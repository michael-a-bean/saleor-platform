import { notFound } from "next/navigation";
import { type ResolvingMetadata, type Metadata } from "next";
import { ProductListByCategoryDocument } from "@/gql/graphql";

export const dynamic = "force-dynamic";
import { executeGraphQL } from "@/lib/graphql";
import { getPaginatedListVariables } from "@/lib/utils";
import { ProductList } from "@/ui/components/ProductList";
import { Pagination } from "@/ui/components/Pagination";
import { fetchCategoryMetadata, searchCategoryProducts, checkMeilisearchHealth } from "./actions";
import { transformMeilisearchResults, createMeilisearchPageInfo } from "../../search/transforms";

export const generateMetadata = async (
	props: { params: Promise<{ slug: string; channel: string }> },
	parent: ResolvingMetadata,
): Promise<Metadata> => {
	const params = await props.params;
	const metadata = await fetchCategoryMetadata(params.slug);

	return {
		title: `${metadata?.name || "Category"} | ${metadata?.seoTitle || (await parent).title?.absolute}`,
		description: metadata?.seoDescription || metadata?.description || metadata?.seoTitle || metadata?.name,
	};
};

/**
 * Get Meilisearch sort from URL sort param.
 */
const getMeilisearchSort = (sortParam?: string): string[] => {
	switch (sortParam) {
		case "price-asc":
			return ["min_price:asc"];
		case "price-desc":
			return ["min_price:desc"];
		default:
			return ["name:asc"];
	}
};

/**
 * Parse offset from cursor param. Gracefully handles old cursor-based pagination
 * URLs by returning 0 (page 1) for unrecognized formats.
 */
const getMeilisearchOffset = (
	cursor: string | undefined,
	direction: string | undefined,
	limit: number,
): number => {
	if (!cursor) return 0;
	const match = cursor.match(/^offset:(\d+)$/);
	if (!match) return 0;
	const cursorOffset = parseInt(match[1], 10);
	if (isNaN(cursorOffset)) return 0;
	if (direction === "prev") {
		return Math.max(0, cursorOffset - limit);
	}
	return cursorOffset;
};

export default async function Page(props: {
	params: Promise<{ slug: string; channel: string }>;
	searchParams: Promise<{ cursor?: string; direction?: string; sort?: string }>;
}) {
	const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

	// Always fetch category metadata from Saleor (cached 5 min).
	// This determines if the category exists (notFound if not)
	// and provides name + SEO regardless of which product source we use.
	const metadata = await fetchCategoryMetadata(params.slug);
	if (!metadata) {
		notFound();
	}

	// Try Meilisearch first for products
	const useMeilisearch = await checkMeilisearchHealth();

	if (useMeilisearch) {
		const limit = 24;
		const offset = getMeilisearchOffset(searchParams.cursor, searchParams.direction, limit);
		const sort = getMeilisearchSort(searchParams.sort);

		const result = await searchCategoryProducts(params.slug, params.channel, {
			limit,
			offset,
			sort,
		});

		// Amendment A3: If Meilisearch returns 0 results on first page,
		// fall back to GraphQL to verify (Meili may be stale/reindexing).
		if (result.totalCount === 0 && offset === 0) {
			// Fall through to GraphQL path below
		} else {
			const productList = transformMeilisearchResults(result.products);
			const pageInfo = createMeilisearchPageInfo(offset, limit, result.totalCount);

			return (
				<div className="mx-auto max-w-7xl p-8 pb-16">
					<h1 className="pb-8 text-xl font-semibold">{metadata.name}</h1>
					<p className="pb-4 text-sm text-neutral-500">
						{result.totalCount} {result.totalCount === 1 ? "product" : "products"}
						{result.processingTimeMs > 0 && (
							<span className="ml-2 text-neutral-400">({result.processingTimeMs}ms)</span>
						)}
					</p>
					<ProductList products={productList} />
					<Pagination pageInfo={pageInfo} />
				</div>
			);
		}
	}

	// GraphQL fallback path (original behavior)
	const paginationVars = getPaginatedListVariables({ params: searchParams, pageSize: 24 });

	const { category } = await executeGraphQL(ProductListByCategoryDocument, {
		variables: { slug: params.slug, channel: params.channel, ...paginationVars },
		revalidate: 60,
	});

	if (!category || !category.products) {
		notFound();
	}

	const { products } = category;
	const productsWithPagination = products as typeof products & {
		totalCount?: number;
		pageInfo?: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor?: string | null; endCursor?: string | null };
	};

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<h1 className="pb-8 text-xl font-semibold">{metadata.name}</h1>
			{productsWithPagination.totalCount != null && (
				<p className="pb-4 text-sm text-neutral-500">{productsWithPagination.totalCount} products</p>
			)}
			<ProductList products={products.edges.map((e) => e.node)} />
			{productsWithPagination.pageInfo && <Pagination pageInfo={productsWithPagination.pageInfo} />}
		</div>
	);
}
