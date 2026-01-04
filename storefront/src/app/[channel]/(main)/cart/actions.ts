"use server";

import { revalidatePath } from "next/cache";
import { executeGraphQL } from "@/lib/graphql";
import { CheckoutDeleteLinesDocument, CheckoutUpdateLineDocument } from "@/gql/graphql";

type deleteLineFromCheckoutArgs = {
	lineId: string;
	checkoutId: string;
};

export const deleteLineFromCheckout = async ({ lineId, checkoutId }: deleteLineFromCheckoutArgs) => {
	await executeGraphQL(CheckoutDeleteLinesDocument, {
		variables: {
			checkoutId,
			lineIds: [lineId],
		},
		cache: "no-cache",
	});

	revalidatePath("/cart");
};

type updateLineQuantityArgs = {
	checkoutId: string;
	variantId: string;
	quantity: number;
};

export const updateLineQuantity = async ({ checkoutId, variantId, quantity }: updateLineQuantityArgs) => {
	if (quantity < 1) {
		return;
	}

	await executeGraphQL(CheckoutUpdateLineDocument, {
		variables: {
			checkoutId,
			lines: [{ variantId, quantity }],
		},
		cache: "no-cache",
	});

	revalidatePath("/cart");
};
