import type { ProductFilterInput, AttributeInput, StockAvailability } from "@/gql/graphql";
import type { SinglesFilterState } from "./filterTypes";

/**
 * Build a Saleor ProductFilterInput from SinglesFilterState
 *
 * Note: Saleor's product filter supports filtering by product-level attributes.
 * Variant-level filtering (condition, finish, stock) is handled client-side
 * after the query returns, or via stockAvailability for stock filtering.
 */
export function buildSinglesFilter(
	searchQuery: string,
	filters: SinglesFilterState,
): ProductFilterInput {
	const filter: ProductFilterInput = {};

	// Search query (combines user search with set name filter)
	const searchTerms: string[] = [];
	if (searchQuery.trim()) {
		searchTerms.push(searchQuery.trim());
	}
	if (filters.setName.trim()) {
		searchTerms.push(filters.setName.trim());
	}
	if (searchTerms.length > 0) {
		filter.search = searchTerms.join(" ");
	}

	// Product-level attribute filters
	const attributeFilters: AttributeInput[] = [];

	// Rarity filter (product-level)
	if (filters.rarity.length > 0) {
		attributeFilters.push({
			slug: "rarity",
			values: filters.rarity,
		});
	}

	if (attributeFilters.length > 0) {
		filter.attributes = attributeFilters;
	}

	// Price range filter
	if (filters.priceMin !== null || filters.priceMax !== null) {
		filter.minimalPrice = {};
		if (filters.priceMin !== null) {
			filter.minimalPrice.gte = filters.priceMin;
		}
		if (filters.priceMax !== null) {
			filter.minimalPrice.lte = filters.priceMax;
		}
	}

	// Stock availability filter
	if (filters.inStockOnly) {
		filter.stockAvailability = "IN_STOCK" as StockAvailability;
	}

	return filter;
}

/**
 * Check if a variant matches the variant-level filters
 * (condition, finish) which cannot be filtered server-side
 */
export function matchesVariantFilters(
	variantAttributes: Array<{
		attribute: { slug: string };
		values: Array<{ name: string | null; slug: string }>;
	}> | null | undefined,
	filters: SinglesFilterState,
): boolean {
	// If no variant-level filters, always match
	if (filters.condition.length === 0 && filters.finish.length === 0) {
		return true;
	}

	if (!variantAttributes) {
		return false;
	}

	// Check condition filter
	if (filters.condition.length > 0) {
		const conditionAttr = variantAttributes.find((a) => a.attribute.slug === "condition");
		const conditionValue = conditionAttr?.values[0]?.name;
		if (!conditionValue || !filters.condition.includes(conditionValue)) {
			return false;
		}
	}

	// Check finish filter
	if (filters.finish.length > 0) {
		const finishAttr = variantAttributes.find((a) => a.attribute.slug === "finish");
		const finishValue = finishAttr?.values[0]?.name;
		if (!finishValue || !filters.finish.includes(finishValue)) {
			return false;
		}
	}

	return true;
}

/**
 * Check if a product has at least one variant matching the variant-level filters
 */
export function productHasMatchingVariants(
	variants: Array<{
		quantityAvailable?: number | null;
		attributes?: Array<{
			attribute: { slug: string };
			values: Array<{ name: string | null; slug: string }>;
		}> | null;
	}> | null | undefined,
	filters: SinglesFilterState,
): boolean {
	if (!variants || variants.length === 0) {
		return false;
	}

	return variants.some((variant) => {
		// Check stock filter
		if (filters.inStockOnly && (variant.quantityAvailable ?? 0) <= 0) {
			return false;
		}

		// Check variant-level attribute filters
		return matchesVariantFilters(variant.attributes, filters);
	});
}
