import { describe, it, expect } from "vitest";
import { DEFAULT_FILTER_STATE, type MTGFilterState } from "./types";
import {
	buildMeilisearchFilters,
	buildExtraFilterParts,
	buildMeilisearchQuery,
	getMeilisearchSort,
	hasMeilisearchUnsupportedFilters,
} from "./buildMeilisearchFilter";

function makeFilters(overrides: Partial<MTGFilterState> = {}): MTGFilterState {
	return { ...DEFAULT_FILTER_STATE, ...overrides };
}

describe("buildMeilisearchFilters", () => {
	it("returns empty object for default filters", () => {
		expect(buildMeilisearchFilters(makeFilters())).toEqual({});
	});

	it("includes rarity filter when set", () => {
		const result = buildMeilisearchFilters(makeFilters({ rarity: ["rare", "mythic"] }));
		expect(result.rarity).toEqual(["rare", "mythic"]);
	});

	it("includes setName when set", () => {
		const result = buildMeilisearchFilters(makeFilters({ setName: "Modern Horizons 3" }));
		expect(result.setName).toBe("Modern Horizons 3");
	});

	it("normalizes finish values to title case", () => {
		const result = buildMeilisearchFilters(makeFilters({ finish: ["non-foil", "foil"] }));
		expect(result.finishes).toEqual(["Non-Foil", "Foil"]);
	});

	it("includes price range with min only", () => {
		const result = buildMeilisearchFilters(makeFilters({ price: { min: 5 } }));
		expect(result.priceRange).toEqual({ min: 5 });
	});

	it("includes price range with both min and max", () => {
		const result = buildMeilisearchFilters(makeFilters({ price: { min: 1, max: 100 } }));
		expect(result.priceRange).toEqual({ min: 1, max: 100 });
	});

	it("builds multiple filter types combined", () => {
		const result = buildMeilisearchFilters(makeFilters({
			rarity: ["common"],
			setName: "Foundations",
			price: { max: 5 },
		}));
		expect(result.rarity).toEqual(["common"]);
		expect(result.setName).toBe("Foundations");
		expect(result.priceRange).toEqual({ max: 5 });
	});
});

describe("buildExtraFilterParts", () => {
	it("returns empty array for no extra filters", () => {
		expect(buildExtraFilterParts(makeFilters())).toEqual([]);
	});

	it("builds color identity OR filter", () => {
		const parts = buildExtraFilterParts(makeFilters({ colorIdentity: ["w", "u"] }));
		expect(parts).toHaveLength(1);
		expect(parts[0]).toBe('(color_identity = "W" OR color_identity = "U")');
	});

	it("builds mana value range filters", () => {
		const parts = buildExtraFilterParts(makeFilters({ manaValue: { min: 2, max: 5 } }));
		expect(parts).toContain("mana_value >= 2");
		expect(parts).toContain("mana_value <= 5");
	});
});

describe("buildMeilisearchQuery", () => {
	it("returns empty string for no search terms", () => {
		expect(buildMeilisearchQuery(makeFilters())).toBe("");
	});

	it("includes typeLine as search term", () => {
		expect(buildMeilisearchQuery(makeFilters({ typeLine: "Creature" }))).toBe("Creature");
	});

	it("includes card types as search terms", () => {
		expect(buildMeilisearchQuery(makeFilters({ cardType: ["creature", "artifact"] }))).toBe("creature artifact");
	});

	it("combines typeLine and cardType", () => {
		const result = buildMeilisearchQuery(makeFilters({ typeLine: "Legendary", cardType: ["creature"] }));
		expect(result).toBe("Legendary creature");
	});
});

describe("getMeilisearchSort", () => {
	it("returns price ascending sort", () => {
		expect(getMeilisearchSort("price-asc")).toEqual(["min_price:asc"]);
	});

	it("returns price descending sort", () => {
		expect(getMeilisearchSort("price-desc")).toEqual(["min_price:desc"]);
	});

	it("defaults to name ascending", () => {
		expect(getMeilisearchSort()).toEqual(["name:asc"]);
	});

	it("defaults to name ascending for unknown sort", () => {
		expect(getMeilisearchSort("unknown")).toEqual(["name:asc"]);
	});

	it("handles array input using first element", () => {
		expect(getMeilisearchSort(["price-asc", "name:desc"])).toEqual(["min_price:asc"]);
	});
});

describe("hasMeilisearchUnsupportedFilters", () => {
	it("returns false for default filters", () => {
		expect(hasMeilisearchUnsupportedFilters(makeFilters())).toBe(false);
	});

	it("returns true when reservedList is set", () => {
		expect(hasMeilisearchUnsupportedFilters(makeFilters({ reservedList: true }))).toBe(true);
	});

	it("returns true when isPromo is set", () => {
		expect(hasMeilisearchUnsupportedFilters(makeFilters({ isPromo: false }))).toBe(true);
	});

	it("returns true when isFullArt is set", () => {
		expect(hasMeilisearchUnsupportedFilters(makeFilters({ isFullArt: true }))).toBe(true);
	});
});
