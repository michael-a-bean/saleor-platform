"use client";

import { useOptimistic, useTransition } from "react";
import { updateLineQuantity, deleteLineFromCheckout } from "./actions";

type Props = {
	checkoutId: string;
	lineId: string;
	variantId: string;
	quantity: number;
};

export const QuantityEditor = ({ checkoutId, lineId, variantId, quantity }: Props) => {
	const [isPending, startTransition] = useTransition();
	const [optimisticQuantity, setOptimisticQuantity] = useOptimistic(quantity);

	const handleDecrement = () => {
		if (isPending) return;
		if (optimisticQuantity <= 1) {
			setOptimisticQuantity(0);
			startTransition(() => deleteLineFromCheckout({ checkoutId, lineId }));
		} else {
			const newQty = optimisticQuantity - 1;
			setOptimisticQuantity(newQty);
			startTransition(() => updateLineQuantity({ checkoutId, variantId, quantity: newQty }));
		}
	};

	const handleIncrement = () => {
		if (isPending) return;
		const newQty = optimisticQuantity + 1;
		setOptimisticQuantity(newQty);
		startTransition(() => updateLineQuantity({ checkoutId, variantId, quantity: newQty }));
	};

	// Hide during optimistic delete (quantity reaches 0)
	if (optimisticQuantity === 0) {
		return (
			<span className="text-sm text-neutral-400">Removing...</span>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={handleDecrement}
				disabled={isPending}
				className="flex h-8 w-8 items-center justify-center rounded border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
				aria-label={optimisticQuantity <= 1 ? "Remove item" : "Decrease quantity"}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
					<path d="M17 12L7 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
				</svg>
			</button>
			<span className="w-8 text-center font-medium" aria-label={`Quantity: ${optimisticQuantity}`}>
				{optimisticQuantity}
			</span>
			<button
				type="button"
				onClick={handleIncrement}
				disabled={isPending}
				className="flex h-8 w-8 items-center justify-center rounded border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
				aria-label="Increase quantity"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
					<path d="M12 7V17M17 12H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
				</svg>
			</button>
		</div>
	);
};
