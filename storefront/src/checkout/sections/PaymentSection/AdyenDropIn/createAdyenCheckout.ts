import AdyenCheckout from "@adyen/adyen-web";
import { type CardElementData } from "@adyen/adyen-web/dist/types/components/Card/types";
import type DropinElement from "@adyen/adyen-web/dist/types/components/Dropin";
import { type CreateCheckoutSessionResponse } from "@adyen/api-library/lib/src/typings/checkout/createCheckoutSessionResponse";
import { type AdyenPaymentResponse } from "./types";
import { replaceUrl } from "@/checkout/lib/utils/url";

export type AdyenDropInCreateSessionResponse = {
	session: CreateCheckoutSessionResponse;
	clientKey?: string;
};
export type PostAdyenDropInPaymentsDetailsResponse = {
	payment: AdyenPaymentResponse;
	orderId: string;
};
export type PostAdyenDropInPaymentsResponse = {
	payment: AdyenPaymentResponse;
	orderId: string;
};

export type AdyenCheckoutInstanceState = {
	isValid?: boolean;
	data: CardElementData & Record<string, unknown>;
};
export type AdyenCheckoutInstanceOnSubmit = (
	state: AdyenCheckoutInstanceState,
	component: DropinElement,
) => Promise<void> | void;

export type AdyenCheckoutInstanceOnAdditionalDetails = (
	state: AdyenCheckoutInstanceState,
	component: DropinElement,
) => Promise<void> | void;

type ApplePayCallback = <T>(value: T) => void;

type ApplePayEvent = {
	paymentMethod?: unknown;
	shippingContact?: unknown;
	shippingMethod?: unknown;
};

export function createAdyenCheckoutInstance(
	adyenSessionResponse: AdyenDropInCreateSessionResponse,
	{
		onSubmit,
		onAdditionalDetails,
	}: {
		onSubmit: AdyenCheckoutInstanceOnSubmit;
		onAdditionalDetails: AdyenCheckoutInstanceOnAdditionalDetails;
	},
) {
	return AdyenCheckout({
		locale: "en-US",
		environment: "test",
		clientKey: adyenSessionResponse.clientKey,
		session: {
			id: adyenSessionResponse.session.id,
			sessionData: adyenSessionResponse.session.sessionData,
		},
		onPaymentCompleted: () => {
			// Payment completed callback - success is handled by handlePaymentResult
		},
		onError: (error: { name?: string; message?: string }) => {
			// Error is shown to user via component.setStatus in handlePaymentResult
			void error; // Acknowledge error parameter
		},
		onSubmit,
		onAdditionalDetails,
		// Any payment method specific configuration. Find the configuration specific to each payment method: https://docs.adyen.com/payment-methods
		// For example, this is 3D Secure configuration for cards:
		paymentMethodsConfiguration: {
			card: {
				hasHolderName: true,
				holderNameRequired: true,
				billingAddressRequired: false,
			},
			applepay: {
				buttonType: "plain",
				buttonColor: "black",
				onPaymentMethodSelected: (resolve: ApplePayCallback, _reject: ApplePayCallback, event: ApplePayEvent) => {
					resolve(event.paymentMethod);
				},
				onShippingContactSelected: (resolve: ApplePayCallback, _reject: ApplePayCallback, event: ApplePayEvent) => {
					resolve(event.shippingContact);
				},
				onShippingMethodSelected: (resolve: ApplePayCallback, _reject: ApplePayCallback, event: ApplePayEvent) => {
					resolve(event.shippingMethod);
				},
			},
		},
		analytics: {
			enabled: false,
		},
	});
}

export function handlePaymentResult(
	saleorApiUrl: string,
	result: PostAdyenDropInPaymentsResponse | PostAdyenDropInPaymentsDetailsResponse,
	component: DropinElement,
) {
	const resultCode = result.payment.resultCode;

	// Handle error/pending states
	// @see https://docs.adyen.com/online-payments/payment-result-codes
	switch (resultCode) {
		case "AuthenticationFinished":
		case "Cancelled":
		case "ChallengeShopper":
		case "Error":
		case "IdentifyShopper":
		case "Pending":
		case "PresentToShopper":
		case "Received":
		case "RedirectShopper":
		case "Refused": {
			component.setStatus("error", {
				message: `${resultCode}: ${result.payment.refusalReason ?? "Payment could not be processed"}`,
			});
			return;
		}

		case "Authorised":
		case "Success": {
			component.setStatus("success");
			const domain = new URL(saleorApiUrl).hostname;
			const newUrl = replaceUrl({
				query: {
					checkout: undefined,
					order: result.orderId,
					saleorApiUrl,
					// @todo remove `domain`
					// https://github.com/saleor/saleor-dashboard/issues/2387
					// https://github.com/saleor/saleor-app-sdk/issues/87
					domain,
				},
			});
			window.location.href = newUrl;
			return;
		}
	}
}
