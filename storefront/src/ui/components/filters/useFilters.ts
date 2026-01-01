"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
	parseFiltersFromURL,
	serializeFiltersToURL,
	getActiveFilterCount,
	type MTGFilterState,
	DEFAULT_FILTER_STATE,
	URL_PARAMS,
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
		// Start with existing params and only remove filter-specific ones
		const newParams = new URLSearchParams(searchParams.toString());

		// Remove all filter params
		Object.values(URL_PARAMS).forEach((param) => newParams.delete(param));

		// Reset pagination
		newParams.delete("cursor");
		newParams.delete("direction");

		const queryString = newParams.toString();
		router.push(queryString ? `${pathname}?${queryString}` : pathname);
	}, [pathname, router, searchParams]);

	return {
		filters,
		updateFilter,
		removeFilterValue,
		clearAllFilters,
		activeCount,
	};
};
