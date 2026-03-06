"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition, useRef } from "react";
import {
	type SinglesFilterState,
	DEFAULT_SINGLES_FILTER,
	CONDITION_OPTIONS,
	FINISH_OPTIONS,
	RARITY_OPTIONS,
	parseFiltersFromURL,
	FILTER_URL_PARAMS,
	hasActiveFilters,
	countActiveFilters,
} from "./filterTypes";

const DEBOUNCE_MS = 400;

interface MultiSelectProps {
	label: string;
	options: { value: string; label: string; color?: string }[];
	selected: string[];
	onChange: (values: string[]) => void;
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
	const toggleValue = (value: string) => {
		if (selected.includes(value)) {
			onChange(selected.filter((v) => v !== value));
		} else {
			onChange([...selected, value]);
		}
	};

	return (
		<div>
			<label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
			<div className="flex flex-wrap gap-1.5">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						onClick={() => toggleValue(option.value)}
						className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
							selected.includes(option.value)
								? "bg-blue-600 text-white"
								: "bg-gray-100 text-gray-700 hover:bg-gray-200"
						}`}
						style={
							selected.includes(option.value) && option.color
								? { backgroundColor: option.color }
								: undefined
						}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}

interface PriceRangeProps {
	min: number | null;
	max: number | null;
	onMinChange: (value: number | null) => void;
	onMaxChange: (value: number | null) => void;
}

function PriceRange({ min, max, onMinChange, onMaxChange }: PriceRangeProps) {
	return (
		<div>
			<label className="mb-2 block text-sm font-medium text-gray-700">Price Range</label>
			<div className="flex items-center gap-2">
				<div className="relative flex-1">
					<span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
					<input
						type="number"
						placeholder="Min"
						value={min ?? ""}
						onChange={(e) => onMinChange(e.target.value ? parseFloat(e.target.value) : null)}
						className="w-full rounded border border-gray-300 py-1.5 pl-6 pr-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						min={0}
						step={0.01}
					/>
				</div>
				<span className="text-gray-400">-</span>
				<div className="relative flex-1">
					<span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
					<input
						type="number"
						placeholder="Max"
						value={max ?? ""}
						onChange={(e) => onMaxChange(e.target.value ? parseFloat(e.target.value) : null)}
						className="w-full rounded border border-gray-300 py-1.5 pl-6 pr-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						min={0}
						step={0.01}
					/>
				</div>
			</div>
		</div>
	);
}

export function SinglesFilters() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	// Derive filter state from URL — URL is the source of truth
	const filters = parseFiltersFromURL(searchParams);
	const [setNameInput, setSetNameInput] = useState(filters.setName);
	const debounceTimer = useRef<NodeJS.Timeout | null>(null);

	// Sync debounced input when URL changes externally (e.g., browser back/forward)
	const currentSearchParamsStr = searchParams.toString();
	const [prevSearchParamsStr, setPrevSearchParamsStr] = useState(currentSearchParamsStr);
	if (currentSearchParamsStr !== prevSearchParamsStr) {
		setPrevSearchParamsStr(currentSearchParamsStr);
		setSetNameInput(filters.setName);
	}

	// Update URL with new filter state
	const updateURL = useCallback(
		(newFilters: SinglesFilterState) => {
			const params = new URLSearchParams(searchParams.toString());

			// Preserve search query
			const existingQuery = params.get("q");

			// Clear all filter params
			Object.values(FILTER_URL_PARAMS).forEach((param) => params.delete(param));

			// Set new filter params
			if (newFilters.setName) {
				params.set(FILTER_URL_PARAMS.setName, newFilters.setName);
			}
			if (newFilters.rarity.length > 0) {
				params.set(FILTER_URL_PARAMS.rarity, newFilters.rarity.join(","));
			}
			if (newFilters.condition.length > 0) {
				params.set(FILTER_URL_PARAMS.condition, newFilters.condition.join(","));
			}
			if (newFilters.finish.length > 0) {
				params.set(FILTER_URL_PARAMS.finish, newFilters.finish.join(","));
			}
			if (newFilters.priceMin !== null) {
				params.set(FILTER_URL_PARAMS.priceMin, newFilters.priceMin.toString());
			}
			if (newFilters.priceMax !== null) {
				params.set(FILTER_URL_PARAMS.priceMax, newFilters.priceMax.toString());
			}
			if (newFilters.inStockOnly) {
				params.set(FILTER_URL_PARAMS.inStockOnly, "1");
			}

			// Restore search query
			if (existingQuery) {
				params.set("q", existingQuery);
			}

			startTransition(() => {
				router.push(`${pathname}?${params.toString()}`, { scroll: false });
			});
		},
		[pathname, router, searchParams],
	);

	// Handle filter changes
	const handleFilterChange = useCallback(
		(key: keyof SinglesFilterState, value: SinglesFilterState[typeof key]) => {
			const newFilters = { ...filters, [key]: value };
			updateURL(newFilters);
		},
		[filters, updateURL],
	);

	// Handle set name with debounce
	const handleSetNameChange = (value: string) => {
		setSetNameInput(value);

		if (debounceTimer.current) {
			clearTimeout(debounceTimer.current);
		}

		debounceTimer.current = setTimeout(() => {
			handleFilterChange("setName", value);
		}, DEBOUNCE_MS);
	};

	// Clear all filters
	const handleClearAll = () => {
		setSetNameInput("");
		updateURL(DEFAULT_SINGLES_FILTER);
	};

	const activeCount = countActiveFilters(filters);
	const isActive = hasActiveFilters(filters);

	return (
		<div className="space-y-5">
			{/* Header with clear button */}
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-gray-900">
					Filters
					{activeCount > 0 && (
						<span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
							{activeCount}
						</span>
					)}
				</h2>
				{isActive && (
					<button
						type="button"
						onClick={handleClearAll}
						className="text-xs text-blue-600 hover:text-blue-800"
					>
						Clear all
					</button>
				)}
			</div>

			{/* Loading indicator */}
			{isPending && (
				<div className="flex items-center gap-2 text-xs text-gray-500">
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
					Updating...
				</div>
			)}

			{/* In Stock Only Toggle */}
			<div>
				<label className="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={filters.inStockOnly}
						onChange={(e) => handleFilterChange("inStockOnly", e.target.checked)}
						className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<span className="text-sm font-medium text-gray-700">In Stock Only</span>
				</label>
			</div>

			{/* Set Name Search */}
			<div>
				<label className="mb-2 block text-sm font-medium text-gray-700">Set Name</label>
				<input
					type="text"
					placeholder="e.g., Modern Horizons 3"
					value={setNameInput}
					onChange={(e) => handleSetNameChange(e.target.value)}
					className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			{/* Rarity */}
			<MultiSelect
				label="Rarity"
				options={RARITY_OPTIONS}
				selected={filters.rarity}
				onChange={(values) => handleFilterChange("rarity", values)}
			/>

			{/* Condition */}
			<MultiSelect
				label="Condition"
				options={CONDITION_OPTIONS}
				selected={filters.condition}
				onChange={(values) => handleFilterChange("condition", values)}
			/>

			{/* Finish */}
			<MultiSelect
				label="Finish"
				options={FINISH_OPTIONS}
				selected={filters.finish}
				onChange={(values) => handleFilterChange("finish", values)}
			/>

			{/* Price Range */}
			<PriceRange
				min={filters.priceMin}
				max={filters.priceMax}
				onMinChange={(value) => handleFilterChange("priceMin", value)}
				onMaxChange={(value) => handleFilterChange("priceMax", value)}
			/>
		</div>
	);
}
