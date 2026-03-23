import { describe, it, expect } from "vitest";
import { ATTRIBUTE_SLUGS } from "./mtgConstants";
import { transformToProductListItem, transformMeilisearchResults } from "./transformMeilisearchResults";
import type { MeilisearchProduct } from "@/lib/meilisearch";

function makeMeilisearchProduct(overrides: Partial<MeilisearchProduct> = {}): MeilisearchProduct {
	return {
		id: "ms-1",
		original_id: "UHJvZHVjdDox",
		name: "Black Lotus",
		slug: "black-lotus",
		thumbnail: "https://cdn.example.com/black-lotus.jpg",
		set_name: "Limited Edition Alpha",
		set_code: "LEA",
		collector_number: "232",
		rarity: "rare",
		colors: "Colorless",
		mana_cost: "{0}",
		type_line: "Artifact",
		oracle_text: "Sacrifice Black Lotus: Add three mana of any one color.",
		min_price: 999.99,
		total_stock: 1,
		in_stock: true,
		conditions_available: ["NM"],
		finishes_available: ["Non-Foil"],
		variants: [
			{ id: "mv-1", original_id: "UHJvZHVjdFZhcmlhbnQ6MQ==", sku: "abc-NM-NF", condition: "NM", finish: "Non-Foil", price: 999.99, stock: 1 },
		],
		category_id: "cat-1",
		category_name: "Singles",
		category_slug: "singles",
		...overrides,
	};
}

describe("transformToProductListItem", () => {
	it("maps basic fields correctly", () => {
		const result = transformToProductListItem(makeMeilisearchProduct());
		expect(result.id).toBe("UHJvZHVjdDox");
		expect(result.name).toBe("Black Lotus");
		expect(result.slug).toBe("black-lotus");
	});

	it("maps thumbnail with alt text", () => {
		const result = transformToProductListItem(makeMeilisearchProduct());
		expect(result.thumbnail).toEqual({
			url: "https://cdn.example.com/black-lotus.jpg",
			alt: "Black Lotus",
		});
	});

	it("handles null thumbnail", () => {
		const result = transformToProductListItem(makeMeilisearchProduct({ thumbnail: null }));
		expect(result.thumbnail).toBeNull();
	});

	it("maps pricing with USD currency", () => {
		const result = transformToProductListItem(makeMeilisearchProduct({ min_price: 5.99 }));
		expect(result.pricing?.priceRange?.start?.gross).toEqual({ amount: 5.99, currency: "USD" });
		expect(result.pricing?.priceRange?.stop?.gross).toEqual({ amount: 5.99, currency: "USD" });
	});

	it("handles null min_price", () => {
		const result = transformToProductListItem(makeMeilisearchProduct({ min_price: null }));
		expect(result.pricing).toBeNull();
	});

	it("maps variants with stock quantity", () => {
		const result = transformToProductListItem(makeMeilisearchProduct({
			variants: [
				{ id: "v1", original_id: "o1", sku: "s1", condition: "NM", finish: "Foil", price: 10, stock: 3 },
				{ id: "v2", original_id: "o2", sku: "s2", condition: "LP", finish: "Non-Foil", price: 8, stock: 0 },
			],
		}));
		expect(result.variants).toHaveLength(2);
		expect(result.variants?.[0]?.quantityAvailable).toBe(3);
		expect(result.variants?.[1]?.quantityAvailable).toBe(0);
	});

	it("maps set_name attribute", () => {
		const result = transformToProductListItem(makeMeilisearchProduct({ set_name: "Modern Horizons 3" }));
		const setNameAttr = result.attributes?.find((a: any) => a.attribute.slug === ATTRIBUTE_SLUGS.setName);
		expect(setNameAttr?.values?.[0]?.name).toBe("Modern Horizons 3");
		expect(setNameAttr?.values?.[0]?.slug).toBe("modern-horizons-3");
	});

	it("maps rarity attribute", () => {
		const result = transformToProductListItem(makeMeilisearchProduct({ rarity: "mythic" }));
		const rarityAttr = result.attributes?.find((a: any) => a.attribute.slug === ATTRIBUTE_SLUGS.rarity);
		expect(rarityAttr?.values?.[0]?.name).toBe("mythic");
		expect(rarityAttr?.values?.[0]?.slug).toBe("mythic");
	});

	it("handles missing set_name gracefully", () => {
		const result = transformToProductListItem(makeMeilisearchProduct({ set_name: "" }));
		const setNameAttr = result.attributes?.find((a: any) => a.attribute.slug === ATTRIBUTE_SLUGS.setName);
		expect(setNameAttr?.values).toEqual([]);
	});
});

describe("transformMeilisearchResults", () => {
	it("transforms array of products", () => {
		const products = [
			makeMeilisearchProduct({ name: "Card A", original_id: "id-a" }),
			makeMeilisearchProduct({ name: "Card B", original_id: "id-b" }),
		];
		const result = transformMeilisearchResults(products);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("Card A");
		expect(result[1].name).toBe("Card B");
	});

	it("handles empty array", () => {
		expect(transformMeilisearchResults([])).toEqual([]);
	});
});
