import type { FilterOption } from "./types";

// Rarity options with slugs matching Saleor attribute values
export const RARITY_OPTIONS: FilterOption[] = [
	{ value: "mtg-rarity-common", label: "Common", color: "#1a1a1a" },
	{ value: "mtg-rarity-uncommon", label: "Uncommon", color: "#707883" },
	{ value: "mtg-rarity-rare", label: "Rare", color: "#a58e4a" },
	{ value: "mtg-rarity-mythic", label: "Mythic Rare", color: "#bf4427" },
	{ value: "mtg-rarity-special", label: "Special", color: "#905d98" },
	{ value: "mtg-rarity-bonus", label: "Bonus", color: "#6b5b95" },
];

export const BOOLEAN_FILTER_OPTIONS = [
	{ value: "true", label: "Yes" },
	{ value: "false", label: "No" },
];

// Attribute slugs as defined in Saleor (with mtg- prefix)
export const ATTRIBUTE_SLUGS = {
	rarity: "mtg-rarity",
	setName: "mtg-set-name",
	manaValue: "mtg-mana-value",
	typeLine: "mtg-type-line",
	reservedList: "mtg-reserved",
	isPromo: "mtg-is-promo",
	isFullArt: "mtg-is-full-art",
} as const;

// URL parameter names
export const URL_PARAMS = {
	rarity: "rarity",
	setName: "set",
	manaValueMin: "cmc_min",
	manaValueMax: "cmc_max",
	priceMin: "price_min",
	priceMax: "price_max",
	typeLine: "type",
	reservedList: "reserved",
	isPromo: "promo",
	isFullArt: "fullart",
} as const;
