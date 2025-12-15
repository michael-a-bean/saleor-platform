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

	// Build the filter object
	const filter: ProductFilterInput = {};

	// Add attribute filters if any
	if (attributeFilters.length > 0) {
		filter.attributes = attributeFilters;
	}

	// Add price range filter
	if (filters.price.min !== undefined || filters.price.max !== undefined) {
		filter.minimalPrice = {
			gte: filters.price.min,
			lte: filters.price.max,
		};
	}

	// Add search terms for type line and set name
	// These are combined into a search string since exact attribute matching doesn't work for plain-text fields
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
		filter.minimalPrice ||
		filter.price ||
		filter.search ||
		filter.categories?.length ||
		filter.collections?.length
	);
}
