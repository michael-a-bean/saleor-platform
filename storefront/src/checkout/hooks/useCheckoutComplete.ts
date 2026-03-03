import { useMemo } from "react";
import { useCheckoutCompleteMutation } from "@/checkout/graphql";
import { useCheckout } from "@/checkout/hooks/useCheckout";
import { useSubmit } from "@/checkout/hooks/useSubmit";
import { useAlerts } from "@/checkout/hooks/useAlerts";
import { replaceUrl } from "@/checkout/lib/utils/url";

export const useCheckoutComplete = () => {
	const {
		checkout: { id: checkoutId },
	} = useCheckout();
	const [{ fetching }, checkoutComplete] = useCheckoutCompleteMutation();
	const { showCustomErrors } = useAlerts();

	const onCheckoutComplete = useSubmit<{}, typeof checkoutComplete>(
		useMemo(
			() => ({
				parse: () => ({
					checkoutId,
				}),
				onSubmit: checkoutComplete,
				onSuccess: ({ data }) => {
					const order = data.order;

					if (order) {
						const newUrl = replaceUrl({
							query: {
								order: order.id,
							},
							replaceWholeQuery: true,
						});
						window.location.href = newUrl;
					} else {
						showCustomErrors([
							{ message: "Order could not be placed. Please try again or contact support." },
						]);
					}
				},
				onError: ({ errors }) => {
					const errorMessage =
						errors?.[0]?.message || "Checkout could not be completed. Please try again.";
					showCustomErrors([{ message: errorMessage }]);
				},
			}),
			[checkoutComplete, checkoutId, showCustomErrors],
		),
	);
	return { completingCheckout: fetching, onCheckoutComplete };
};
