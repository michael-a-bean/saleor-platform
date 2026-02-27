import type { FilterOption } from "./types";

// Rarity options — values must match Saleor dropdown choice slugs exactly
export const RARITY_OPTIONS: FilterOption[] = [
	{ value: "common", label: "Common", color: "#1a1a1a" },
	{ value: "uncommon", label: "Uncommon", color: "#707883" },
	{ value: "rare", label: "Rare", color: "#a58e4a" },
	{ value: "mythic", label: "Mythic Rare", color: "#bf4427" },
	{ value: "special", label: "Special", color: "#905d98" },
	{ value: "bonus", label: "Bonus", color: "#6b5b95" },
];

// Color identity options (WUBRG) — values must match Scryfall color letters
export const COLOR_IDENTITY_OPTIONS: FilterOption[] = [
	{ value: "W", label: "White", color: "#F9FAF4" },
	{ value: "U", label: "Blue", color: "#0E68AB" },
	{ value: "B", label: "Black", color: "#150B00" },
	{ value: "R", label: "Red", color: "#D3202A" },
	{ value: "G", label: "Green", color: "#00733E" },
];

// Card type options — values must match mtg-card-type MULTISELECT values from import
export const CARD_TYPE_OPTIONS: FilterOption[] = [
	{ value: "Creature", label: "Creature" },
	{ value: "Instant", label: "Instant" },
	{ value: "Sorcery", label: "Sorcery" },
	{ value: "Artifact", label: "Artifact" },
	{ value: "Enchantment", label: "Enchantment" },
	{ value: "Planeswalker", label: "Planeswalker" },
	{ value: "Land", label: "Land" },
	{ value: "Battle", label: "Battle" },
	{ value: "Legendary", label: "Legendary" },
];

export const BOOLEAN_FILTER_OPTIONS = [
	{ value: "true", label: "Yes" },
	{ value: "false", label: "No" },
];

// Finish options — values must match Saleor dropdown choice slugs exactly
export const FINISH_OPTIONS: FilterOption[] = [
	{ value: "non-foil", label: "Non-Foil" },
	{ value: "foil", label: "Foil", color: "#FFD700" },
	{ value: "etched", label: "Etched", color: "#C0C0C0" },
];

// Condition options — values must match Saleor dropdown choice slugs exactly
export const CONDITION_OPTIONS: FilterOption[] = [
	{ value: "near-mint", label: "Near Mint" },
	{ value: "lightly-played", label: "Lightly Played" },
	{ value: "moderately-played", label: "Moderately Played" },
	{ value: "heavily-played", label: "Heavily Played" },
	{ value: "damaged", label: "Damaged" },
];

// Attribute slugs as defined in Saleor (must match attribute-map.ts in mtg-import)
export const ATTRIBUTE_SLUGS = {
	rarity: "mtg-rarity",
	colorIdentity: "mtg-color-identity",
	cardType: "mtg-card-type",
	reservedList: "reserved-list",
	isPromo: "is-promo",
	isFullArt: "is-full-art",
	finish: "mtg-finish",
	condition: "mtg-condition",
	typeLine: "mtg-type-line",
	manaValue: "mtg-mana-value",
} as const;

// URL parameter names
export const URL_PARAMS = {
	rarity: "rarity",
	colorIdentity: "color",
	cardType: "card_type",
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
