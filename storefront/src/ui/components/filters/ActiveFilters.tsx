"use client";

import { X } from "lucide-react";
import { useFilters } from "./useFilters";
import { RARITY_OPTIONS, COLOR_IDENTITY_OPTIONS } from "@/lib/filters";

export const ActiveFilters = () => {
	const { filters, removeFilterValue, clearAllFilters, activeCount } = useFilters();

	if (activeCount === 0) return null;

	const getLabel = (key: string, value: string): string => {
		if (key === "rarity") {
			return RARITY_OPTIONS.find((o) => o.value === value)?.label || value;
		}
		if (key === "colorIdentity") {
			return COLOR_IDENTITY_OPTIONS.find((o) => o.value === value)?.label || value;
		}
		return value;
	};

	return (
		<div className="mb-4 flex flex-wrap items-center gap-2">
			<span className="text-sm text-neutral-500">Active filters:</span>

			{/* Card Type filter */}
			{filters.typeLine && (
				<FilterTag
					label={`Type: ${filters.typeLine}`}
					onRemove={() => removeFilterValue("typeLine", "")}
				/>
			)}

			{/* Rarity filters */}
			{filters.rarity.map((v) => (
				<FilterTag
					key={`rarity-${v}`}
					label={`Rarity: ${getLabel("rarity", v)}`}
					onRemove={() => removeFilterValue("rarity", v)}
				/>
			))}

			{/* Color Identity filters */}
			{filters.colorIdentity.map((v) => (
				<FilterTag
					key={`color-${v}`}
					label={`Color: ${getLabel("colorIdentity", v)}`}
					onRemove={() => removeFilterValue("colorIdentity", v)}
				/>
			))}

			{/* Set Name filter */}
			{filters.setName && (
				<FilterTag
					label={`Set: ${filters.setName}`}
					onRemove={() => removeFilterValue("setName", "")}
				/>
			)}

			{/* Range filters */}
			{(filters.price.min !== undefined || filters.price.max !== undefined) && (
				<FilterTag
					label={`Price: $${filters.price.min ?? "0"} - $${filters.price.max ?? "Any"}`}
					onRemove={() => removeFilterValue("price", "")}
				/>
			)}

			{(filters.manaValue.min !== undefined || filters.manaValue.max !== undefined) && (
				<FilterTag
					label={`CMC: ${filters.manaValue.min ?? "0"} - ${filters.manaValue.max ?? "Any"}`}
					onRemove={() => removeFilterValue("manaValue", "")}
				/>
			)}

			{/* Boolean filters */}
			{filters.reservedList !== null && (
				<FilterTag
					label={`Reserved: ${filters.reservedList ? "Yes" : "No"}`}
					onRemove={() => removeFilterValue("reservedList", "")}
				/>
			)}

			{filters.isPromo !== null && (
				<FilterTag
					label={`Promo: ${filters.isPromo ? "Yes" : "No"}`}
					onRemove={() => removeFilterValue("isPromo", "")}
				/>
			)}

			{filters.isFullArt !== null && (
				<FilterTag
					label={`Full Art: ${filters.isFullArt ? "Yes" : "No"}`}
					onRemove={() => removeFilterValue("isFullArt", "")}
				/>
			)}

			{activeCount > 1 && (
				<button
					onClick={clearAllFilters}
					className="text-sm text-neutral-500 underline hover:text-neutral-700"
				>
					Clear all
				</button>
			)}
		</div>
	);
};

interface FilterTagProps {
	label: string;
	onRemove: () => void;
}

const FilterTag = ({ label, onRemove }: FilterTagProps) => (
	<span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700">
		{label}
		<button
			onClick={onRemove}
			className="rounded-full p-0.5 hover:bg-neutral-200"
			aria-label={`Remove ${label} filter`}
		>
			<X className="h-3 w-3" />
		</button>
	</span>
);
