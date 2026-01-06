"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import type { SinglesBuilderProductFragment, SinglesBuilderVariantFragment } from "@/gql/graphql";

// Convert full condition name to abbreviation
function abbreviateCondition(condition: string): string {
	const abbrevMap: Record<string, string> = {
		"Near Mint": "NM",
		"Lightly Played": "LP",
		"Moderately Played": "MP",
		"Heavily Played": "HP",
		"Damaged": "DMG",
	};
	return abbrevMap[condition] || condition;
}

// Condition sort order (NM first, DMG last)
const CONDITION_ORDER: Record<string, number> = {
	"Near Mint": 0,
	"Lightly Played": 1,
	"Moderately Played": 2,
	"Heavily Played": 3,
	"Damaged": 4,
};

function getConditionFromVariant(variant: SinglesBuilderVariantFragment): string {
	return variant.attributes?.find((a) => a.attribute.slug === "mtg-condition")?.values[0]?.name || "Near Mint";
}

// Cart line info for a variant
export interface CartLineInfo {
	lineId: string;
	quantity: number;
}

interface SinglesResultItemProps {
	product: SinglesBuilderProductFragment;
	onQuickAdd: (variantId: string, quantity: number) => void;
	onUpdateQuantity: (lineId: string, quantity: number) => void;
	onRemoveLine: (lineId: string) => void;
	cartLines?: Map<string, CartLineInfo>; // Map of variantId -> cart line info
	style?: React.CSSProperties;
}

// Inline variant row with condition, qty controls, stock, and price
interface VariantRowProps {
	variant: SinglesBuilderVariantFragment;
	onQuickAdd: (variantId: string, quantity: number) => void;
	onUpdateQuantity: (lineId: string, quantity: number) => void;
	onRemoveLine: (lineId: string) => void;
	cartLine?: CartLineInfo; // Cart line info if this variant is in cart
}

