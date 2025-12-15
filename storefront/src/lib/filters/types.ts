export interface MTGFilterState {
	// Multiselect dropdown filters
	rarity: string[];
	setName: string[];

	// Numeric range filters
	manaValue: { min?: number; max?: number };
	price: { min?: number; max?: number };

	// Text search
	typeLine: string;

	// Boolean filters
	reservedList: boolean | null;
	isPromo: boolean | null;
	isFullArt: boolean | null;
}

export const DEFAULT_FILTER_STATE: MTGFilterState = {
	rarity: [],
	setName: [],
	manaValue: {},
	price: {},
	typeLine: "",
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
