"use client";

import { useRef, useState, useEffect } from "react";
import { ProductElement } from "./ProductElement";
import type { ProductListItemFragment } from "@/gql/graphql";

interface RelatedProductsCarouselProps {
	products: ProductListItemFragment[];
	title?: string;
}

export function RelatedProductsCarousel({
	products,
	title = "Related Products",
}: RelatedProductsCarouselProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollButtons = () => {
		const container = scrollContainerRef.current;
		if (!container) return;

		setCanScrollLeft(container.scrollLeft > 0);
		setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
	};

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		updateScrollButtons();
		container.addEventListener("scroll", updateScrollButtons);
		window.addEventListener("resize", updateScrollButtons);

		return () => {
			container.removeEventListener("scroll", updateScrollButtons);
			window.removeEventListener("resize", updateScrollButtons);
		};
	}, [products]);

	const scroll = (direction: "left" | "right") => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const scrollAmount = container.clientWidth * 0.8;
		container.scrollBy({
			left: direction === "left" ? -scrollAmount : scrollAmount,
			behavior: "smooth",
		});
	};

	if (products.length === 0) {
		return null;
	}

	return (
		<section className="mt-12 border-t border-neutral-100 pt-8">
			<div className="mb-6 flex items-center justify-between">
				<h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
				<div className="flex gap-2">
					<button
						onClick={() => scroll("left")}
						disabled={!canScrollLeft}
						className="rounded-full border border-neutral-200 p-2 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
						aria-label="Scroll left"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={2}
							stroke="currentColor"
							className="h-5 w-5"
						>
							<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
						</svg>
					</button>
					<button
						onClick={() => scroll("right")}
						disabled={!canScrollRight}
						className="rounded-full border border-neutral-200 p-2 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
						aria-label="Scroll right"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={2}
							stroke="currentColor"
							className="h-5 w-5"
						>
							<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
						</svg>
					</button>
				</div>
			</div>
			<div
				ref={scrollContainerRef}
				className="scrollbar-hide -mx-6 flex gap-4 overflow-x-auto px-6 pb-4"
				style={{ scrollSnapType: "x mandatory" }}
			>
				{products.map((product, index) => (
					<div
						key={product.id}
						className="w-[200px] flex-shrink-0"
						style={{ scrollSnapAlign: "start" }}
					>
						<ul className="list-none">
							<ProductElement
								product={product}
								{...(index < 4 ? { priority: true } : { loading: "lazy" as const })}
							/>
						</ul>
					</div>
				))}
			</div>
		</section>
	);
}
