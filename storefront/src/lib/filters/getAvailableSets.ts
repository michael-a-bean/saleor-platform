"use server";

import { invariant } from "ts-invariant";

interface SetOption {
	value: string;
	label: string;
}

interface ProductAttribute {
	attribute: {
		slug: string;
	};
	values: Array<{
		name: string;
	}>;
}

interface ProductNode {
	attributes: ProductAttribute[];
}

interface ProductEdge {
	node: ProductNode;
}

interface ProductsResponse {
	data: {
		products: {
			edges: ProductEdge[];
		};
	};
}

/**
 * Fetch available set names for products matching a search query.
 * This is used to populate the set dropdown with only relevant options.
 */
export async function getAvailableSetsForSearch(
	search: string,
	channel: string = "webstore",
): Promise<SetOption[]> {
	invariant(process.env.NEXT_PUBLIC_SALEOR_API_URL, "Missing NEXT_PUBLIC_SALEOR_API_URL");

	if (!search || search.length < 2) {
		return [];
	}

	const query = `
		query ProductSetsForSearch($channel: String!, $search: String!) {
			products(first: 100, channel: $channel, filter: { search: $search }) {
				edges {
					node {
						attributes {
							attribute {
								slug
							}
							values {
								name
							}
						}
					}
				}
			}
		}
	`;

	try {
		const response = await fetch(process.env.NEXT_PUBLIC_SALEOR_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				variables: { channel, search },
			}),
			next: { revalidate: 300 }, // Cache for 5 minutes
		});

		if (!response.ok) {
			return [];
		}

		const data = (await response.json()) as ProductsResponse;

		if (!data.data?.products?.edges) {
			return [];
		}

		// Extract unique set names from the response
		const sets = new Set<string>();

		for (const edge of data.data.products.edges) {
			for (const attr of edge.node.attributes) {
				if (attr.attribute.slug === "mtg-set-name") {
					for (const val of attr.values) {
						if (val.name) {
							sets.add(val.name);
						}
					}
				}
			}
		}

		// Convert to options array and sort alphabetically
		return Array.from(sets)
			.sort((a, b) => a.localeCompare(b))
			.map((name) => ({
				value: name,
				label: name,
			}));
	} catch {
		return [];
	}
}
