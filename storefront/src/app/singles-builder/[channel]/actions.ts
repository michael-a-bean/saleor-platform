"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { executeGraphQL } from "@/lib/graphql";
import {
	SinglesBuilderSearchDocument,
	SinglesBuilderCartFindDocument,
	SinglesBuilderCartCreateDocument,
	SinglesBuilderCartAddLinesDocument,
	SinglesBuilderCartUpdateLinesDocument,
	SinglesBuilderCartDeleteLinesDocument,
	SinglesBuilderCartUpdateMetadataDocument,
	type SinglesBuilderSearchQuery,
	type SinglesBuilderCheckoutFragment,
	type ProductFilterInput,
} from "@/gql/graphql";

// Cookie name includes channel for channel-specific carts
const getCheckoutCookieName = (channel: string) => `singles-cart-${channel}`;

// ----- Search Actions -----

export async function fetchSinglesBuilderProducts(
	channel: string,
	search: string,
	after: string | null = null,
	filter?: ProductFilterInput,
): Promise<SinglesBuilderSearchQuery["products"]> {
	// Allow empty search if filters are applied
	const hasSearch = search.trim().length > 0;
	const hasFilters = filter && Object.keys(filter).length > 0;

	if (!hasSearch && !hasFilters) {
		return null;
	}

	// Build the filter object
	const productFilter: ProductFilterInput = {
		...filter,
		// If search is provided, add it to the filter
		...(hasSearch && { search: search.trim() }),
	};

	const { products } = await executeGraphQL(SinglesBuilderSearchDocument, {
		variables: {
			channel,
			search: search.trim() || "", // Required by query but may be empty
			first: 50,
			after: after ?? undefined,
			filter: productFilter,
		},
		revalidate: 0, // Don't cache search results
	});

	return products;
}

// ----- Cart Actions -----

export interface CartActionResult {
	success: boolean;
	error?: string;
	checkout?: SinglesBuilderCheckoutFragment;
}

async function getCheckoutIdFromCookie(channel: string): Promise<string | null> {
	const cookieStore = await cookies();
	return cookieStore.get(getCheckoutCookieName(channel))?.value ?? null;
}

async function setCheckoutCookie(channel: string, checkoutId: string): Promise<void> {
	const cookieStore = await cookies();
	const shouldUseHttps =
		process.env.NEXT_PUBLIC_STOREFRONT_URL?.startsWith("https") || !!process.env.NEXT_PUBLIC_VERCEL_URL;
	cookieStore.set(getCheckoutCookieName(channel), checkoutId, {
		sameSite: "lax",
		secure: shouldUseHttps,
		maxAge: 60 * 60 * 24 * 7, // 7 days
	});
}

export async function fetchSinglesCart(channel: string): Promise<CartActionResult> {
	try {
		const checkoutId = await getCheckoutIdFromCookie(channel);
		if (!checkoutId) {
			return { success: true, checkout: undefined };
		}

		const { checkout } = await executeGraphQL(SinglesBuilderCartFindDocument, {
			variables: { id: checkoutId },
			cache: "no-cache",
		});

		if (!checkout) {
			// Checkout not found (expired or deleted)
			return { success: true, checkout: undefined };
		}

		return { success: true, checkout: checkout as SinglesBuilderCheckoutFragment };
	} catch (error) {
		console.error("Fetch cart error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to fetch cart",
		};
	}
}

async function getOrCreateCheckout(channel: string): Promise<SinglesBuilderCheckoutFragment | null> {
	const existingId = await getCheckoutIdFromCookie(channel);

	// Try to find existing checkout
	if (existingId) {
		try {
			const { checkout } = await executeGraphQL(SinglesBuilderCartFindDocument, {
				variables: { id: existingId },
				cache: "no-cache",
			});
			if (checkout) {
				return checkout as SinglesBuilderCheckoutFragment;
			}
		} catch {
			// Checkout not found, will create new one
		}
	}

	// Create new checkout for singles-builder channel
	const { checkoutCreate } = await executeGraphQL(SinglesBuilderCartCreateDocument, {
		variables: {
			channel,
			lines: [],
		},
		cache: "no-cache",
	});

	if (checkoutCreate?.checkout) {
		await setCheckoutCookie(channel, checkoutCreate.checkout.id);
		return checkoutCreate.checkout as SinglesBuilderCheckoutFragment;
	}

	return null;
}

