"use client";

import { legacyDummyGatewayId } from "./types";
import { Button } from "@/checkout/components";
import { useAlerts } from "@/checkout/hooks/useAlerts";
import { useCheckout } from "@/checkout/hooks/useCheckout";
import { useCheckoutComplete } from "@/checkout/hooks/useCheckoutComplete";
import { useMutation } from "urql";

// Legacy dummy payment gateway (mirumee.payments.dummy)
// Uses the old checkoutPaymentCreate flow instead of transactionInitialize

const CheckoutPaymentCreateDocument = `
	mutation checkoutPaymentCreate($checkoutId: ID!, $gateway: String!, $amount: PositiveDecimal!, $token: String) {
		checkoutPaymentCreate(id: $checkoutId, input: { gateway: $gateway, amount: $amount, token: $token }) {
			errors {
				message
				field
				code
			}
			checkout {
				id
			}
			payment {
				id
				chargeStatus
			}
		}
	}
`;

export const LegacyDummyComponent = () => {
	const { showCustomErrors } = useAlerts();
	const { checkout } = useCheckout();
	const [paymentState, createPayment] = useMutation(CheckoutPaymentCreateDocument);
	const { onCheckoutComplete, completingCheckout } = useCheckoutComplete();
	const isInProgress = completingCheckout || paymentState.fetching;

	const handlePayment = async () => {
		if (!checkout?.totalPrice?.gross) {
			showCustomErrors([{ message: "Unable to get checkout total" }]);
			return;
		}

		try {
			// Create payment with the legacy dummy gateway
			const paymentResult = await createPayment({
				checkoutId: checkout.id,
				gateway: legacyDummyGatewayId,
				amount: checkout.totalPrice.gross.amount,
				token: "dummy-token",
			});

			if (paymentResult.error || paymentResult.data?.checkoutPaymentCreate?.errors?.length) {
				const errors = paymentResult.data?.checkoutPaymentCreate?.errors || [];
				if (errors.length > 0) {
					showCustomErrors(errors.map((e: { message?: string }) => ({ message: e.message || "Payment error" })));
				} else {
					showCustomErrors([{ message: "Failed to create payment" }]);
				}
				return;
			}

			// Complete the checkout
			const result = await onCheckoutComplete();
			if (result?.apiErrors) {
				result.apiErrors.forEach((error) => {
					showCustomErrors([{ message: error.message }]);
				});
			}
		} catch (err) {
			console.error("Payment error:", err);
			showCustomErrors([{ message: "An unexpected error occurred" }]);
		}
	};

	if (isInProgress) {
		return <Button variant="primary" disabled={true} label="Processing payment..." />;
	}

	return (
		<Button variant="primary" onClick={handlePayment} label="Pay with Dummy Gateway" />
	);
};
