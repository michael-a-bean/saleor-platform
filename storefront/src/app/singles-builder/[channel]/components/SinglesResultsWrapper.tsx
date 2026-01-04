"use client";

import { useState, useCallback, useTransition } from "react";
import { toast } from "react-toastify";
import type { SinglesBuilderProductFragment, SinglesBuilderSearchQuery } from "@/gql/graphql";
import { SinglesResults } from "./SinglesResults";

interface SinglesResultsWrapperProps {
	initialData: SinglesBuilderSearchQuery["products"];
	channel: string;
	searchQuery: string;
	fetchMoreAction: (
		channel: string,
		search: string,
		after: string | null,
	) => Promise<SinglesBuilderSearchQuery["products"]>;
	addToCartAction: (variantId: string, quantity: number) => Promise<{ success: boolean; error?: string }>;
}

export function SinglesResultsWrapper({
	initialData,
	channel,
	searchQuery,
	fetchMoreAction,
	addToCartAction,
}: SinglesResultsWrapperProps) {
	const [products, setProducts] = useState<SinglesBuilderProductFragment[]>(
		initialData?.edges.map((e) => e.node) || [],
	);
	const [pageInfo, setPageInfo] = useState(initialData?.pageInfo);
	const [totalCount] = useState(initialData?.totalCount || 0);
	const [isPending, startTransition] = useTransition();

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

	const handleQuickAdd = useCallback(
		async (variantId: string, quantity: number) => {
			try {
				const result = await addToCartAction(variantId, quantity);
				if (result.success) {
					toast.success("Added to cart!", { autoClose: 1500 });
				} else {
					toast.error(result.error || "Failed to add to cart");
				}
			} catch (error) {
				console.error("Failed to add to cart:", error);
				toast.error("Failed to add to cart");
			}
		},
		[addToCartAction],
	);

	return (
		<SinglesResults
			products={products}
			totalCount={totalCount}
			hasNextPage={pageInfo?.hasNextPage || false}
			onLoadMore={handleLoadMore}
			isLoadingMore={isPending}
			onQuickAdd={handleQuickAdd}
		/>
	);
}
