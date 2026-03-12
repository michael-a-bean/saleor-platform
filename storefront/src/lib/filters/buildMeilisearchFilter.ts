import type { MTGFilterState } from "./types";
import type { SearchFilters } from "@/lib/meilisearch";

/**
 * Convert MTGFilterState to Meilisearch SearchFilters.
 *
 * Supported filters: rarity, colorIdentity (via color_identity), finish,
 * setName, price range, mana value, conditions, in-stock.
 *
 * Unsupported in Meilisearch (ignored): cardType, reservedList, isPromo, isFullArt.
 * These only work via the Saleor GraphQL fallback path.
 */
export function buildMeilisearchFilters(filters: MTGFilterState): SearchFilters {
	const meilisearchFilters: SearchFilters = {};

	if (filters.rarity.length > 0) {
		meilisearchFilters.rarity = filters.rarity;
	}

	if (filters.setName) {
		meilisearchFilters.setName = filters.setName;
	}

	if (filters.finish.length > 0) {
		meilisearchFilters.finishes = filters.finish.map(normalizeFinish);
	}

	if (filters.price.min !== undefined || filters.price.max !== undefined) {
		meilisearchFilters.priceRange = {};
		if (filters.price.min !== undefined) {
			meilisearchFilters.priceRange.min = filters.price.min;
		}
		if (filters.price.max !== undefined) {
			meilisearchFilters.priceRange.max = filters.price.max;
		}
	}

	return meilisearchFilters;
}

/**
 * Build additional Meilisearch filter string parts for filters not covered
 * by the standard SearchFilters interface (color_identity, mana_value).
 */
export function buildExtraFilterParts(filters: MTGFilterState): string[] {
	const parts: string[] = [];

	if (filters.colorIdentity.length > 0) {
		const colorFilters = filters.colorIdentity.map(
			(c) => `color_identity = "${c.toUpperCase()}"`,
		);
		parts.push(`(${colorFilters.join(" OR ")})`);
	}

	if (filters.manaValue.min !== undefined) {
		parts.push(`mana_value >= ${filters.manaValue.min}`);
	}
	if (filters.manaValue.max !== undefined) {
		parts.push(`mana_value <= ${filters.manaValue.max}`);
	}

	return parts;
}

/**
 * Build the Meilisearch query string. For browse mode (no text search),
 * returns empty string. Adds type line and card type as search terms
 * since they work better as text queries than filters.
 */
export function buildMeilisearchQuery(filters: MTGFilterState): string {
	const terms: string[] = [];

	if (filters.typeLine) {
		terms.push(filters.typeLine);
	}

	// Card type works as a query term against type_line field
	if (filters.cardType.length > 0) {
		terms.push(filters.cardType.join(" "));
	}

	return terms.join(" ");
}

/**
 * Convert sort URL param to Meilisearch sort array.
 */
export function getMeilisearchSort(sortParam?: string | string[]): string[] {
	const sortValue = Array.isArray(sortParam) ? sortParam[0] : sortParam;

	switch (sortValue) {
		case "price-asc":
			return ["min_price:asc"];
		case "price-desc":
			return ["min_price:desc"];
		default:
			return ["name:asc"];
	}
}

/**
 * Check if any active filters are unsupported by Meilisearch.
 * When true, the page should fall back to Saleor GraphQL.
 */
export function hasMeilisearchUnsupportedFilters(filters: MTGFilterState): boolean {
	return (
		filters.reservedList !== null ||
		filters.isPromo !== null ||
		filters.isFullArt !== null
	);
}

/**
 * Normalize finish values from URL params to Meilisearch document format.
 * URL uses slugs like "non-foil", Meilisearch documents use "Non-Foil".
 */
function normalizeFinish(slug: string): string {
	switch (slug.toLowerCase()) {
		case "non-foil":
			return "Non-Foil";
		case "foil":
			return "Foil";
		case "etched":
			return "Etched";
		default:
			return slug;
	}
}
