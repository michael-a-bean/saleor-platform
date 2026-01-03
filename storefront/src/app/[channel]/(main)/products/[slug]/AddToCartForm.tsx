"use client";

import { useActionState, useState } from "react";
import { AddButton } from "./AddButton";

type ActionResult = { success: boolean; error?: string };

interface AddToCartFormProps {
	addItemAction: (quantity: number) => Promise<ActionResult>;
	disabled: boolean;
	maxQuantity?: number;
}

export function AddToCartForm({ addItemAction, disabled, maxQuantity }: AddToCartFormProps) {
	const [quantity, setQuantity] = useState(1);
	const [state, formAction] = useActionState(
		async (_prevState: ActionResult | null): Promise<ActionResult> => {
			return await addItemAction(quantity);
		},
		null,
	);

	const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = parseInt(e.target.value, 10);
		if (!isNaN(value) && value >= 1) {
			setQuantity(maxQuantity ? Math.min(value, maxQuantity) : value);
		}
	};

	return (
		<form action={formAction}>
			<div className="flex items-center gap-3">
				<div className="flex items-center">
					<label htmlFor="quantity" className="sr-only">Quantity</label>
					<input
						type="number"
						id="quantity"
						name="quantity"
						min="1"
						max={maxQuantity}
						value={quantity}
						onChange={handleQuantityChange}
						disabled={disabled}
						className="h-12 w-16 rounded-lg border border-neutral-200 px-3 text-center text-sm font-medium text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
					/>
				</div>
				<AddButton disabled={disabled} />
			</div>
			{state?.error && (
				<div
					className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
					role="alert"
					aria-live="polite"
				>
					<div className="flex items-center gap-2">
						<svg
							className="h-4 w-4 flex-shrink-0 text-red-400"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fillRule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
								clipRule="evenodd"
							/>
						</svg>
						<span>{state.error}</span>
					</div>
				</div>
			)}
			{state?.success && (
				<div
					className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700"
					role="status"
					aria-live="polite"
				>
					<div className="flex items-center gap-2">
						<svg
							className="h-4 w-4 flex-shrink-0 text-green-400"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fillRule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
								clipRule="evenodd"
							/>
						</svg>
						<span>Added to cart!</span>
					</div>
				</div>
			)}
		</form>
	);
}
