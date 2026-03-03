import { type FormEventHandler, useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { type StripePaymentElementOptions } from "@stripe/stripe-js";
import { getUrlForTransactionInitialize } from "../utils";
import { stripeV2GatewayId } from "./types";
import { useCheckoutCompleteRedirect } from "./useCheckoutCompleteRedirect";
import { useCheckout } from "@/checkout/hooks/useCheckout";
import { useAlerts } from "@/checkout/hooks/useAlerts";
import { useEvent } from "@/checkout/hooks/useEvent";
import { useTransactionInitializeMutation, useTransactionProcessMutation } from "@/checkout/graphql";
import { useCheckoutComplete } from "@/checkout/hooks/useCheckoutComplete";
import { useCheckoutUpdateState, useCheckoutUpdateStateActions } from "@/checkout/state/updateStateStore";

// Safe sessionStorage access for environments where it may not be available
const safeSessionStorage = {
	setItem: (key: string, value: string): void => {
		try {
			sessionStorage.setItem(key, value);
		} catch {
			// Silently fail in environments without sessionStorage
		}
	},
	removeItem: (key: string): void => {
		try {
			sessionStorage.removeItem(key);
		} catch {
			// Silently fail in environments without sessionStorage
		}
	},
};

const paymentElementOptions: StripePaymentElementOptions = {
	layout: "tabs",
};

// Stripe minimum amounts by currency (in major units, e.g., dollars)
const STRIPE_MINIMUM_AMOUNTS: Record<string, number> = {
	usd: 0.5,
	eur: 0.5,
	gbp: 0.3,
	// Add more currencies as needed, default to 0.5
};

const getMinimumAmount = (currency: string): number => {
	return STRIPE_MINIMUM_AMOUNTS[currency.toLowerCase()] ?? 0.5;
};

export function CheckoutForm() {
	const [isLoading, setIsLoading] = useState(false);
	const stripe = useStripe();
	const elements = useElements();
	const { checkout } = useCheckout();
	const { showCustomErrors } = useAlerts();
	const { onCheckoutComplete } = useCheckoutComplete();
	const [, transactionInitialize] = useTransactionInitializeMutation();
	const [, transactionProcess] = useTransactionProcessMutation();
	const { setShouldRegisterUser } = useCheckoutUpdateStateActions();
	const {
		updateState: { checkoutDeliveryMethodUpdate },
	} = useCheckoutUpdateState();
	const isDeliveryUpdating = checkoutDeliveryMethodUpdate === "loading";

	// Check if checkout amount meets Stripe minimum
	const checkoutAmount = checkout?.totalPrice?.gross?.amount ?? 0;
	const currency = checkout?.totalPrice?.gross?.currency ?? "USD";
	const minimumAmount = getMinimumAmount(currency);
	const isBelowMinimum = checkoutAmount < minimumAmount;

	// When page is opened from previously redirected payment, we need to complete the checkout
	useCheckoutCompleteRedirect();

	const handleSubmit: FormEventHandler<HTMLFormElement> = useEvent(async (e) => {
		e.preventDefault();

		if (!stripe || !elements) {
			showCustomErrors([{ message: "Payment system is not available. Please try again later." }]);
			return;
		}

		if (isDeliveryUpdating) {
			return;
		}

		// Check minimum amount before attempting payment
		if (isBelowMinimum) {
			showCustomErrors([
				{
					message: `Order total must be at least ${minimumAmount.toFixed(2)} ${currency.toUpperCase()} to process payment.`,
				},
			]);
			return;
		}

		// Trigger user registration if "create account" was checked
		setShouldRegisterUser(true);
		setIsLoading(true);

		try {
			// First submit Stripe form to validate and get the payment method
			const submitResult = await elements.submit();

			if (submitResult.error) {
				showCustomErrors([{ message: submitResult.error.message || "Payment validation failed" }]);
				setIsLoading(false);
				return;
			}

			// Note: elements.submit() doesn't return selectedPaymentMethod in Stripe.js
			// The Payment Element handles multiple payment methods, but for transaction initialization
			// we default to "card" which is the most common. The actual payment method type will be
			// determined by Stripe when processing the payment.
			const selectedPaymentMethod = "card";

			// Initialize transaction with Saleor
			// Omit amount so Saleor uses the server-side checkout remaining balance,
			// which always includes shipping. Client-side totalPrice can be stale.
			const initializeResult = await transactionInitialize({
				checkoutId: checkout.id,
				paymentGateway: {
					id: stripeV2GatewayId,
					data: {
						paymentIntent: {
							paymentMethod: selectedPaymentMethod,
						},
					},
				},
			});

			if (initializeResult.error) {
				showCustomErrors([
					{ message: initializeResult.error.message || "Transaction initialization failed" },
				]);
				setIsLoading(false);
				return;
			}

			const transactionData = initializeResult.data?.transactionInitialize;
			if (!transactionData || transactionData.errors?.length) {
				const errorMessages = transactionData?.errors?.map((err) => ({ message: err.message || "Error" }));
				showCustomErrors(errorMessages || [{ message: "Transaction initialization failed" }]);
				setIsLoading(false);
				return;
			}

			// Extract client secret from the transaction data
			const data = transactionData.data;

			const clientSecret = data?.paymentIntent?.stripeClientSecret as string | undefined;
			const transactionId = transactionData.transaction?.id;

			if (!clientSecret || !transactionId) {
				showCustomErrors([
					{
						message: `Order total must be at least ${minimumAmount.toFixed(2)} ${currency.toUpperCase()} to process payment. Please add more items to your cart.`,
					},
				]);
				setIsLoading(false);
				return;
			}

			// Store non-sensitive identifier only so that we can resume after redirect
			safeSessionStorage.setItem("transactionId", transactionId);

			const { newUrl: returnUrl } = getUrlForTransactionInitialize({
				transaction: transactionId,
			});

			// Confirm the payment with Stripe
			const { error: confirmError } = await stripe.confirmPayment({
				elements,
				clientSecret,
				confirmParams: {
					return_url: returnUrl,
					payment_method_data: {
						billing_details: {
							name: `${checkout.billingAddress?.firstName} ${checkout.billingAddress?.lastName}`.trim(),
							email: checkout.email || "",
							phone: checkout.billingAddress?.phone || "",
							address: {
								city: checkout.billingAddress?.city || "",
								country: checkout.billingAddress?.country?.code || "",
								line1: checkout.billingAddress?.streetAddress1 || "",
								line2: checkout.billingAddress?.streetAddress2 || "",
								postal_code: checkout.billingAddress?.postalCode || "",
								state: checkout.billingAddress?.countryArea || "",
							},
						},
					},
				},
			});

			if (confirmError) {
				setIsLoading(false);
				if (confirmError.type === "card_error" || confirmError.type === "validation_error") {
					showCustomErrors([{ message: confirmError.message ?? "Payment failed" }]);
				} else {
					showCustomErrors([{ message: "An unexpected error occurred with your payment" }]);
				}
			} else {
				// Payment succeeded without redirect - sync Saleor with Stripe status
				const processResult = await transactionProcess({ id: transactionId });

				if (processResult.error || processResult.data?.transactionProcess?.errors?.length) {
					showCustomErrors([
						{ message: "Payment was successful but order processing failed. Please contact support." },
					]);
					setIsLoading(false);
					return;
				}

				// Clear session storage since we're not going through redirect
				safeSessionStorage.removeItem("transactionId");
				safeSessionStorage.removeItem("clientSecret");

				const completeResult = await onCheckoutComplete();

				if (completeResult?.hasErrors) {
					const errorMessage =
						completeResult.apiErrors?.[0]?.message ||
						"Payment was successful but order could not be placed. Please contact support.";
					showCustomErrors([{ message: errorMessage }]);
					setIsLoading(false);
				}
			}

			// Note: If Stripe requires redirect (3DS, etc.), it will redirect to the return_url
			// The redirect flow is handled by useCheckoutCompleteRedirect
		} catch {
			showCustomErrors([{ message: "An unexpected error occurred during payment" }]);
			setIsLoading(false);
		}
	});

	return (
		<form className="my-8 flex flex-col gap-y-6" onSubmit={handleSubmit}>
			{isBelowMinimum && (
				<div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
					<p className="text-sm text-yellow-800">
						Order total must be at least {minimumAmount.toFixed(2)} {currency.toUpperCase()} to process
						payment. Please add more items to your cart.
					</p>
				</div>
			)}
			<PaymentElement className="payment-element" options={paymentElementOptions} />
			<button
				className="h-12 items-center rounded-md bg-neutral-900 px-6 py-3 text-base font-medium leading-6 text-white shadow hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-70 hover:disabled:bg-neutral-700 aria-disabled:cursor-not-allowed aria-disabled:opacity-70 hover:aria-disabled:bg-neutral-700"
				aria-disabled={isLoading || !stripe || !elements || isBelowMinimum || isDeliveryUpdating}
				disabled={isBelowMinimum || isDeliveryUpdating}
				id="submit"
				type="submit"
			>
				<span className="button-text">
					{isLoading ? <Loader /> : isDeliveryUpdating ? "Updating..." : "Pay now"}
				</span>
			</button>
		</form>
	);
}

function Loader() {
	return (
		<div className="text-center" aria-busy="true" role="status">
			<div>
				<svg
					aria-hidden="true"
					className="mr-2 inline h-6 w-6 animate-spin fill-neutral-600 text-neutral-100 dark:text-neutral-600"
					viewBox="0 0 100 101"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
						fill="currentColor"
					/>
					<path
						d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
						fill="currentFill"
					/>
				</svg>
				<span className="sr-only">Loading...</span>
			</div>
		</div>
	);
}
