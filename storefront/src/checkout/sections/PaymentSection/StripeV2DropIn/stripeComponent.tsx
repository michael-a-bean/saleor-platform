"use client";

import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckoutForm } from "./stripeForm";
import { useCheckout } from "@/checkout/hooks/useCheckout";

interface StripeConfig {
	data?: {
		stripePublishableKey?: string;
	};
}

// Skeleton loader that matches the PaymentElement height
const PaymentSkeleton = () => (
	<div className="animate-pulse">
		<div className="h-12 bg-neutral-200 rounded mb-4" />
		<div className="h-10 bg-neutral-200 rounded w-3/4 mb-2" />
		<div className="h-10 bg-neutral-200 rounded w-1/2" />
	</div>
);

export const StripeComponent = ({ config }: { config: StripeConfig }) => {
	const { checkout } = useCheckout();

	const publishableKey = config?.data?.stripePublishableKey;
	const [stripePromise, setStripePromise] = useState<Stripe | null>(null);
	const [loadingError, setLoadingError] = useState<string | null>(null);
	const [isReady, setIsReady] = useState(false);

	// Calculate amount - ensure we have valid checkout data
	const amount = Math.round((checkout?.totalPrice?.gross?.amount ?? 0) * 100);
	const currency = checkout?.totalPrice?.gross?.currency?.toLowerCase() || "usd";
	const hasValidAmount = amount > 0;

	// Track the amount we initialized with to prevent unnecessary re-renders
	const initializedAmountRef = useRef<number | null>(null);

	// Memoize stripe options - only create once we have valid data
	const stripeOptions: StripeElementsOptions | null = useMemo(() => {
		if (!hasValidAmount) return null;

		// Use the first valid amount, or update if it changed significantly
		if (initializedAmountRef.current === null) {
			initializedAmountRef.current = amount;
		} else if (Math.abs(amount - initializedAmountRef.current) > 100) {
			// Only update for significant changes (> $1)
			initializedAmountRef.current = amount;
		}

		return {
			mode: "payment" as const,
			amount: initializedAmountRef.current,
			appearance: { theme: "stripe" as const },
			currency,
		};
	}, [hasValidAmount, amount, currency]);

	// Load Stripe.js
	useEffect(() => {
		if (!publishableKey) {
			return;
		}

		let isMounted = true;

		loadStripe(publishableKey)
			.then((stripe) => {
				if (isMounted && stripe) {
					setStripePromise(stripe);
					setLoadingError(null);
				}
			})
			.catch(() => {
				if (!isMounted) return;
				setLoadingError("Failed to initialize payment system");
			});

		return () => {
			isMounted = false;
		};
	}, [publishableKey]);

	// Mark as ready only when both Stripe and options are available
	useEffect(() => {
		if (stripePromise && stripeOptions) {
			// Small delay to prevent flashing
			const timer = setTimeout(() => setIsReady(true), 50);
			return () => clearTimeout(timer);
		}
	}, [stripePromise, stripeOptions]);

	// Conditional returns AFTER all hooks
	if (!publishableKey) {
		return <div className="text-red-500">Missing payment gateway configuration</div>;
	}

	if (loadingError) {
		return <div className="text-red-500">{loadingError}</div>;
	}

	// Show skeleton while loading Stripe or waiting for checkout data
	if (!isReady || !stripePromise || !stripeOptions) {
		return <PaymentSkeleton />;
	}

	return (
		<Elements options={stripeOptions} stripe={stripePromise} key={`stripe-${currency}`}>
			<CheckoutForm />
		</Elements>
	);
};
