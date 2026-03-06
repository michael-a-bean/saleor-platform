"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { getAvailableSetsForSearch } from "@/lib/filters/getAvailableSets";
import type { FilterOption } from "@/lib/filters";

interface SetFilterDropdownProps {
	value: string;
	onChange: (value: string) => void;
	channel?: string;
}

export const SetFilterDropdown = ({ value, onChange, channel = "webstore" }: SetFilterDropdownProps) => {
	const searchParams = useSearchParams();
	const searchQuery = searchParams.get("query") || "";

	const [options, setOptions] = useState<FilterOption[]>([]);
	const [isOpen, setIsOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [hasLoaded, setHasLoaded] = useState(false);

	// Clear options when search query is too short — render-time adjustment
	const prevSearchQueryRef = useRef(searchQuery);
	if (searchQuery !== prevSearchQueryRef.current) {
		prevSearchQueryRef.current = searchQuery;
		if (!searchQuery || searchQuery.length < 2) {
			setOptions([]);
			setHasLoaded(false);
		}
	}

	// Fetch available sets when search query changes or dropdown opens
	useEffect(() => {
		if (!searchQuery || searchQuery.length < 2) return;

		// Only fetch when dropdown is opened or we haven't loaded yet
		if (!isOpen && hasLoaded) return;

		startTransition(async () => {
			const sets = await getAvailableSetsForSearch(searchQuery, channel);
			setOptions(sets);
			setHasLoaded(true);
		});
	}, [searchQuery, channel, isOpen, hasLoaded]);

	const selectedLabel = value || "All sets";

	const handleSelect = (setName: string) => {
		onChange(setName);
		setIsOpen(false);
	};

	const handleClear = () => {
		onChange("");
		setIsOpen(false);
	};

	if (!searchQuery || searchQuery.length < 2) {
		return (
			<div className="text-sm text-neutral-500 italic">Enter a search term to filter by set</div>
		);
	}

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center justify-between rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:border-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
			>
				<span className={value ? "text-neutral-900" : "text-neutral-500"}>
					{selectedLabel}
				</span>
				<span className="flex items-center gap-1">
					{isPending && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
					<ChevronDown
						className={`h-4 w-4 text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
					/>
				</span>
			</button>

			{isOpen && (
				<div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded border border-neutral-200 bg-white shadow-lg">
					{isPending ? (
						<div className="flex items-center justify-center py-4">
							<Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
							<span className="ml-2 text-sm text-neutral-500">Loading sets...</span>
						</div>
					) : options.length === 0 ? (
						<div className="px-3 py-2 text-sm text-neutral-500">No sets found</div>
					) : (
						<>
							{value && (
								<button
									type="button"
									onClick={handleClear}
									className="w-full px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100"
								>
									Clear selection
								</button>
							)}
							{options.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => handleSelect(option.value)}
									className={`w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
										value === option.value
											? "bg-neutral-50 font-medium text-neutral-900"
											: "text-neutral-700"
									}`}
								>
									{option.label}
								</button>
							))}
						</>
					)}
				</div>
			)}

			{/* Backdrop to close dropdown when clicking outside */}
			{isOpen && (
				<div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
			)}
		</div>
	);
};
