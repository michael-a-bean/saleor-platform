"use client";

import { useState, useEffect } from "react";

interface TextFilterProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export const TextFilter = ({ value, onChange, placeholder = "Enter value..." }: TextFilterProps) => {
	const [inputValue, setInputValue] = useState(value);

	// Sync internal state with external value
	useEffect(() => {
		setInputValue(value);
	}, [value]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			onChange(inputValue);
		}
	};

	const handleBlur = () => {
		if (inputValue !== value) {
			onChange(inputValue);
		}
	};

	return (
		<div className="flex gap-2">
			<input
				type="text"
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleBlur}
				placeholder={placeholder}
				className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
			/>
			{inputValue && inputValue !== value && (
				<button
					onClick={() => onChange(inputValue)}
					className="shrink-0 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
				>
					Apply
				</button>
			)}
		</div>
	);
};
