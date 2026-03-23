import { describe, it, expect } from "vitest";
import { DEFAULT_FILTER_STATE, type MTGFilterState } from "./types";
import { ATTRIBUTE_SLUGS } from "./mtgConstants";
import {
	buildProductFilter,
	getFilterSearchTerms,
	hasActiveFilters,
	requiresGraphQLFiltering,
} from "./buildGraphQLFilter";

function makeFilters(overrides: Partial<MTGFilterState> = {}): MTGFilterState {
	return { ...DEFAULT_FILTER_STATE, ...overrides };
}

describe("buildProductFilter", () => {
	it("returns empty filter for default state", () => {
		expect(buildProductFilter(makeFilters())).toEqual({});
	});

	it("builds rarity attribute filter", () => {
		const filter = buildProductFilter(makeFilters({ rarity: ["rare"] }));
		expect(filter.attributes).toContainEqual({
			slug: ATTRIBUTE_SLUGS.rarity,
			values: ["rare"],
		});
	});

	it("builds color identity attribute filter", () => {
		const filter = buildProductFilter(makeFilters({ colorIdentity: ["w", "u"] }));
		expect(filter.attributes).toContainEqual({
			slug: ATTRIBUTE_SLUGS.colorIdentity,
			values: ["w", "u"],
		});
	});

	it("builds card type attribute filter", () => {
		const filter = buildProductFilter(makeFilters({ cardType: ["creature"] }));
		expect(filter.attributes).toContainEqual({
			slug: ATTRIBUTE_SLUGS.cardType,
			values: ["creature"],
		});
	});

	it("builds finish attribute filter", () => {
		const filter = buildProductFilter(makeFilters({ finish: ["foil"] }));
		expect(filter.attributes).toContainEqual({
			slug: ATTRIBUTE_SLUGS.finish,
			values: ["foil"],
		});
	});

	it("builds boolean filter for reservedList", () => {
		const filter = buildProductFilter(makeFilters({ reservedList: true }));
		expect(filter.attributes).toContainEqual({
			slug: ATTRIBUTE_SLUGS.reservedList,
			boolean: true,
		});
	});

	it("builds mana value range filter", () => {
		const filter = buildProductFilter(makeFilters({ manaValue: { min: 2, max: 5 } }));
		expect(filter.attributes).toContainEqual({
			slug: ATTRIBUTE_SLUGS.manaValue,
			valuesRange: { gte: 2, lte: 5 },
		});
	});

	it("builds price range filter", () => {
		const filter = buildProductFilter(makeFilters({ price: { min: 1, max: 50 } }));
		expect(filter.price).toEqual({ gte: 1, lte: 50 });
	});

	it("adds search terms for typeLine and setName", () => {
		const filter = buildProductFilter(makeFilters({ typeLine: "Creature", setName: "Foundations" }));
		expect(filter.search).toBe("Creature Foundations");
	});

	it("handles empty filter input without error", () => {
		const filter = buildProductFilter(makeFilters());
		expect(filter.attributes).toBeUndefined();
		expect(filter.price).toBeUndefined();
		expect(filter.search).toBeUndefined();
	});
});

describe("getFilterSearchTerms", () => {
	it("returns empty string for no terms", () => {
		expect(getFilterSearchTerms(makeFilters())).toBe("");
	});

	it("returns typeLine", () => {
		expect(getFilterSearchTerms(makeFilters({ typeLine: "Instant" }))).toBe("Instant");
	});

	it("combines typeLine and setName", () => {
		expect(getFilterSearchTerms(makeFilters({ typeLine: "Creature", setName: "Foundations" }))).toBe("Creature Foundations");
	});
});

describe("hasActiveFilters", () => {
	it("returns false for empty filter", () => {
		expect(hasActiveFilters({})).toBe(false);
	});

	it("returns true when attributes present", () => {
		expect(hasActiveFilters({ attributes: [{ slug: "rarity", values: ["rare"] }] })).toBe(true);
	});

	it("returns true when price present", () => {
		expect(hasActiveFilters({ price: { gte: 1 } })).toBe(true);
	});

	it("returns true when search present", () => {
		expect(hasActiveFilters({ search: "creature" })).toBe(true);
	});
});

describe("requiresGraphQLFiltering", () => {
	it("returns false for Meilisearch-compatible filters only", () => {
		expect(requiresGraphQLFiltering(makeFilters({ rarity: ["rare"], setName: "Test" }))).toBe(false);
	});

	it("returns true for colorIdentity", () => {
		expect(requiresGraphQLFiltering(makeFilters({ colorIdentity: ["w"] }))).toBe(true);
	});

	it("returns true for cardType", () => {
		expect(requiresGraphQLFiltering(makeFilters({ cardType: ["creature"] }))).toBe(true);
	});

	it("returns true for finish", () => {
		expect(requiresGraphQLFiltering(makeFilters({ finish: ["foil"] }))).toBe(true);
	});

	it("returns true for boolean filters", () => {
		expect(requiresGraphQLFiltering(makeFilters({ reservedList: true }))).toBe(true);
		expect(requiresGraphQLFiltering(makeFilters({ isPromo: false }))).toBe(true);
		expect(requiresGraphQLFiltering(makeFilters({ isFullArt: true }))).toBe(true);
	});

	it("returns true for mana value range", () => {
		expect(requiresGraphQLFiltering(makeFilters({ manaValue: { min: 3 } }))).toBe(true);
	});
});
