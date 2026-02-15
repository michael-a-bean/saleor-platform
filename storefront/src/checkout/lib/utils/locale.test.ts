import { describe, it, expect } from "vitest";
import { type CountryCode } from "@/checkout/graphql";

import { getCountryName } from "./locale";

describe("getCountryName", () => {
	it("returns full name for US", () => {
		expect(getCountryName("US" as CountryCode)).toBe("United States");
	});

	it("returns full name for GB", () => {
		expect(getCountryName("GB" as CountryCode)).toBe("United Kingdom");
	});

	it("returns full name for DE", () => {
		expect(getCountryName("DE" as CountryCode)).toBe("Germany");
	});

	it("returns full name for JP", () => {
		expect(getCountryName("JP" as CountryCode)).toBe("Japan");
	});

	it("returns full name for CA", () => {
		expect(getCountryName("CA" as CountryCode)).toBe("Canada");
	});

	it("returns full name for AU", () => {
		expect(getCountryName("AU" as CountryCode)).toBe("Australia");
	});

	it("returns a string for unknown code", () => {
		const result = getCountryName("ZZ" as CountryCode);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});
});
