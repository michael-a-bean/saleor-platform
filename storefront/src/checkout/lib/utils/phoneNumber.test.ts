import { describe, it, expect } from "vitest";
import { type CountryCode } from "@/checkout/graphql";

import { isValidPhoneNumber, getPhoneNumberWithCountryCode } from "./phoneNumber";

describe("isValidPhoneNumber", () => {
	describe("US phone numbers", () => {
		const US = "US" as CountryCode;

		it("accepts valid US number with country code", () => {
			expect(isValidPhoneNumber("+12125551234", US)).toBe(true);
		});

		it("accepts valid US number without country code", () => {
			expect(isValidPhoneNumber("2125551234", US)).toBe(true);
		});

		it("accepts formatted US number", () => {
			expect(isValidPhoneNumber("(212) 555-1234", US)).toBe(true);
		});

		it("rejects too-short US number", () => {
			expect(isValidPhoneNumber("212555", US)).toBe(false);
		});

		it("rejects too-long US number", () => {
			expect(isValidPhoneNumber("212555123456789", US)).toBe(false);
		});

		it("rejects empty string", () => {
			expect(isValidPhoneNumber("", US)).toBe(false);
		});

		it("rejects non-numeric input", () => {
			expect(isValidPhoneNumber("not-a-phone", US)).toBe(false);
		});
	});

	describe("International numbers", () => {
		it("accepts valid UK number", () => {
			expect(isValidPhoneNumber("+442071234567", "GB" as CountryCode)).toBe(true);
		});

		it("accepts valid German number", () => {
			expect(isValidPhoneNumber("+4930123456", "DE" as CountryCode)).toBe(true);
		});

		it("accepts valid Japanese number", () => {
			expect(isValidPhoneNumber("+81312345678", "JP" as CountryCode)).toBe(true);
		});

		it("validates with undefined country code using intl format", () => {
			expect(isValidPhoneNumber("+12125551234", undefined)).toBe(true);
		});

		it("rejects number without country code when country is undefined", () => {
			expect(isValidPhoneNumber("2125551234", undefined)).toBe(false);
		});
	});
});

describe("getPhoneNumberWithCountryCode", () => {
	const US = "US" as CountryCode;

	it("adds country calling code when missing", () => {
		const result = getPhoneNumberWithCountryCode("2125551234", US);
		expect(result).toBe("+12125551234");
	});

	it("preserves number that already has country code", () => {
		const result = getPhoneNumberWithCountryCode("+12125551234", US);
		expect(result).toBe("+12125551234");
	});

	it("preserves formatted number that already has country code", () => {
		const result = getPhoneNumberWithCountryCode("+1 (212) 555-1234", US);
		expect(result).toBe("+1 (212) 555-1234");
	});

	it("adds UK country code", () => {
		const result = getPhoneNumberWithCountryCode("2071234567", "GB" as CountryCode);
		expect(result).toBe("+442071234567");
	});
});
