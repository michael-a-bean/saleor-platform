import { useMemo } from "react";
import { paymentMethodToComponent } from "./supportedPaymentApps";
import { PaymentSectionSkeleton } from "@/checkout/sections/PaymentSection/PaymentSectionSkeleton";
import { usePayments } from "@/checkout/sections/PaymentSection/usePayments";
import { useCheckoutUpdateState } from "@/checkout/state/updateStateStore";

export const PaymentMethods = () => {
	const { availablePaymentGateways, fetching } = usePayments();
	const {
		changingBillingCountry,
		updateState: { checkoutDeliveryMethodUpdate },
	} = useCheckoutUpdateState();

	const gatewaysWithDefinedComponent = useMemo(
		() => availablePaymentGateways.filter((gateway) => gateway.id in paymentMethodToComponent),
		[availablePaymentGateways],
	);

	// delivery methods change total price so we want to wait until the change is done
	if (changingBillingCountry || fetching || checkoutDeliveryMethodUpdate === "loading") {
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
