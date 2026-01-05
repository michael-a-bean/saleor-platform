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
 * Check if a product's type line matches the filter.
 * Type line filter uses case-insensitive partial matching.
 * e.g., "Creature" matches "Legendary Creature — Dragon"
 */
function matchesTypeLine(productTypeLine: string | undefined, filterTypeLine: string): boolean {
	if (!productTypeLine) return false;
	return productTypeLine.toLowerCase().includes(filterTypeLine.toLowerCase());
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
			setName?: string;
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
	if (filters.setName) {
		meilisearchFilters.setName = filters.setName;
	}
	// Handle rarity array - pass all values for OR matching
	if (filters.rarity && filters.rarity.length > 0) {
		meilisearchFilters.rarity = filters.rarity;
	}
	// Note: typeLine is filtered post-query since Meilisearch doesn't support partial string matching
	if (filters.priceRange) {
		meilisearchFilters.priceRange = filters.priceRange;
	}

	// If typeLine filter is active, fetch more results to account for post-filtering
	const fetchLimit = filters.typeLine ? limit * 4 : limit;

	const result = await searchProducts(query, channel, {
		limit: fetchLimit,
		offset,
		filters: meilisearchFilters,
		sort,
	});

	// Post-filter by typeLine (Meilisearch doesn't support partial string matching)
	let filteredProducts = result.hits;
	if (filters.typeLine) {
		filteredProducts = result.hits.filter((p) => matchesTypeLine(p.type_line, filters.typeLine!));
	}

	// Apply pagination to filtered results
	const paginatedProducts = filteredProducts.slice(0, limit);
	const estimatedTotal = filters.typeLine
		? filteredProducts.length // Use actual filtered count when post-filtering
		: result.estimatedTotalHits;

	return {
		products: paginatedProducts,
		totalCount: estimatedTotal,
		hasNextPage: filters.typeLine
			? filteredProducts.length > limit
			: offset + result.hits.length < result.estimatedTotalHits,
		processingTimeMs: result.processingTimeMs,
	};
}

/**
 * Check if Meilisearch is available.
 */
export async function checkMeilisearchHealth(): Promise<boolean> {
	return isMeilisearchHealthy();
}