export async function addToSinglesCart(
	variantId: string,
	quantity: number,
	channel: string = "singles-builder",
): Promise<CartActionResult> {
	try {
		let checkout = await getOrCreateCheckout(channel);
		if (!checkout) {
			return { success: false, error: "Could not create checkout" };
		}

		const { checkoutLinesAdd } = await executeGraphQL(SinglesBuilderCartAddLinesDocument, {
			variables: {
				id: checkout.id,
				lines: [{ variantId, quantity }],
			},
			cache: "no-cache",
		});

		if (checkoutLinesAdd?.errors && checkoutLinesAdd.errors.length > 0) {
			return {
				success: false,
				error: checkoutLinesAdd.errors[0].message || "Failed to add item",
			};
		}

		revalidatePath("/singles-builder");

		return {
			success: true,
			checkout: checkoutLinesAdd?.checkout as SinglesBuilderCheckoutFragment,
		};
	} catch (error) {
		console.error("Add to cart error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to add to cart",
		};
	}
}

export async function updateCartLineQuantity(
	lineId: string,
	quantity: number,
	channel: string = "singles-builder",
): Promise<CartActionResult> {
	try {
		const checkoutId = await getCheckoutIdFromCookie(channel);
		if (!checkoutId) {
			return { success: false, error: "No cart found" };
		}

		const { checkoutLinesUpdate } = await executeGraphQL(SinglesBuilderCartUpdateLinesDocument, {
			variables: {
				id: checkoutId,
				lines: [{ lineId, quantity }],
			},
			cache: "no-cache",
		});

		if (checkoutLinesUpdate?.errors && checkoutLinesUpdate.errors.length > 0) {
			return {
				success: false,
				error: checkoutLinesUpdate.errors[0].message || "Failed to update quantity",
			};
		}

		revalidatePath("/singles-builder");

		return {
			success: true,
			checkout: checkoutLinesUpdate?.checkout as SinglesBuilderCheckoutFragment,
		};
	} catch (error) {
		console.error("Update quantity error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to update quantity",
		};
	}
}

export async function removeCartLine(
	lineId: string,
	channel: string = "singles-builder",
): Promise<CartActionResult> {
	try {
		const checkoutId = await getCheckoutIdFromCookie(channel);
		if (!checkoutId) {
			return { success: false, error: "No cart found" };
		}

		const { checkoutLinesDelete } = await executeGraphQL(SinglesBuilderCartDeleteLinesDocument, {
			variables: {
				id: checkoutId,
				lineIds: [lineId],
			},
			cache: "no-cache",
		});

		if (checkoutLinesDelete?.errors && checkoutLinesDelete.errors.length > 0) {
			return {
				success: false,
				error: checkoutLinesDelete.errors[0].message || "Failed to remove item",
			};
		}

		revalidatePath("/singles-builder");

		return {
			success: true,
			checkout: checkoutLinesDelete?.checkout as SinglesBuilderCheckoutFragment,
		};
	} catch (error) {
		console.error("Remove line error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to remove item",
		};
	}
}

export async function updateCartMetadata(
	metadata: Array<{ key: string; value: string }>,
	channel: string = "singles-builder",
): Promise<CartActionResult> {
	try {
		const checkoutId = await getCheckoutIdFromCookie(channel);
		if (!checkoutId) {
			return { success: false, error: "No cart found" };
		}

		const { updateMetadata } = await executeGraphQL(SinglesBuilderCartUpdateMetadataDocument, {
			variables: {
				id: checkoutId,
				input: metadata,
			},
			cache: "no-cache",
		});

		if (updateMetadata?.errors && updateMetadata.errors.length > 0) {
			return {
				success: false,
				error: updateMetadata.errors[0].message || "Failed to update metadata",
			};
		}

		// The result is wrapped in `item` field for metadata mutations
		const checkout = updateMetadata?.item as SinglesBuilderCheckoutFragment | undefined;

		return {
			success: true,
			checkout,
		};
	} catch (error) {
		console.error("Update metadata error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to update metadata",
		};
	}
}

// POS handoff: Set customer name, notes, and short code
export async function saveCartForPOS(
	customerName: string,
	notes: string,
	shortCode: string,
	channel: string = "singles-builder",
): Promise<CartActionResult> {
	return updateCartMetadata(
		[
			{ key: "singles_builder_customer", value: customerName },
			{ key: "singles_builder_notes", value: notes },
			{ key: "singles_builder_code", value: shortCode },
			{ key: "singles_builder_created", value: new Date().toISOString() },
		],
		channel,
	);
}

// Clear the cart cookie (for starting fresh)
export async function clearSinglesCart(channel: string = "singles-builder"): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.delete(getCheckoutCookieName(channel));
	revalidatePath("/singles-builder");
}
