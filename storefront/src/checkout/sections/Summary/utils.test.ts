import { describe, it, expect } from "vitest";
import { isCheckoutLine, getThumbnailFromLine, getThumbnailFromOrderLine, getSummaryLineProps } from "./utils";
import { type CheckoutLineFragment, type OrderLineFragment } from "@/checkout/graphql";

// Mock data helpers - use Record<string, unknown> for overrides to allow test-specific extra properties
const createMockMedia = (type: "IMAGE" | "VIDEO", url: string) => ({
	type,
	url,
	alt: "test",
});

const createCheckoutLine = (overrides: Record<string, unknown> = {}): CheckoutLineFragment =>
	({
		__typename: "CheckoutLine",
		id: "line-1",
		quantity: 1,
		totalPrice: { gross: { amount: 10, currency: "USD" } },
		unitPrice: { gross: { amount: 10, currency: "USD" } },
		undiscountedUnitPrice: { amount: 10, currency: "USD" },
		variant: {
			id: "variant-1",
			name: "Default",
			translation: null,
			attributes: [],
			product: {
				name: "Test Product",
				translation: null,
				media: [],
			},
			media: [],
		},
		...overrides,
	}) as CheckoutLineFragment;

const createOrderLine = (overrides: Record<string, unknown> = {}): OrderLineFragment =>
	({
		__typename: "OrderLine",
		id: "line-1",
		quantity: 1,
		productName: "Test Product",
		variantName: "Default",
		thumbnail: null,
		totalPrice: { gross: { amount: 10, currency: "USD" } },
		unitPrice: { gross: { amount: 10, currency: "USD" } },
		undiscountedUnitPrice: { gross: { amount: 10, currency: "USD" } },
		variant: {
			name: "Default",
			attributes: [],
			product: {
				media: [],
			},
			media: [],
		},
		...overrides,
	}) as OrderLineFragment;

describe("isCheckoutLine", () => {
	it("returns true for CheckoutLine", () => {
		const line = createCheckoutLine();
		expect(isCheckoutLine(line)).toBe(true);
	});

	it("returns false for OrderLine", () => {
		const line = createOrderLine();
		expect(isCheckoutLine(line)).toBe(false);
	});

	it("correctly narrows type", () => {
		const line = createCheckoutLine();
		if (isCheckoutLine(line)) {
			// TypeScript should allow accessing variant.product
			expect(line.variant.product.name).toBe("Test Product");
		}
	});
});

describe("getThumbnailFromLine", () => {
	it("returns variant media if available", () => {
		const line = createCheckoutLine({
			variant: {
				id: "v1",
				name: "Variant",
				translation: null,
				media: [createMockMedia("IMAGE", "variant-image.jpg")],
				product: {
					id: "p1",
					name: "Product",
					translation: null,
					media: [createMockMedia("IMAGE", "product-image.jpg")],
				},
			},
		});
		const result = getThumbnailFromLine(line);
		expect(result?.url).toBe("variant-image.jpg");
	});

	it("falls back to product media if variant has no images", () => {
		const line = createCheckoutLine({
			variant: {
				id: "v1",
				name: "Variant",
				translation: null,
				media: [createMockMedia("VIDEO", "video.mp4")],
				product: {
					id: "p1",
					name: "Product",
					translation: null,
					media: [createMockMedia("IMAGE", "product-image.jpg")],
				},
			},
		});
		const result = getThumbnailFromLine(line);
		expect(result?.url).toBe("product-image.jpg");
	});

	it("returns undefined if no images available", () => {
		const line = createCheckoutLine({
			variant: {
				id: "v1",
				name: "Variant",
				translation: null,
				media: [],
				product: {
					id: "p1",
					name: "Product",
					translation: null,
					media: [],
				},
			},
		});
		const result = getThumbnailFromLine(line);
		expect(result).toBeUndefined();
	});

	it("skips non-IMAGE media types", () => {
		const line = createCheckoutLine({
			variant: {
				id: "v1",
				name: "Variant",
				translation: null,
				media: [createMockMedia("VIDEO", "video.mp4")],
				product: {
					id: "p1",
					name: "Product",
					translation: null,
					media: [createMockMedia("VIDEO", "another-video.mp4")],
				},
			},
		});
		const result = getThumbnailFromLine(line);
		expect(result).toBeUndefined();
	});
});

