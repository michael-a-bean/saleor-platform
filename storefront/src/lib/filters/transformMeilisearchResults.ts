import type { ProductListItemFragment } from "@/gql/graphql";
import type { MeilisearchProduct } from "@/lib/meilisearch";
import { ATTRIBUTE_SLUGS } from "./mtgConstants";

/**
 * Transform a MeilisearchProduct to a ProductListItemFragment.
 *
 * This maps the Meilisearch document shape (flat fields) to the
 * GraphQL fragment shape expected by ProductElement and ProductList.
 *
 * Currency is hardcoded to USD — all MTG products use USD pricing.
 * Meilisearch documents store variant prices from Saleor (always USD for this store).
 */
export function transformToProductListItem(
	product: MeilisearchProduct,
): ProductListItemFragment {
	const minPrice = product.min_price;

	return {
		id: product.original_id,
		name: product.name,
		slug: product.slug,
		thumbnail: product.thumbnail
			? { url: product.thumbnail, alt: product.name }
			: null,
		pricing: minPrice !== null
			? {
					priceRange: {
						start: {
							gross: { amount: minPrice, currency: "USD" },
						},
						stop: {
							gross: { amount: minPrice, currency: "USD" },
						},
					},
				}
			: null,
		category: null,
		variants: product.variants.map((v) => ({
			quantityAvailable: v.stock,
		})),
		attributes: [
			{
				attribute: { slug: ATTRIBUTE_SLUGS.setName },
				values: product.set_name
					? [{ name: product.set_name, slug: product.set_name.toLowerCase().replace(/\s+/g, "-") }]
					: [],
			},
			{
				attribute: { slug: ATTRIBUTE_SLUGS.setCode },
				values: product.set_code
					? [{ name: product.set_code, slug: product.set_code.toLowerCase() }]
					: [],
			},
			{
				attribute: { slug: ATTRIBUTE_SLUGS.rarity },
				values: product.rarity
					? [{ name: product.rarity, slug: product.rarity.toLowerCase() }]
					: [],
			},
			{
				attribute: { slug: ATTRIBUTE_SLUGS.collectorNumber },
				values: product.collector_number
					? [{ name: product.collector_number, slug: product.collector_number }]
					: [],
			},
		],
	};
}

/**
 * Transform an array of Meilisearch products to ProductListItemFragment[].
 */
export function transformMeilisearchResults(
	products: MeilisearchProduct[],
): ProductListItemFragment[] {
	return products.map(transformToProductListItem);
}
