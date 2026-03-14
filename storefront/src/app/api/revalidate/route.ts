import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

/**
 * Saleor webhook handler for on-demand cache revalidation.
 *
 * Invalidates Next.js Data Cache entries tagged with relevant product/category IDs.
 * Saleor 3.22 uses JWS (JSON Web Signature) for payload signing — full JWS
 * verification requires the JWKS endpoint and is deferred to a follow-up.
 * For now, this endpoint relies on network-level security (not publicly routed
 * on staging) and a shared secret token in the query string.
 *
 * Note: With force-dynamic on all pages, this only benefits the fetch-level
 * Data Cache (revalidate: 60 on executeGraphQL calls). Full page-level
 * caching benefits unlock after PPR migration (Phase 5.1).
 */
export async function POST(req: NextRequest) {
	// Simple shared-secret auth until JWS verification is implemented
	const token = req.nextUrl.searchParams.get("token");
	const expectedToken = process.env.SALEOR_WEBHOOK_SECRET;
	if (expectedToken && token !== expectedToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const rawBody = await req.text();

	type WebhookBody = {
		product?: { id?: string };
		// Saleor sends camelCase in webhook payloads
		productVariant?: { product?: { id?: string } };
		category?: { id?: string };
	};

	let body: WebhookBody;
	try {
		body = JSON.parse(rawBody) as WebhookBody;
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	// Saleor sends event type in Saleor-Event header (case-insensitive via Headers API)
	const event = req.headers.get("saleor-event");
	const revalidatedTags: string[] = [];

	function invalidate(tag: string) {
		revalidateTag(tag, "default");
		revalidatedTags.push(tag);
	}

	switch (event) {
		case "PRODUCT_UPDATED":
		case "PRODUCT_CREATED":
		case "PRODUCT_DELETED": {
			if (body.product?.id) invalidate(`product-${body.product.id}`);
			invalidate("products");
			break;
		}
		case "PRODUCT_VARIANT_UPDATED":
		case "PRODUCT_VARIANT_CREATED":
		case "PRODUCT_VARIANT_DELETED": {
			if (body.productVariant?.product?.id) invalidate(`product-${body.productVariant.product.id}`);
			invalidate("products");
			break;
		}
		case "CATEGORY_UPDATED":
		case "CATEGORY_CREATED":
		case "CATEGORY_DELETED": {
			if (body.category?.id) invalidate(`category-${body.category.id}`);
			invalidate("categories");
			break;
		}
		default:
			return NextResponse.json({ revalidated: false, event, reason: "unhandled event type" });
	}

	return NextResponse.json({ revalidated: true, event, tags: revalidatedTags });
}