describe("getThumbnailFromOrderLine", () => {
	it("prefers variant media over thumbnail", () => {
		const line = createOrderLine({
			thumbnail: { url: "thumbnail.jpg", alt: "thumb" },
			variant: {
				id: "v1",
				media: [createMockMedia("IMAGE", "variant-image.jpg")],
				product: {
					id: "p1",
					media: [],
				},
			},
		});
		const result = getThumbnailFromOrderLine(line);
		expect(result?.url).toBe("variant-image.jpg");
	});

	it("prefers product media over thumbnail", () => {
		const line = createOrderLine({
			thumbnail: { url: "thumbnail.jpg", alt: "thumb" },
			variant: {
				id: "v1",
				media: [],
				product: {
					id: "p1",
					media: [createMockMedia("IMAGE", "product-image.jpg")],
				},
			},
		});
		const result = getThumbnailFromOrderLine(line);
		expect(result?.url).toBe("product-image.jpg");
	});

	it("falls back to thumbnail if no media available", () => {
		const line = createOrderLine({
			thumbnail: { url: "thumbnail.jpg", alt: "thumb" },
			variant: {
				id: "v1",
				media: [],
				product: {
					id: "p1",
					media: [],
				},
			},
		});
		const result = getThumbnailFromOrderLine(line);
		expect(result?.url).toBe("thumbnail.jpg");
	});

	it("returns undefined if no images at all", () => {
		const line = createOrderLine({
			thumbnail: null,
			variant: {
				id: "v1",
				media: [],
				product: {
					id: "p1",
					media: [],
				},
			},
		});
		const result = getThumbnailFromOrderLine(line);
		expect(result).toBeUndefined();
	});

	it("handles null variant", () => {
		const line = createOrderLine({
			thumbnail: { url: "thumbnail.jpg", alt: "thumb" },
			variant: null as any,
		});
		const result = getThumbnailFromOrderLine(line);
		expect(result?.url).toBe("thumbnail.jpg");
	});
});

describe("getSummaryLineProps", () => {
	describe("for CheckoutLine", () => {
		it("extracts props from checkout line", () => {
			const line = createCheckoutLine({
				variant: {
					id: "v1",
					name: "Large",
					translation: null,
					media: [createMockMedia("IMAGE", "variant.jpg")],
					product: {
						id: "p1",
						name: "T-Shirt",
						translation: null,
						media: [],
					},
				},
			});
			const result = getSummaryLineProps(line);
			expect(result.variantName).toBe("Large");
			expect(result.productName).toBe("T-Shirt");
			expect(result.productImage?.url).toBe("variant.jpg");
		});

		it("uses translation if available", () => {
			const line = createCheckoutLine({
				variant: {
					id: "v1",
					name: "Large",
					translation: { name: "Grande" },
					media: [],
					product: {
						id: "p1",
						name: "T-Shirt",
						translation: { name: "Camiseta" },
						media: [],
					},
				},
			});
			const result = getSummaryLineProps(line);
			expect(result.variantName).toBe("Grande");
			expect(result.productName).toBe("Camiseta");
		});
	});

	describe("for OrderLine", () => {
		it("extracts props from order line", () => {
			const line = createOrderLine({
				productName: "T-Shirt",
				variantName: "Large",
				thumbnail: { url: "thumb.jpg", alt: "Thumbnail" },
			});
			const result = getSummaryLineProps(line);
			expect(result.variantName).toBe("Large");
			expect(result.productName).toBe("T-Shirt");
		});

		it("uses media over thumbnail", () => {
			const line = createOrderLine({
				productName: "T-Shirt",
				variantName: "Large",
				thumbnail: { url: "thumb.jpg", alt: "Thumbnail" },
				variant: {
					id: "v1",
					media: [createMockMedia("IMAGE", "media.jpg")],
					product: {
						id: "p1",
						media: [],
					},
				},
			});
			const result = getSummaryLineProps(line);
			expect(result.productImage?.url).toBe("media.jpg");
		});
	});
});
