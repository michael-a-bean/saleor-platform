import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/config", () => ({
	ProductsPerPage: 12,
}));

import { formatDate, formatMoney, formatMoneyRange, getHrefForVariant, getPaginatedListVariables } from "./utils";

describe("formatMoney", () => {
	it("formats USD amount with dollar sign and decimals", () => {
		expect(formatMoney(9.99, "USD")).toBe("$9.99");
	});

	it("formats zero amount", () => {
		expect(formatMoney(0, "USD")).toBe("$0.00");
	});

	it("formats large amounts with comma separators", () => {
		expect(formatMoney(1234.56, "USD")).toBe("$1,234.56");
	});

	it("returns empty string for empty currency", () => {
		expect(formatMoney(10, "")).toBe("");
	});

	it("handles EUR currency", () => {
		const result = formatMoney(10, "EUR");
		expect(result).toContain("10");
	});
});

describe("formatMoneyRange", () => {
	it("shows single price when start equals stop", () => {
		const range = {
			start: { amount: 5.99, currency: "USD" },
			stop: { amount: 5.99, currency: "USD" },
		};
		expect(formatMoneyRange(range)).toBe("$5.99");
	});

	it("shows range when start differs from stop", () => {
		const range = {
			start: { amount: 1.00, currency: "USD" },
			stop: { amount: 10.00, currency: "USD" },
		};
		expect(formatMoneyRange(range)).toBe("$1.00 - $10.00");
	});

	it("handles null range", () => {
		expect(formatMoneyRange(null)).toBeUndefined();
	});

	it("handles missing start", () => {
		const range = { stop: { amount: 10, currency: "USD" } };
		const result = formatMoneyRange(range);
		expect(result).toContain("$10.00");
	});

	it("handles missing stop", () => {
		const range = { start: { amount: 5, currency: "USD" } };
		const result = formatMoneyRange(range);
		expect(result).toContain("$5.00");
	});
});

describe("formatDate", () => {
	it("formats a Date object to medium date style", () => {
		const date = new Date("2026-03-22T12:00:00Z");
		const result = formatDate(date);
		expect(result).toContain("Mar");
		expect(result).toContain("2026");
	});

	it("formats a timestamp number", () => {
		const timestamp = new Date("2026-01-15").getTime();
		const result = formatDate(timestamp);
		expect(result).toContain("Jan");
		expect(result).toContain("2026");
	});
});

describe("getHrefForVariant", () => {
	it("returns product path without variant", () => {
		expect(getHrefForVariant({ productSlug: "black-lotus" })).toBe("/products/black-lotus");
	});

	it("returns product path with variant query param", () => {
		const href = getHrefForVariant({ productSlug: "black-lotus", variantId: "var-123" });
		expect(href).toBe("/products/black-lotus?variant=var-123");
	});

	it("encodes special characters in slug", () => {
		const href = getHrefForVariant({ productSlug: "card with spaces" });
		expect(href).toBe("/products/card%20with%20spaces");
	});
});

describe("getPaginatedListVariables", () => {
	it("returns first/after for next direction (default)", () => {
		const result = getPaginatedListVariables({ params: { cursor: "abc", direction: "next" } });
		expect(result).toEqual({ first: 12, after: "abc" });
	});

	it("returns last/before for prev direction", () => {
		const result = getPaginatedListVariables({ params: { cursor: "xyz", direction: "prev" } });
		expect(result).toEqual({ last: 12, before: "xyz" });
	});

	it("defaults to next direction when not specified", () => {
		const result = getPaginatedListVariables({ params: { cursor: "abc" } });
		expect(result).toEqual({ first: 12, after: "abc" });
	});

	it("handles null cursor", () => {
		const result = getPaginatedListVariables({ params: {} });
		expect(result).toEqual({ first: 12, after: null });
	});

	it("respects custom pageSize", () => {
		const result = getPaginatedListVariables({ params: {}, pageSize: 24 });
		expect(result).toEqual({ first: 24, after: null });
	});
});
