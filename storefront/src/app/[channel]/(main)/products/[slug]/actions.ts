"use server";

import { revalidatePath } from "next/cache";
import { invariant } from "ts-invariant";
import { executeGraphQL } from "@/lib/graphql";
import { CheckoutAddLineDocument } from "@/gql/graphql";
import * as Checkout from "@/lib/checkout";

// Stable top-level server action export — survives redeployments.
// Do NOT use inline "use server" closures in server components:
// they get unique IDs per build and break after redeployment.

export async function addToWebstoreCart(
	variantId: string,
	quantity: number,
	channel: string,
	quantityAvailable: number,
): Promise<{ success: boolean; error?: string }> {
	if (!variantId) {
		return { success: false, error: "Please select a variant" };
	}

	if (quantityAvailable <= 0) {
		return { success: false, error: "This item is out of stock" };
	}

	if (quantity > quantityAvailable) {
		return { success: false, error: `Only ${quantityAvailable} available` };
	}

	try {
		const checkout = await Checkout.findOrCreate({
			checkoutId: await Checkout.getIdFromCookies(channel),
			channel,
		});
		invariant(checkout, "This should never happen");

		await Checkout.saveIdToCookie(channel, checkout.id);

		const result = await executeGraphQL(CheckoutAddLineDocument, {
			variables: {
				id: checkout.id,
				productVariantId: decodeURIComponent(variantId),
				quantity,
			} as { id: string; productVariantId: string; quantity?: number },
			cache: "no-cache",
		});

		const errors = result.checkoutLinesAdd?.errors;
		if (errors && errors.length > 0) {
			const errorMessage = errors.map((e) => e.message).join(", ");
			return { success: false, error: errorMessage || "Failed to add item to cart" };
		}

		revalidatePath("/cart");
		return { success: true };
	} catch (e) {
		console.error("[AddToCart Error]", e);
		const message = e instanceof Error ? e.message : "Unknown error";
		return { success: false, error: `Failed to add item to cart: ${message}` };
	}
}
