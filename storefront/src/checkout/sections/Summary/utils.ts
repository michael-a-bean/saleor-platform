import compact from "lodash-es/compact";
import { type CheckoutLineFragment, type OrderLineFragment } from "@/checkout/graphql";
import { type MightNotExist } from "@/checkout/lib/globalTypes";

export const isCheckoutLine = (
	line: CheckoutLineFragment | OrderLineFragment,
): line is CheckoutLineFragment => line.__typename === "CheckoutLine";

export const getThumbnailFromLine = (line: CheckoutLineFragment) =>
	line.variant.media?.find(({ type }) => type === "IMAGE") ||
	line.variant.product.media?.find(({ type }) => type === "IMAGE");

export const getThumbnailFromOrderLine = (line: OrderLineFragment) => {
	// For external images (like Scryfall), the thumbnail endpoint returns 404
	// so we prefer the media URL directly over the thumbnail URL
	const variantMedia = line.variant?.media?.find(({ type }) => type === "IMAGE");
	const productMedia = line.variant?.product?.media?.find(({ type }) => type === "IMAGE");
	return variantMedia || productMedia || line.thumbnail;
};

export const getSummaryLineProps = (line: OrderLineFragment | CheckoutLineFragment) =>
	isCheckoutLine(line)
		? {
				variantName: line.variant.translation?.name || line.variant.name,
				productName: line.variant.product.translation?.name || line.variant.product.name,
				productImage: getThumbnailFromLine(line),
		  }
		: {
				variantName: line.variantName,
				productName: line.productName,
				productImage: getThumbnailFromOrderLine(line),
		  };

export const useSummaryLineLineAttributesText = (line: CheckoutLineFragment | OrderLineFragment): string => {
	const parsedValues =
		line.variant?.attributes?.reduce<Array<MightNotExist<string>>>(
			(result, { values }) => [
				...result,
				...values.map(({ name, dateTime, translation }) => {
					if (translation?.name) {
						return translation.name;
					}

					if (dateTime) {
						return new Intl.DateTimeFormat("EN-US", { dateStyle: "medium" }).format(new Date(dateTime));
					}

					return name;
				}),
			],
			[],
		) || [];

	return compact(parsedValues).join(", ");
};
