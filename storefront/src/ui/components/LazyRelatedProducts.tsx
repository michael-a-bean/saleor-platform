"use client";

import { useEffect, useState } from "react";
import { RelatedProductsCarousel } from "./RelatedProductsCarousel";
import type { ProductListItemFragment } from "@/gql/graphql";

interface LazyRelatedProductsProps {
	categoryId: string;
	categoryName?: string;
	productId: string;
	channel: string;
}

export function LazyRelatedProducts({
	categoryId,
	categoryName,
	productId,
	channel,
}: LazyRelatedProductsProps) {
	const [products, setProducts] = useState<ProductListItemFragment[] | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		const params = new URLSearchParams({
			channel,
			categoryId,
			excludeProductId: productId,
		});

		fetch(`/api/products/related?${params}`, { signal: controller.signal })
			.then((res) => {
				if (!res.ok) throw new Error(res.statusText);
				return res.json() as Promise<{ products?: ProductListItemFragment[] }>;
			})
			.then((data) => setProducts(data.products ?? []))
			.catch((err) => {
				if (err.name !== "AbortError") setProducts([]);
			});

		return () => controller.abort();
	}, [channel, categoryId, productId]);

	if (products === null) {
		// Skeleton placeholder
		return (
			<section className="mt-12 border-t border-neutral-100 pt-8">
				<div className="mb-6 h-7 w-48 animate-pulse rounded bg-neutral-200" />
				<div className="flex gap-4 overflow-hidden">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={i} className="w-[200px] flex-shrink-0">
							<div className="aspect-[2/3] animate-pulse rounded-lg bg-neutral-200" />
							<div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
							<div className="mt-1 h-4 w-1/2 animate-pulse rounded bg-neutral-200" />
						</div>
					))}
				</div>
			</section>
		);
	}

	if (products.length === 0) {
		return null;
	}

	return (
		<RelatedProductsCarousel
			products={products}
			title={categoryName ? `More from ${categoryName}` : "Related Products"}
		/>
	);
}
