import { useEffect, useMemo, useRef, useState } from "react";
import { type CountryCode, usePaymentGatewaysInitializeMutation } from "@/checkout/graphql";
import { useCheckout } from "@/checkout/hooks/useCheckout";
import { useSubmit } from "@/checkout/hooks/useSubmit";
import { type MightNotExist } from "@/checkout/lib/globalTypes";
import { type ParsedLegacyDummyGateway, type ParsedPaymentGateways } from "@/checkout/sections/PaymentSection/types";
import { getFilteredPaymentGateways, getLegacyPaymentGateways } from "@/checkout/sections/PaymentSection/utils";
import { type LegacyDummyGatewayId } from "./LegacyDummyDropIn/types";

export const usePaymentGatewaysInitialize = () => {
	const {
		checkout: { billingAddress },
	} = useCheckout();
	const {
		checkout: { id: checkoutId, availablePaymentGateways },
	} = useCheckout();

	const billingCountry = billingAddress?.country.code as MightNotExist<CountryCode>;

	const [gatewayConfigs, setGatewayConfigs] = useState<ParsedPaymentGateways>([]);
	const previousBillingCountry = useRef(billingCountry);

	const [{ fetching }, paymentGatewaysInitialize] = usePaymentGatewaysInitializeMutation();

	// Get legacy gateways that don't need initialization (use old checkoutPaymentCreate flow)
	const legacyGateways = useMemo(
		() => getLegacyPaymentGateways(availablePaymentGateways),
		[availablePaymentGateways],
	);

	// Convert legacy gateways to ParsedPaymentGateways format
	const legacyGatewayConfigs = useMemo<ParsedLegacyDummyGateway[]>(
		() =>
			legacyGateways.map((gateway) => ({
				id: gateway.id as LegacyDummyGatewayId,
				data: {},
				errors: [],
			})),
		[legacyGateways],
	);

	const transactionBasedGateways = useMemo(
		() => getFilteredPaymentGateways(availablePaymentGateways),
		[availablePaymentGateways],
	);

	const onSubmit = useSubmit<{}, typeof paymentGatewaysInitialize>(
		useMemo(
			() => ({
				hideAlerts: true,
				scope: "paymentGatewaysInitialize",
				// Only abort if no transaction-based gateways (legacy gateways handled separately)
				shouldAbort: () => !transactionBasedGateways.length,
				onSubmit: paymentGatewaysInitialize,
				parse: () => ({
					checkoutId,
					paymentGateways: transactionBasedGateways.map(({ config, id }) => ({
						id,
						data: config,
					})),
				}),
				onSuccess: ({ data }) => {
					const parsedConfigs = (data.gatewayConfigs || []) as ParsedPaymentGateways;
					// Combine transaction-based configs with legacy gateway configs
					setGatewayConfigs([...parsedConfigs, ...legacyGatewayConfigs]);
				},
				onError: () => {
					// Even if transaction-based gateways fail, still show legacy gateways
					if (legacyGatewayConfigs.length > 0) {
						setGatewayConfigs(legacyGatewayConfigs);
					}
				},
			}),
			[transactionBasedGateways, checkoutId, paymentGatewaysInitialize, legacyGatewayConfigs],
		),
	);

	useEffect(() => {
		// If no transaction-based gateways, just set legacy gateways immediately
		if (!transactionBasedGateways.length && legacyGatewayConfigs.length > 0) {
			setGatewayConfigs(legacyGatewayConfigs);
			return;
		}
		void onSubmit();
	}, []);

	useEffect(() => {
		if (billingCountry !== previousBillingCountry.current) {
			previousBillingCountry.current = billingCountry;
			if (!transactionBasedGateways.length && legacyGatewayConfigs.length > 0) {
				setGatewayConfigs(legacyGatewayConfigs);
				return;
			}
			void onSubmit();
		}
	}, [billingCountry, onSubmit, transactionBasedGateways.length, legacyGatewayConfigs]);

	return {
		fetching,
		availablePaymentGateways: gatewayConfigs || [],
	};
};
