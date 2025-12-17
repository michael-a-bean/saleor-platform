import { compact } from "lodash-es";
import { adyenGatewayId } from "./AdyenDropIn/types";
import { legacyDummyGatewayId } from "./LegacyDummyDropIn/types";
import { stripeV2GatewayId } from "./StripeV2DropIn/types";
import {
	type CheckoutAuthorizeStatusEnum,
	type CheckoutChargeStatusEnum,
	type OrderAuthorizeStatusEnum,
	type OrderChargeStatusEnum,
	type PaymentGateway,
} from "@/checkout/graphql";
import { type MightNotExist } from "@/checkout/lib/globalTypes";
import { getUrl, type ParamBasicValue } from "@/checkout/lib/utils/url";
import { type PaymentStatus } from "@/checkout/sections/PaymentSection/types";

// Transaction-based payment gateways that use paymentGatewayInitializeSession webhook
export const supportedPaymentGateways = [adyenGatewayId, stripeV2GatewayId] as const;

// Legacy payment gateways that use the old checkoutPaymentCreate flow
// These don't require the paymentGatewayInitializeSession webhook
export const legacyPaymentGateways = [legacyDummyGatewayId] as const;

export const getFilteredPaymentGateways = (
	paymentGateways: MightNotExist<PaymentGateway[]>,
): PaymentGateway[] => {
	if (!paymentGateways) {
		return [];
	}

	// Filter to only transaction-based payment apps (not legacy plugins)
	return compact(paymentGateways).filter(({ id }) => supportedPaymentGateways.includes(id));
};

export const getLegacyPaymentGateways = (
	paymentGateways: MightNotExist<PaymentGateway[]>,
): PaymentGateway[] => {
	if (!paymentGateways) {
		return [];
	}

	// Filter to only legacy payment gateways
	return compact(paymentGateways).filter(({ id }) => legacyPaymentGateways.includes(id as typeof legacyDummyGatewayId));
};

export const getUrlForTransactionInitialize = (extraQuery?: Record<string, ParamBasicValue>) =>
	getUrl({
		query: {
			processingPayment: true,
			...extraQuery,
		},
	});

export const usePaymentStatus = ({
	chargeStatus,
	authorizeStatus,
}: {
	chargeStatus: CheckoutChargeStatusEnum | OrderChargeStatusEnum;
	authorizeStatus: CheckoutAuthorizeStatusEnum | OrderAuthorizeStatusEnum;
}): PaymentStatus => {
	if (chargeStatus === "NONE" && authorizeStatus === "FULL") {
		return "authorized";
	}

	if (chargeStatus === "FULL") {
		return "paidInFull";
	}

	if (chargeStatus === "OVERCHARGED") {
		return "overpaid";
	}

	return "none";
};
