/**
 * Meilisearch client for singles-builder search.
 * Provides instant search with typo tolerance and partial matching.
 */

import { logger } from "@/lib/logger";

const log = logger.scope("meilisearch");

const MEILISEARCH_URL = process.env.MEILISEARCH_URL || "http://localhost:7700";
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY;

/**
 * Get headers for Meilisearch requests, including auth if API key is set.
 */
function getMeilisearchHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (MEILISEARCH_API_KEY) {
		headers["Authorization"] = `Bearer ${MEILISEARCH_API_KEY}`;
	}
	return headers;
}

/**
 * Get the Meilisearch index name for a channel.
 * Each channel has its own index for channel-specific pricing/stock.
 * Use indexPrefix to override the default channel-based naming (e.g., "singles-builder" for singles search).
 */
function getIndexName(channel: string, indexPrefix?: string): string {
	if (indexPrefix) {
		return `${indexPrefix}-products`;
	}
	return `${channel}-products`;
}

export interface MeilisearchVariant {
	id: string;
	original_id: string;  // Original Saleor GraphQL ID for cart operations
	sku: string | null;
	condition: string;
	finish: string;
	stock: number;
	price: number | null;
}

export interface MeilisearchProduct {
	id: string;
	original_id: string;  // Original Saleor GraphQL ID for lookups
	name: string;
	slug: string;
	thumbnail: string | null;
	set_name: string;
	set_code: string;
	collector_number: string;
	rarity: string;
	colors: string;
	mana_cost: string;
	type_line: string;
	oracle_text: string;
	min_price: number | null;
	total_stock: number;
	in_stock: boolean;
	conditions_available: string[];
	finishes_available: string[];
	variants: MeilisearchVariant[];
}

export interface MeilisearchSearchResult {
	hits: MeilisearchProduct[];
	query: string;
	processingTimeMs: number;
	limit: number;
	offset: number;
	estimatedTotalHits: number;
}

export interface SearchFilters {
	conditions?: string[];
	finishes?: string[];
	inStockOnly?: boolean;
	setCode?: string;
	setName?: string;
	rarity?: string | string[];
	typeLine?: string;
	priceRange?: { min?: number; max?: number };
}

/**
 * Build Meilisearch filter string from search filters.
 */
function buildFilterString(filters: SearchFilters): string | undefined {
	const parts: string[] = [];

	if (filters.inStockOnly) {
		parts.push("in_stock = true");
	}

	if (filters.conditions && filters.conditions.length > 0) {
		// Match any of the conditions
		const conditionFilters = filters.conditions.map((c) => `conditions_available = "${c}"`);
		parts.push(`(${conditionFilters.join(" OR ")})`);
	}

	if (filters.finishes && filters.finishes.length > 0) {
		const finishFilters = filters.finishes.map((f) => `finishes_available = "${f}"`);
		parts.push(`(${finishFilters.join(" OR ")})`);
	}

	if (filters.setCode) {
		parts.push(`set_code = "${filters.setCode.toUpperCase()}"`);
	}

	if (filters.setName) {
		parts.push(`set_name = "${filters.setName}"`);
	}

	if (filters.rarity) {
		// Handle single string or array of rarities
		const rarities = Array.isArray(filters.rarity) ? filters.rarity : [filters.rarity];
		if (rarities.length > 0) {
			const rarityFilters = rarities.map((r) => `rarity = "${r.toLowerCase()}"`);
			parts.push(`(${rarityFilters.join(" OR ")})`);
		}
	}

	if (filters.typeLine) {
		// Match partial type line (e.g., "Creature" matches "Legendary Creature — Dragon")
		parts.push(`type_line = "${filters.typeLine}"`);
	}

	if (filters.priceRange) {
		if (filters.priceRange.min !== undefined) {
			parts.push(`min_price >= ${filters.priceRange.min}`);
		}
		if (filters.priceRange.max !== undefined) {
			parts.push(`min_price <= ${filters.priceRange.max}`);
		}
	}

	return parts.length > 0 ? parts.join(" AND ") : undefined;
}

/**
 * Search products in Meilisearch.
 */
export async function searchProducts(
	query: string,
	channel: string,
	options: {
		limit?: number;
		offset?: number;
		filters?: SearchFilters;
		sort?: string[];
		indexPrefix?: string;
		extraFilterParts?: string[];
	} = {},
): Promise<MeilisearchSearchResult> {
	const { limit = 50, offset = 0, filters = {}, sort, indexPrefix, extraFilterParts } = options;
	const indexName = getIndexName(channel, indexPrefix);

	const searchParams: Record<string, unknown> = {
		q: query,
		limit,
		offset,
		attributesToRetrieve: [
			"id",
			"original_id",
			"name",
			"slug",
			"thumbnail",
			"set_name",
			"set_code",
			"collector_number",
			"rarity",
			"colors",
			"mana_cost",
			"type_line",
			"oracle_text",
			"min_price",
			"total_stock",
			"in_stock",
			"conditions_available",
			"finishes_available",
			"variants",
		],
	};

	const filterString = buildFilterString(filters);
	const allFilterParts = [filterString, ...(extraFilterParts ?? [])].filter(Boolean);
	if (allFilterParts.length > 0) {
		searchParams.filter = allFilterParts.join(" AND ");
	}

	if (sort && sort.length > 0) {
		searchParams.sort = sort;
	}

	try {
		const response = await fetch(`${MEILISEARCH_URL}/indexes/${indexName}/search`, {
			method: "POST",
			headers: getMeilisearchHeaders(),
			body: JSON.stringify(searchParams),
			// Don't cache search results
			cache: "no-store",
		});

		if (!response.ok) {
			throw new Error(`Meilisearch error: ${response.status} ${response.statusText}`);
		}

		return (await response.json()) as MeilisearchSearchResult;
	} catch (error) {
		log.error("search failed", {
			query,
			channel,
			indexName,
			error: error instanceof Error ? error.message : String(error),
		});
		// Return empty results on error
		return {
			hits: [],
			query,
			processingTimeMs: 0,
			limit,
			offset,
			estimatedTotalHits: 0,
		};
	}
}

/**
 * Check if Meilisearch is available and healthy.
 * Uses Next.js data cache with 5-minute revalidation — stale responses served
 * while background revalidation runs. Search failures fall back to GraphQL
 * regardless, so a brief stale "healthy" result is harmless.
 */
export async function isMeilisearchHealthy(): Promise<boolean> {
	try {
		const response = await fetch(`${MEILISEARCH_URL}/health`, {
			headers: getMeilisearchHeaders(),
			next: { revalidate: 300 },
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Get index stats from Meilisearch.
 */
export async function getIndexStats(channel: string): Promise<{ numberOfDocuments: number; isIndexing: boolean } | null> {
	const indexName = getIndexName(channel);
	try {
		const response = await fetch(`${MEILISEARCH_URL}/indexes/${indexName}/stats`, {
			headers: getMeilisearchHeaders(),
			cache: "no-store",
		});
		if (!response.ok) return null;
		return (await response.json()) as { numberOfDocuments: number; isIndexing: boolean };
	} catch {
		return null;
	}
}
