import type { MeilisearchProduct } from "@/lib/meilisearch";
import type { ProductListItemFragment } from "@/gql/graphql";

/**
 * Transform a Meilisearch product to ProductListItemFragment format.
 * This allows Meilisearch results to be used with existing ProductList components.
 */
export function transformToProductListItem(
	product: MeilisearchProduct,
): ProductListItemFragment {
	// Calculate max price for price range
	const allPrices = product.variants.map((v) => v.price).filter((p): p is number => p !== null);
	const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : null;

	return {
		id: product.original_id,
		name: product.name,
		slug: product.slug,
		thumbnail: product.thumbnail
			? {
					url: product.thumbnail,
					alt: product.name,
				}
			: null,
		// Use media array for external images (preferred in ProductElement)
		media: product.thumbnail
			? [
					{
						url: product.thumbnail,
						alt: product.name,
					},
				]
			: [],
		pricing: {
			priceRange: {
				start: {
					gross: {
						amount: product.min_price || 0,
						currency: "USD",
					},
				},
				stop: {
					gross: {
						amount: maxPrice || product.min_price || 0,
						currency: "USD",
					},
				},
			},
		},
		category: null,
		// Map variants with quantity info
		variants: product.variants.map((v) => ({
			quantityAvailable: v.stock,
		})),
		// Include MTG attributes for display
		attributes: [
			{
				attribute: { slug: "mtg-set-name" },
				values: product.set_name ? [{ name: product.set_name, slug: product.set_name.toLowerCase().replace(/\s+/g, "-") }] : [],
			},
			{
				attribute: { slug: "mtg-set-code" },
				values: product.set_code ? [{ name: product.set_code, slug: product.set_code.toLowerCase() }] : [],
			},
			{
				attribute: { slug: "mtg-collector-number" },
				values: product.collector_number
					? [{ name: product.collector_number, slug: product.collector_number }]
					: [],
			},
			{
				attribute: { slug: "mtg-rarity" },
				values: product.rarity ? [{ name: product.rarity, slug: product.rarity.toLowerCase() }] : [],
			},
			{
				attribute: { slug: "mtg-type-line" },
				values: product.type_line ? [{ name: product.type_line, slug: product.type_line.toLowerCase().replace(/\s+/g, "-") }] : [],
			},
			{
				attribute: { slug: "mtg-colors" },
				values: product.colors ? [{ name: product.colors, slug: product.colors.toLowerCase() }] : [],
			},
		],
	};
}

/**
 * Transform an array of Meilisearch products to ProductListItemFragment array.
 */
export function transformMeilisearchResults(
	products: MeilisearchProduct[],
): ProductListItemFragment[] {
	return products.map(transformToProductListItem);
}

/**
 * Create a pagination info object for Meilisearch results.
 * Uses offset-based cursors in format "offset:N" that can be parsed back to offsets.
 */
export function createMeilisearchPageInfo(
	currentOffset: number,
	limit: number,
	totalCount: number,
): {
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	startCursor: string | null;
	endCursor: string | null;
} {
	const hasNextPage = currentOffset + limit < totalCount;
	const hasPreviousPage = currentOffset > 0;

	return {
		hasNextPage,
		hasPreviousPage,
		// startCursor points to current page start (used for "prev" navigation)
		startCursor: hasPreviousPage ? `offset:${currentOffset}` : null,
		// endCursor points to next page start (used for "next" navigation)
		endCursor: hasNextPage ? `offset:${currentOffset + limit}` : null,
	};
}
