"use client";

import { useState, useCallback, useTransition, useMemo, useEffect } from "react";
import { toast } from "react-toastify";
import type { SinglesBuilderProductFragment, SinglesBuilderSearchQuery } from "@/gql/graphql";
import { SinglesResults } from "./SinglesResults";
import type { CartLineInfo } from "./SinglesResultItem";
import { useSinglesCartStore, type CartLine } from "../store";
import type { CartActionResult } from "../actions";
import { updateCartLineQuantity, removeCartLine } from "../actions";
import type { SinglesFilterState } from "./filterTypes";
import { matchesVariantFilters } from "./buildSinglesFilter";

/**
 * Check if a product name matches the search query.
 * For multi-word searches, ALL words must be present in the product name.
 * This filters out irrelevant results like "Verdant Force" when searching "verdant catacombs".
 */
function productNameMatchesSearch(productName: string, searchQuery: string): boolean {
	if (!searchQuery.trim()) return true;

	const normalizedName = productName.toLowerCase();
	const searchWords = searchQuery.toLowerCase().trim().split(/\s+/);

	// All search words must be present in the product name
	return searchWords.every((word) => normalizedName.includes(word));
}

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
	const [isPending, startTransition] = useTransition();

	// Sync products state when initialData changes (e.g., when filters are applied)
	useEffect(() => {
		setProducts(initialData?.edges.map((e) => e.node) || []);
		setPageInfo(initialData?.pageInfo);
	}, [initialData]);

	// Check if we have variant-level filters active
	const hasVariantFilters = filterState && (filterState.condition.length > 0 || filterState.finish.length > 0);

	// Filter products:
	// 1. By search query (all words must be in product name) - eliminates irrelevant results
	// 2. By variant-level attributes (condition, finish) - done client-side since Saleor doesn't support it
	const filteredProducts = useMemo((): SinglesBuilderProductFragment[] => {
		const result: SinglesBuilderProductFragment[] = [];

		for (const product of products) {
			// Filter by search query - all words must be present in product name
			if (!productNameMatchesSearch(product.name, searchQuery)) {
				continue;
			}

			// If we have variant filters, apply them
			if (hasVariantFilters && filterState) {
				const matchingVariants = product.variants?.filter((variant) =>
					matchesVariantFilters(variant.attributes, filterState),
				);

				// If no variants match, skip this product
				if (!matchingVariants || matchingVariants.length === 0) {
					continue;
				}

				// Add product with only matching variants
				result.push({
					...product,
					variants: matchingVariants,
				});
			} else {
				// No variant filters, just add the product
				result.push(product);
			}
		}

		return result;
	}, [products, searchQuery, filterState, hasVariantFilters]);

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

	const { cart, setCart } = useSinglesCartStore();

	// Build a map of variantId -> cart line info for quick lookup
	const cartLines = useMemo(() => {
		const map = new Map<string, CartLineInfo>();
		if (cart?.lines) {
			for (const line of cart.lines) {
				map.set(line.variant.id, {
					lineId: line.id,
					quantity: line.quantity,
				});
			}
		}
		return map;
	}, [cart?.lines]);

	// Helper to update cart state from action result
	const handleCartResult = useCallback((result: CartActionResult, successMessage?: string) => {
		if (result.success && result.checkout) {
			setCart({
				id: result.checkout.id,
				token: result.checkout.token,
				lines: result.checkout.lines as CartLine[],
				subtotalPrice: result.checkout.subtotalPrice,
				totalPrice: result.checkout.totalPrice,
				metadata: result.checkout.metadata,
			});
			if (successMessage) {
				toast.success(successMessage, { autoClose: 1500 });
			}
		} else if (result.error) {
			toast.error(result.error);
		}
	}, [setCart]);

	const handleQuickAdd = useCallback(
		async (variantId: string, quantity: number) => {
			try {
				const result = await addToCartAction(variantId, quantity);
				handleCartResult(result, "Added to cart!");
			} catch (error) {
				console.error("Failed to add to cart:", error);
				toast.error("Failed to add to cart");
			}
		},
		[addToCartAction, handleCartResult],
	);

	const handleUpdateQuantity = useCallback(
		async (lineId: string, quantity: number) => {
			try {
				const result = await updateCartLineQuantity(lineId, quantity, channel);
				handleCartResult(result);
			} catch (error) {
				console.error("Failed to update quantity:", error);
				toast.error("Failed to update quantity");
			}
		},
		[channel, handleCartResult],
	);

	const handleRemoveLine = useCallback(
		async (lineId: string) => {
			try {
				const result = await removeCartLine(lineId, channel);
				handleCartResult(result, "Removed from cart");
			} catch (error) {
				console.error("Failed to remove item:", error);
				toast.error("Failed to remove item");
			}
		},
		[channel, handleCartResult],
	);

	// Always show filtered count since we filter by search query match
	const displayCount = filteredProducts.length;

	return (
		<SinglesResults
			products={filteredProducts}
			totalCount={displayCount}
			hasNextPage={pageInfo?.hasNextPage || false}
			onLoadMore={handleLoadMore}
			isLoadingMore={isPending}
			onQuickAdd={handleQuickAdd}
			onUpdateQuantity={handleUpdateQuantity}
			onRemoveLine={handleRemoveLine}
			cartLines={cartLines}
		/>
	);
}
