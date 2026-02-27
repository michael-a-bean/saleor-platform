import { describe, it, expect } from "vitest";
import {
	parseFiltersFromURL,
	serializeFiltersToURL,
	getActiveFilterCount,
	isDefaultFilterState,
} from "./urlFilters";
import { DEFAULT_FILTER_STATE, type MTGFilterState } from "./types";

describe("urlFilters", () => {
	describe("parseFiltersFromURL", () => {
		it("returns default state for empty params", () => {
			const params = new URLSearchParams();
			const result = parseFiltersFromURL(params);

			expect(result.rarity).toEqual([]);
			expect(result.colorIdentity).toEqual([]);
			expect(result.typeLine).toBe("");
			expect(result.setName).toBe("");
			expect(result.manaValue).toEqual({ min: undefined, max: undefined });
			expect(result.price).toEqual({ min: undefined, max: undefined });
			expect(result.reservedList).toBeNull();
			expect(result.isPromo).toBeNull();
			expect(result.isFullArt).toBeNull();
		});

		describe("array params (rarity, colorIdentity)", () => {
			it("parses single rarity value", () => {
				const params = new URLSearchParams("rarity=mtg-rarity-common");
				const result = parseFiltersFromURL(params);
				expect(result.rarity).toEqual(["mtg-rarity-common"]);
			});

			it("parses multiple rarity values", () => {
				const params = new URLSearchParams("rarity=mtg-rarity-common,mtg-rarity-rare");
				const result = parseFiltersFromURL(params);
				expect(result.rarity).toEqual(["mtg-rarity-common", "mtg-rarity-rare"]);
			});

			it("parses color identity (single)", () => {
				const params = new URLSearchParams("color=mtg-color-u");
				const result = parseFiltersFromURL(params);
				expect(result.colorIdentity).toEqual(["mtg-color-u"]);
			});

			it("parses multiple color identity values", () => {
				const params = new URLSearchParams("color=mtg-color-w,mtg-color-u,mtg-color-b");
				const result = parseFiltersFromURL(params);
				expect(result.colorIdentity).toEqual(["mtg-color-w", "mtg-color-u", "mtg-color-b"]);
			});

			it("filters empty strings from arrays", () => {
				const params = new URLSearchParams("rarity=mtg-rarity-common,,mtg-rarity-rare,");
				const result = parseFiltersFromURL(params);
				expect(result.rarity).toEqual(["mtg-rarity-common", "mtg-rarity-rare"]);
			});
		});

		describe("numeric range params (manaValue, price)", () => {
			it("parses mana value min", () => {
				const params = new URLSearchParams("cmc_min=3");
				const result = parseFiltersFromURL(params);
				expect(result.manaValue.min).toBe(3);
				expect(result.manaValue.max).toBeUndefined();
			});

			it("parses mana value max", () => {
				const params = new URLSearchParams("cmc_max=5");
				const result = parseFiltersFromURL(params);
				expect(result.manaValue.min).toBeUndefined();
				expect(result.manaValue.max).toBe(5);
			});

			it("parses mana value range", () => {
				const params = new URLSearchParams("cmc_min=2&cmc_max=4");
				const result = parseFiltersFromURL(params);
				expect(result.manaValue.min).toBe(2);
				expect(result.manaValue.max).toBe(4);
			});

			it("parses price range", () => {
				const params = new URLSearchParams("price_min=10&price_max=100");
				const result = parseFiltersFromURL(params);
				expect(result.price.min).toBe(10);
				expect(result.price.max).toBe(100);
			});

			it("parses decimal prices", () => {
				const params = new URLSearchParams("price_min=0.25&price_max=99.99");
				const result = parseFiltersFromURL(params);
				expect(result.price.min).toBe(0.25);
				expect(result.price.max).toBe(99.99);
			});

			it("returns undefined for non-numeric values", () => {
				const params = new URLSearchParams("cmc_min=abc&price_max=invalid");
				const result = parseFiltersFromURL(params);
				expect(result.manaValue.min).toBeUndefined();
				expect(result.price.max).toBeUndefined();
			});
		});

		describe("text params (typeLine, setName)", () => {
			it("parses type line", () => {
				const params = new URLSearchParams("type=Creature");
				const result = parseFiltersFromURL(params);
				expect(result.typeLine).toBe("Creature");
			});

			it("parses set name", () => {
				const params = new URLSearchParams("set=Foundations");
				const result = parseFiltersFromURL(params);
				expect(result.setName).toBe("Foundations");
			});

			it("handles special characters in set name", () => {
				const params = new URLSearchParams("set=Time+Spiral+Remastered");
				const result = parseFiltersFromURL(params);
				expect(result.setName).toBe("Time Spiral Remastered");
			});
		});

		describe("boolean params (reservedList, isPromo, isFullArt)", () => {
			it("parses reservedList true", () => {
				const params = new URLSearchParams("reserved=true");
				const result = parseFiltersFromURL(params);
				expect(result.reservedList).toBe(true);
			});

			it("parses reservedList false", () => {
				const params = new URLSearchParams("reserved=false");
				const result = parseFiltersFromURL(params);
				expect(result.reservedList).toBe(false);
			});

			it("parses isPromo", () => {
				const params = new URLSearchParams("promo=true");
				const result = parseFiltersFromURL(params);
				expect(result.isPromo).toBe(true);
			});

			it("parses isFullArt", () => {
				const params = new URLSearchParams("fullart=true");
				const result = parseFiltersFromURL(params);
				expect(result.isFullArt).toBe(true);
			});

			it("returns null for missing boolean params", () => {
				const params = new URLSearchParams();
				const result = parseFiltersFromURL(params);
				expect(result.reservedList).toBeNull();
				expect(result.isPromo).toBeNull();
				expect(result.isFullArt).toBeNull();
			});

			it("returns null for invalid boolean values", () => {
				const params = new URLSearchParams("reserved=yes&promo=no");
				const result = parseFiltersFromURL(params);
				expect(result.reservedList).toBeNull();
				expect(result.isPromo).toBeNull();
			});
		});

		it("parses complex combined URL", () => {
			const params = new URLSearchParams(
				"rarity=mtg-rarity-rare,mtg-rarity-mythic&color=mtg-color-u,mtg-color-b&cmc_min=3&cmc_max=5&price_min=5&type=Creature&set=Foundations&reserved=true&promo=false",
			);
			const result = parseFiltersFromURL(params);

			expect(result.rarity).toEqual(["mtg-rarity-rare", "mtg-rarity-mythic"]);
			expect(result.colorIdentity).toEqual(["mtg-color-u", "mtg-color-b"]);
			expect(result.manaValue).toEqual({ min: 3, max: 5 });
			expect(result.price).toEqual({ min: 5, max: undefined });
			expect(result.typeLine).toBe("Creature");
			expect(result.setName).toBe("Foundations");
			expect(result.reservedList).toBe(true);
			expect(result.isPromo).toBe(false);
			expect(result.isFullArt).toBeNull();
		});
	});

	describe("serializeFiltersToURL", () => {
		it("returns empty params for default state", () => {
			const result = serializeFiltersToURL(DEFAULT_FILTER_STATE);
			expect(result.toString()).toBe("");
		});

		describe("array params", () => {
			it("serializes single rarity", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					rarity: ["mtg-rarity-common"],
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("rarity")).toBe("mtg-rarity-common");
			});

			it("serializes multiple rarities as comma-separated", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					rarity: ["mtg-rarity-common", "mtg-rarity-rare"],
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("rarity")).toBe("mtg-rarity-common,mtg-rarity-rare");
			});

			it("serializes color identity", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					colorIdentity: ["mtg-color-w", "mtg-color-u"],
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("color")).toBe("mtg-color-w,mtg-color-u");
			});

			it("omits empty arrays", () => {
				const result = serializeFiltersToURL(DEFAULT_FILTER_STATE);
				expect(result.has("rarity")).toBe(false);
				expect(result.has("color")).toBe(false);
			});
		});

		describe("numeric range params", () => {
			it("serializes mana value min only", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					manaValue: { min: 3 },
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("cmc_min")).toBe("3");
				expect(result.has("cmc_max")).toBe(false);
			});

			it("serializes mana value range", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					manaValue: { min: 2, max: 5 },
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("cmc_min")).toBe("2");
				expect(result.get("cmc_max")).toBe("5");
			});

			it("serializes price range with decimals", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					price: { min: 0.5, max: 99.99 },
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("price_min")).toBe("0.5");
				expect(result.get("price_max")).toBe("99.99");
			});

			it("omits undefined range values", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					manaValue: {},
				};
				const result = serializeFiltersToURL(filters);
				expect(result.has("cmc_min")).toBe(false);
				expect(result.has("cmc_max")).toBe(false);
			});
		});

		describe("text params", () => {
			it("serializes type line", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					typeLine: "Creature",
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("type")).toBe("Creature");
			});

			it("serializes set name", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					setName: "Foundations",
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("set")).toBe("Foundations");
			});

			it("omits empty strings", () => {
				const result = serializeFiltersToURL(DEFAULT_FILTER_STATE);
				expect(result.has("type")).toBe(false);
				expect(result.has("set")).toBe(false);
			});
		});

		describe("boolean params", () => {
			it("serializes reservedList true", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					reservedList: true,
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("reserved")).toBe("true");
			});

			it("serializes reservedList false", () => {
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					reservedList: false,
				};
				const result = serializeFiltersToURL(filters);
				expect(result.get("reserved")).toBe("false");
			});

			it("omits null boolean values", () => {
				const result = serializeFiltersToURL(DEFAULT_FILTER_STATE);
				expect(result.has("reserved")).toBe(false);
				expect(result.has("promo")).toBe(false);
				expect(result.has("fullart")).toBe(false);
			});
		});

		describe("preserves existing params", () => {
			it("keeps non-filter params", () => {
				const existing = new URLSearchParams("page=2&sort=price");
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					rarity: ["mtg-rarity-rare"],
				};
				const result = serializeFiltersToURL(filters, existing);

				expect(result.get("page")).toBe("2");
				expect(result.get("sort")).toBe("price");
				expect(result.get("rarity")).toBe("mtg-rarity-rare");
			});

			it("overwrites existing filter params", () => {
				const existing = new URLSearchParams("rarity=mtg-rarity-common");
				const filters: MTGFilterState = {
					...DEFAULT_FILTER_STATE,
					rarity: ["mtg-rarity-rare"],
				};
				const result = serializeFiltersToURL(filters, existing);
				expect(result.get("rarity")).toBe("mtg-rarity-rare");
			});

			it("removes filter params when cleared", () => {
				const existing = new URLSearchParams("rarity=mtg-rarity-common&color=mtg-color-u");
				const result = serializeFiltersToURL(DEFAULT_FILTER_STATE, existing);
				expect(result.has("rarity")).toBe(false);
				expect(result.has("color")).toBe(false);
			});
		});

		it("serializes complex filter state", () => {
			const filters: MTGFilterState = {
				rarity: ["mtg-rarity-rare", "mtg-rarity-mythic"],
				colorIdentity: ["mtg-color-u"],
				cardType: [],
				finish: [],
				manaValue: { min: 3, max: 5 },
				price: { min: 10, max: 100 },
				typeLine: "Creature",
				setName: "Foundations",
				reservedList: true,
				isPromo: false,
				isFullArt: null,
			};
			const result = serializeFiltersToURL(filters);

			expect(result.get("rarity")).toBe("mtg-rarity-rare,mtg-rarity-mythic");
			expect(result.get("color")).toBe("mtg-color-u");
			expect(result.get("cmc_min")).toBe("3");
			expect(result.get("cmc_max")).toBe("5");
			expect(result.get("price_min")).toBe("10");
			expect(result.get("price_max")).toBe("100");
			expect(result.get("type")).toBe("Creature");
			expect(result.get("set")).toBe("Foundations");
			expect(result.get("reserved")).toBe("true");
			expect(result.get("promo")).toBe("false");
			expect(result.has("fullart")).toBe(false);
		});
	});

	describe("round-trip: parse → serialize → parse", () => {
		it("preserves empty state", () => {
			const original = DEFAULT_FILTER_STATE;
			const serialized = serializeFiltersToURL(original);
			const parsed = parseFiltersFromURL(serialized);

			expect(parsed.rarity).toEqual(original.rarity);
			expect(parsed.colorIdentity).toEqual(original.colorIdentity);
			expect(parsed.typeLine).toBe(original.typeLine);
			expect(parsed.setName).toBe(original.setName);
		});

		it("preserves complex state", () => {
			const original: MTGFilterState = {
				rarity: ["mtg-rarity-rare", "mtg-rarity-mythic"],
				colorIdentity: ["mtg-color-w", "mtg-color-u", "mtg-color-b"],
				cardType: [],
				finish: [],
				manaValue: { min: 2, max: 6 },
				price: { min: 5.5, max: 50 },
				typeLine: "Legendary Creature",
				setName: "Commander Masters",
				reservedList: false,
				isPromo: true,
				isFullArt: false,
			};
			const serialized = serializeFiltersToURL(original);
			const parsed = parseFiltersFromURL(serialized);

			expect(parsed.rarity).toEqual(original.rarity);
			expect(parsed.colorIdentity).toEqual(original.colorIdentity);
			expect(parsed.manaValue).toEqual(original.manaValue);
			expect(parsed.price).toEqual(original.price);
			expect(parsed.typeLine).toBe(original.typeLine);
			expect(parsed.setName).toBe(original.setName);
			expect(parsed.reservedList).toBe(original.reservedList);
			expect(parsed.isPromo).toBe(original.isPromo);
			expect(parsed.isFullArt).toBe(original.isFullArt);
		});
	});

	describe("getActiveFilterCount", () => {
		it("returns 0 for default state", () => {
			expect(getActiveFilterCount(DEFAULT_FILTER_STATE)).toBe(0);
		});

		it("counts single array filter as 1", () => {
			const filters: MTGFilterState = {
				...DEFAULT_FILTER_STATE,
				rarity: ["mtg-rarity-common"],
			};
			expect(getActiveFilterCount(filters)).toBe(1);
		});

		it("counts multiple array values as 1 filter", () => {
			const filters: MTGFilterState = {
				...DEFAULT_FILTER_STATE,
				rarity: ["mtg-rarity-common", "mtg-rarity-rare", "mtg-rarity-mythic"],
			};
			expect(getActiveFilterCount(filters)).toBe(1);
		});

		it("counts each array type separately", () => {
			const filters: MTGFilterState = {
				...DEFAULT_FILTER_STATE,
				rarity: ["mtg-rarity-common"],
				colorIdentity: ["mtg-color-u"],
			};
			expect(getActiveFilterCount(filters)).toBe(2);
		});

		it("counts text filters", () => {
			const filters: MTGFilterState = {
				...DEFAULT_FILTER_STATE,
				typeLine: "Creature",
				setName: "Foundations",
			};
			expect(getActiveFilterCount(filters)).toBe(2);
		});

		it("counts range with min only as 1", () => {
			const filters: MTGFilterState = {
				...DEFAULT_FILTER_STATE,
				manaValue: { min: 3 },
			};
			expect(getActiveFilterCount(filters)).toBe(1);
		});

		it("counts range with max only as 1", () => {
			const filters: MTGFilterState = {
				...DEFAULT_FILTER_STATE,
				price: { max: 100 },
			};
			expect(getActiveFilterCount(filters)).toBe(1);
		});

		it("counts range with both min and max as 1", () => {
			const filters: MTGFilterState = {
				...DEFAULT_FILTER_STATE,
				manaValue: { min: 2, max: 5 },
			};
			expect(getActiveFilterCount(filters)).toBe(1);
		});

		it("counts boolean filters", () => {
			const filters: MTGFilterState = {
				...DEFAULT_FILTER_STATE,
				reservedList: true,
				isPromo: false,
			};
			expect(getActiveFilterCount(filters)).toBe(2);
		});

		it("does not count null booleans", () => {
			const filters: MTGFilterState = {
				...DEFAULT_FILTER_STATE,
				reservedList: null,
				isPromo: null,
				isFullArt: null,
			};
			expect(getActiveFilterCount(filters)).toBe(0);
		});

		it("counts all filter types correctly", () => {
			const filters: MTGFilterState = {
				rarity: ["mtg-rarity-rare"],
				colorIdentity: ["mtg-color-u", "mtg-color-b"],
				cardType: ["Creature"],
				finish: [],
				manaValue: { min: 3, max: 5 },
				price: { min: 10 },
				typeLine: "Creature",
				setName: "Foundations",
				reservedList: true,
				isPromo: false,
				isFullArt: true,
			};
			// rarity=1, colorIdentity=1, cardType=1, manaValue=1, price=1, typeLine=1, setName=1, reserved=1, promo=1, fullart=1
			expect(getActiveFilterCount(filters)).toBe(10);
		});
	});

	describe("isDefaultFilterState", () => {
		it("returns true for default state", () => {
			expect(isDefaultFilterState(DEFAULT_FILTER_STATE)).toBe(true);
		});

		it("returns true for equivalent empty state", () => {
			const filters: MTGFilterState = {
				rarity: [],
				colorIdentity: [],
				cardType: [],
				finish: [],
				manaValue: {},
				price: {},
				typeLine: "",
				setName: "",
				reservedList: null,
				isPromo: null,
				isFullArt: null,
			};
			expect(isDefaultFilterState(filters)).toBe(true);
		});

		it("returns false when any filter is active", () => {
			expect(
				isDefaultFilterState({
					...DEFAULT_FILTER_STATE,
					rarity: ["mtg-rarity-common"],
				}),
			).toBe(false);

			expect(
				isDefaultFilterState({
					...DEFAULT_FILTER_STATE,
					typeLine: "Creature",
				}),
			).toBe(false);

			expect(
				isDefaultFilterState({
					...DEFAULT_FILTER_STATE,
					manaValue: { min: 1 },
				}),
			).toBe(false);

			expect(
				isDefaultFilterState({
					...DEFAULT_FILTER_STATE,
					reservedList: true,
				}),
			).toBe(false);

			expect(
				isDefaultFilterState({
					...DEFAULT_FILTER_STATE,
					reservedList: false,
				}),
			).toBe(false);
		});
	});
});
