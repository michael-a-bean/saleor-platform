import { describe, it, expect } from "vitest";
import { anyFormsValidating, areAllFormsValid } from "./utils";
import { type ValidationState } from "./checkoutValidationStateStore";

describe("anyFormsValidating", () => {
	it("returns true when at least one form is validating", () => {
		const state = {
			shippingAddress: "valid",
			billingAddress: "validating",
		} as ValidationState;
		expect(anyFormsValidating(state)).toBe(true);
	});

	it("returns false when no forms are validating", () => {
		const state = {
			shippingAddress: "valid",
			billingAddress: "valid",
		} as ValidationState;
		expect(anyFormsValidating(state)).toBe(false);
	});

	it("returns false for empty state", () => {
		const state = {} as ValidationState;
		expect(anyFormsValidating(state)).toBe(false);
	});

	it("returns false when all forms are invalid", () => {
		const state = {
			shippingAddress: "invalid",
			billingAddress: "invalid",
		} as ValidationState;
		expect(anyFormsValidating(state)).toBe(false);
	});
});

describe("areAllFormsValid", () => {
	it("returns true when all forms are valid", () => {
		const state = {
			shippingAddress: "valid",
			billingAddress: "valid",
		} as ValidationState;
		expect(areAllFormsValid(state)).toBe(true);
	});

	it("returns false when any form is invalid", () => {
		const state = {
			shippingAddress: "valid",
			billingAddress: "invalid",
		} as ValidationState;
		expect(areAllFormsValid(state)).toBe(false);
	});

	it("returns false when any form is still validating", () => {
		const state = {
			shippingAddress: "valid",
			billingAddress: "validating",
		} as ValidationState;
		expect(areAllFormsValid(state)).toBe(false);
	});

	it("returns true for empty state (vacuous truth)", () => {
		const state = {} as ValidationState;
		expect(areAllFormsValid(state)).toBe(true);
	});
});
