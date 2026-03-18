"use client";

import { useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

interface Suggestion {
	name: string;
	set_name?: string;
	set_code?: string;
	rarity?: string;
	min_price?: number | null;
	thumbnail?: string | null;
	_formatted?: { name?: string };
}

export function SinglesSearch() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	// Extract channel from pathname: /singles-builder/{channel}
	const channel = pathname.split("/").pop() || "singles-builder";

	const initialQuery = searchParams.get("q") || "";
	const [inputValue, setInputValue] = useState(initialQuery);
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const [isLoading, setIsLoading] = useState(false);

	const debounceTimer = useRef<NodeJS.Timeout | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const abortRef = useRef<AbortController | null>(null);

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
		setShowSuggestions(false);
	}

	// Close dropdown on outside click
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node) &&
				inputRef.current &&
				!inputRef.current.contains(e.target as Node)
			) {
				setShowSuggestions(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const fetchSuggestions = useCallback(
		async (query: string) => {
			if (query.trim().length < MIN_CHARS) {
				setSuggestions([]);
				setShowSuggestions(false);
				return;
			}

			// Cancel previous request
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			setIsLoading(true);
			try {
				const res = await fetch(
					`/api/search/suggestions?q=${encodeURIComponent(query.trim())}&channel=${channel}`,
					{ signal: controller.signal },
				);
				if (!res.ok) throw new Error("fetch failed");
				const data = (await res.json()) as { hits: Suggestion[] };
				setSuggestions(data.hits || []);
				setShowSuggestions(data.hits.length > 0);
				setSelectedIndex(-1);
			} catch (err) {
				if ((err as Error).name !== "AbortError") {
					setSuggestions([]);
					setShowSuggestions(false);
				}
			} finally {
				setIsLoading(false);
			}
		},
		[channel],
	);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setInputValue(value);

		if (debounceTimer.current) {
			clearTimeout(debounceTimer.current);
		}

		// Debounced suggestions fetch (no form submit — just dropdown)
		debounceTimer.current = setTimeout(() => {
			fetchSuggestions(value);
		}, DEBOUNCE_MS);
	};

	const handleSubmit = () => {
		if (debounceTimer.current) {
			clearTimeout(debounceTimer.current);
		}
		abortRef.current?.abort();
		setShowSuggestions(false);
	};

	const selectSuggestion = (name: string) => {
		setInputValue(name);
		setShowSuggestions(false);
		// Submit the form with the selected suggestion
		setTimeout(() => formRef.current?.requestSubmit(), 0);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape") {
			e.preventDefault();
			if (showSuggestions) {
				setShowSuggestions(false);
			} else {
				setInputValue("");
				setTimeout(() => formRef.current?.requestSubmit(), 0);
				inputRef.current?.blur();
			}
			return;
		}

		if (!showSuggestions || suggestions.length === 0) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
		} else if (e.key === "Enter" && selectedIndex >= 0) {
			e.preventDefault();
			selectSuggestion(suggestions[selectedIndex].name);
		}
		// If Enter with no selection, native form submission handles it
	};

	const handleClear = () => {
		setInputValue("");
		setSuggestions([]);
		setShowSuggestions(false);
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
		<div className="relative">
			<form ref={formRef} action={pathname} method="GET" onSubmit={handleSubmit}>
				{preservedParams.map(([key, value], i) => (
					<input key={`${key}-${i}`} type="hidden" name={key} value={value} />
				))}
				<div className="relative">
					<input
						ref={inputRef}
						name="q"
						type="text"
						value={inputValue}
						onChange={handleChange}
						onKeyDown={handleKeyDown}
						onFocus={() => {
							if (suggestions.length > 0) setShowSuggestions(true);
						}}
						placeholder="Search cards by name, set, collector number..."
						className="w-full rounded-lg border border-gray-300 px-4 py-3 pl-12 pr-20 text-lg shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
						aria-label="Search cards"
						aria-expanded={showSuggestions}
						aria-autocomplete="list"
						aria-controls="search-suggestions"
						autoComplete="off"
						spellCheck={false}
						role="combobox"
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
					{/* Right side: spinner / clear / Enter hint */}
					<div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
						{isLoading && (
							<svg
								className="h-4 w-4 animate-spin text-blue-500"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
						)}
						{inputValue && !isLoading && (
							<button
								type="button"
								onClick={handleClear}
								className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
								aria-label="Clear search"
							>
								<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						)}
						{inputValue && (
							<kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-400 sm:inline">
								Enter
							</kbd>
						)}
					</div>
				</div>
			</form>

			{/* Suggestions dropdown */}
			{showSuggestions && suggestions.length > 0 && (
				<div
					ref={dropdownRef}
					id="search-suggestions"
					role="listbox"
					className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
				>
					{suggestions.map((hit, i) => (
						<button
							key={`${hit.name}-${hit.set_code}-${i}`}
							type="button"
							role="option"
							aria-selected={i === selectedIndex}
							className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
								i === selectedIndex ? "bg-blue-50 text-blue-900" : "text-gray-900 hover:bg-gray-50"
							}`}
							onMouseDown={(e) => {
								e.preventDefault(); // Prevent blur before click registers
								selectSuggestion(hit.name);
							}}
							onMouseEnter={() => setSelectedIndex(i)}
						>
							{hit.thumbnail && (
								<img
									src={hit.thumbnail}
									alt=""
									className="h-10 w-8 rounded object-cover"
									loading="lazy"
								/>
							)}
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">{hit.name}</div>
								<div className="flex items-center gap-2 text-xs text-gray-500">
									{hit.set_name && <span>{hit.set_name}</span>}
									{hit.set_code && <span className="uppercase">({hit.set_code})</span>}
									{hit.rarity && (
										<span className="capitalize">{hit.rarity}</span>
									)}
								</div>
							</div>
							{hit.min_price != null && hit.min_price > 0 && (
								<span className="whitespace-nowrap text-sm font-medium text-gray-600">
									${hit.min_price.toFixed(2)}
								</span>
							)}
						</button>
					))}
					<div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
						Press <kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-mono">Enter</kbd> to see all results
						{" · "}<kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-mono">↑↓</kbd> to navigate
					</div>
				</div>
			)}
		</div>
	);
}
