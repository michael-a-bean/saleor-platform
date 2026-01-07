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

// Color identity options (WUBRG)
export const COLOR_IDENTITY_OPTIONS: FilterOption[] = [
	{ value: "mtg-color-w", label: "White", color: "#F9FAF4" },
	{ value: "mtg-color-u", label: "Blue", color: "#0E68AB" },
	{ value: "mtg-color-b", label: "Black", color: "#150B00" },
	{ value: "mtg-color-r", label: "Red", color: "#D3202A" },
	{ value: "mtg-color-g", label: "Green", color: "#00733E" },
];

// Common card type options (used for search filtering)
export const CARD_TYPE_OPTIONS: FilterOption[] = [
	{ value: "Creature", label: "Creature" },
	{ value: "Instant", label: "Instant" },
	{ value: "Sorcery", label: "Sorcery" },
	{ value: "Artifact", label: "Artifact" },
	{ value: "Enchantment", label: "Enchantment" },
	{ value: "Planeswalker", label: "Planeswalker" },
	{ value: "Land", label: "Land" },
	{ value: "Battle", label: "Battle" },
];

export const BOOLEAN_FILTER_OPTIONS = [
	{ value: "true", label: "Yes" },
	{ value: "false", label: "No" },
];

// Finish options (variant-level attribute for foil/non-foil)
export const FINISH_OPTIONS: FilterOption[] = [
	{ value: "mtg-finish-nf", label: "Non-Foil" },
	{ value: "mtg-finish-f", label: "Foil", color: "#FFD700" },
	{ value: "mtg-finish-e", label: "Etched", color: "#C0C0C0" },
	{ value: "mtg-finish-g", label: "Glossy", color: "#E8E8E8" },
];

// Condition options (variant-level attribute)
export const CONDITION_OPTIONS: FilterOption[] = [
	{ value: "mtg-condition-nm", label: "Near Mint" },
	{ value: "mtg-condition-lp", label: "Lightly Played" },
	{ value: "mtg-condition-mp", label: "Moderately Played" },
	{ value: "mtg-condition-hp", label: "Heavily Played" },
	{ value: "mtg-condition-dmg", label: "Damaged" },
];

// Attribute slugs as defined in Saleor (with mtg- prefix)
export const ATTRIBUTE_SLUGS = {
	rarity: "mtg-rarity",
	colorIdentity: "mtg-color-identity",
	reservedList: "mtg-reserved",
	isPromo: "mtg-is-promo",
	isFullArt: "mtg-is-full-art",
	finish: "mtg-finish",
	condition: "mtg-condition",
} as const;

// URL parameter names
export const URL_PARAMS = {
	rarity: "rarity",
	colorIdentity: "color",
	setName: "set",
	manaValueMin: "cmc_min",
	manaValueMax: "cmc_max",
	priceMin: "price_min",
	priceMax: "price_max",
	typeLine: "type",
	reservedList: "reserved",
	isPromo: "promo",
	isFullArt: "fullart",
	finish: "finish",
	condition: "condition",
} as const;
