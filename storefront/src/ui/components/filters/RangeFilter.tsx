"use client";

import clsx from "clsx";
import { useState, useEffect } from "react";
import type { RangeValue } from "@/lib/filters";

interface RangeFilterProps {
	value: RangeValue;
	onChange: (value: RangeValue) => void;
	prefix?: string;
	minPlaceholder?: string;
	maxPlaceholder?: string;
}

export const RangeFilter = ({
	value,
	onChange,
	prefix = "",
	minPlaceholder = "Min",
	maxPlaceholder = "Max",
}: RangeFilterProps) => {
	const [localMin, setLocalMin] = useState(value.min?.toString() ?? "");
	const [localMax, setLocalMax] = useState(value.max?.toString() ?? "");

	// Sync local state with prop changes
	useEffect(() => {
		setLocalMin(value.min?.toString() ?? "");
		setLocalMax(value.max?.toString() ?? "");
	}, [value.min, value.max]);

	const handleBlur = () => {
		const min = localMin ? parseFloat(localMin) : undefined;
		const max = localMax ? parseFloat(localMax) : undefined;

		// Only update if values have changed
		if (min !== value.min || max !== value.max) {
			onChange({
				min: min !== undefined && !isNaN(min) ? min : undefined,
				max: max !== undefined && !isNaN(max) ? max : undefined,
			});
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleBlur();
		}
	};

	return (
		<div className="flex items-center gap-2">
			<div className="relative flex-1">
				{prefix && (
					<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
						{prefix}
					</span>
				)}
				<input
					type="number"
					value={localMin}
					onChange={(e) => setLocalMin(e.target.value)}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					placeholder={minPlaceholder}
					className={clsx(
						"w-full rounded border border-neutral-300 py-1.5 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500",
						prefix ? "pl-6 pr-2" : "px-2",
					)}
				/>
			</div>
			<span className="text-neutral-400">-</span>
			<div className="relative flex-1">
				{prefix && (
					<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
						{prefix}
					</span>
				)}
				<input
					type="number"
					value={localMax}
					onChange={(e) => setLocalMax(e.target.value)}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					placeholder={maxPlaceholder}
					className={clsx(
						"w-full rounded border border-neutral-300 py-1.5 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500",
						prefix ? "pl-6 pr-2" : "px-2",
					)}
				/>
			</div>
		</div>
	);
};
