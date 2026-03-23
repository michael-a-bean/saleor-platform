import { describe, it, expect } from "vitest";
import { apiErrorMessages } from "./errorMessages";

describe("apiErrorMessages", () => {
	it("has a message for every key", () => {
		for (const [key, value] of Object.entries(apiErrorMessages)) {
			expect(value, `Missing message for key: ${key}`).toBeTruthy();
			expect(typeof value).toBe("string");
		}
	});

	it("includes checkout payment error messages", () => {
		expect(apiErrorMessages.checkoutPayShippingMethodNotSetError).toContain("delivery method");
		expect(apiErrorMessages.checkoutPayEmailNotSetError).toContain("email");
		expect(apiErrorMessages.checkoutPayTotalAmountMismatchError).toContain("finalize");
	});

	it("includes address validation error messages", () => {
		expect(apiErrorMessages.checkoutShippingUpdatePostalCodeInvalidError).toContain("postal code");
		expect(apiErrorMessages.checkoutBillingUpdatePostalCodeInvalidError).toContain("postal code");
		expect(apiErrorMessages.checkoutShippingUpdatePhoneInvalidError).toContain("phone");
	});

	it("includes login/auth error messages", () => {
		expect(apiErrorMessages.loginEmailNotFoundError).toContain("not found");
		expect(apiErrorMessages.loginEmailInactiveError).toContain("inactive");
		expect(apiErrorMessages.signInEmailInvalidCredentialsError).toContain("Invalid credentials");
	});

	it("includes promo code error messages", () => {
		expect(apiErrorMessages.checkoutAddPromoCodePromoCodeInvalidError).toContain("promo code");
		expect(apiErrorMessages.checkoutAddPromoCodePromoCodeVoucherNotApplicableError).toContain("not applicable");
	});

	it("includes stock/quantity error messages", () => {
		expect(apiErrorMessages.checkoutLinesUpdateQuantityQuantityGreaterThanLimitError).toContain("limit");
		expect(apiErrorMessages.checkoutLinesUpdateQuantityInsufficientStockError).toContain("stock");
	});
});
