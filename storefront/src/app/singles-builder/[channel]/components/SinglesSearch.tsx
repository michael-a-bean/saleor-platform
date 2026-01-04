"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

const DEBOUNCE_MS = 300;

export function SinglesSearch() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const initialQuery = searchParams.get("q") || "";
	const [inputValue, setInputValue] = useState(initialQuery);
	const debounceTimer = useRef<NodeJS.Timeout | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Sync input with URL when navigating
	useEffect(() => {
		const urlQuery = searchParams.get("q") || "";
		if (urlQuery !== inputValue && document.activeElement !== inputRef.current) {
			setInputValue(urlQuery);
		}
	}, [searchParams]);

	const updateSearchParams = useCallback(
		(query: string) => {
			const params = new URLSearchParams(searchParams.toString());
			if (query.trim()) {
				params.set("q", query.trim());
			} else {
				params.delete("q");
			}
			// Reset pagination on new search
			params.delete("after");

			startTransition(() => {
				router.push(`${pathname}?${params.toString()}`, { scroll: false });
			});
		},
		[pathname, router, searchParams],
	);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setInputValue(value);

		// Clear existing timer
		if (debounceTimer.current) {
			clearTimeout(debounceTimer.current);
		}

		// Set new debounce timer
		debounceTimer.current = setTimeout(() => {
			updateSearchParams(value);
		}, DEBOUNCE_MS);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			// Clear debounce and search immediately
			if (debounceTimer.current) {
				clearTimeout(debounceTimer.current);
			}
			updateSearchParams(inputValue);
		}
		if (e.key === "Escape") {
			setInputValue("");
			updateSearchParams("");
			inputRef.current?.blur();
		}
	};

	const handleClear = () => {
		setInputValue("");
		updateSearchParams("");
		inputRef.current?.focus();
	};

	return (
		<div className="relative">
			<input
				ref={inputRef}
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
				{isPending ? (
					<svg
						className="h-5 w-5 animate-spin text-blue-500"
						fill="none"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
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
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						/>
					</svg>
				) : inputValue ? (
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
		</div>
	);
}
