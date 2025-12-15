"use client";

import clsx from "clsx";
import type { FilterOption } from "@/lib/filters";

interface MultiSelectFilterProps {
	options: FilterOption[];
	value: string[];
	onChange: (value: string[]) => void;
}

export const MultiSelectFilter = ({ options, value, onChange }: MultiSelectFilterProps) => {
	const toggleValue = (optionValue: string) => {
		if (value.includes(optionValue)) {
			onChange(value.filter((v) => v !== optionValue));
		} else {
			onChange([...value, optionValue]);
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
							type="checkbox"
							checked={isSelected}
							onChange={() => toggleValue(option.value)}
							className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
						/>
						{option.icon && (
							<span
								className={clsx(
									"flex h-5 w-5 items-center justify-center rounded text-xs font-bold",
									option.value === "W" && "bg-amber-100 text-amber-800",
									option.value === "U" && "bg-blue-100 text-blue-800",
									option.value === "B" && "bg-neutral-800 text-neutral-100",
									option.value === "R" && "bg-red-100 text-red-800",
									option.value === "G" && "bg-green-100 text-green-800",
								)}
							>
								{option.icon}
							</span>
						)}
						<span
							className={clsx(option.color && "font-medium")}
							style={option.color ? { color: option.color } : undefined}
						>
							{option.label}
						</span>
					</label>
				);
			})}
		</div>
	);
};
