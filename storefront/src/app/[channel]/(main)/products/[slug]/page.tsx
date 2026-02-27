import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { type ResolvingMetadata, type Metadata } from "next";
import { invariant } from "ts-invariant";
import { type WithContext, type Product } from "schema-dts";
import { AddToCartForm } from "./AddToCartForm";
import { VariantSelector } from "@/ui/components/VariantSelector";
import { ProductImageWrapper } from "@/ui/atoms/ProductImageWrapper";
import { EssentialCardInfo } from "@/ui/components/EssentialCardInfo";
import { MTGCardAttributes } from "@/ui/components/MTGCardAttributes";
import { executeGraphQL } from "@/lib/graphql";
import { formatMoney, formatMoneyRange } from "@/lib/utils";
import { CheckoutAddLineDocument, ProductDetailsDocument, ProductListDocument, OtherPrintingsDocument, RelatedProductsDocument } from "@/gql/graphql";
import * as Checkout from "@/lib/checkout";
import { AvailabilityMessage } from "@/ui/components/AvailabilityMessage";
import { OtherPrintings } from "@/ui/components/OtherPrintings";
import { RelatedProductsCarousel } from "@/ui/components/RelatedProductsCarousel";

export const dynamic = "force-dynamic";

export async function generateMetadata(
	props: {
		params: Promise<{ slug: string; channel: string }>;
		searchParams: Promise<{ variant?: string }>;
	},
	parent: ResolvingMetadata,
): Promise<Metadata> {
	const [searchParams, params] = await Promise.all([props.searchParams, props.params]);

	const { product } = await executeGraphQL(ProductDetailsDocument, {
		variables: {
			slug: decodeURIComponent(params.slug),
			channel: params.channel,
		},
		revalidate: 60,
	});

	if (!product) {
		notFound();
	}

	const productName = product.seoTitle || product.name;
	const variantName = product.variants?.find(({ id }) => id === searchParams.variant)?.name;
	const productNameAndVariant = variantName ? `${productName} - ${variantName}` : productName;

	// Prefer media URL (external images) over thumbnail URL (Saleor-generated)
	const imageUrl = product.media?.[0]?.url || product.thumbnail?.url;

	return {
		title: `${product.name} | ${product.seoTitle || (await parent).title?.absolute}`,
		description: product.seoDescription || productNameAndVariant,
		alternates: {
			canonical: process.env.NEXT_PUBLIC_STOREFRONT_URL
				? process.env.NEXT_PUBLIC_STOREFRONT_URL + `/products/${encodeURIComponent(params.slug)}`
				: undefined,
		},
		openGraph: imageUrl
			? {
					images: [
						{
							url: imageUrl,
							alt: product.name,
						},
					],
				}
			: null,
	};
}

export async function generateStaticParams({ params }: { params: { channel: string } }) {
	try {
		const { products } = await executeGraphQL(ProductListDocument, {
			revalidate: 60,
			variables: { first: 20, channel: params.channel },
			withAuth: false,
		});

		const paths = products?.edges.map(({ node: { slug } }) => ({ slug })) || [];
		return paths;
	} catch (error) {
		// Return empty params if API is unreachable during build
		// Page will be generated on-demand at runtime
		console.warn("[generateStaticParams] API unreachable, skipping pre-generation:", error);
		return [];
	}
}

