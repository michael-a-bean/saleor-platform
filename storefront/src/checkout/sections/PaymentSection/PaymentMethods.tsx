import { useMemo, useRef, useState, useEffect } from "react";
import { paymentMethodToComponent } from "./supportedPaymentApps";
import { PaymentSectionSkeleton } from "@/checkout/sections/PaymentSection/PaymentSectionSkeleton";
import { usePayments } from "@/checkout/sections/PaymentSection/usePayments";
import { useCheckout } from "@/checkout/hooks/useCheckout";
import { useCheckoutUpdateState } from "@/checkout/state/updateStateStore";

export const PaymentMethods = () => {
	const { availablePaymentGateways, fetching } = usePayments();
	const { checkout } = useCheckout();
	const {
		changingBillingCountry,
		updateState: { paymentGatewaysInitialize },
	} = useCheckoutUpdateState();

	const gatewaysWithDefinedComponent = useMemo(
		() => availablePaymentGateways.filter((gateway) => gateway.id in paymentMethodToComponent),
		[availablePaymentGateways],
	);

	// Track if we've ever successfully loaded gateways
	const hasLoadedRef = useRef(false);
	const [isInitializing, setIsInitializing] = useState(true);

	// Once we have gateways, mark as loaded and not initializing
	useEffect(() => {
		if (gatewaysWithDefinedComponent.length > 0) {
			hasLoadedRef.current = true;
			setIsInitializing(false);
		}
	}, [gatewaysWithDefinedComponent.length]);

	// Also stop initializing if the gateway fetch completed (even with no results)
	useEffect(() => {
		if (paymentGatewaysInitialize === "success" && !fetching) {
			// Give a small delay to ensure state is stable
			const timer = setTimeout(() => setIsInitializing(false), 100);
			return () => clearTimeout(timer);
		}
	}, [paymentGatewaysInitialize, fetching]);

	// Don't show payment until a delivery method is selected (when shipping is required).
	// This prevents Stripe from appearing before shipping loads, then flickering when
	// the delivery method auto-selects.
	const awaitingDeliveryMethod = checkout?.isShippingRequired && !checkout?.deliveryMethod;

	// Show skeleton during initial gateway loading or billing country change.
	// Note: checkoutDeliveryMethodUpdate is intentionally NOT included here.
	// Once payment is visible, delivery method changes should not cause it to
	// unmount/remount (which destroys Stripe Elements and causes flickering).
	// Instead, the pay button is disabled during delivery method updates.
	const showSkeleton =
		isInitializing ||
		changingBillingCountry ||
		fetching ||
		paymentGatewaysInitialize === "loading";

	if (awaitingDeliveryMethod) {
		return (
			<p className="text-sm text-neutral-500">
				Please select a shipping method above to continue to payment.
			</p>
		);
	}

	if (showSkeleton) {
		return <PaymentSectionSkeleton />;
	}

	return (
		<div className="gap-y-8">
			{gatewaysWithDefinedComponent.map((gateway) => {
				const Component = paymentMethodToComponent[gateway.id];
				return <Component key={gateway.id} config={gateway} />;
			})}
		</div>
	);
};
