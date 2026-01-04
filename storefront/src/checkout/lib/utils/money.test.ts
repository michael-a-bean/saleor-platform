import { describe, it, expect } from "vitest";
import { getFormattedMoney, type Money } from "./money";

describe("getFormattedMoney", () => {
	describe("with null/undefined values", () => {
		it("returns empty string for null money", () => {
			expect(getFormattedMoney(null)).toBe("");
		});

		it("returns empty string for undefined money", () => {
			expect(getFormattedMoney(undefined)).toBe("");
		});
	});

	describe("with USD currency", () => {
		it("formats whole number amount", () => {
			const money: Money = { currency: "USD", amount: 100 };
			expect(getFormattedMoney(money)).toBe("$100.00");
		});

		it("formats decimal amount", () => {
			const money: Money = { currency: "USD", amount: 19.99 };
			expect(getFormattedMoney(money)).toBe("$19.99");
		});

		it("formats zero amount", () => {
			const money: Money = { currency: "USD", amount: 0 };
			expect(getFormattedMoney(money)).toBe("$0.00");
		});

		it("formats small decimal amount", () => {
			const money: Money = { currency: "USD", amount: 0.01 };
			expect(getFormattedMoney(money)).toBe("$0.01");
		});

		it("formats large amount with thousands separator", () => {
			const money: Money = { currency: "USD", amount: 1234567.89 };
			expect(getFormattedMoney(money)).toBe("$1,234,567.89");
		});
	});

	describe("with other currencies", () => {
		it("formats EUR amount", () => {
			const money: Money = { currency: "EUR", amount: 50 };
			expect(getFormattedMoney(money)).toBe("€50.00");
		});

		it("formats GBP amount", () => {
			const money: Money = { currency: "GBP", amount: 75.5 };
			expect(getFormattedMoney(money)).toBe("£75.50");
		});

		it("formats JPY amount (no decimals)", () => {
			const money: Money = { currency: "JPY", amount: 1500 };
			expect(getFormattedMoney(money)).toBe("¥1,500");
		});

		it("formats CAD amount", () => {
			const money: Money = { currency: "CAD", amount: 25.99 };
			expect(getFormattedMoney(money)).toBe("CA$25.99");
		});
	});

	describe("with negative flag", () => {
		it("returns negative amount when flag is true", () => {
			const money: Money = { currency: "USD", amount: 50 };
			expect(getFormattedMoney(money, true)).toBe("-$50.00");
		});

		it("returns positive amount when flag is false", () => {
			const money: Money = { currency: "USD", amount: 50 };
			expect(getFormattedMoney(money, false)).toBe("$50.00");
		});

		it("handles zero with negative flag (displays as -$0.00)", () => {
			const money: Money = { currency: "USD", amount: 0 };
			// Intl.NumberFormat shows -$0.00 for negative zero
			expect(getFormattedMoney(money, true)).toBe("-$0.00");
		});

		it("negates already negative amounts", () => {
			const money: Money = { currency: "USD", amount: -25 };
			// Negative of negative becomes positive
			expect(getFormattedMoney(money, true)).toBe("$25.00");
		});
	});

	describe("edge cases", () => {
		it("handles very small amounts", () => {
			const money: Money = { currency: "USD", amount: 0.001 };
			expect(getFormattedMoney(money)).toBe("$0.00");
		});

		it("handles negative amounts without flag", () => {
			const money: Money = { currency: "USD", amount: -100 };
			expect(getFormattedMoney(money)).toBe("-$100.00");
		});
	});
});