function VariantRow({ variant, onQuickAdd, onUpdateQuantity, onRemoveLine, cartLine }: VariantRowProps) {
	const [addQuantity, setAddQuantity] = useState(1);
	const [isPending, setIsPending] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const conditionFull = getConditionFromVariant(variant);
	const condition = abbreviateCondition(conditionFull);
	const finish = variant.attributes?.find((a) => a.attribute.slug === "mtg-finish")?.values[0]?.name;
	const price = variant.pricing?.price?.gross;
	const stockQty = variant.quantityAvailable ?? 0;
	const inStock = stockQty > 0;
	const isFoil = finish && finish !== "Non-Foil";

	const cartQty = cartLine?.quantity ?? 0;
	const isInCart = cartQty > 0;

	// Calculate max we can add (stock minus what's in cart)
	const maxAddable = Math.max(0, stockQty - cartQty);
	const canAdd = maxAddable > 0 && addQuantity > 0 && addQuantity <= maxAddable;

	// --- Handlers for adding new items ---
	const handleAdd = async () => {
		if (!canAdd || isPending) return;
		setIsPending(true);
		try {
			await onQuickAdd(variant.id, addQuantity);
			setAddQuantity(1);
		} finally {
			setIsPending(false);
		}
	};

	const handleAddDecrement = () => {
		setAddQuantity((q) => Math.max(1, q - 1));
	};

	const handleAddIncrement = () => {
		setAddQuantity((q) => Math.min(maxAddable, q + 1));
	};

	const handleAddInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = parseInt(e.target.value, 10);
		if (!isNaN(val) && val >= 0) {
			setAddQuantity(Math.min(maxAddable, Math.max(0, val)));
		} else if (e.target.value === "") {
			setAddQuantity(0);
		}
	};

	const handleAddInputBlur = () => {
		if (addQuantity < 1) setAddQuantity(1);
	};

	const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && canAdd) {
			handleAdd();
		}
	};

	// --- Handlers for adjusting cart quantity ---
	const handleCartDecrement = async () => {
		if (!cartLine || isPending) return;
		setIsPending(true);
		try {
			if (cartLine.quantity <= 1) {
				await onRemoveLine(cartLine.lineId);
			} else {
				await onUpdateQuantity(cartLine.lineId, cartLine.quantity - 1);
			}
		} finally {
			setIsPending(false);
		}
	};

	const handleCartIncrement = async () => {
		if (!cartLine || isPending || cartQty >= stockQty) return;
		setIsPending(true);
		try {
			await onUpdateQuantity(cartLine.lineId, cartLine.quantity + 1);
		} finally {
			setIsPending(false);
		}
	};

	const handleRemove = async () => {
		if (!cartLine || isPending) return;
		setIsPending(true);
		try {
			await onRemoveLine(cartLine.lineId);
		} finally {
			setIsPending(false);
		}
	};

	// Color coding by condition
	const conditionColor = condition === "NM"
		? "text-green-700"
		: condition === "LP"
			? "text-blue-700"
			: condition === "MP"
				? "text-yellow-700"
				: "text-gray-600";

	const conditionBgColor = condition === "NM"
		? "bg-green-50"
		: condition === "LP"
			? "bg-blue-50"
			: condition === "MP"
				? "bg-yellow-50"
				: "bg-gray-50";

	return (
		<div
			className={`grid grid-cols-[3rem_2rem_5rem_1fr] items-center gap-1 rounded border px-2 py-1 text-xs ${
				isInCart
					? "border-blue-300 bg-blue-50"
					: inStock
						? "border-gray-200 bg-white"
						: "border-gray-100 bg-gray-50 opacity-60"
			}`}
		>
			{/* Condition badge - fixed width */}
			<span className={`rounded px-1 py-0.5 font-medium text-center ${conditionColor} ${conditionBgColor}`}>
				{isFoil && <span className="text-purple-600 mr-0.5">✦</span>}
				{condition}
			</span>

			{/* Stock info - fixed width, right aligned */}
			<span className="text-gray-400 text-[10px] text-right">{stockQty}</span>

			{/* Price - fixed width, right aligned */}
			<span className="font-medium text-gray-700 text-right">
				{price ? `$${price.amount.toFixed(2)}` : "—"}
			</span>

			{/* Controls - flex to fill remaining space */}
			{isInCart ? (
				<div className="flex items-center gap-0.5 justify-end">
					<button
						type="button"
						onClick={handleCartDecrement}
						disabled={isPending}
						className="flex h-6 w-6 items-center justify-center rounded border border-blue-300 bg-blue-100 text-sm text-blue-700 hover:bg-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
						aria-label="Decrease cart quantity"
					>
						-
					</button>
					<span className="w-10 h-6 flex items-center justify-center rounded border border-blue-300 bg-blue-50 text-sm font-bold text-blue-700">{cartQty}</span>
					<button
						type="button"
						onClick={handleCartIncrement}
						disabled={isPending || cartQty >= stockQty}
						className="flex h-6 w-6 items-center justify-center rounded border border-blue-300 bg-blue-100 text-sm text-blue-700 hover:bg-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
						aria-label="Increase cart quantity"
					>
						+
					</button>
					<button
						type="button"
						onClick={handleRemove}
						disabled={isPending}
						className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
						aria-label="Remove from cart"
						title="Remove"
					>
						{isPending ? (
							<svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
							</svg>
						) : (
							<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						)}
					</button>
				</div>
			) : inStock ? (
				<div className="flex items-center gap-0.5 justify-end">
					<button
						type="button"
						onClick={handleAddDecrement}
						disabled={addQuantity <= 1 || isPending}
						className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-gray-50 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
						aria-label="Decrease quantity"
					>
						-
					</button>
					<input
						ref={inputRef}
						type="text"
						inputMode="numeric"
						value={addQuantity}
						onChange={handleAddInputChange}
						onBlur={handleAddInputBlur}
						onKeyDown={handleAddKeyDown}
						disabled={isPending}
						className="h-6 w-10 rounded border border-gray-300 bg-white text-center text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
						aria-label="Quantity to add"
					/>
					<button
						type="button"
						onClick={handleAddIncrement}
						disabled={addQuantity >= maxAddable || isPending}
						className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-gray-50 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
						aria-label="Increase quantity"
					>
						+
					</button>
					<button
						type="button"
						onClick={handleAdd}
						disabled={!canAdd || isPending}
						className={`flex h-6 w-10 items-center justify-center rounded text-sm font-medium transition-colors ${
							canAdd && !isPending
								? "bg-blue-600 text-white hover:bg-blue-700"
								: "bg-gray-200 text-gray-400 cursor-not-allowed"
						}`}
						aria-label="Add to cart"
					>
						{isPending ? (
							<svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
							</svg>
						) : (
							"Add"
						)}
					</button>
				</div>
			) : (
				<span className="text-[10px] text-gray-400 italic text-right">Out of stock</span>
			)}
		</div>
	);
}

