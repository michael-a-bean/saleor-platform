"use client";

import Image from "next/image";
import { useState } from "react";
import type { SinglesBuilderProductFragment, SinglesBuilderVariantFragment } from "@/gql/graphql";

interface VariantRowProps {
	variant: SinglesBuilderVariantFragment;
	onQuickAdd: (variantId: string, quantity: number) => void;
}

function VariantRow({ variant, onQuickAdd }: VariantRowProps) {
	const [isAdding, setIsAdding] = useState(false);

	// Extract condition and finish from variant attributes
	const condition = variant.attributes?.find((a) => a.attribute.slug === "condition")?.values[0]?.name || "NM";
	const finish = variant.attributes?.find((a) => a.attribute.slug === "finish")?.values[0]?.name;

	const price = variant.pricing?.price?.gross;
	const inStock = (variant.quantityAvailable ?? 0) > 0;
	const stockQty = variant.quantityAvailable ?? 0;

	const handleQuickAdd = async () => {
		if (!inStock || isAdding) return;
		setIsAdding(true);
		try {
			await onQuickAdd(variant.id, 1);
		} finally {
			setIsAdding(false);
		}
	};

	return (
		<div
			className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm ${
				inStock ? "hover:bg-gray-50" : "opacity-50"
			}`}
		>
			<div className="flex items-center gap-3 min-w-0">
				{/* Condition badge */}
				<span
					className={`inline-flex w-8 justify-center rounded px-1.5 py-0.5 text-xs font-medium ${
						condition === "NM"
							? "bg-green-100 text-green-800"
							: condition === "LP"
								? "bg-blue-100 text-blue-800"
								: condition === "MP"
									? "bg-yellow-100 text-yellow-800"
									: "bg-gray-100 text-gray-800"
					}`}
				>
					{condition}
				</span>
				{/* Finish indicator */}
				{finish && finish !== "Non-Foil" && (
					<span className="inline-flex items-center gap-1 text-xs text-purple-600">
						<svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
							<path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
						</svg>
						{finish}
					</span>
				)}
				{/* SKU if useful */}
				{variant.sku && (
					<span className="hidden text-xs text-gray-400 lg:inline" title="SKU">
						{variant.sku}
					</span>
				)}
			</div>

			<div className="flex items-center gap-3">
				{/* Stock quantity */}
				<span className={`text-xs ${inStock ? "text-gray-600" : "text-red-500"}`}>
					{inStock ? `${stockQty} avail` : "Out"}
				</span>
				{/* Price */}
				{price && (
					<span className="w-16 text-right font-medium">
						${price.amount.toFixed(2)}
					</span>
				)}
				{/* Quick add button */}
				<button
					type="button"
					onClick={handleQuickAdd}
					disabled={!inStock || isAdding}
					className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
						inStock
							? "bg-blue-600 text-white hover:bg-blue-700"
							: "cursor-not-allowed bg-gray-200 text-gray-400"
					}`}
					title={inStock ? "Add to cart" : "Out of stock"}
				>
					{isAdding ? (
						<svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
					) : (
						<svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
						</svg>
					)}
					Add
				</button>
			</div>
		</div>
	);
}

interface SinglesResultItemProps {
	product: SinglesBuilderProductFragment;
	onQuickAdd: (variantId: string, quantity: number) => void;
	style?: React.CSSProperties;
}

export function SinglesResultItem({ product, onQuickAdd, style }: SinglesResultItemProps) {
	const [isExpanded, setIsExpanded] = useState(true);

	// Extract key MTG attributes from product
	const setName = product.attributes?.find((a) => a.attribute.slug === "set")?.values[0]?.name;
	const setCode = product.attributes?.find((a) => a.attribute.slug === "set-code")?.values[0]?.name;
	const collectorNumber = product.attributes?.find((a) => a.attribute.slug === "collector-number")?.values[0]?.name;
	const rarity = product.attributes?.find((a) => a.attribute.slug === "rarity")?.values[0]?.name;

	// Count in-stock variants
	const variants = product.variants || [];
	const inStockCount = variants.filter((v) => (v.quantityAvailable ?? 0) > 0).length;

	return (
		<div style={style} className="border-b border-gray-100 bg-white">
			{/* Card header with image and info */}
			<div className="flex gap-3 p-3">
				{/* Thumbnail */}
				<div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded bg-gray-100">
					{product.thumbnail?.url ? (
						<Image
							src={product.thumbnail.url}
							alt={product.thumbnail.alt || product.name}
							fill
							className="object-contain"
							sizes="56px"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center text-gray-400">
							<svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
								/>
							</svg>
						</div>
					)}
				</div>

				{/* Card info */}
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<h3 className="truncate font-medium text-gray-900">{product.name}</h3>
							<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-500">
								{setName && (
									<span className="truncate">
										{setCode && <span className="uppercase">[{setCode}]</span>} {setName}
									</span>
								)}
								{collectorNumber && <span>#{collectorNumber}</span>}
								{rarity && (
									<span
										className={`capitalize ${
											rarity === "mythic"
												? "text-orange-600"
												: rarity === "rare"
													? "text-yellow-600"
													: rarity === "uncommon"
														? "text-gray-600"
														: "text-gray-400"
										}`}
									>
										{rarity}
									</span>
								)}
							</div>
						</div>
						{/* Expand/collapse toggle */}
						{variants.length > 1 && (
							<button
								type="button"
								onClick={() => setIsExpanded(!isExpanded)}
								className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
								aria-label={isExpanded ? "Collapse variants" : "Expand variants"}
							>
								<svg
									className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
								</svg>
							</button>
						)}
					</div>
					{/* Stock summary */}
					<div className="mt-1 text-xs text-gray-400">
						{inStockCount} of {variants.length} variant{variants.length !== 1 ? "s" : ""} in stock
					</div>
				</div>
			</div>

			{/* Variants list */}
			{isExpanded && variants.length > 0 && (
				<div className="border-t border-gray-50 bg-gray-50/50 px-3 py-2">
					<div className="space-y-1">
						{variants.map((variant) => (
							<VariantRow key={variant.id} variant={variant} onQuickAdd={onQuickAdd} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}
