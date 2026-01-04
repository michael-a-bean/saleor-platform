import { useMemo, useRef, useState, useEffect } from "react";
import { paymentMethodToComponent } from "./supportedPaymentApps";
import { PaymentSectionSkeleton } from "@/checkout/sections/PaymentSection/PaymentSectionSkeleton";
import { usePayments } from "@/checkout/sections/PaymentSection/usePayments";
import { useCheckoutUpdateState } from "@/checkout/state/updateStateStore";

export const PaymentMethods = () => {
	const { availablePaymentGateways, fetching } = usePayments();
	const {
		changingBillingCountry,
		updateState: { checkoutDeliveryMethodUpdate, paymentGatewaysInitialize },
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

	// Show skeleton during:
	// - Initial gateway initialization
	// - Active fetch in progress
	// - During billing country change
	// - During delivery method update
	// - Before first successful load with gateways available
	const showSkeleton =
		isInitializing ||
		changingBillingCountry ||
		fetching ||
		paymentGatewaysInitialize === "loading" ||
		checkoutDeliveryMethodUpdate === "loading";

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
