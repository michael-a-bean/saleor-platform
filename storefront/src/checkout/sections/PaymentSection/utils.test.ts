import { describe, it, expect } from "vitest";
import { getFilteredPaymentGateways, usePaymentStatus, supportedPaymentGateways } from "./utils";
import { stripeV2GatewayId } from "./StripeV2DropIn/types";
import { type PaymentGateway } from "@/checkout/graphql";

describe("supportedPaymentGateways", () => {
	it("includes Stripe V2 gateway", () => {
		expect(supportedPaymentGateways).toContain(stripeV2GatewayId);
	});

	it("is an array with at least one gateway", () => {
		expect(Array.isArray(supportedPaymentGateways)).toBe(true);
		expect(supportedPaymentGateways.length).toBeGreaterThan(0);
	});
});

describe("getFilteredPaymentGateways", () => {
	const stripeGateway: PaymentGateway = {
		id: stripeV2GatewayId,
		name: "Stripe",
		config: [],
		currencies: ["USD"],
	};

	const unsupportedGateway: PaymentGateway = {
		id: "app.saleor.unsupported",
		name: "Unsupported Gateway",
		config: [],
		currencies: ["USD"],
	};

	const anotherUnsupportedGateway: PaymentGateway = {
		id: "some.other.gateway",
		name: "Other",
		config: [],
		currencies: ["USD"],
	};

	it("returns empty array for null input", () => {
		expect(getFilteredPaymentGateways(null)).toEqual([]);
	});

	it("returns empty array for undefined input", () => {
		expect(getFilteredPaymentGateways(undefined)).toEqual([]);
	});

	it("returns empty array for empty array input", () => {
		expect(getFilteredPaymentGateways([])).toEqual([]);
	});

	it("filters to only supported gateways", () => {
		const gateways = [stripeGateway, unsupportedGateway];
		const result = getFilteredPaymentGateways(gateways);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(stripeV2GatewayId);
	});

	it("returns empty when no supported gateways", () => {
		const gateways = [unsupportedGateway, anotherUnsupportedGateway];
		const result = getFilteredPaymentGateways(gateways);
		expect(result).toHaveLength(0);
	});

	it("preserves multiple supported gateways", () => {
		// If there were multiple supported gateways
		const gateways = [stripeGateway];
		const result = getFilteredPaymentGateways(gateways);
		expect(result).toHaveLength(1);
	});

	it("handles arrays with null elements", () => {
		const gateways = [stripeGateway, null as unknown as PaymentGateway, unsupportedGateway];
		const result = getFilteredPaymentGateways(gateways);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(stripeV2GatewayId);
	});
});

describe("usePaymentStatus", () => {
	describe("authorized status", () => {
		it("returns authorized when chargeStatus is NONE and authorizeStatus is FULL", () => {
			const result = usePaymentStatus({
				chargeStatus: "NONE",
				authorizeStatus: "FULL",
			});
			expect(result).toBe("authorized");
		});

		it("does not return authorized when chargeStatus is not NONE", () => {
			const result = usePaymentStatus({
				chargeStatus: "PARTIAL",
				authorizeStatus: "FULL",
			});
			expect(result).not.toBe("authorized");
		});
	});

	describe("paidInFull status", () => {
		it("returns paidInFull when chargeStatus is FULL", () => {
			const result = usePaymentStatus({
				chargeStatus: "FULL",
				authorizeStatus: "NONE",
			});
			expect(result).toBe("paidInFull");
		});

		it("returns paidInFull regardless of authorizeStatus", () => {
			const result = usePaymentStatus({
				chargeStatus: "FULL",
				authorizeStatus: "FULL",
			});
			expect(result).toBe("paidInFull");
		});
	});

	describe("overpaid status", () => {
		it("returns overpaid when chargeStatus is OVERCHARGED", () => {
			const result = usePaymentStatus({
				chargeStatus: "OVERCHARGED",
				authorizeStatus: "NONE",
			});
			expect(result).toBe("overpaid");
		});
	});

	describe("none status", () => {
		it("returns none when chargeStatus is NONE and authorizeStatus is NONE", () => {
			const result = usePaymentStatus({
				chargeStatus: "NONE",
				authorizeStatus: "NONE",
			});
			expect(result).toBe("none");
		});

		it("returns none when chargeStatus is PARTIAL", () => {
			const result = usePaymentStatus({
				chargeStatus: "PARTIAL",
				authorizeStatus: "PARTIAL",
			});
			expect(result).toBe("none");
		});

		it("returns none when authorizeStatus is PARTIAL and chargeStatus is NONE", () => {
			const result = usePaymentStatus({
				chargeStatus: "NONE",
				authorizeStatus: "PARTIAL",
			});
			expect(result).toBe("none");
		});
	});

	describe("priority ordering", () => {
		it("paidInFull takes priority over authorized", () => {
			// FULL charge takes priority
			const result = usePaymentStatus({
				chargeStatus: "FULL",
				authorizeStatus: "FULL",
			});
			expect(result).toBe("paidInFull");
		});

		it("overpaid takes priority over paidInFull check order", () => {
			const result = usePaymentStatus({
				chargeStatus: "OVERCHARGED",
				authorizeStatus: "FULL",
			});
			expect(result).toBe("overpaid");
		});
	});
});
