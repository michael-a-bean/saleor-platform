"use client";

import { useState, useCallback, useTransition, useMemo } from "react";
import { toast } from "react-toastify";
import type { SinglesBuilderProductFragment, SinglesBuilderSearchQuery } from "@/gql/graphql";
import { SinglesResults } from "./SinglesResults";
import { useSinglesCartStore, type CartLine } from "../store";
import type { CartActionResult } from "../actions";
import type { SinglesFilterState } from "./filterTypes";
import { matchesVariantFilters } from "./buildSinglesFilter";

interface SinglesResultsWrapperProps {
	initialData: SinglesBuilderSearchQuery["products"];
	channel: string;
	searchQuery: string;
	filterState?: SinglesFilterState;
	fetchMoreAction: (
		channel: string,
		search: string,
		after: string | null,
	) => Promise<SinglesBuilderSearchQuery["products"]>;
	addToCartAction: (variantId: string, quantity: number) => Promise<CartActionResult>;
}

export function SinglesResultsWrapper({
	initialData,
	channel,
	searchQuery,
	filterState,
	fetchMoreAction,
	addToCartAction,
}: SinglesResultsWrapperProps) {
	const [products, setProducts] = useState<SinglesBuilderProductFragment[]>(
		initialData?.edges.map((e) => e.node) || [],
	);
	const [pageInfo, setPageInfo] = useState(initialData?.pageInfo);
	const [totalCount] = useState(initialData?.totalCount || 0);
	const [isPending, startTransition] = useTransition();

	// Check if we have variant-level filters active
	const hasVariantFilters = filterState && (filterState.condition.length > 0 || filterState.finish.length > 0);

	// Filter products by variant-level attributes (condition, finish)
	// This is done client-side because Saleor only supports product-level filtering
	const filteredProducts = useMemo(() => {
		if (!hasVariantFilters || !filterState) {
			return products;
		}

		return products
			.map((product) => {
				// Filter variants that match the condition/finish filters
				const matchingVariants = product.variants?.filter((variant) =>
					matchesVariantFilters(variant.attributes, filterState),
				);

				// If no variants match, exclude this product
				if (!matchingVariants || matchingVariants.length === 0) {
					return null;
				}

				// Return product with only matching variants
				return {
					...product,
					variants: matchingVariants,
				};
			})
			.filter((p): p is SinglesBuilderProductFragment => p !== null);
	}, [products, filterState, hasVariantFilters]);

	const handleLoadMore = useCallback(() => {
		if (!pageInfo?.hasNextPage || !pageInfo?.endCursor || isPending) return;

		startTransition(async () => {
			try {
				const moreData = await fetchMoreAction(channel, searchQuery, pageInfo.endCursor ?? null);
				if (moreData) {
					setProducts((prev) => [...prev, ...moreData.edges.map((e) => e.node)]);
					setPageInfo(moreData.pageInfo);
				}
			} catch (error) {
				console.error("Failed to load more:", error);
				toast.error("Failed to load more results");
			}
		});
	}, [channel, searchQuery, pageInfo, isPending, fetchMoreAction]);

	const { setCart } = useSinglesCartStore();

	const handleQuickAdd = useCallback(
		async (variantId: string, quantity: number) => {
			try {
				const result = await addToCartAction(variantId, quantity);
				if (result.success) {
					// Update the cart store with the new checkout data
					if (result.checkout) {
						setCart({
							id: result.checkout.id,
							token: result.checkout.token,
							lines: result.checkout.lines as CartLine[],
							subtotalPrice: result.checkout.subtotalPrice,
							totalPrice: result.checkout.totalPrice,
							metadata: result.checkout.metadata,
						});
					}
					toast.success("Added to cart!", { autoClose: 1500 });
				} else {
					toast.error(result.error || "Failed to add to cart");
				}
			} catch (error) {
				console.error("Failed to add to cart:", error);
				toast.error("Failed to add to cart");
			}
		},
		[addToCartAction, setCart],
	);

	// Calculate display count - if variant filtering is active, show filtered count
	const displayCount = hasVariantFilters ? filteredProducts.length : totalCount;

	return (
		<SinglesResults
			products={filteredProducts}
			totalCount={displayCount}
			hasNextPage={pageInfo?.hasNextPage || false}
			onLoadMore={handleLoadMore}
			isLoadingMore={isPending}
			onQuickAdd={handleQuickAdd}
		/>
	);
}
