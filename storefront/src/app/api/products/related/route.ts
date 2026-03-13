import { NextResponse } from "next/server";
import { executeGraphQL } from "@/lib/graphql";
import { RelatedProductsDocument } from "@/gql/graphql";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const channel = url.searchParams.get("channel");
	const categoryId = url.searchParams.get("categoryId");
	const excludeProductId = url.searchParams.get("excludeProductId");

	if (!channel || !categoryId) {
		return NextResponse.json(
			{ error: "Missing required parameters: channel, categoryId" },
			{ status: 400 },
		);
	}

	try {
		const result = await executeGraphQL(RelatedProductsDocument, {
			variables: {
				channel,
				categoryId,
				first: 12,
			},
			revalidate: 60,
		});

		const products =
			result.products?.edges
				.map((e) => e.node)
				.filter((p) => p.id !== excludeProductId) ?? [];

		return NextResponse.json({ products });
	} catch (error) {
		console.error("[API] Related products error:", error);
		return NextResponse.json({ error: "Failed to fetch related products" }, { status: 500 });
	}
}
