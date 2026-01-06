import { NextResponse } from "next/server";
import { executeGraphQL } from "@/lib/graphql";
import { SinglesBuilderPosLookupDocument } from "@/gql/graphql";

interface LookupRequest {
	code: string;
}

interface LookupResponse {
	success: boolean;
	checkout?: {
		id: string;
		token: string;
		customerName?: string;
		notes?: string;
		shortCode: string;
		createdAt?: string;
		lines: Array<{
			id: string;
			quantity: number;
			productName: string;
			variantName: string;
			sku?: string;
			condition?: string;
			finish?: string;
			unitPrice: { amount: number; currency: string };
			totalPrice: { amount: number; currency: string };
		}>;
		subtotal: { amount: number; currency: string };
		total: { amount: number; currency: string };
	};
	error?: string;
}

// Validate 6-character alphanumeric code
function isValidShortCode(code: string): boolean {
	return /^[A-Z0-9]{6}$/.test(code.toUpperCase());
}

// Extract attribute value from variant/product attributes
function getAttributeValue(
	attributes: Array<{
		attribute: { slug?: string | null };
		values: Array<{ name?: string | null }>;
	}> | null | undefined,
	slug: string,
): string | undefined {
	const attr = attributes?.find((a) => a.attribute.slug === slug);
	return attr?.values[0]?.name ?? undefined;
}

// Convert full condition name to abbreviation
function abbreviateCondition(condition: string | undefined): string | undefined {
	if (!condition) return undefined;
	const abbrevMap: Record<string, string> = {
		"Near Mint": "NM",
		"Lightly Played": "LP",
		"Moderately Played": "MP",
		"Heavily Played": "HP",
		"Damaged": "DMG",
	};
	return abbrevMap[condition] || condition;
}

export async function POST(request: Request): Promise<NextResponse<LookupResponse>> {
	try {
		const data = (await request.json()) as LookupRequest;
		const code = data.code?.toUpperCase();

		// Validate code format
		if (!code || !isValidShortCode(code)) {
			return NextResponse.json(
				{ success: false, error: "Invalid code format. Expected 6-character alphanumeric code." },
				{ status: 400 },
			);
		}

		// Query Saleor for checkout with matching metadata
		const result = await executeGraphQL(SinglesBuilderPosLookupDocument, {
			variables: {
				shortCode: code,
			},
			cache: "no-store",
			withAuth: true,
		});

		const checkoutNode = result.checkouts?.edges?.[0]?.node;

		if (!checkoutNode) {
			return NextResponse.json(
				{ success: false, error: "No cart found with this code. It may have expired or been completed." },
				{ status: 404 },
			);
		}

		// Extract metadata fields
		const metadata = checkoutNode.metadata || [];
		const getMetaValue = (key: string) => metadata.find((m) => m.key === key)?.value;

		// Map checkout lines to response format
		const lines = (checkoutNode.lines || []).map((line) => ({
			id: line.id,
			quantity: line.quantity,
			productName: line.variant.product.name,
			variantName: line.variant.name,
			sku: line.variant.sku ?? undefined,
			condition: abbreviateCondition(getAttributeValue(line.variant.attributes, "mtg-condition")),
			finish: getAttributeValue(line.variant.attributes, "mtg-finish"),
			unitPrice: {
				amount: line.variant.pricing?.price?.gross?.amount ?? 0,
				currency: line.variant.pricing?.price?.gross?.currency ?? "USD",
			},
			totalPrice: {
				amount: line.totalPrice.gross.amount,
				currency: line.totalPrice.gross.currency,
			},
		}));

		return NextResponse.json({
			success: true,
			checkout: {
				id: checkoutNode.id,
				token: checkoutNode.token,
				customerName: getMetaValue("singles_builder_customer"),
				notes: getMetaValue("singles_builder_notes"),
				shortCode: code,
				createdAt: getMetaValue("singles_builder_created"),
				lines,
				subtotal: {
					amount: checkoutNode.subtotalPrice?.gross?.amount ?? 0,
					currency: checkoutNode.subtotalPrice?.gross?.currency ?? "USD",
				},
				total: {
					amount: checkoutNode.totalPrice?.gross?.amount ?? 0,
					currency: checkoutNode.totalPrice?.gross?.currency ?? "USD",
				},
			},
		});
	} catch (error) {
		console.error("POS lookup error:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to look up cart. Please try again." },
			{ status: 500 },
		);
	}
}

// GET method for simple testing
export async function GET(request: Request): Promise<NextResponse<LookupResponse>> {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");

	if (!code) {
		return NextResponse.json(
			{ success: false, error: "Missing 'code' query parameter" },
			{ status: 400 },
		);
	}

	// Reuse POST logic by creating a mock request
	const mockRequest = new Request(request.url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code }),
	});

	return POST(mockRequest);
}
