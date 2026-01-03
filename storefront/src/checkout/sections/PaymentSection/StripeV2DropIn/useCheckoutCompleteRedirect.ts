import { useEffect, useRef } from "react";
import { useStripe } from "@stripe/react-stripe-js";
import { useCheckoutComplete } from "@/checkout/hooks/useCheckoutComplete";
import { useTransactionProcessMutation } from "@/checkout/graphql";
import { getQueryParams, clearQueryParams } from "@/checkout/lib/utils/url";
import { usePaymentProcessingScreen } from "@/checkout/sections/PaymentSection/PaymentProcessingScreen";
import { useAlerts } from "@/checkout/hooks/useAlerts";

export const useCheckoutCompleteRedirect = () => {
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

		const transactionId = sessionStorage.getItem("transactionId");
		const transactionIdFromQuery = typeof transaction === "string" ? transaction : undefined;
		const resolvedTransactionId = transactionId ?? transactionIdFromQuery;

		if (!resolvedTransactionId) {
			console.error("Missing transactionId in sessionStorage and query params after Stripe redirect", {
				transaction,
			});
			clearPaymentParams();
			showCustomErrors([{ message: "Payment session expired. Please try again." }]);
			return;
		}

		isProcessingRef.current = true;

		const processAndComplete = async () => {
			try {
				// First, sync Saleor with Stripe's payment status via transactionProcess
				const processResult = await transactionProcess({ id: resolvedTransactionId });

				if (processResult.error) {
					console.error("Transaction process failed:", processResult.error);
					clearPaymentParams();
					showCustomErrors([{ message: "Failed to process payment. Please try again." }]);
					isProcessingRef.current = false;
					return;
				}

				const processErrors = processResult.data?.transactionProcess?.errors;
				if (processErrors?.length) {
					console.error("Transaction process errors:", processErrors);
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
					const intentResult = await stripe.retrievePaymentIntent(serverClientSecret);

					if (intentResult.error) {
						console.error("Unable to retrieve PaymentIntent:", intentResult.error);
					} else {
						console.info("Retrieved PaymentIntent status:", intentResult.paymentIntent?.status);
					}
				}

				// Clear transaction identifier once we finalize
				sessionStorage.removeItem("transactionId");

				// Now complete the checkout
				const result = await onCheckoutComplete();

				// If checkout completion failed (no redirect happened), show error
				if (result?.hasErrors) {
					console.error("Checkout completion failed:", result.apiErrors);
					clearPaymentParams();
					const errorMessage =
						result.apiErrors?.[0]?.message || "Failed to complete checkout. Please try again.";
					showCustomErrors([{ message: errorMessage }]);
					isProcessingRef.current = false;
				}
				// Note: If successful, onCheckoutComplete triggers a redirect via window.location.href
				// so we don't need to handle the success case here
			} catch (error) {
				console.error("Error during checkout completion:", error);
				clearPaymentParams();
				showCustomErrors([{ message: "An unexpected error occurred. Please try again." }]);
				isProcessingRef.current = false;
			}
		};

		void processAndComplete();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [completingCheckout, onCheckoutComplete, processingTransaction, transactionProcess, stripe]);
};
