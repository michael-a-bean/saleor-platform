"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
	parseFiltersFromURL,
	serializeFiltersToURL,
	getActiveFilterCount,
	type MTGFilterState,
	DEFAULT_FILTER_STATE,
} from "@/lib/filters";

export const useFilters = () => {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const filters = useMemo(() => parseFiltersFromURL(searchParams), [searchParams]);

	const activeCount = useMemo(() => getActiveFilterCount(filters), [filters]);

	const updateFilter = useCallback(
		<K extends keyof MTGFilterState>(key: K, value: MTGFilterState[K]) => {
			const newFilters = { ...filters, [key]: value };
			const newParams = serializeFiltersToURL(newFilters, searchParams);
			// Reset pagination when filters change
			newParams.delete("cursor");
			newParams.delete("direction");
			router.push(`${pathname}?${newParams.toString()}`);
		},
		[filters, pathname, router, searchParams],
	);

	const removeFilterValue = useCallback(
		(key: keyof MTGFilterState, valueToRemove: string) => {
			const currentValue = filters[key];
			if (Array.isArray(currentValue)) {
				const newValue = currentValue.filter((v) => v !== valueToRemove);
				updateFilter(key, newValue as MTGFilterState[typeof key]);
			} else if (typeof currentValue === "object" && currentValue !== null) {
				// Range value - clear it
				updateFilter(key, {} as MTGFilterState[typeof key]);
			} else {
				// Boolean or string - reset to default
				updateFilter(key, DEFAULT_FILTER_STATE[key]);
			}
		},
		[filters, updateFilter],
	);

	const clearAllFilters = useCallback(() => {
		const newParams = new URLSearchParams();
		// Keep sort param if it exists
		const sort = searchParams.get("sort");
		if (sort) {
			newParams.set("sort", sort);
		}
		router.push(`${pathname}?${newParams.toString()}`);
	}, [pathname, router, searchParams]);

	return {
		filters,
		updateFilter,
		removeFilterValue,
		clearAllFilters,
		activeCount,
	};
};
