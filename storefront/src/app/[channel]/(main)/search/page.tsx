import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { OrderDirection, ProductOrderField, ProductListFilteredDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { Pagination } from "@/ui/components/Pagination";
import { ProductList } from "@/ui/components/ProductList";
import { getPaginatedListVariables } from "@/lib/utils";
import { SortBy } from "@/ui/components/SortBy";
import { FilterSidebar, MobileFilterModal, ActiveFilters } from "@/ui/components/filters";
import { parseFiltersFromURL, buildProductFilter, getActiveFilterCount } from "@/lib/filters";
import { searchWebstore, checkMeilisearchHealth } from "./actions";
import { transformMeilisearchResults, createMeilisearchPageInfo } from "./transforms";

// Force dynamic rendering since this page uses notFound() and redirect()
export const dynamic = "force-dynamic";

export const metadata = {
	title: "Search · Magic: The Gathering Marketplace",
	description: "Search Magic: The Gathering cards",
};

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

// Convert sort param to Meilisearch sort format
// Returns undefined if sortable attributes aren't configured on the index
const getMeilisearchSort = (sortParam?: string | string[], hasSetFilter?: boolean): string[] | undefined => {
	const sortValue = Array.isArray(sortParam) ? sortParam[0] : sortParam;

	// Base sort: type_line ascending puts sealed products (empty type_line) before singles
	const sealedFirstSort = hasSetFilter ? ["type_line:asc"] : [];

	switch (sortValue) {
		case "price-asc":
			return [...sealedFirstSort, "min_price:asc"];
		case "price-desc":
			return [...sealedFirstSort, "min_price:desc"];
		default:
			// When viewing a set, sort sealed first then by name
			// Otherwise use Meilisearch relevance ranking
			return hasSetFilter ? [...sealedFirstSort, "name:asc"] : undefined;
	}
};

// Get page offset from cursor and direction (for Meilisearch pagination)
const getMeilisearchOffset = (
	cursor: string | undefined,
	direction: string | undefined,
	limit: number,
): number => {
	if (!cursor) return 0;

	// Cursor format: "offset:N" where N is the offset value
	const match = cursor.match(/^offset:(\d+)$/);
	if (!match) return 0;

	const cursorOffset = parseInt(match[1], 10);
	if (isNaN(cursorOffset)) return 0;

	// For "prev" direction, go back one page from the cursor
	// For "next" direction, use the cursor offset directly
	if (direction === "prev") {
		return Math.max(0, cursorOffset - limit);
	}
	return cursorOffset;
};

export default async function Page(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
	params: Promise<{ channel: string }>;
}) {
	const [searchParams, params] = await Promise.all([props.searchParams, props.params]);

	const searchValue = searchParams.query;

	if (!searchValue) {
		notFound();
	}

	if (Array.isArray(searchValue)) {
		const firstValidSearchValue = searchValue.find((v) => v.length > 0);
		if (!firstValidSearchValue) {
			notFound();
		}
		redirect(`/search?${new URLSearchParams({ query: firstValidSearchValue }).toString()}`);
	}

	// Convert searchParams to URLSearchParams for filter parsing
	const urlSearchParams = new URLSearchParams();
	Object.entries(searchParams).forEach(([key, value]) => {
		if (value !== undefined) {
			urlSearchParams.set(key, Array.isArray(value) ? value[0] : value);
		}
	});

	// Parse filters from URL
	const filters = parseFiltersFromURL(urlSearchParams);
	const productFilter = buildProductFilter(filters);
	const activeFilterCount = getActiveFilterCount(filters);

	// Check if Meilisearch is available
	const meilisearchHealthy = await checkMeilisearchHealth();

	// Variables for rendering
	let productList: ReturnType<typeof transformMeilisearchResults> = [];
	let totalCount = 0;
	let pageInfo: {
		hasNextPage: boolean;
		hasPreviousPage: boolean;
		startCursor: string | null;
		endCursor: string | null;
	} = { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null };
	let usedMeilisearch = false;
	let processingTimeMs = 0;

	if (meilisearchHealthy) {
		// Use Meilisearch for search
		usedMeilisearch = true;

		// Get pagination offset from cursor and direction
		const cursor = Array.isArray(searchParams.cursor) ? searchParams.cursor[0] : searchParams.cursor;
		const direction = Array.isArray(searchParams.direction) ? searchParams.direction[0] : searchParams.direction;
		const limit = 24; // Products per page
		const offset = getMeilisearchOffset(cursor, direction, limit);

		// Build Meilisearch filters from URL filters
		const meilisearchFilters: {
			rarity?: string[];
			typeLine?: string;
			setName?: string;
			priceRange?: { min?: number; max?: number };
			inStockOnly?: boolean;
		} = {};

		if (filters.rarity.length > 0) {
			// Transform Saleor attribute slugs (mtg-rarity-common) to Meilisearch values (common)
			meilisearchFilters.rarity = filters.rarity.map((r) =>
				r.replace(/^mtg-rarity-/, ""),
			);
		}
		// typeLine is post-filtered in actions.ts (Meilisearch doesn't support partial string matching)
		if (filters.typeLine) {
			meilisearchFilters.typeLine = filters.typeLine;
		}
		// setName uses exact matching filter
		if (filters.setName) {
			meilisearchFilters.setName = filters.setName;
		}
		if (filters.price.min !== undefined || filters.price.max !== undefined) {
			meilisearchFilters.priceRange = {
				min: filters.price.min,
				max: filters.price.max,
			};
		}

		// Use the search query directly - setName and typeLine are filtered separately
		const combinedQuery = searchValue;

		// When viewing a set, sort sealed products before singles
		const hasSetFilter = !!filters.setName;
		const meilisearchSort = getMeilisearchSort(searchParams.sort, hasSetFilter);

		const result = await searchWebstore(combinedQuery, params.channel, {
			limit,
			offset,
			filters: meilisearchFilters,
			sort: meilisearchSort,
		});

		productList = transformMeilisearchResults(result.products);
		totalCount = result.totalCount;
		processingTimeMs = result.processingTimeMs;
		pageInfo = createMeilisearchPageInfo(offset, limit, result.totalCount);
	} else {
		// Fallback to Saleor GraphQL search
		const filterSearchTerms = productFilter.search || "";
		const combinedSearchQuery = [searchValue, filterSearchTerms].filter(Boolean).join(" ");

		const combinedFilter = {
			...productFilter,
			search: combinedSearchQuery,
		};

		const paginationVariables = getPaginatedListVariables({ params: searchParams });
		const sortVariables = getSortVariables(searchParams.sort);

		const { products } = await executeGraphQL(ProductListFilteredDocument, {
			variables: {
				...paginationVariables,
				channel: params.channel,
				sortBy: sortVariables,
				filter: combinedFilter,
			},
			revalidate: 60,
		});

		if (!products) {
			notFound();
		}

		productList = products.edges.map((e) => e.node);
		totalCount = products.totalCount ?? 0;
		pageInfo = {
			hasNextPage: products.pageInfo.hasNextPage,
			hasPreviousPage: products.pageInfo.hasPreviousPage,
			startCursor: products.pageInfo.startCursor ?? null,
			endCursor: products.pageInfo.endCursor ?? null,
		};
	}

	return (
		<section className="mx-auto max-w-7xl p-8 pb-16">
			<div className="flex gap-8">
				{/* Desktop Sidebar - hidden on mobile */}
				<div className="hidden lg:block">
					<Suspense fallback={<div className="w-64" />}>
						<FilterSidebar />
					</Suspense>
				</div>

				{/* Main content */}
				<div className="flex-1">
					{/* Header with search query and controls */}
					<div className="mb-6">
						<h1 className="text-xl font-semibold">
							Search results for &quot;{searchValue}&quot;
						</h1>
						<p className="mt-1 text-sm text-neutral-500">
							{totalCount} {totalCount === 1 ? "result" : "results"}
							{activeFilterCount > 0 && ` (${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied)`}
							{usedMeilisearch && processingTimeMs > 0 && (
								<span className="ml-2 text-neutral-400">({processingTimeMs}ms)</span>
							)}
						</p>
					</div>

					{/* Filter controls row */}
					<div className="mb-6 flex items-center justify-between gap-4">
						<Suspense fallback={null}>
							<MobileFilterModal />
						</Suspense>
						<SortBy />
					</div>

					{/* Active filters display */}
					<Suspense fallback={null}>
						<ActiveFilters />
					</Suspense>

					{/* Product list */}
					<h2 className="sr-only">Product list</h2>
					{productList.length > 0 ? (
						<>
							<ProductList products={productList} />
							<Pagination pageInfo={pageInfo} />
						</>
					) : (
						<div className="py-12 text-center">
							<p className="text-lg text-neutral-600">No products found</p>
							<p className="mt-2 text-sm text-neutral-500">
								Try adjusting your filters or search for something else
							</p>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
