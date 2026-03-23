import { describe, it, expect, beforeEach } from "vitest";

// Must set up location before importing the module since it uses location at call time
function setLocation(search: string) {
	Object.defineProperty(window, "location", {
		value: {
			search,
			toString: () => `http://localhost:3000${search}`,
			href: `http://localhost:3000${search}`,
		},
		writable: true,
	});
}

describe("url utilities", () => {
	beforeEach(() => {
		setLocation("");
	});

	describe("getQueryParams", () => {
		it("maps checkout query param to checkoutId", async () => {
			setLocation("?checkout=abc-123");
			const { getQueryParams } = await import("./url");
			const params = getQueryParams();
			expect(params.checkoutId).toBe("abc-123");
		});

		it("maps order query param to orderId", async () => {
			setLocation("?order=order-456");
			const { getQueryParams } = await import("./url");
			const params = getQueryParams();
			expect(params.orderId).toBe("order-456");
		});

		it("maps payment_intent to paymentIntent", async () => {
			setLocation("?payment_intent=pi_abc");
			const { getQueryParams } = await import("./url");
			const params = getQueryParams();
			expect(params.paymentIntent).toBe("pi_abc");
		});
	});

	describe("extractCheckoutIdFromUrl", () => {
		it("returns checkout ID from URL", async () => {
			setLocation("?checkout=test-checkout-id");
			const { extractCheckoutIdFromUrl } = await import("./url");
			expect(extractCheckoutIdFromUrl()).toBe("test-checkout-id");
		});

		it("returns empty string on order confirmation page", async () => {
			setLocation("?order=order-789");
			const { extractCheckoutIdFromUrl } = await import("./url");
			expect(extractCheckoutIdFromUrl()).toBe("");
		});

		it("throws when no checkout ID present", async () => {
			setLocation("");
			const { extractCheckoutIdFromUrl } = await import("./url");
			expect(() => extractCheckoutIdFromUrl()).toThrow("Checkout token does not exist");
		});
	});

	describe("isOrderConfirmationPage", () => {
		it("returns true when orderId is in URL", async () => {
			setLocation("?order=order-123");
			const { isOrderConfirmationPage } = await import("./url");
			expect(isOrderConfirmationPage()).toBe(true);
		});

		it("returns false when no orderId in URL", async () => {
			setLocation("?checkout=abc");
			const { isOrderConfirmationPage } = await import("./url");
			expect(isOrderConfirmationPage()).toBe(false);
		});
	});
});
