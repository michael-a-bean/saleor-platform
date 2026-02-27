import type { ProductFilterInput, AttributeInput } from "@/gql/graphql";
import type { MTGFilterState } from "./types";
import { ATTRIBUTE_SLUGS } from "./mtgConstants";

/**
 * Convert MTGFilterState to Saleor ProductFilterInput
 */
export function buildProductFilter(filters: MTGFilterState): ProductFilterInput {
	const attributeFilters: AttributeInput[] = [];

	// Rarity filter (dropdown attribute)
	if (filters.rarity.length > 0) {
		attributeFilters.push({
			slug: ATTRIBUTE_SLUGS.rarity,
			values: filters.rarity,
		});
	}

	// Color identity filter (multiselect attribute)
	if (filters.colorIdentity.length > 0) {
		attributeFilters.push({
			slug: ATTRIBUTE_SLUGS.colorIdentity,
			values: filters.colorIdentity,
		});
	}

	// Card type filter (multiselect attribute — exact match, not search-based)
	if (filters.cardType.length > 0) {
		attributeFilters.push({
			slug: ATTRIBUTE_SLUGS.cardType,
			values: filters.cardType,
		});
	}

	// Finish filter (variant attribute for foil/non-foil)
	if (filters.finish.length > 0) {
		attributeFilters.push({
			slug: ATTRIBUTE_SLUGS.finish,
			values: filters.finish,
		});
	}

	// Boolean filters
	if (filters.reservedList !== null) {
		attributeFilters.push({
			slug: ATTRIBUTE_SLUGS.reservedList,
			boolean: filters.reservedList,
		});
	}

	if (filters.isPromo !== null) {
		attributeFilters.push({
			slug: ATTRIBUTE_SLUGS.isPromo,
			boolean: filters.isPromo,
		});
	}

	if (filters.isFullArt !== null) {
		attributeFilters.push({
			slug: ATTRIBUTE_SLUGS.isFullArt,
			boolean: filters.isFullArt,
		});
	}

	// Mana value filter (numeric attribute — uses valuesRange for IntRangeInput)
	if (filters.manaValue.min !== undefined || filters.manaValue.max !== undefined) {
		attributeFilters.push({
			slug: ATTRIBUTE_SLUGS.manaValue,
			valuesRange: {
				gte: filters.manaValue.min,
				lte: filters.manaValue.max,
			},
		});
	}

	// Build the filter object
	const filter: ProductFilterInput = {};

	// Add attribute filters if any
	if (attributeFilters.length > 0) {
		filter.attributes = attributeFilters;
	}

	// Add price range filter
	if (filters.price.min !== undefined || filters.price.max !== undefined) {
		filter.price = {
			gte: filters.price.min,
			lte: filters.price.max,
		};
	}

	// Add search terms for type line and set name
	// Plain-text attributes can only be filtered via free-text search
	const searchTerms: string[] = [];
	if (filters.typeLine) {
		searchTerms.push(filters.typeLine);
	}
	if (filters.setName) {
		searchTerms.push(filters.setName);
	}
	if (searchTerms.length > 0) {
		filter.search = searchTerms.join(" ");
	}

	return filter;
}

/**
 * Get the search string from filters (for combining with user search query)
 */
export function getFilterSearchTerms(filters: MTGFilterState): string {
	const terms: string[] = [];
	if (filters.typeLine) {
		terms.push(filters.typeLine);
	}
	if (filters.setName) {
		terms.push(filters.setName);
	}
	return terms.join(" ");
}

/**
 * Check if a ProductFilterInput has any filters applied
 */
export function hasActiveFilters(filter: ProductFilterInput): boolean {
	return !!(
		filter.attributes?.length ||
		filter.price ||
		filter.search ||
		filter.categories?.length ||
		filter.collections?.length
	);
}
