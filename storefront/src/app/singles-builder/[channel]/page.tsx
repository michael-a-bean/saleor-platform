export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { SinglesBuilderSearchDocument, type ProductFilterInput } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import {
	SinglesSearch,
	SinglesResultsWrapper,
	SinglesFilters,
	parseFiltersFromURL,
} from "./components";
import { buildSinglesFilter } from "./components/buildSinglesFilter";
import { fetchSinglesBuilderProducts, addToSinglesCart } from "./actions";

interface PageProps {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function SearchResults({
	channel,
	searchQuery,
	filter,
}: {
	channel: string;
	searchQuery: string;
	filter: ProductFilterInput;
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
					Start typing to search for MTG singles across all printings and variants.
				</p>
			</div>
		);
	}

	const products = await executeGraphQL(SinglesBuilderSearchDocument, {
		variables: {
			channel,
			search: searchQuery,
			first: 50,
			filter,
		},
		revalidate: 0,
	});

	// Bind the channel and filter to the action
	const boundFetchMore = async (
		channel: string,
		search: string,
		after: string | null,
	) => {
		"use server";
		return fetchSinglesBuilderProducts(channel, search, after, filter);
	};

	const boundAddToCart = async (variantId: string, quantity: number) => {
		"use server";
		return addToSinglesCart(variantId, quantity, channel);
	};

	return (
		<SinglesResultsWrapper
			initialData={products.products}
			channel={channel}
			searchQuery={searchQuery}
			fetchMoreAction={boundFetchMore}
			addToCartAction={boundAddToCart}
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
					<div className="mb-4 flex items-center justify-between">
						<p className="text-sm text-gray-600">
							{searchQuery ? `Results for "${searchQuery}"` : "Use search or filters to find cards"}
						</p>
						<select className="rounded border px-2 py-1 text-sm" disabled>
							<option>Sort: Relevance</option>
							<option>Sort: Price (Low)</option>
							<option>Sort: Price (High)</option>
							<option>Sort: Name (A-Z)</option>
						</select>
					</div>

					<Suspense fallback={<SearchResultsSkeleton />}>
						<SearchResults channel={channel} searchQuery={searchQuery} filter={graphqlFilter} />
					</Suspense>
				</section>
			</div>

			{/* Cart Drawer Placeholder */}
			<div className="fixed bottom-4 right-4">
				<button
					type="button"
					className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-white shadow-lg hover:bg-blue-700"
				>
					<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
						/>
					</svg>
					<span>Cart (0)</span>
				</button>
			</div>
		</div>
	);
}