export function SinglesResultItem({ product, onQuickAdd, onUpdateQuantity, onRemoveLine, cartLines, style }: SinglesResultItemProps) {
	// Extract key MTG attributes from product
	const setCode = product.attributes?.find((a) => a.attribute.slug === "mtg-set-code")?.values[0]?.name;
	const collectorNumber = product.attributes?.find((a) => a.attribute.slug === "mtg-collector-number")?.values[0]?.name;
	const rarity = product.attributes?.find((a) => a.attribute.slug === "mtg-rarity")?.values[0]?.name;

	// Process variants: sort by condition, filter to show NM always + in-stock others + in-cart items
	const variants = product.variants || [];
	const sortedAndFilteredVariants = [...variants]
		.sort((a, b) => {
			const condA = getConditionFromVariant(a);
			const condB = getConditionFromVariant(b);
			return (CONDITION_ORDER[condA] ?? 99) - (CONDITION_ORDER[condB] ?? 99);
		})
		.filter((variant) => {
			const condition = getConditionFromVariant(variant);
			const inStock = (variant.quantityAvailable ?? 0) > 0;
			const isInCart = cartLines?.has(variant.id) ?? false;
			// Show if: NM condition, in stock, or already in cart
			return condition === "Near Mint" || inStock || isInCart;
		});

	// Rarity color
	const rarityColor = rarity === "mythic"
		? "text-orange-600"
		: rarity === "rare"
			? "text-yellow-600"
			: rarity === "uncommon"
				? "text-gray-500"
				: "text-gray-400";

	return (
		<div style={style} className="border-b border-gray-100 bg-white">
			<div className="flex gap-3 px-3 py-2">
				{/* Thumbnail */}
				<div className="relative h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-gray-100">
					{product.thumbnail?.url ? (
						<Image
							src={product.thumbnail.url}
							alt={product.thumbnail.alt || product.name}
							fill
							className="object-contain"
							sizes="40px"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center text-gray-400">
							<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

				{/* Card info and variants - all inline with thumbnail */}
				<div className="flex min-w-0 flex-1 items-start gap-4">
					{/* Name and set info */}
					<div className="min-w-0 flex-shrink-0 pt-0.5">
						<span className="font-medium text-gray-900">{product.name}</span>
						<span className="ml-2 text-sm text-gray-500">
							{setCode && <span className="uppercase">[{setCode}]</span>}
							{collectorNumber && <span className="ml-1">#{collectorNumber}</span>}
							{rarity && <span className={`ml-1 capitalize ${rarityColor}`}>{rarity}</span>}
						</span>
					</div>

					{/* Variants - stacked vertically, to the right */}
					<div className="flex flex-col gap-1 ml-auto">
						{sortedAndFilteredVariants.map((variant) => (
							<VariantRow
								key={variant.id}
								variant={variant}
								onQuickAdd={onQuickAdd}
								onUpdateQuantity={onUpdateQuantity}
								onRemoveLine={onRemoveLine}
								cartLine={cartLines?.get(variant.id)}
							/>
						))}
						{sortedAndFilteredVariants.length === 0 && (
							<span className="text-xs text-gray-400">No variants</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
