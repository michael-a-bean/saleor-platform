import type { MTGFilterState } from "./types";
import { URL_PARAMS } from "./mtgConstants";

/**
 * Parse URL search params to filter state
 */
export function parseFiltersFromURL(searchParams: URLSearchParams): MTGFilterState {
	return {
		rarity: parseArrayParam(searchParams.get(URL_PARAMS.rarity)),
		colorIdentity: parseArrayParam(searchParams.get(URL_PARAMS.colorIdentity)),
		manaValue: {
			min: parseNumberParam(searchParams.get(URL_PARAMS.manaValueMin)),
			max: parseNumberParam(searchParams.get(URL_PARAMS.manaValueMax)),
		},
		price: {
			min: parseNumberParam(searchParams.get(URL_PARAMS.priceMin)),
			max: parseNumberParam(searchParams.get(URL_PARAMS.priceMax)),
		},
		typeLine: searchParams.get(URL_PARAMS.typeLine) || "",
		setName: searchParams.get(URL_PARAMS.setName) || "",
		reservedList: parseBooleanParam(searchParams.get(URL_PARAMS.reservedList)),
		isPromo: parseBooleanParam(searchParams.get(URL_PARAMS.isPromo)),
		isFullArt: parseBooleanParam(searchParams.get(URL_PARAMS.isFullArt)),
	};
}

/**
 * Serialize filter state to URL search params
 */
export function serializeFiltersToURL(
	filters: MTGFilterState,
	existingParams?: URLSearchParams,
): URLSearchParams {
	const params = new URLSearchParams(existingParams?.toString() || "");

	// Clear existing filter params
	Object.values(URL_PARAMS).forEach((param) => params.delete(param));

	// Set array params
	if (filters.rarity.length > 0) {
		params.set(URL_PARAMS.rarity, filters.rarity.join(","));
	}
	if (filters.colorIdentity.length > 0) {
		params.set(URL_PARAMS.colorIdentity, filters.colorIdentity.join(","));
	}

	// Set text params
	if (filters.typeLine) {
		params.set(URL_PARAMS.typeLine, filters.typeLine);
	}
	if (filters.setName) {
		params.set(URL_PARAMS.setName, filters.setName);
	}

	// Set range params
	if (filters.manaValue.min !== undefined) {
		params.set(URL_PARAMS.manaValueMin, filters.manaValue.min.toString());
	}
	if (filters.manaValue.max !== undefined) {
		params.set(URL_PARAMS.manaValueMax, filters.manaValue.max.toString());
	}
	if (filters.price.min !== undefined) {
		params.set(URL_PARAMS.priceMin, filters.price.min.toString());
	}
	if (filters.price.max !== undefined) {
		params.set(URL_PARAMS.priceMax, filters.price.max.toString());
	}

	// Set boolean params
	if (filters.reservedList !== null) {
		params.set(URL_PARAMS.reservedList, filters.reservedList.toString());
	}
	if (filters.isPromo !== null) {
		params.set(URL_PARAMS.isPromo, filters.isPromo.toString());
	}
	if (filters.isFullArt !== null) {
		params.set(URL_PARAMS.isFullArt, filters.isFullArt.toString());
	}

	return params;
}

/**
 * Get count of active filters for badge display
 */
export function getActiveFilterCount(filters: MTGFilterState): number {
	let count = 0;

	if (filters.rarity.length > 0) count++;
	if (filters.colorIdentity.length > 0) count++;
	if (filters.typeLine) count++;
	if (filters.setName) count++;
	if (filters.manaValue.min !== undefined || filters.manaValue.max !== undefined) count++;
	if (filters.price.min !== undefined || filters.price.max !== undefined) count++;
	if (filters.reservedList !== null) count++;
	if (filters.isPromo !== null) count++;
	if (filters.isFullArt !== null) count++;

	return count;
}

/**
 * Check if filters are at default state (no filters applied)
 */
export function isDefaultFilterState(filters: MTGFilterState): boolean {
	return getActiveFilterCount(filters) === 0;
}

// Helper functions
function parseArrayParam(value: string | null): string[] {
	if (!value) return [];
	return value.split(",").filter(Boolean);
}

function parseNumberParam(value: string | null): number | undefined {
	if (!value) return undefined;
	const num = parseFloat(value);
	return isNaN(num) ? undefined : num;
}

function parseBooleanParam(value: string | null): boolean | null {
	if (value === "true") return true;
	if (value === "false") return false;
	return null;
}
