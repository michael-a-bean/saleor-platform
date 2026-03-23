import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAvailableSetsForSearch } from "./getAvailableSets";

describe("getAvailableSetsForSearch", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("returns empty array for empty search", async () => {
		expect(await getAvailableSetsForSearch("")).toEqual([]);
	});

	it("returns empty array for single character search", async () => {
		expect(await getAvailableSetsForSearch("a")).toEqual([]);
	});

	it("fetches facets from correct index for webstore channel", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ facetDistribution: { set_name: {} }, estimatedTotalHits: 0, hits: [] }),
		});

		await getAvailableSetsForSearch("dragon", "webstore");

		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/indexes/webstore-products/search"),
			expect.objectContaining({
				method: "POST",
				body: expect.stringContaining('"q":"dragon"'),
			}),
		);
	});

	it("maps default-channel to webstore-products index", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ facetDistribution: { set_name: {} }, estimatedTotalHits: 0, hits: [] }),
		});

		await getAvailableSetsForSearch("dragon", "default-channel");

		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/indexes/webstore-products/search"),
			expect.anything(),
		);
	});

	it("returns sets sorted by count descending", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				hits: [],
				estimatedTotalHits: 100,
				facetDistribution: {
					set_name: {
						"Foundations": 50,
						"Modern Horizons 3": 120,
						"Bloomburrow": 30,
					},
				},
			}),
		});

		const result = await getAvailableSetsForSearch("creature");
		expect(result[0].value).toBe("Modern Horizons 3");
		expect(result[1].value).toBe("Foundations");
		expect(result[2].value).toBe("Bloomburrow");
	});

	it("limits to 50 sets", async () => {
		const facets: Record<string, number> = {};
		for (let i = 0; i < 60; i++) {
			facets[`Set ${i}`] = 60 - i;
		}

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				hits: [],
				estimatedTotalHits: 1000,
				facetDistribution: { set_name: facets },
			}),
		});

		const result = await getAvailableSetsForSearch("test");
		expect(result).toHaveLength(50);
	});

	it("returns empty array when no facetDistribution", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ hits: [], estimatedTotalHits: 0 }),
		});

		const result = await getAvailableSetsForSearch("dragon");
		expect(result).toEqual([]);
	});

	it("returns empty array on fetch error", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
		const result = await getAvailableSetsForSearch("dragon");
		expect(result).toEqual([]);
	});

	it("returns empty array on non-ok response", async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		const result = await getAvailableSetsForSearch("dragon");
		expect(result).toEqual([]);
	});

	it("sets value and label to set name", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				hits: [],
				estimatedTotalHits: 10,
				facetDistribution: { set_name: { "Foundations": 5 } },
			}),
		});

		const result = await getAvailableSetsForSearch("test");
		expect(result[0]).toEqual({ value: "Foundations", label: "Foundations" });
	});
});
