"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useSinglesCartStore, generateShortCode, type CartLine } from "../store/singlesCartStore";
import {
	fetchSinglesCart,
	updateCartLineQuantity,
	removeCartLine,
	saveCartForPOS,
	clearSinglesCart,
	type CartActionResult,
} from "../actions";
import { useStaff } from "../../StaffContext";

// Convert full condition name to abbreviation
function abbreviateCondition(condition: string): string {
	const abbrevMap: Record<string, string> = {
		"Near Mint": "NM",
		"Lightly Played": "LP",
		"Moderately Played": "MP",
		"Heavily Played": "HP",
		"Damaged": "DMG",
	};
	return abbrevMap[condition] || condition;
}

interface CartLineItemProps {
	line: CartLine;
	channel: string;
	onUpdate: (result: CartActionResult) => void;
}

function CartLineItem({ line, channel, onUpdate }: CartLineItemProps) {
	const [isPending, startTransition] = useTransition();
	const { variant } = line;

	// Extract condition and finish from variant
	const conditionFull = variant.attributes.find((a) => a.attribute.slug === "mtg-condition")?.values[0]?.name || "Near Mint";
	const condition = abbreviateCondition(conditionFull);
	const finish = variant.attributes.find((a) => a.attribute.slug === "mtg-finish")?.values[0]?.name;

	// Extract set info from product
	const setCode = variant.product.attributes.find((a) => a.attribute.slug === "mtg-set-code")?.values[0]?.name;

	const handleQuantityChange = (newQuantity: number) => {
		if (newQuantity < 1) return;
		startTransition(async () => {
			const result = await updateCartLineQuantity(line.id, newQuantity, channel);
			onUpdate(result);
		});
	};

	const handleRemove = () => {
		startTransition(async () => {
			const result = await removeCartLine(line.id, channel);
			onUpdate(result);
		});
	};

	return (
		<div className={`flex gap-3 border-b border-gray-100 py-3 ${isPending ? "opacity-50" : ""}`}>
			{/* Thumbnail */}
			<div className="relative h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-gray-100">
				{variant.product.thumbnail?.url ? (
					<Image
						src={variant.product.thumbnail.url}
						alt={variant.product.thumbnail.alt || variant.product.name}
						fill
						className="object-contain"
						sizes="40px"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-gray-400">
						<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
							/>
						</svg>
					</div>
				)}
			</div>

			{/* Details */}
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-gray-900">{variant.product.name}</p>
				<div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
					{setCode && <span className="uppercase">[{setCode}]</span>}
					<span
						className={`rounded px-1 py-0.5 font-medium ${
							condition === "NM"
								? "bg-green-100 text-green-700"
								: condition === "LP"
									? "bg-blue-100 text-blue-700"
									: condition === "MP"
										? "bg-yellow-100 text-yellow-700"
										: "bg-gray-100 text-gray-700"
						}`}
					>
						{condition}
					</span>
					{finish && finish !== "Non-Foil" && <span className="text-purple-600">{finish}</span>}
				</div>

				{/* Quantity + Price */}
				<div className="mt-2 flex items-center justify-between">
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => handleQuantityChange(line.quantity - 1)}
							disabled={isPending || line.quantity <= 1}
							className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
						>
							-
						</button>
						<span className="w-8 text-center text-sm font-medium">{line.quantity}</span>
						<button
							type="button"
							onClick={() => handleQuantityChange(line.quantity + 1)}
							disabled={isPending}
							className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
						>
							+
						</button>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium">
							{line.totalPrice?.gross?.amount != null
								? `$${line.totalPrice.gross.amount.toFixed(2)}`
								: "$0.00"}
						</span>
						<button
							type="button"
							onClick={handleRemove}
							disabled={isPending}
							className="text-gray-400 hover:text-red-500"
							title="Remove"
						>
							<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

interface CartDrawerProps {
	channel: string;
}

export function CartDrawer({ channel }: CartDrawerProps) {
	const staff = useStaff();
	const {
		cart,
		setCart,
		isDrawerOpen,
		closeDrawer,
		customerInfo,
		setCustomerInfo,
		shortCode,
		setShortCode,
		isLoading,
		setLoading,
		error,
		setError,
		getItemCount,
		clearCart,
	} = useSinglesCartStore();

	const [isPending, startTransition] = useTransition();
	const [showSuccess, setShowSuccess] = useState(false);

	// Only fetch cart when drawer opens AND cart is not already loaded
	// This avoids duplicate fetches since CartButton already loads on mount
	useEffect(() => {
		if (isDrawerOpen && !cart && !isLoading) {
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
		}
	}, [isDrawerOpen, cart, isLoading, channel, setCart, setLoading]);

	const handleCartUpdate = (result: CartActionResult) => {
		if (result.success && result.checkout) {
			setCart({
				id: result.checkout.id,
				token: result.checkout.token,
				lines: result.checkout.lines as CartLine[],
				subtotalPrice: result.checkout.subtotalPrice,
				totalPrice: result.checkout.totalPrice,
				metadata: result.checkout.metadata,
			});
			setError(null);
		} else if (result.error) {
			setError(result.error);
		}
	};

	const handleGenerateCode = () => {
		startTransition(async () => {
			const code = generateShortCode();
			const result = await saveCartForPOS(customerInfo.name, customerInfo.notes, code, staff.email, channel);
			if (result.success) {
				setShortCode(code);
				handleCartUpdate(result);
				setShowSuccess(true);
				setTimeout(() => setShowSuccess(false), 5000);
			} else {
				setError(result.error || "Failed to save cart");
			}
		});
	};

	const handleClearCart = () => {
		startTransition(async () => {
			await clearSinglesCart(channel);
			clearCart();
		});
	};

	const itemCount = getItemCount();

	if (!isDrawerOpen) return null;

	return (
		<>
			{/* Backdrop */}
			<div className="fixed inset-0 z-40 bg-black/30" onClick={closeDrawer} aria-hidden="true" />

			{/* Drawer */}
			<div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl">
				{/* Header */}
				<div className="flex items-center justify-between border-b px-4 py-3">
					<h2 className="text-lg font-semibold">Cart ({itemCount})</h2>
					<button
						type="button"
						onClick={closeDrawer}
						className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
					>
						<svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{/* Error banner */}
				{error && (
					<div className="mx-4 mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
						{error}
						<button type="button" onClick={() => setError(null)} className="ml-2 font-medium underline">
							Dismiss
						</button>
					</div>
				)}

				{/* Large code display after generation */}
				{showSuccess && shortCode && (
					<div className="mx-4 mt-4 rounded-lg border-2 border-green-500 bg-green-50 p-6 text-center">
						<div className="text-sm font-medium uppercase tracking-wider text-green-600">
							Ready for POS
						</div>
						<div className="mt-3 font-mono text-4xl font-bold tracking-[0.3em] text-green-800">
							{shortCode}
						</div>
						<div className="mt-3 text-xs text-green-600">
							Enter this code at the register
						</div>
					</div>
				)}

				{/* Cart content */}
				<div className="flex-1 overflow-y-auto px-4">
					{isLoading ? (
						<div className="py-12 text-center text-gray-500">Loading cart...</div>
					) : !cart || cart.lines.length === 0 ? (
						<div className="py-12 text-center">
							<svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
								/>
							</svg>
							<p className="mt-2 text-gray-500">Cart is empty</p>
						</div>
					) : (
						<div className="py-2">
							{cart.lines.map((line) => (
								<CartLineItem key={line.id} line={line} channel={channel} onUpdate={handleCartUpdate} />
							))}
						</div>
					)}
				</div>

				{/* Customer info + POS handoff */}
				{cart && cart.lines.length > 0 && (
					<div className="border-t px-4 py-4">
						{/* Customer name */}
						<div className="mb-3">
							<label htmlFor="customer-name" className="block text-sm font-medium text-gray-700">
								Customer Name
							</label>
							<input
								type="text"
								id="customer-name"
								value={customerInfo.name}
								onChange={(e) => setCustomerInfo({ name: e.target.value })}
								placeholder="Optional"
								className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
						</div>

						{/* Notes */}
						<div className="mb-4">
							<label htmlFor="cart-notes" className="block text-sm font-medium text-gray-700">
								Notes
							</label>
							<textarea
								id="cart-notes"
								value={customerInfo.notes}
								onChange={(e) => setCustomerInfo({ notes: e.target.value })}
								placeholder="Any special instructions..."
								rows={2}
								className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
						</div>

						{/* Subtotal */}
						<div className="mb-4 flex justify-between border-t pt-3 text-lg font-semibold">
							<span>Total</span>
							<span>
								{cart.totalPrice?.gross?.amount != null
									? `$${cart.totalPrice.gross.amount.toFixed(2)}`
									: "$0.00"}
							</span>
						</div>

						{/* Current code display (persistent, when not in success flash) */}
						{shortCode && !showSuccess && (
							<div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
								<div className="text-xs font-medium uppercase tracking-wider text-blue-600">
									POS Code
								</div>
								<div className="mt-2 font-mono text-3xl font-bold tracking-[0.25em] text-blue-900">
									{shortCode}
								</div>
							</div>
						)}

						{/* Actions */}
						<div className="flex gap-2">
							<button
								type="button"
								onClick={handleClearCart}
								disabled={isPending}
								className="flex-shrink-0 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
							>
								Clear
							</button>
							<button
								type="button"
								onClick={() => window.print()}
								className="flex-shrink-0 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 print:hidden"
								title="Print Pull List"
							>
								Print
							</button>
							<button
								type="button"
								onClick={handleGenerateCode}
								disabled={isPending}
								className="flex-1 rounded-md bg-green-600 px-4 py-3 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50"
							>
								{isPending ? (
									<span className="flex items-center justify-center gap-2">
										<svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
											<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
											/>
										</svg>
										Saving...
									</span>
								) : shortCode ? (
									"Refresh POS Code"
								) : (
									"Send to Register"
								)}
							</button>
						</div>
					</div>
				)}
			</div>
		</>
	);
}
