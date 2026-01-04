"use client";

import { useTransition } from "react";
import { updateLineQuantity, deleteLineFromCheckout } from "./actions";

type Props = {
	checkoutId: string;
	lineId: string;
	variantId: string;
	quantity: number;
};

export const QuantityEditor = ({ checkoutId, lineId, variantId, quantity }: Props) => {
	const [isPending, startTransition] = useTransition();

	const handleDecrement = () => {
		if (isPending) return;
		if (quantity <= 1) {
			startTransition(() => deleteLineFromCheckout({ checkoutId, lineId }));
		} else {
			startTransition(() => updateLineQuantity({ checkoutId, variantId, quantity: quantity - 1 }));
		}
	};

	const handleIncrement = () => {
		if (isPending) return;
		startTransition(() => updateLineQuantity({ checkoutId, variantId, quantity: quantity + 1 }));
	};

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={handleDecrement}
				disabled={isPending}
				className="flex h-8 w-8 items-center justify-center rounded border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
				aria-label={quantity <= 1 ? "Remove item" : "Decrease quantity"}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
					<path d="M17 12L7 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
				</svg>
			</button>
			<span className="w-8 text-center font-medium" aria-label={`Quantity: ${quantity}`}>
				{isPending ? "..." : quantity}
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
