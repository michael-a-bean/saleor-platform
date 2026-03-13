import { NextResponse } from "next/server";
import { executeGraphQL } from "@/lib/graphql";
import { OtherPrintingsDocument } from "@/gql/graphql";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const channel = url.searchParams.get("channel");
	const productName = url.searchParams.get("productName");

	if (!channel || !productName) {
		return NextResponse.json(
			{ error: "Missing required parameters: channel, productName" },
			{ status: 400 },
		);
	}

	try {
		const result = await executeGraphQL(OtherPrintingsDocument, {
			variables: {
				search: productName,
				channel,
				first: 50,
			},
			revalidate: 60,
		});

		// Filter to exact name matches only (GraphQL search is fuzzy)
		const printings =
			result.products?.edges
				.map((e) => e.node)
				.filter((p) => p.name === productName) ?? [];

		return NextResponse.json({ printings });
	} catch (error) {
		console.error("[API] Other printings error:", error);
		return NextResponse.json({ error: "Failed to fetch other printings" }, { status: 500 });
	}
}
