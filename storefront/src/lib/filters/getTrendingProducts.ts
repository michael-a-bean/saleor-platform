"use server";

import { executeGraphQL } from "@/lib/graphql";
import { ProductListFilteredDocument, OrderDirection, ProductOrderField } from "@/gql/graphql";
import type { ProductListItemFragment } from "@/gql/graphql";

/**
 * Fetches trending/best-selling products for the storefront.
 *
 * Current implementation: Returns products sorted alphabetically by name
 * for deterministic ordering when sales data is equal/unavailable.
 *
 * Enhancement path: When sales tracking is implemented, this function
 * can be updated to use actual sales data from:
 * - A custom API endpoint exposing order line aggregations
 * - A database view of product sales counts
 * - The reportProductSales query (requires admin token)
 *
 * Tie-breaker logic: Products with equal sales are sorted alphabetically
 * by name for consistent, deterministic results.
 */
export async function getTrendingProducts(
	channel: string = "webstore",
	limit: number = 12,
): Promise<ProductListItemFragment[]> {
	try {
		const data = await executeGraphQL(ProductListFilteredDocument, {
			variables: {
				first: limit,
				channel,
				sortBy: {
					field: ProductOrderField.Name,
					direction: OrderDirection.Asc,
				},
			},
			revalidate: 300, // Cache for 5 minutes
		});

		return data.products?.edges.map(({ node }) => node) ?? [];
	} catch (error) {
		console.error("Error fetching trending products:", error);
		return [];
	}
}
