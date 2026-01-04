"use server";

import {
	searchProducts,
	isMeilisearchHealthy,
	type MeilisearchProduct,
	type SearchFilters,
} from "@/lib/meilisearch";

export interface WebstoreSearchResult {
	products: MeilisearchProduct[];
	totalCount: number;
	hasNextPage: boolean;
	processingTimeMs: number;
}

/**
 * Search products using Meilisearch for the webstore.
 * Returns empty results if Meilisearch is unavailable.
 */
export async function searchWebstore(
	query: string,
	channel: string,
	options: {
		limit?: number;
		offset?: number;
		filters?: {
			conditions?: string[];
			finishes?: string[];
			inStockOnly?: boolean;
			setCode?: string;
			rarity?: string[];
			typeLine?: string;
			priceRange?: { min?: number; max?: number };
		};
		sort?: string[];
	} = {},
): Promise<WebstoreSearchResult> {
	const { limit = 50, offset = 0, filters = {}, sort } = options;

	// Check Meilisearch health first
	const isHealthy = await isMeilisearchHealthy();
	if (!isHealthy) {
		console.warn("Meilisearch is not available, returning empty results");
		return {
			products: [],
			totalCount: 0,
			hasNextPage: false,
			processingTimeMs: 0,
		};
	}

	// Build Meilisearch filters
	const meilisearchFilters: SearchFilters = {};

	if (filters.conditions && filters.conditions.length > 0) {
		meilisearchFilters.conditions = filters.conditions;
	}
	if (filters.finishes && filters.finishes.length > 0) {
		meilisearchFilters.finishes = filters.finishes;
	}
	if (filters.inStockOnly) {
		meilisearchFilters.inStockOnly = true;
	}
	if (filters.setCode) {
		meilisearchFilters.setCode = filters.setCode;
	}
	// Handle rarity array - use first value for now (Meilisearch filter)
	if (filters.rarity && filters.rarity.length > 0) {
		meilisearchFilters.rarity = filters.rarity[0];
	}
	if (filters.typeLine) {
		meilisearchFilters.typeLine = filters.typeLine;
	}
	if (filters.priceRange) {
		meilisearchFilters.priceRange = filters.priceRange;
	}

	const result = await searchProducts(query, channel, {
		limit,
		offset,
		filters: meilisearchFilters,
		sort,
	});

	return {
		products: result.hits,
		totalCount: result.estimatedTotalHits,
		hasNextPage: offset + result.hits.length < result.estimatedTotalHits,
		processingTimeMs: result.processingTimeMs,
	};
}

/**
 * Check if Meilisearch is available.
 */
export async function checkMeilisearchHealth(): Promise<boolean> {
	return isMeilisearchHealthy();
}
