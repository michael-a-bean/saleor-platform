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

// Force dynamic rendering since this page uses notFound() and redirect()
export const dynamic = "force-dynamic";

export const metadata = {
	title: "Search products · MTG Card Marketplace",
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

	// Combine search with filter search terms (type line, set name)
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
						{products.totalCount !== undefined && (
							<p className="mt-1 text-sm text-neutral-500">
								{products.totalCount} {products.totalCount === 1 ? "result" : "results"}
								{activeFilterCount > 0 && ` (${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied)`}
							</p>
						)}
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
					{products.edges.length > 0 ? (
						<>
							<ProductList products={products.edges.map((e) => e.node)} />
							<Pagination pageInfo={products.pageInfo} />
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
