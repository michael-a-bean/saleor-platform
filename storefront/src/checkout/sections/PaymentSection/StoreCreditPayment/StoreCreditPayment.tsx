"use client";

import { useState, useMemo } from "react";
import { useCheckout } from "@/checkout/hooks/useCheckout";
import { useAlerts } from "@/checkout/hooks/useAlerts";
import { useTransactionInitializeMutation } from "@/checkout/graphql";
import { formatMoney } from "@/lib/utils";
import { storeCreditGatewayId } from "./types";

interface StoreCreditConfig {
	data?: {
		storeCreditAvailable?: boolean;
		balance?: number;
		currency?: string;
	};
}

export const StoreCreditPayment = ({ config }: { config: StoreCreditConfig }) => {
	const { checkout } = useCheckout();
	const { showCustomErrors } = useAlerts();
	const [, transactionInitialize] = useTransactionInitializeMutation();

	const balance = config?.data?.balance ?? 0;
	const currency = config?.data?.currency ?? "USD";
	const storeCreditAvailable = config?.data?.storeCreditAvailable ?? false;

	const checkoutTotal = checkout?.totalPrice?.gross?.amount ?? 0;
	const maxApplicable = Math.min(balance, checkoutTotal);

	const [amount, setAmount] = useState<string>(maxApplicable.toFixed(2));
	const [isLoading, setIsLoading] = useState(false);
	const [applied, setApplied] = useState(false);
	const [appliedAmount, setAppliedAmount] = useState(0);

	const parsedAmount = useMemo(() => {
		const parsed = parseFloat(amount);
		if (isNaN(parsed) || parsed < 0) return 0;
		return Math.min(parsed, maxApplicable);
	}, [amount, maxApplicable]);

	const remaining = checkoutTotal - parsedAmount;

	if (!storeCreditAvailable || balance <= 0) {
		return null;
	}

	const handleApply = async () => {
		if (parsedAmount <= 0) {
			showCustomErrors([{ message: "Please enter a valid amount to apply." }]);
			return;
		}

		setIsLoading(true);

		try {
			const result = await transactionInitialize({
				checkoutId: checkout.id,
				paymentGateway: {
					id: storeCreditGatewayId,
					data: {
						storeCreditAmount: parsedAmount,
					},
				},
				amount: parsedAmount,
			});

			if (result.error) {
				showCustomErrors([
					{ message: result.error.message || "Failed to apply store credit." },
				]);
				setIsLoading(false);
				return;
			}

			const transactionData = result.data?.transactionInitialize;
			if (!transactionData || transactionData.errors?.length) {
				const errorMessages = transactionData?.errors?.map((err) => ({
					message: err.message || "Error applying store credit",
				}));
				showCustomErrors(errorMessages || [{ message: "Failed to apply store credit." }]);
				setIsLoading(false);
				return;
			}

			setApplied(true);
			setAppliedAmount(parsedAmount);
		} catch {
			showCustomErrors([{ message: "An unexpected error occurred while applying store credit." }]);
		} finally {
			setIsLoading(false);
		}
	};

	if (applied) {
		return (
			<div className="rounded-md border border-green-200 bg-green-50 p-4">
				<div className="flex items-center gap-2">
					<svg
						className="h-5 w-5 text-green-600"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={2}
						stroke="currentColor"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
					</svg>
					<span className="font-medium text-green-800">
						Store credit applied: {formatMoney(appliedAmount, currency)}
					</span>
				</div>
				{remaining > 0 && (
					<p className="mt-2 text-sm text-green-700">
						Remaining {formatMoney(remaining, currency)} will be charged to your card below.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
			<h3 className="text-base font-medium text-neutral-900">Store Credit</h3>

			<p className="mt-2 text-sm text-neutral-600">
				Available balance: <span className="font-semibold">{formatMoney(balance, currency)}</span>
			</p>

			<div className="mt-4">
				<label htmlFor="store-credit-amount" className="block text-sm font-medium text-neutral-700">
					Amount to apply
				</label>
				<div className="relative mt-1">
					<span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-500">
						$
					</span>
					<input
						id="store-credit-amount"
						type="number"
						step="0.01"
						min="0"
						max={maxApplicable}
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						className="block w-full rounded-md border border-neutral-300 py-2 pl-7 pr-3 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
					/>
				</div>
			</div>

			<button
				type="button"
				onClick={handleApply}
				disabled={isLoading || parsedAmount <= 0}
				className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-70"
			>
				{isLoading ? "Applying..." : "Apply Store Credit"}
			</button>

			{parsedAmount > 0 && remaining > 0 && (
				<p className="mt-3 text-sm text-neutral-500">
					Remaining {formatMoney(remaining, currency)} will be charged to your card below.
				</p>
			)}
		</div>
	);
};
