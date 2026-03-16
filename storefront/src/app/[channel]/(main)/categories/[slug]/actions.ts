"use server";

import {
	searchProducts,
	isMeilisearchHealthy,
	type MeilisearchProduct,
} from "@/lib/meilisearch";

export interface CategoryMetadata {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	seoTitle: string | null;
	seoDescription: string | null;
}

const CATEGORY_METADATA_QUERY = `
	query CategoryMetadata($slug: String!) {
		category(slug: $slug) {
			id
			name
			slug
			description
			seoTitle
			seoDescription
		}
	}
`;

/**
 * Fetch category metadata (name, SEO) without products.
 * Uses a direct GraphQL call with 5-min cache to avoid the heavy product fetch.
 */
export async function fetchCategoryMetadata(slug: string): Promise<CategoryMetadata | null> {
	const apiUrl = process.env.SALEOR_API_URL || process.env.NEXT_PUBLIC_SALEOR_API_URL;
	if (!apiUrl) return null;

	try {
		const response = await fetch(apiUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				query: CATEGORY_METADATA_QUERY,
				operationName: "CategoryMetadata",
				variables: { slug },
			}),
			next: { revalidate: 300 },
		});

		if (!response.ok) return null;

		const json = (await response.json()) as { data?: { category: CategoryMetadata | null } };
		return json.data?.category ?? null;
	} catch {
		return null;
	}
}

export interface CategorySearchResult {
	products: MeilisearchProduct[];
	totalCount: number;
	processingTimeMs: number;
}

export async function searchCategoryProducts(
	categorySlug: string,
	channel: string,
	options: {
		limit?: number;
		offset?: number;
		sort?: string[];
	} = {},
): Promise<CategorySearchResult> {
	const { limit = 24, offset = 0, sort } = options;

	const result = await searchProducts("", channel, {
		limit,
		offset,
		filters: { categorySlug },
		sort,
	});

	return {
		products: result.hits,
		totalCount: result.estimatedTotalHits,
		processingTimeMs: result.processingTimeMs,
	};
}

export async function checkMeilisearchHealth(): Promise<boolean> {
	return isMeilisearchHealthy();
}
