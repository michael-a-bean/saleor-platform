// Filter options for Singles Builder
export interface SinglesFilterState {
	// Text search for set name
	setName: string;
	// Multi-select filters
	rarity: string[];
	condition: string[];
	finish: string[];
	// Price range
	priceMin: number | null;
	priceMax: number | null;
	// Stock toggle
	inStockOnly: boolean;
}

export const DEFAULT_SINGLES_FILTER: SinglesFilterState = {
	setName: "",
	rarity: [],
	condition: [],
	finish: [],
	priceMin: null,
	priceMax: null,
	inStockOnly: false,
};

// Condition options (variant-level attribute)
// Values must match Saleor attribute values exactly
export const CONDITION_OPTIONS = [
	{ value: "Near Mint", label: "Near Mint", shortLabel: "NM" },
	{ value: "Lightly Played", label: "Lightly Played", shortLabel: "LP" },
	{ value: "Moderately Played", label: "Moderately Played", shortLabel: "MP" },
	{ value: "Heavily Played", label: "Heavily Played", shortLabel: "HP" },
	{ value: "Damaged", label: "Damaged", shortLabel: "DMG" },
];

// Finish options (variant-level attribute)
export const FINISH_OPTIONS = [
	{ value: "Non-Foil", label: "Non-Foil" },
	{ value: "Foil", label: "Foil" },
	{ value: "Etched", label: "Etched" },
];

// Rarity options (product-level attribute)
export const RARITY_OPTIONS = [
	{ value: "common", label: "Common", color: "#1a1a1a" },
	{ value: "uncommon", label: "Uncommon", color: "#707883" },
	{ value: "rare", label: "Rare", color: "#a58e4a" },
	{ value: "mythic", label: "Mythic", color: "#bf4427" },
	{ value: "special", label: "Special", color: "#905d98" },
	{ value: "bonus", label: "Bonus", color: "#6b5b95" },
];

// URL parameter names for filter state
export const FILTER_URL_PARAMS = {
	setName: "set",
	rarity: "rarity",
	condition: "cond",
	finish: "finish",
	priceMin: "pmin",
	priceMax: "pmax",
	inStockOnly: "stock",
} as const;

// Parse URL params to filter state
export function parseFiltersFromURL(searchParams: URLSearchParams): SinglesFilterState {
	return {
		setName: searchParams.get(FILTER_URL_PARAMS.setName) || "",
		rarity: searchParams.get(FILTER_URL_PARAMS.rarity)?.split(",").filter(Boolean) || [],
		condition: searchParams.get(FILTER_URL_PARAMS.condition)?.split(",").filter(Boolean) || [],
		finish: searchParams.get(FILTER_URL_PARAMS.finish)?.split(",").filter(Boolean) || [],
		priceMin: parseFloat(searchParams.get(FILTER_URL_PARAMS.priceMin) || "") || null,
		priceMax: parseFloat(searchParams.get(FILTER_URL_PARAMS.priceMax) || "") || null,
		inStockOnly: searchParams.get(FILTER_URL_PARAMS.inStockOnly) === "1",
	};
}

// Serialize filter state to URL params
export function serializeFiltersToURL(filters: SinglesFilterState): URLSearchParams {
	const params = new URLSearchParams();

	if (filters.setName) {
		params.set(FILTER_URL_PARAMS.setName, filters.setName);
	}
	if (filters.rarity.length > 0) {
		params.set(FILTER_URL_PARAMS.rarity, filters.rarity.join(","));
	}
	if (filters.condition.length > 0) {
		params.set(FILTER_URL_PARAMS.condition, filters.condition.join(","));
	}
	if (filters.finish.length > 0) {
		params.set(FILTER_URL_PARAMS.finish, filters.finish.join(","));
	}
	if (filters.priceMin !== null) {
		params.set(FILTER_URL_PARAMS.priceMin, filters.priceMin.toString());
	}
	if (filters.priceMax !== null) {
		params.set(FILTER_URL_PARAMS.priceMax, filters.priceMax.toString());
	}
	if (filters.inStockOnly) {
		params.set(FILTER_URL_PARAMS.inStockOnly, "1");
	}

	return params;
}

// Check if any filters are active
export function hasActiveFilters(filters: SinglesFilterState): boolean {
	return !!(
		filters.setName ||
		filters.rarity.length > 0 ||
		filters.condition.length > 0 ||
		filters.finish.length > 0 ||
		filters.priceMin !== null ||
		filters.priceMax !== null ||
		filters.inStockOnly
	);
}

// Count active filters
export function countActiveFilters(filters: SinglesFilterState): number {
	let count = 0;
	if (filters.setName) count++;
	if (filters.rarity.length > 0) count++;
	if (filters.condition.length > 0) count++;
	if (filters.finish.length > 0) count++;
	if (filters.priceMin !== null || filters.priceMax !== null) count++;
	if (filters.inStockOnly) count++;
	return count;
}
