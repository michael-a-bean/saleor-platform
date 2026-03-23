import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLatestSets } from "./getLatestSets";

const createSet = (overrides: Record<string, unknown> = {}) => ({
	code: "fdn",
	name: "Foundations",
	released_at: "2024-11-15",
	set_type: "core",
	icon_svg_uri: "https://svgs.scryfall.io/sets/fdn.svg",
	card_count: 271,
	...overrides,
});

describe("getLatestSets", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("returns sets sorted by release date descending", async () => {
		const mockSets = [
			createSet({ code: "old", name: "Old Set", released_at: "2023-01-01" }),
			createSet({ code: "new", name: "New Set", released_at: "2025-06-01" }),
			createSet({ code: "mid", name: "Mid Set", released_at: "2024-06-01" }),
		];

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: mockSets }),
		});

		const result = await getLatestSets("webstore", 10);
		expect(result[0].code).toBe("new");
		expect(result[1].code).toBe("mid");
		expect(result[2].code).toBe("old");
	});

	it("filters out token and art series sets", async () => {
		const mockSets = [
			createSet({ name: "Foundations" }),
			createSet({ code: "tfdn", name: "Foundations Tokens", set_type: "token" }),
			createSet({ code: "afdn", name: "Foundations Art Series" }),
			createSet({ code: "pfdn", name: "Foundations Promos" }),
		];

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: mockSets }),
		});

		const result = await getLatestSets();
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("Foundations");
	});

	it("filters out unsupported set types", async () => {
		const mockSets = [
			createSet({ set_type: "core" }),
			createSet({ code: "prom", name: "Promo Pack", set_type: "promo" }),
			createSet({ code: "memo", name: "Memorabilia", set_type: "memorabilia" }),
		];

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: mockSets }),
		});

		const result = await getLatestSets();
		expect(result).toHaveLength(1);
	});

	it("excludes sets released in the future", async () => {
		const mockSets = [
			createSet({ released_at: "2024-01-01" }),
			createSet({ code: "future", name: "Future Set", released_at: "2099-01-01" }),
		];

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: mockSets }),
		});

		const result = await getLatestSets();
		expect(result).toHaveLength(1);
		expect(result[0].code).toBe("fdn");
	});

	it("respects limit parameter", async () => {
		const mockSets = Array.from({ length: 20 }, (_, i) =>
			createSet({ code: `set${i}`, name: `Set ${i}`, released_at: `2024-${String(i + 1).padStart(2, "0")}-01` }),
		);

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: mockSets }),
		});

		const result = await getLatestSets("webstore", 5);
		expect(result).toHaveLength(5);
	});

	it("maps response to LatestSet shape", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [createSet()] }),
		});

		const result = await getLatestSets();
		expect(result[0]).toEqual({
			name: "Foundations",
			code: "fdn",
			releasedAt: "2024-11-15",
			iconUri: "https://svgs.scryfall.io/sets/fdn.svg",
			cardCount: 271,
		});
	});

	it("returns empty array on fetch error", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
		const result = await getLatestSets();
		expect(result).toEqual([]);
	});

	it("returns empty array on non-ok response", async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		const result = await getLatestSets();
		expect(result).toEqual([]);
	});
});