export default async function Page(props: {
	params: Promise<{ slug: string; channel: string }>;
	searchParams: Promise<{ variant?: string }>;
}) {
	const [searchParams, params] = await Promise.all([props.searchParams, props.params]);
	const { product } = await executeGraphQL(ProductDetailsDocument, {
		variables: {
			slug: decodeURIComponent(params.slug),
			channel: params.channel,
		},
		revalidate: 60,
	});

	if (!product) {
		notFound();
	}

	// Fetch other printings (same card name, different sets)
	const { products: otherPrintingsResult } = await executeGraphQL(OtherPrintingsDocument, {
		variables: {
			search: product.name,
			channel: params.channel,
			first: 50, // Reasonable limit for printings
		},
		revalidate: 60,
	});

	// Filter to exact name matches only
	const otherPrintings = otherPrintingsResult?.edges
		.map((e) => e.node)
		.filter((p) => p.name === product.name) ?? [];

	// Fetch related products from the same category
	const relatedProducts = product.category?.id
		? await executeGraphQL(RelatedProductsDocument, {
				variables: {
					channel: params.channel,
					categoryId: product.category.id,
					first: 12,
				},
				revalidate: 60,
			})
		: null;

	// Filter out the current product from related products
	const filteredRelatedProducts = relatedProducts?.products?.edges
		.map((e) => e.node)
		.filter((p) => p.id !== product.id) ?? [];

	// Prefer media URL (external images) over thumbnail URL (Saleor-generated)
	const firstImage = product.media?.[0] || product.thumbnail;
	// Fallback: if media URL fails, try thumbnail (different CDN path)
	const fallbackImageUrl = product.media?.[0]?.url
		? product.thumbnail?.url
		: undefined;

	const variants = product.variants;
	const selectedVariantID = searchParams.variant;
	const selectedVariant = variants?.find(({ id }) => id === selectedVariantID);

	async function addItem(quantity: number): Promise<{ success: boolean; error?: string }> {
		"use server";

		// Validate stock is available before adding to cart
		if (!selectedVariantID) {
			return { success: false, error: "Please select a variant" };
		}

		if (!selectedVariant?.quantityAvailable) {
			return { success: false, error: "This item is out of stock" };
		}

		if (quantity > (selectedVariant?.quantityAvailable || 0)) {
			return { success: false, error: `Only ${selectedVariant?.quantityAvailable} available` };
		}

		try {
			const checkout = await Checkout.findOrCreate({
				checkoutId: await Checkout.getIdFromCookies(params.channel),
				channel: params.channel,
			});
			invariant(checkout, "This should never happen");

			await Checkout.saveIdToCookie(params.channel, checkout.id);

			const result = await executeGraphQL(CheckoutAddLineDocument, {
				variables: {
					id: checkout.id,
					productVariantId: decodeURIComponent(selectedVariantID),
					quantity,
				} as { id: string; productVariantId: string; quantity?: number },
				cache: "no-cache",
			});

			// Check for GraphQL errors
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

	const isAvailable = variants?.some((variant) => variant.quantityAvailable) ?? false;

	const price = selectedVariant?.pricing?.price?.gross
		? formatMoney(selectedVariant.pricing.price.gross.amount, selectedVariant.pricing.price.gross.currency)
		: isAvailable
			? formatMoneyRange({
					start: product?.pricing?.priceRange?.start?.gross,
					stop: product?.pricing?.priceRange?.stop?.gross,
				})
			: "";

	const productJsonLd: WithContext<Product> = {
		"@context": "https://schema.org",
		"@type": "Product",
		image: firstImage?.url,
		...(selectedVariant
			? {
					name: `${product.name} - ${selectedVariant.name}`,
					description: product.seoDescription || `${product.name} - ${selectedVariant.name}`,
					offers: selectedVariant.pricing?.price?.gross
						? {
								"@type": "Offer",
								availability: selectedVariant.quantityAvailable
									? "https://schema.org/InStock"
									: "https://schema.org/OutOfStock",
								priceCurrency: selectedVariant.pricing.price.gross.currency,
								price: selectedVariant.pricing.price.gross.amount,
							}
						: undefined,
				}
			: {
					name: product.name,
					description: product.seoDescription || product.name,
					offers: product.pricing?.priceRange?.start?.gross
						? {
								"@type": "AggregateOffer",
								availability: product.variants?.some((variant) => variant.quantityAvailable)
									? "https://schema.org/InStock"
									: "https://schema.org/OutOfStock",
								priceCurrency: product.pricing.priceRange.start.gross.currency,
								lowPrice: product.pricing.priceRange.start.gross.amount,
								highPrice: product.pricing.priceRange.stop?.gross.amount,
							}
						: undefined,
				}),
	};

	return (
		<section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(productJsonLd),
				}}
			/>
			<div className="lg:flex lg:gap-12">
				{/* Product Image */}
				<div className="lg:w-[45%] lg:flex-shrink-0">
					{firstImage && (
						<ProductImageWrapper
							priority={true}
							alt={firstImage.alt ?? ""}
							width={672}
							height={936}
							sizes="(max-width: 1024px) 100vw, 45vw"
							src={firstImage.url}
							fallbackSrc={fallbackImageUrl}
						/>
					)}
				</div>

				{/* Product Info */}
				<div className="mt-8 lg:mt-0 lg:flex-1">
					<h1 className="text-2xl font-semibold tracking-tight text-neutral-900 lg:text-3xl">
						{product?.name}
					</h1>

					{/* Essential card info strip */}
					{product.attributes && <EssentialCardInfo attributes={product.attributes} />}

					{/* Variants */}
					{variants && (
						<VariantSelector
							selectedVariant={selectedVariant}
							variants={variants}
							product={product}
							channel={params.channel}
						/>
					)}

					{/* Stock availability */}
					<AvailabilityMessage isAvailable={isAvailable} quantity={selectedVariant?.quantityAvailable} />

					{/* Price + Quantity + Add to Cart - inline */}
					<div className="mt-6 flex flex-wrap items-center gap-4">
						<p className="text-2xl font-semibold text-neutral-900" data-testid="ProductElement_Price">
							{price}
						</p>
						<AddToCartForm
							addItemAction={addItem}
							disabled={!selectedVariantID || !selectedVariant?.quantityAvailable}
							maxQuantity={selectedVariant?.quantityAvailable ?? undefined}
						/>
					</div>

					{/* Other printings of this card */}
					{otherPrintings.length > 1 && (
						<OtherPrintings
							printings={otherPrintings}
							currentProductId={product.id}
							channel={params.channel}
						/>
					)}
				</div>
			</div>

			{/* More Info section */}
			{product.attributes && (
				<div className="mt-12 border-t border-neutral-100 pt-8">
					<MTGCardAttributes attributes={product.attributes} />
				</div>
			)}

			{/* Related Products Carousel */}
			{filteredRelatedProducts.length > 0 && (
				<RelatedProductsCarousel
					products={filteredRelatedProducts}
					title={product.category?.name ? `More from ${product.category.name}` : "Related Products"}
				/>
			)}
		</section>
	);
}
