"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SinglesBuilderProductFragment } from "@/gql/graphql";
import { SinglesResultItem, type CartLineInfo } from "./SinglesResultItem";

// Estimate row height: header (~92px) + variants (~40px each, assume avg 2 variants)
const ESTIMATED_ROW_HEIGHT = 172;

interface SinglesResultsProps {
	products: SinglesBuilderProductFragment[];
	totalCount: number;
	hasNextPage: boolean;
	onLoadMore: () => void;
	isLoadingMore: boolean;
	onQuickAdd: (variantId: string, quantity: number) => Promise<void>;
	onUpdateQuantity: (lineId: string, quantity: number) => Promise<void>;
	onRemoveLine: (lineId: string) => Promise<void>;
	cartLines?: Map<string, CartLineInfo>; // Map of variantId -> cart line info
}

export function SinglesResults({
	products,
	totalCount,
	hasNextPage,
	onLoadMore,
	isLoadingMore,
	onQuickAdd,
	onUpdateQuantity,
	onRemoveLine,
	cartLines,
}: SinglesResultsProps) {
	"use no memo"; // TanStack Virtual uses interior mutability incompatible with React Compiler
	const parentRef = useRef<HTMLDivElement>(null);
	const [parentHeight, setParentHeight] = useState(600);

	// Update parent height on resize
	useEffect(() => {
		const updateHeight = () => {
			if (parentRef.current) {
				// Calculate available height (viewport - header - padding)
				const rect = parentRef.current.getBoundingClientRect();
				const availableHeight = window.innerHeight - rect.top - 32; // 32px bottom padding
				setParentHeight(Math.max(400, availableHeight));
			}
		};

		updateHeight();
		window.addEventListener("resize", updateHeight);
		return () => window.removeEventListener("resize", updateHeight);
	}, []);

	const virtualizer = useVirtualizer({
		count: products.length,
		getScrollElement: () => parentRef.current,
		estimateSize: useCallback(() => ESTIMATED_ROW_HEIGHT, []),
		overscan: 5,
	});

	const items = virtualizer.getVirtualItems();

	// Load more when scrolling near the bottom
	useEffect(() => {
		const lastItem = items[items.length - 1];
		if (!lastItem) return;

		// When we're within 5 items of the end, load more
		if (lastItem.index >= products.length - 5 && hasNextPage && !isLoadingMore) {
			onLoadMore();
		}
	}, [items, products.length, hasNextPage, isLoadingMore, onLoadMore]);

	if (products.length === 0) {
		return (
			<div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
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
						d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<h3 className="mt-4 text-lg font-medium text-gray-900">No results found</h3>
				<p className="mt-2 text-sm text-gray-500">
					Try adjusting your search terms or clearing filters.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			{/* Results count header */}
			<div className="mb-2 flex items-center justify-between text-sm text-gray-600">
				<span>
					Showing {products.length} of {totalCount.toLocaleString()} results
				</span>
				{isLoadingMore && (
					<span className="flex items-center gap-2 text-blue-600">
						<svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle
								className="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								strokeWidth="4"
							/>
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							/>
						</svg>
						Loading more...
					</span>
				)}
			</div>

			{/* Virtualized list container */}
			<div
				ref={parentRef}
				className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm"
				style={{ height: parentHeight }}
			>
				<div
					style={{
						height: `${virtualizer.getTotalSize()}px`,
						width: "100%",
						position: "relative",
					}}
				>
					{items.map((virtualRow) => {
						const product = products[virtualRow.index];
						return (
							<div
								key={product.id}
								data-index={virtualRow.index}
								ref={virtualizer.measureElement}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									transform: `translateY(${virtualRow.start}px)`,
								}}
							>
								<SinglesResultItem
									product={product}
									onQuickAdd={onQuickAdd}
									onUpdateQuantity={onUpdateQuantity}
									onRemoveLine={onRemoveLine}
									cartLines={cartLines}
								/>
							</div>
						);
					})}
				</div>

				{/* Load more indicator at bottom */}
				{hasNextPage && (
					<div className="border-t border-gray-100 bg-gray-50 p-4 text-center">
						<button
							type="button"
							onClick={onLoadMore}
							disabled={isLoadingMore}
							className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
						>
							{isLoadingMore ? "Loading..." : "Load more results"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
