export interface MTGFilterState {
	// Multiselect dropdown filters
	rarity: string[];
	colorIdentity: string[];
	finish: string[];

	// Numeric range filters
	manaValue: { min?: number; max?: number };
	price: { min?: number; max?: number };

	// Text search filters (applied via search, not attribute filtering)
	typeLine: string;
	setName: string;

	// Boolean filters
	reservedList: boolean | null;
	isPromo: boolean | null;
	isFullArt: boolean | null;
}

export const DEFAULT_FILTER_STATE: MTGFilterState = {
	rarity: [],
	colorIdentity: [],
	finish: [],
	manaValue: {},
	price: {},
	typeLine: "",
	setName: "",
	reservedList: null,
	isPromo: null,
	isFullArt: null,
};

export interface FilterOption {
	value: string;
	label: string;
	color?: string;
	icon?: string;
}

export interface RangeValue {
	min?: number;
	max?: number;
}
