"use client";

import { useEffect } from "react";
import { useSinglesCartStore } from "../store/singlesCartStore";
import { fetchSinglesCart } from "../actions";
import type { CartLine } from "../store/singlesCartStore";

interface CartButtonProps {
	channel: string;
}

export function CartButton({ channel }: CartButtonProps) {
	const { cart, setCart, openDrawer, setLoading, getItemCount } = useSinglesCartStore();

	// Initial cart load
	useEffect(() => {
		const loadCart = async () => {
			setLoading(true);
			const result = await fetchSinglesCart(channel);
			if (result.success && result.checkout) {
				setCart({
					id: result.checkout.id,
					token: result.checkout.token,
					lines: result.checkout.lines as CartLine[],
					subtotalPrice: result.checkout.subtotalPrice,
					totalPrice: result.checkout.totalPrice,
					metadata: result.checkout.metadata,
				});
			}
			setLoading(false);
		};
		loadCart();
	}, [channel, setCart, setLoading]);

	const itemCount = getItemCount();

	return (
		<button
			type="button"
			onClick={openDrawer}
			className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl"
		>
			<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
				/>
			</svg>
			<span>Cart ({itemCount})</span>
			{cart?.totalPrice?.gross?.amount != null && cart.totalPrice.gross.amount > 0 && (
				<span className="text-sm opacity-80">${cart.totalPrice.gross.amount.toFixed(2)}</span>
			)}
		</button>
	);
}
