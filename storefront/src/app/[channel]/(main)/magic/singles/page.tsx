import { type ReactNode, Suspense } from "react";
import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { ProductListFilteredDocument, OrderDirection, ProductOrderField, type ProductListItemFragment } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { ProductList } from "@/ui/components/ProductList";
import { getPaginatedListVariables } from "@/lib/utils";
import { ProductsPerPage } from "@/app/config";
import { Pagination } from "@/ui/components/Pagination";
import { OffsetPagination } from "@/ui/components/OffsetPagination";
import { SortBy } from "@/ui/components/SortBy";
import { FilterSidebar, MobileFilterModal, ActiveFilters } from "@/ui/components/filters";
import { parseFiltersFromURL, buildProductFilter, getActiveFilterCount } from "@/lib/filters";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { MagicSubNav } from "@/ui/components/MagicSubNav";
import { searchProducts, isMeilisearchHealthy } from "@/lib/meilisearch";
import { transformMeilisearchResults } from "@/lib/filters/transformMeilisearchResults";
import {
	buildMeilisearchFilters,
	buildExtraFilterParts,
	buildMeilisearchQuery,
	getMeilisearchSort,
	hasMeilisearchUnsupportedFilters,
} from "@/lib/filters/buildMeilisearchFilter";

export const metadata: Metadata = {
	title: "Magic: The Gathering Singles",
	description: "Browse Magic: The Gathering single cards. Filter by rarity, color, set, price, and more.",
};

export const dynamic = "force-dynamic";

// Category ID for MTG Cards (base64 encoded: Category:2)
const MTG_CARDS_CATEGORY_ID = "Q2F0ZWdvcnk6Mg==";

const getSortVariables = (sortParam?: string | string[]) => {
	const sortValue = Array.isArray(sortParam) ? sortParam[0] : sortParam;

	switch (sortValue) {
		case "price-asc":
			return { field: ProductOrderField.MinimalPrice, direction: OrderDirection.Asc };
		case "price-desc":
			return { field: ProductOrderField.MinimalPrice, direction: OrderDirection.Desc };
		default:
			return { field: ProductOrderField.Name, direction: OrderDirection.Asc };
	}
};

function SinglesPageLayout({
	totalCount,
	activeFilterCount,
	products,
	pagination,
}: {
	totalCount: number;
	activeFilterCount: number;
	products: readonly ProductListItemFragment[];
	pagination: ReactNode;
}) {
	return (
		<section className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Magic: The Gathering", href: "/magic" },
					{ label: "Singles" },
				]}
				className="mb-4"
			/>
			<MagicSubNav />

			<div className="mb-6">
				<h1 className="text-2xl font-bold">Magic: The Gathering Singles</h1>
				<p className="mt-1 text-neutral-500">
					{totalCount.toLocaleString()} cards available
				</p>
			</div>

			<div className="flex gap-8">
				<div className="hidden lg:block">
					<Suspense fallback={<div className="w-64" />}>
						<FilterSidebar />
					</Suspense>
				</div>

				<div className="flex-1">
					<div className="mb-6 flex items-center justify-between gap-4">
						<div className="flex items-center gap-4">
							<Suspense fallback={null}>
								<MobileFilterModal />
							</Suspense>
							{activeFilterCount > 0 && (
								<span className="hidden text-sm text-neutral-500 lg:inline">
									{totalCount} {totalCount === 1 ? "result" : "results"}
								</span>
							)}
						</div>
						<SortBy />
					</div>

					<Suspense fallback={null}>
						<ActiveFilters />
					</Suspense>

					<h2 className="sr-only">Product list</h2>
					{products.length > 0 ? (
						<>
							<ProductList products={products} />
							{pagination}
						</>
					) : (
						<div className="py-12 text-center">
							<p className="text-lg text-neutral-600">No cards found</p>
							<p className="mt-2 text-sm text-neutral-500">
								Try adjusting your filters or search criteria
							</p>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}

export default async function SinglesPage(props: {
	params: Promise<{ channel: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const searchParams = await props.searchParams;
	const params = await props.params;

	// Convert searchParams to URLSearchParams for filter parsing
	const urlSearchParams = new URLSearchParams();
	Object.entries(searchParams).forEach(([key, value]) => {
		if (value !== undefined) {
			urlSearchParams.set(key, Array.isArray(value) ? value[0] : value);
		}
	});

	// Parse filters from URL
	const filters = parseFiltersFromURL(urlSearchParams);
	const activeFilterCount = getActiveFilterCount(filters);

	// Determine if we can use Meilisearch or need Saleor fallback
	const needsSaleorFallback = hasMeilisearchUnsupportedFilters(filters);
	const meilisearchHealthy = needsSaleorFallback ? false : await isMeilisearchHealthy();
	const useMeilisearch = meilisearchHealthy && !needsSaleorFallback;

	if (useMeilisearch) {
		const page = Math.max(1, parseInt(String(searchParams.page ?? "1"), 10) || 1);
		const offset = (page - 1) * ProductsPerPage;

		const meilisearchFilters = buildMeilisearchFilters(filters);
		const extraFilterParts = buildExtraFilterParts(filters);
		// Restrict to MTG products — all MTG cards have a set_code, non-MTG products don't
		extraFilterParts.push("set_code EXISTS");
		const query = buildMeilisearchQuery(filters);
		const sort = getMeilisearchSort(searchParams.sort);

		const result = await searchProducts(query, params.channel, {
			limit: ProductsPerPage,
			offset,
			filters: meilisearchFilters,
			sort,
			extraFilterParts,
		});

		// If search failed (processingTimeMs=0 is the error sentinel from searchProducts),
		// fall through to Saleor GraphQL instead of showing an empty catalog
		if (result.hits.length === 0 && result.processingTimeMs === 0 && offset === 0 && !query) {
			// Fall through to Saleor fallback below
		} else {
			return (
				<SinglesPageLayout
					totalCount={result.estimatedTotalHits}
					activeFilterCount={activeFilterCount}
					products={transformMeilisearchResults(result.hits)}
					pagination={
						<OffsetPagination
							totalCount={result.estimatedTotalHits}
							pageSize={ProductsPerPage}
							currentPage={page}
						/>
					}
				/>
			);
		}
	}

	// --- Saleor GraphQL fallback path ---
	const productFilter = buildProductFilter(filters);
	productFilter.categories = [MTG_CARDS_CATEGORY_ID];

	const paginationVariables = getPaginatedListVariables({ params: searchParams });
	const sortVariables = getSortVariables(searchParams.sort);

	const { products } = await executeGraphQL(ProductListFilteredDocument, {
		variables: {
			...paginationVariables,
			channel: params.channel,
			sortBy: sortVariables,
			filter: productFilter,
		},
		revalidate: 60,
	});

	if (!products) {
		notFound();
	}

	return (
		<SinglesPageLayout
			totalCount={products.totalCount ?? 0}
			activeFilterCount={activeFilterCount}
			products={products.edges.map((e) => e.node)}
			pagination={<Pagination pageInfo={products.pageInfo} />}
		/>
	);
}
