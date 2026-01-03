"use server";

import { invariant } from "ts-invariant";

interface ScryfallSet {
	code: string;
	name: string;
	released_at: string;
	set_type: string;
	icon_svg_uri: string;
}

interface ScryfallSetsResponse {
	data: ScryfallSet[];
}

export interface LatestSet {
	name: string;
	code: string;
	releasedAt: string;
	iconUri: string;
	productCount: number;
}

interface ProductCountResponse {
	data: {
		products: {
			totalCount: number;
		};
	};
}

/**
 * Fetches the latest MTG sets from Scryfall API and matches them with sets
 * available in the store's catalog.
 */
export async function getLatestSets(
	channel: string = "webstore",
	limit: number = 9,
): Promise<LatestSet[]> {
	invariant(process.env.NEXT_PUBLIC_SALEOR_API_URL, "Missing NEXT_PUBLIC_SALEOR_API_URL");

	try {
		// Fetch sets from Scryfall
		const response = await fetch("https://api.scryfall.com/sets", {
			next: { revalidate: 3600 }, // Cache for 1 hour
		});

		if (!response.ok) {
			return [];
		}

		const data = (await response.json()) as ScryfallSetsResponse;
		const today = new Date().toISOString().split("T")[0];

		// Filter to valid set types that have been released
		const validTypes = ["core", "expansion", "masters", "draft_innovation", "commander", "funny"];
		const recentSets = data.data
			.filter(
				(s) =>
					s.released_at &&
					s.released_at <= today &&
					validTypes.includes(s.set_type) &&
					!s.name.endsWith("Tokens") &&
					!s.name.includes("Art Series") &&
					!s.name.includes("Promos"),
			)
			.sort((a, b) => b.released_at.localeCompare(a.released_at));

		// Check which sets we have in the database and get counts
		const setsWithProducts: LatestSet[] = [];

		// Use search to find products by set name
		const query = `
			query ProductCountBySet($channel: String!, $search: String!) {
				products(
					first: 1
					channel: $channel
					filter: { search: $search }
				) {
					totalCount
				}
			}
		`;

		for (const set of recentSets) {
			if (setsWithProducts.length >= limit) break;

			try {
				// Search for the exact set name (quoted to match exactly)
				const result = await fetch(process.env.NEXT_PUBLIC_SALEOR_API_URL, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						query,
						variables: { channel, search: `"${set.name}"` },
					}),
					next: { revalidate: 3600 },
				});

				if (!result.ok) continue;

				const json = (await result.json()) as ProductCountResponse;
				const count = json.data?.products?.totalCount ?? 0;

				if (count > 0) {
					setsWithProducts.push({
						name: set.name,
						code: set.code,
						releasedAt: set.released_at,
						iconUri: set.icon_svg_uri,
						productCount: count,
					});
				}
			} catch {
				// Skip sets that fail to query
				continue;
			}
		}

		return setsWithProducts;
	} catch {
		return [];
	}
}
