import { describe, it, expect } from "vitest";
import { areAnyRequestsInProgress, hasFinishedApiChangesWithNoError } from "./utils";
import { type CheckoutUpdateState } from "./updateStateStore";

const createState = (overrides: Partial<CheckoutUpdateState> = {}): CheckoutUpdateState => ({
	loadingCheckout: false,
	submitInProgress: false,
	changingBillingCountry: false,
	updateState: {
		paymentGatewaysInitialize: "success",
		checkoutShippingUpdate: "success",
		checkoutCustomerAttach: "success",
		checkoutBillingUpdate: "success",
		checkoutAddPromoCode: "success",
		checkoutDeliveryMethodUpdate: "success",
		checkoutLinesUpdate: "success",
		checkoutEmailUpdate: "success",
		userRegister: "success",
		resetPassword: "success",
		signIn: "success",
		requestPasswordReset: "success",
		checkoutLinesDelete: "success",
		userAddressCreate: "success",
		userAddressDelete: "success",
		userAddressUpdate: "success",
	},
	...overrides,
});

describe("areAnyRequestsInProgress", () => {
	it("returns false when all requests succeeded and checkout is not loading", () => {
		const state = createState();
		expect(areAnyRequestsInProgress(state)).toBe(false);
	});

	it("returns true when checkout is loading", () => {
		const state = createState({ loadingCheckout: true });
		expect(areAnyRequestsInProgress(state)).toBe(true);
	});

	it("returns true when any update is loading", () => {
		const state = createState({
			updateState: {
				...createState().updateState,
				checkoutShippingUpdate: "loading",
			},
		});
		expect(areAnyRequestsInProgress(state)).toBe(true);
	});

	it("returns false when updates have errors but none loading", () => {
		const state = createState({
			updateState: {
				...createState().updateState,
				checkoutBillingUpdate: "error",
			},
		});
		expect(areAnyRequestsInProgress(state)).toBe(false);
	});

	it("returns true when both checkout loading and update loading", () => {
		const state = createState({
			loadingCheckout: true,
			updateState: {
				...createState().updateState,
				checkoutLinesUpdate: "loading",
			},
		});
		expect(areAnyRequestsInProgress(state)).toBe(true);
	});
});

describe("hasFinishedApiChangesWithNoError", () => {
	it("returns true when all updates succeeded and checkout not loading", () => {
		const state = createState();
		expect(hasFinishedApiChangesWithNoError(state)).toBe(true);
	});

	it("returns false when checkout is still loading", () => {
		const state = createState({ loadingCheckout: true });
		expect(hasFinishedApiChangesWithNoError(state)).toBe(false);
	});

	it("returns false when any update is in error state", () => {
		const state = createState({
			updateState: {
				...createState().updateState,
				checkoutBillingUpdate: "error",
			},
		});
		expect(hasFinishedApiChangesWithNoError(state)).toBe(false);
	});

	it("returns false when any update is still loading", () => {
		const state = createState({
			updateState: {
				...createState().updateState,
				paymentGatewaysInitialize: "loading",
			},
		});
		expect(hasFinishedApiChangesWithNoError(state)).toBe(false);
	});
});
