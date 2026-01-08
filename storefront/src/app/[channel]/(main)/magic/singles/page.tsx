import { Suspense } from "react";
import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { ProductListFilteredDocument, OrderDirection, ProductOrderField } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { Pagination } from "@/ui/components/Pagination";
import { ProductList } from "@/ui/components/ProductList";
import { getPaginatedListVariables } from "@/lib/utils";
import { SortBy } from "@/ui/components/SortBy";
import { FilterSidebar, MobileFilterModal, ActiveFilters } from "@/ui/components/filters";
import { parseFiltersFromURL, buildProductFilter, getActiveFilterCount } from "@/lib/filters";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { MagicSubNav } from "@/ui/components/MagicSubNav";

export const metadata: Metadata = {
	title: "MTG Singles",
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
	const productFilter = buildProductFilter(filters);
	const activeFilterCount = getActiveFilterCount(filters);

	// Add category filter to restrict to MTG singles
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
		<section className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Magic", href: "/magic" },
					{ label: "Singles" },
				]}
				className="mb-4"
			/>
			<MagicSubNav />

			<div className="mb-6">
				<h1 className="text-2xl font-bold">MTG Singles</h1>
				<p className="mt-1 text-neutral-500">
					{products.totalCount?.toLocaleString()} cards available
				</p>
			</div>

			<div className="flex gap-8">
				{/* Desktop Sidebar - hidden on mobile */}
				<div className="hidden lg:block">
					<Suspense fallback={<div className="w-64" />}>
						<FilterSidebar />
					</Suspense>
				</div>

				{/* Main content */}
				<div className="flex-1">
					{/* Header with mobile filter button and sort */}
					<div className="mb-6 flex items-center justify-between gap-4">
						<div className="flex items-center gap-4">
							<Suspense fallback={null}>
								<MobileFilterModal />
							</Suspense>
							{activeFilterCount > 0 && (
								<span className="hidden text-sm text-neutral-500 lg:inline">
									{products.totalCount} {products.totalCount === 1 ? "result" : "results"}
								</span>
							)}
						</div>
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
