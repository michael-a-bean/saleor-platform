import { useEffect, useRef } from "react";
import { useStripe } from "@stripe/react-stripe-js";
import { useCheckoutComplete } from "@/checkout/hooks/useCheckoutComplete";
import { useTransactionProcessMutation } from "@/checkout/graphql";
import { getQueryParams, clearQueryParams } from "@/checkout/lib/utils/url";
import { usePaymentProcessingScreen } from "@/checkout/sections/PaymentSection/PaymentProcessingScreen";
import { useAlerts } from "@/checkout/hooks/useAlerts";

// Safe sessionStorage access for environments where it may not be available
const safeSessionStorage = {
	getItem: (key: string): string | null => {
		try {
			return sessionStorage.getItem(key);
		} catch {
			return null;
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

export const useCheckoutCompleteRedirect = () => {
	"use no memo";
	const stripe = useStripe();
	const { completingCheckout, onCheckoutComplete } = useCheckoutComplete();
	const [{ fetching: processingTransaction }, transactionProcess] = useTransactionProcessMutation();
	const { setIsProcessingPayment } = usePaymentProcessingScreen();
	const { showCustomErrors } = useAlerts();
	const isProcessingRef = useRef(false);

	const clearPaymentParams = () => {
		clearQueryParams("processingPayment", "paymentIntent", "paymentIntentClientSecret", "transaction");
		setIsProcessingPayment(false);
	};

	useEffect(() => {
		const { paymentIntent, paymentIntentClientSecret, processingPayment, transaction } = getQueryParams();

		// Check if we're returning from a Stripe redirect
		if (!paymentIntent || !paymentIntentClientSecret || !processingPayment) {
			return;
		}

		if (!stripe) {
			return;
		}

		// Prevent multiple executions
		if (isProcessingRef.current || completingCheckout || processingTransaction) {
			return;
		}

		const transactionId = safeSessionStorage.getItem("transactionId");
		const transactionIdFromQuery = typeof transaction === "string" ? transaction : undefined;
		const resolvedTransactionId = transactionId ?? transactionIdFromQuery;

		if (!resolvedTransactionId) {
			clearPaymentParams();
			showCustomErrors([{ message: "Payment session expired. Please try again." }]);
			return;
		}

		isProcessingRef.current = true;

		const processAndComplete = async () => {
			try {
				console.info("[checkout-redirect] Processing transaction:", resolvedTransactionId);

				// First, sync Saleor with Stripe's payment status via transactionProcess
				const processResult = await transactionProcess({ id: resolvedTransactionId });

				if (processResult.error) {
					console.error("[checkout-redirect] transactionProcess error:", processResult.error);
					clearPaymentParams();
					showCustomErrors([{ message: "Failed to process payment. Please try again." }]);
					isProcessingRef.current = false;
					return;
				}

				const processErrors = processResult.data?.transactionProcess?.errors;
				if (processErrors?.length) {
					console.error("[checkout-redirect] transactionProcess API errors:", processErrors);
					clearPaymentParams();
					const errorMessage = processErrors[0]?.message || "Payment processing failed";
					showCustomErrors([{ message: errorMessage }]);
					isProcessingRef.current = false;
					return;
				}

				type TransactionProcessData = {
					paymentIntent?: {
						stripeClientSecret?: string;
					};
				};

				const processData = processResult.data?.transactionProcess?.data as
					| TransactionProcessData
					| undefined;

				const serverClientSecret = processData?.paymentIntent?.stripeClientSecret;

				if (serverClientSecret) {
					// Verify payment intent status with Stripe (result not needed for checkout flow)
					await stripe.retrievePaymentIntent(serverClientSecret);
				}

				// Clear transaction identifier once we finalize
				safeSessionStorage.removeItem("transactionId");

				console.info("[checkout-redirect] transactionProcess succeeded, completing checkout...");

				// Now complete the checkout
				const result = await onCheckoutComplete();

				// If checkout completion failed (no redirect happened), show error
				if (result?.hasErrors) {
					console.error("[checkout-redirect] checkoutComplete failed:", result.apiErrors, result);
					clearPaymentParams();
					const errorMessage =
						result.apiErrors?.[0]?.message || "Failed to complete checkout. Please try again.";
					showCustomErrors([{ message: errorMessage }]);
					isProcessingRef.current = false;
				} else {
					console.info("[checkout-redirect] checkoutComplete succeeded");
				}
				// Note: If successful, onCheckoutComplete triggers a redirect via window.location.href
				// so we don't need to handle the success case here
			} catch (err) {
				console.error("[checkout-redirect] unexpected error:", err);
				clearPaymentParams();
				showCustomErrors([{ message: "An unexpected error occurred. Please try again." }]);
				isProcessingRef.current = false;
			}
		};

		void processAndComplete();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [completingCheckout, onCheckoutComplete, processingTransaction, transactionProcess, stripe]);
};
