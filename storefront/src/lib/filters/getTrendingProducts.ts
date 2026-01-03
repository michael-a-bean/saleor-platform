"use server";

import { executeGraphQL } from "@/lib/graphql";
import {
	ProductListFilteredDocument,
	ProductListByCollectionDocument,
	OrderDirection,
	ProductOrderField,
} from "@/gql/graphql";
import type { ProductListItemFragment } from "@/gql/graphql";

/**
 * Collection slugs to try for curated trending products.
 * Create these collections in Saleor Dashboard to enable manual curation.
 * The first collection found with products will be used.
 */
const TRENDING_COLLECTION_SLUGS = ["featured", "trending", "bestsellers", "popular"];

/**
 * Fetches trending/featured products for the storefront.
 *
 * Strategy:
 * 1. Try to fetch from curated collections (featured, trending, bestsellers, popular)
 * 2. If no collection exists or is empty, fall back to recently modified products
 *
 * To curate trending products:
 * - Create a collection in Saleor Dashboard with slug "featured" (or "trending")
 * - Add products you want to feature on the homepage
 * - Products will appear in the order set in the collection
 *
 * Fallback behavior:
 * - Shows recently modified products (proxy for market activity)
 * - Products with price updates, stock changes, or edits appear first
 */
export async function getTrendingProducts(
	channel: string = "webstore",
	limit: number = 12,
): Promise<ProductListItemFragment[]> {
	// First, try to fetch from a curated collection
	const collectionProducts = await fetchFromCollection(channel, limit);
	if (collectionProducts.length > 0) {
		return collectionProducts;
	}

	// Fallback: fetch recently modified products
	return fetchRecentlyModified(channel, limit);
}

/**
 * Try to fetch products from curated collections.
 * Returns empty array if no collection exists or has no products.
 */
async function fetchFromCollection(
	channel: string,
	limit: number,
): Promise<ProductListItemFragment[]> {
	for (const slug of TRENDING_COLLECTION_SLUGS) {
		try {
			const data = await executeGraphQL(ProductListByCollectionDocument, {
				variables: {
					slug,
					channel,
				},
				revalidate: 300, // Cache for 5 minutes
			});

			const products = data.collection?.products?.edges.map(({ node }) => node) ?? [];
			if (products.length > 0) {
				// Return up to limit products from this collection
				return products.slice(0, limit);
			}
		} catch {
			// Collection doesn't exist, try next one
			continue;
		}
	}

	return [];
}

/**
 * Fetch recently modified products as a fallback.
 * Recently modified products often indicate market activity
 * (price updates, stock changes, new additions).
 */
async function fetchRecentlyModified(
	channel: string,
	limit: number,
): Promise<ProductListItemFragment[]> {
	try {
		const data = await executeGraphQL(ProductListFilteredDocument, {
			variables: {
				first: limit,
				channel,
				sortBy: {
					field: ProductOrderField.LastModifiedAt,
					direction: OrderDirection.Desc,
				},
			},
			revalidate: 300, // Cache for 5 minutes
		});

		return data.products?.edges.map(({ node }) => node) ?? [];
	} catch (error) {
		console.error("Error fetching recently modified products:", error);
		return [];
	}
}
