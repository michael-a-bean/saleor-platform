import { type CardElementData } from "@adyen/adyen-web/dist/types/components/Card/types";
import type DropinElement from "@adyen/adyen-web/dist/types/components/Dropin";
import { type PaymentMethodsResponse } from "@adyen/adyen-web/dist/types/core/ProcessResponse/PaymentMethodsResponse/types";
import { type PaymentResponse } from "@adyen/adyen-web/dist/types/components/types";

export const adyenGatewayId = "app.saleor.adyen";
export type AdyenGatewayId = typeof adyenGatewayId;

// Adyen result codes - expanded to match all API response possibilities
// https://docs.adyen.com/online-payments/payment-result-codes
type AdyenResultCode =
	| "AuthenticationFinished"
	| "AuthenticationNotRequired"
	| "Authorised"
	| "Cancelled"
	| "ChallengeShopper"
	| "Error"
	| "IdentifyShopper"
	| "PartiallyAuthorised"
	| "Pending"
	| "PresentToShopper"
	| "Received"
	| "RedirectShopper"
	| "Refused"
	| "Success";

export interface AdyenGatewayInitializePayload {
	paymentMethodsResponse: PaymentMethodsResponse;
	clientKey: string;
	environment: string;
}

export interface AdyenPaymentResponse extends Omit<PaymentResponse, "resultCode"> {
	resultCode: AdyenResultCode;
	refusalReason?: string;
}

export interface AdyenTransactionInitializeResponse {
	paymentResponse: AdyenPaymentResponse;
}

export interface AdyenTransactionProcessResponse {
	paymentDetailsResponse: AdyenPaymentResponse;
}

// -------

export type ApplePayCallback = <T>(value: T) => void;

export type AdyenCheckoutInstanceState = {
	isValid?: boolean;
	data: CardElementData & Record<string, any>;
};

export type AdyenCheckoutInstanceOnSubmit = (
	state: AdyenCheckoutInstanceState,
	component: DropinElement,
) => Promise<void> | void;

export type AdyenCheckoutInstanceOnAdditionalDetails = (
	state: AdyenCheckoutInstanceState,
	component: DropinElement,
) => Promise<void> | void;
