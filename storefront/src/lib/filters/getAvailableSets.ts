"use server";

const MEILISEARCH_URL = process.env.MEILISEARCH_URL || "http://localhost:7700";

interface SetOption {
	value: string;
	label: string;
}

interface MeilisearchFacetResponse {
	hits: Array<{ set_name?: string }>;
	facetDistribution?: {
		set_name?: Record<string, number>;
	};
	estimatedTotalHits: number;
}

/**
 * Get index name for a channel.
 */
function getIndexName(channel: string): string {
	// Map channel slugs to index names
	if (channel === "default-channel" || channel === "webstore") {
		return "webstore-products";
	}
	return `${channel}-products`;
}

/**
 * Fetch available set names for products matching a search query.
 * Uses Meilisearch faceting to get sets from actual search results.
 */
export async function getAvailableSetsForSearch(
	search: string,
	channel: string = "webstore",
): Promise<SetOption[]> {
	if (!search || search.length < 2) {
		return [];
	}

	const indexName = getIndexName(channel);

	try {
		const response = await fetch(`${MEILISEARCH_URL}/indexes/${indexName}/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				q: search,
				limit: 0, // We only need facets, not hits
				facets: ["set_name"],
			}),
			cache: "no-store",
		});

		if (!response.ok) {
			console.error("Meilisearch facet error:", response.status);
			return [];
		}

		const data = (await response.json()) as MeilisearchFacetResponse;

		if (!data.facetDistribution?.set_name) {
			return [];
		}

		// Convert facet distribution to options array, sorted by count (most common first)
		const setEntries = Object.entries(data.facetDistribution.set_name);

		return setEntries
			.sort((a, b) => b[1] - a[1]) // Sort by count descending
			.slice(0, 50) // Limit to top 50 sets
			.map(([name]) => ({
				value: name,
				label: name,
			}));
	} catch (error) {
		console.error("Failed to fetch sets from Meilisearch:", error);
		return [];
	}
}
