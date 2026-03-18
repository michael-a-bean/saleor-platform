"use client";

import { useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 300;

export function SinglesSearch() {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const initialQuery = searchParams.get("q") || "";
	const [inputValue, setInputValue] = useState(initialQuery);
	const debounceTimer = useRef<NodeJS.Timeout | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const formRef = useRef<HTMLFormElement>(null);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Sync input with URL on back/forward navigation
	const urlQuery = searchParams.get("q") || "";
	const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
	if (urlQuery !== prevUrlQuery) {
		setPrevUrlQuery(urlQuery);
		setInputValue(urlQuery);
	}

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setInputValue(value);

		if (debounceTimer.current) {
			clearTimeout(debounceTimer.current);
		}

		// Auto-submit form after debounce for live search
		debounceTimer.current = setTimeout(() => {
			formRef.current?.requestSubmit();
		}, DEBOUNCE_MS);
	};

	const handleSubmit = () => {
		// Clear debounce so we don't double-fire
		if (debounceTimer.current) {
			clearTimeout(debounceTimer.current);
		}
		// Native form GET submission handles navigation
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape") {
			e.preventDefault();
			setInputValue("");
			// Submit empty to clear results
			setTimeout(() => formRef.current?.requestSubmit(), 0);
			inputRef.current?.blur();
		}
		// Enter is handled by native form submission
	};

	const handleClear = () => {
		setInputValue("");
		setTimeout(() => formRef.current?.requestSubmit(), 0);
		inputRef.current?.focus();
	};

	// Preserve existing filter params as hidden fields
	const preservedParams: Array<[string, string]> = [];
	searchParams.forEach((value, key) => {
		if (key !== "q" && key !== "after") {
			preservedParams.push([key, value]);
		}
	});

	return (
		<form ref={formRef} action={pathname} method="GET" onSubmit={handleSubmit} className="relative">
			{preservedParams.map(([key, value], i) => (
				<input key={`${key}-${i}`} type="hidden" name={key} value={value} />
			))}
			<input
				ref={inputRef}
				name="q"
				type="text"
				value={inputValue}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				placeholder="Search cards by name, set, collector number..."
				className="w-full rounded-lg border border-gray-300 px-4 py-3 pl-12 pr-12 text-lg shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
				aria-label="Search cards"
				autoComplete="off"
				spellCheck={false}
			/>
			{/* Search icon */}
			<svg
				className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			{/* Loading/Clear indicator */}
			<div className="absolute right-4 top-1/2 -translate-y-1/2">
				{inputValue ? (
					<button
						type="button"
						onClick={handleClear}
						className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						aria-label="Clear search"
					>
						<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				) : null}
			</div>
			{/* Keyboard hints */}
			{inputValue && (
				<div className="absolute right-12 top-1/2 -translate-y-1/2 hidden text-xs text-gray-400 sm:block">
					<kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono">
						Enter
					</kbd>
				</div>
			)}
		</form>
	);
}
