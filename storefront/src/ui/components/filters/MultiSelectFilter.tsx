"use client";

import type { FilterOption } from "@/lib/filters";

interface MultiSelectFilterProps {
	options: FilterOption[];
	value: string[];
	onChange: (value: string[]) => void;
	showColorDot?: boolean;
	singleSelect?: boolean;
}

export const MultiSelectFilter = ({
	options,
	value,
	onChange,
	showColorDot = false,
	singleSelect = false,
}: MultiSelectFilterProps) => {
	const toggleValue = (optionValue: string) => {
		if (singleSelect) {
			// Single select: toggle off if already selected, otherwise select only this one
			if (value.includes(optionValue)) {
				onChange([]);
			} else {
				onChange([optionValue]);
			}
		} else {
			// Multi select: add or remove from array
			if (value.includes(optionValue)) {
				onChange(value.filter((v) => v !== optionValue));
			} else {
				onChange([...value, optionValue]);
			}
		}
	};

	return (
		<div className="space-y-2">
			{options.map((option) => {
				const isSelected = value.includes(option.value);
				return (
					<label
						key={option.value}
						className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 hover:text-neutral-900"
					>
						<input
							type={singleSelect ? "radio" : "checkbox"}
							checked={isSelected}
							onChange={() => toggleValue(option.value)}
							className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
							name={singleSelect ? "single-select-filter" : undefined}
						/>
						{showColorDot && option.color && (
							<span
								className="h-4 w-4 rounded-full border border-neutral-300"
								style={{ backgroundColor: option.color }}
							/>
						)}
						<span
							className={option.color && !showColorDot ? "font-medium" : undefined}
							style={option.color && !showColorDot ? { color: option.color } : undefined}
						>
							{option.label}
						</span>
					</label>
				);
			})}
		</div>
	);
};
