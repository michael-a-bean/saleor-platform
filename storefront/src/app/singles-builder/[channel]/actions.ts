"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { executeGraphQL } from "@/lib/graphql";
import {
	SinglesBuilderSearchDocument,
	CheckoutAddLineDocument,
	CheckoutFindDocument,
	CheckoutCreateDocument,
	type SinglesBuilderSearchQuery,
} from "@/gql/graphql";

const CHECKOUT_COOKIE_NAME = "checkout-id";

export async function fetchSinglesBuilderProducts(
	channel: string,
	search: string,
	after: string | null = null,
): Promise<SinglesBuilderSearchQuery["products"]> {
	if (!search.trim()) {
		return null;
	}

	const { products } = await executeGraphQL(SinglesBuilderSearchDocument, {
		variables: {
			channel,
			search: search.trim(),
			first: 50,
			after: after ?? undefined,
		},
		revalidate: 0, // Don't cache search results
	});

	return products;
}

async function getOrCreateCheckout(channel: string): Promise<string | null> {
	const cookieStore = await cookies();
	const checkoutId = cookieStore.get(CHECKOUT_COOKIE_NAME)?.value;

	// Try to find existing checkout
	if (checkoutId) {
		try {
			const { checkout } = await executeGraphQL(CheckoutFindDocument, {
				variables: { id: checkoutId },
			});
			if (checkout) {
				return checkout.id;
			}
		} catch {
			// Checkout not found, will create new one
		}
	}

	// Create new checkout for singles-builder channel
	const { checkoutCreate } = await executeGraphQL(CheckoutCreateDocument, {
		variables: {
			channel,
			lines: [],
		},
	});

	if (checkoutCreate?.checkout?.id) {
		// Note: In a real app, you'd set the cookie here
		// For now, we return the ID and let the caller handle persistence
		return checkoutCreate.checkout.id;
	}

	return null;
}

export async function addToSinglesCart(
	variantId: string,
	quantity: number,
	channel: string = "singles-builder",
): Promise<{ success: boolean; error?: string; checkoutId?: string }> {
	try {
		const checkoutId = await getOrCreateCheckout(channel);
		if (!checkoutId) {
			return { success: false, error: "Could not create checkout" };
		}

		const { checkoutLinesAdd } = await executeGraphQL(CheckoutAddLineDocument, {
			variables: {
				id: checkoutId,
				productVariantId: variantId,
				quantity,
			},
		});

		if (checkoutLinesAdd?.errors && checkoutLinesAdd.errors.length > 0) {
			return {
				success: false,
				error: checkoutLinesAdd.errors[0].message || "Failed to add item",
			};
		}

		// Revalidate to update cart count
		revalidatePath("/singles-builder");

		return { success: true, checkoutId };
	} catch (error) {
		console.error("Add to cart error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to add to cart",
		};
	}
}
