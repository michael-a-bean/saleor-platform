"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Local types matching our GraphQL fragments
export interface CartLineVariant {
	id: string;
	name: string;
	sku: string | null;
	pricing: {
		price: {
			gross: {
				amount: number;
				currency: string;
			};
		} | null;
	} | null;
	attributes: Array<{
		attribute: { slug: string; name: string };
		values: Array<{ slug: string; name: string }>;
	}>;
	product: {
		id: string;
		name: string;
		slug: string;
		thumbnail: { url: string; alt: string | null } | null;
		attributes: Array<{
			attribute: { slug: string; name: string };
			values: Array<{ slug: string; name: string }>;
		}>;
	};
}

export interface CartLine {
	id: string;
	quantity: number;
	totalPrice: {
		gross: {
			amount: number;
			currency: string;
		};
	};
	variant: CartLineVariant;
}

export interface SinglesCart {
	id: string;
	token: string;
	lines: CartLine[];
	subtotalPrice: {
		gross: {
			amount: number;
			currency: string;
		};
	};
	totalPrice: {
		gross: {
			amount: number;
			currency: string;
		};
	};
	metadata: Array<{ key: string; value: string }>;
}

export interface CustomerInfo {
	name: string;
	notes: string;
}

interface SinglesCartState {
	// Cart data from Saleor
	cart: SinglesCart | null;
	checkoutId: string | null;

	// Channel this cart belongs to
	currentChannel: string | null;

	// Customer info for POS handoff
	customerInfo: CustomerInfo;

	// POS short code
	shortCode: string | null;

	// UI state
	isDrawerOpen: boolean;
	isLoading: boolean;
	error: string | null;

	// Actions
	setCart: (cart: SinglesCart | null) => void;
	setCheckoutId: (id: string | null) => void;
	setChannel: (channel: string) => void;
	setCustomerInfo: (info: Partial<CustomerInfo>) => void;
	setShortCode: (code: string | null) => void;
	openDrawer: () => void;
	closeDrawer: () => void;
	toggleDrawer: () => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	clearCart: () => void;

	// Computed-like helpers
	getItemCount: () => number;
	getTotal: () => { amount: number; currency: string };
}

const STORAGE_KEY = "singles-builder-cart";

export const useSinglesCartStore = create<SinglesCartState>()(
	persist(
		(set, get) => ({
			// Initial state
			cart: null,
			checkoutId: null,
			currentChannel: null,
			customerInfo: {
				name: "",
				notes: "",
			},
			shortCode: null,
			isDrawerOpen: false,
			isLoading: false,
			error: null,

			// Actions
			setCart: (cart) => set({ cart }),

			setCheckoutId: (id) => set({ checkoutId: id }),

			setChannel: (channel) => {
				const { currentChannel } = get();
				if (currentChannel && currentChannel !== channel) {
					// Channel changed — clear cart to prevent cross-location leakage
					set({
						cart: null,
						checkoutId: null,
						currentChannel: channel,
						customerInfo: { name: "", notes: "" },
						shortCode: null,
						error: null,
					});
				} else {
					set({ currentChannel: channel });
				}
			},

			setCustomerInfo: (info) =>
				set((state) => ({
					customerInfo: { ...state.customerInfo, ...info },
				})),

			setShortCode: (code) => set({ shortCode: code }),

			openDrawer: () => set({ isDrawerOpen: true }),

			closeDrawer: () => set({ isDrawerOpen: false }),

			toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

			setLoading: (loading) => set({ isLoading: loading }),

			setError: (error) => set({ error }),

			clearCart: () =>
				set({
					cart: null,
					checkoutId: null,
					customerInfo: { name: "", notes: "" },
					shortCode: null,
					error: null,
				}),

			// Computed helpers
			getItemCount: () => {
				const { cart } = get();
				if (!cart) return 0;
				return cart.lines.reduce((sum, line) => sum + line.quantity, 0);
			},

			getTotal: () => {
				const { cart } = get();
				if (!cart) return { amount: 0, currency: "USD" };
				return cart.totalPrice.gross;
			},
		}),
		{
			name: STORAGE_KEY,
			storage: createJSONStorage(() => localStorage),
			// Only persist these fields
			partialize: (state) => ({
				checkoutId: state.checkoutId,
				currentChannel: state.currentChannel,
				customerInfo: state.customerInfo,
				shortCode: state.shortCode,
			}),
		},
	),
);

// Generate a short alphanumeric code for POS handoff
export function generateShortCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusable chars (0, O, 1, I)
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return code;
}
