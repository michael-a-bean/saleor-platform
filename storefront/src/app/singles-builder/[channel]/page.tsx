export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { type ProductFilterInput } from "@/gql/graphql";
import {
	SinglesSearch,
	SinglesResultsWrapper,
	SinglesFilters,
	CartButton,
	CartDrawer,
	parseFiltersFromURL,
} from "./components";
import { buildSinglesFilter } from "./components/buildSinglesFilter";
import {
	searchWithMeilisearch,
	transformMeilisearchToGraphQL,
} from "./actions";

interface PageProps {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function SearchResults({
	channel,
	searchQuery,
	filter,
	filterState,
}: {
	channel: string;
	searchQuery: string;
	filter: ProductFilterInput;
	filterState: import("./components").SinglesFilterState;
}) {
	const hasSearch = searchQuery.trim().length > 0;
	const hasFilters = Object.keys(filter).length > 0;

	if (!hasSearch && !hasFilters) {
		return (
			<div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
				<svg
					className="mx-auto h-12 w-12 text-gray-400"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={1.5}
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
				<h3 className="mt-4 text-lg font-medium text-gray-900">Search for cards</h3>
				<p className="mt-2 text-gray-500">
					Start typing to search for Magic: The Gathering singles across all printings and variants.
				</p>
			</div>
		);
	}

	// Use Meilisearch for instant search with typo tolerance
	const meilisearchResult = await searchWithMeilisearch(searchQuery, channel, {
		limit: 50,
		conditions: filterState.condition,
		finishes: filterState.finish,
		rarity: filterState.rarity,
		inStockOnly: filterState.inStockOnly,
		priceMin: filterState.priceMin,
		priceMax: filterState.priceMax,
	});

	// Transform to GraphQL-compatible format
	const products = await transformMeilisearchToGraphQL(meilisearchResult);

	return (
		<SinglesResultsWrapper
			initialData={products}
			channel={channel}
			searchQuery={searchQuery}
			filterState={filterState}
		/>
	);
}

function SearchResultsSkeleton() {
	return (
		<div className="space-y-2">
			{[...Array(5)].map((_, i) => (
				<div
					key={i}
					className="h-32 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
				/>
			))}
		</div>
	);
}

export default async function SinglesBuilderPage({ params, searchParams }: PageProps) {
	const { channel } = await params;
	const resolvedSearchParams = await searchParams;
	const searchQuery = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : "";

	// Parse filter state from URL
	const urlSearchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(resolvedSearchParams)) {
		if (typeof value === "string") {
			urlSearchParams.set(key, value);
		}
	}
	const filterState = parseFiltersFromURL(urlSearchParams);

	// Build GraphQL filter
	const graphqlFilter = buildSinglesFilter(searchQuery, filterState);

	return (
		<div className="mx-auto max-w-7xl px-4 py-6">
			{/* Search Header */}
			<div className="mb-6">
				<SinglesSearch />
			</div>

			{/* Main Content Area */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
				{/* Filter Sidebar */}
				<aside className="rounded-lg border bg-white p-4 shadow-sm lg:col-span-1">
					<SinglesFilters />
				</aside>

				{/* Results Area */}
				<section className="lg:col-span-3">
					<div className="mb-4">
						<p className="text-sm text-gray-600">
							{searchQuery ? `Results for "${searchQuery}"` : "Use search or filters to find cards"}
						</p>
					</div>

					<Suspense fallback={<SearchResultsSkeleton />}>
						<SearchResults channel={channel} searchQuery={searchQuery} filter={graphqlFilter} filterState={filterState} />
					</Suspense>
				</section>
			</div>

			{/* Cart Button (floating) */}
			<div className="fixed bottom-4 right-4 z-30">
				<CartButton channel={channel} />
			</div>

			{/* Cart Drawer */}
			<CartDrawer channel={channel} />
		</div>
	);
}
