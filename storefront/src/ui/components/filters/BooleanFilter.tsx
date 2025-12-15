"use client";

import clsx from "clsx";

interface BooleanFilterProps {
	label: string;
	value: boolean | null;
	onChange: (value: boolean | null) => void;
}

export const BooleanFilter = ({ label, value, onChange }: BooleanFilterProps) => {
	const options = [
		{ value: null, label: "Any" },
		{ value: true, label: "Yes" },
		{ value: false, label: "No" },
	];

	return (
		<div className="flex items-center justify-between">
			<span className="text-sm text-neutral-700">{label}</span>
			<div className="flex rounded border border-neutral-300">
				{options.map((option) => (
					<button
						key={String(option.value)}
						type="button"
						onClick={() => onChange(option.value)}
						className={clsx(
							"px-2 py-1 text-xs",
							value === option.value
								? "bg-neutral-900 text-white"
								: "bg-white text-neutral-700 hover:bg-neutral-100",
							option.value === null && "rounded-l",
							option.value === false && "rounded-r",
						)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
};
