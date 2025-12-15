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

	// Set Name filter
	if (filters.setName.length > 0) {
		attributeFilters.push({
			slug: ATTRIBUTE_SLUGS.setName,
			values: filters.setName,
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

	// Add type line as search (text search)
	if (filters.typeLine) {
		filter.search = filters.typeLine;
	}

	return filter;
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
