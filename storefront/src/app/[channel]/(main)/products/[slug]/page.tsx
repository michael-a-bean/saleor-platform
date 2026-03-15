import { cache, Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { type ResolvingMetadata, type Metadata } from "next";
import { type WithContext, type Product } from "schema-dts";
import { AddToCartForm } from "./AddToCartForm";
import { VariantSelector, pickDefaultVariant } from "@/ui/components/VariantSelector";
import { ProductImageWrapper } from "@/ui/atoms/ProductImageWrapper";
import { EssentialCardInfo } from "@/ui/components/EssentialCardInfo";
import { MTGCardAttributes } from "@/ui/components/MTGCardAttributes";
import { executeGraphQL } from "@/lib/graphql";
import { formatMoney, formatMoneyRange, getHrefForVariant } from "@/lib/utils";
import { ProductDetailsDocument, ProductListDocument } from "@/gql/graphql";
import { AvailabilityMessage } from "@/ui/components/AvailabilityMessage";
import { LazyOtherPrintings } from "@/ui/components/LazyOtherPrintings";
import { LazyRelatedProducts } from "@/ui/components/LazyRelatedProducts";

export const dynamic = "force-dynamic";

const getProduct = cache(async (slug: string, channel: string) => {
	const { product } = await executeGraphQL(ProductDetailsDocument, {
		variables: { slug, channel },
		revalidate: 60,
		withAuth: false, // Product data is public — skipping auth enables fetch dedup
	});
	return product;
});

export async function generateMetadata(
	props: {
		params: Promise<{ slug: string; channel: string }>;
		searchParams: Promise<{ variant?: string }>;
	},
	parent: ResolvingMetadata,
): Promise<Metadata> {
	const [searchParams, params] = await Promise.all([props.searchParams, props.params]);

	const product = await getProduct(decodeURIComponent(params.slug), params.channel);

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
	const product = await getProduct(decodeURIComponent(params.slug), params.channel);

	if (!product) {
		notFound();
	}

	// Prefer media URL (external images) over thumbnail URL (Saleor-generated)
	const firstImage = product.media?.[0] || product.thumbnail;
	// Fallback: if media URL fails, try thumbnail (different CDN path)
	const fallbackImageUrl = product.media?.[0]?.url
		? product.thumbnail?.url
		: undefined;

	const variants = product.variants;
	const selectedVariantID = searchParams.variant;
	// Use URL variant if present, otherwise auto-select the best available.
	// No redirect — RSC redirects cause blank pages during client-side navigation.
	const selectedVariant =
		variants?.find(({ id }) => id === selectedVariantID) ??
		(variants && variants.length >= 1 ? pickDefaultVariant(variants) : undefined);

	// Auto-select best variant before any JSX renders — redirect at the page
	// level fires at the top of the RSC response, avoiding blank pages during
	// client-side navigation (redirect mid-render breaks RSC streaming).
	if (!selectedVariant && variants && variants.length >= 1) {
		const best = pickDefaultVariant(variants);
		if (best) {
			redirect(
				`/${params.channel}${getHrefForVariant({ productSlug: product.slug, variantId: best.id })}`,
			);
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
				{/* Product Image — aspect-square reserves space to prevent CLS */}
				<div className="aspect-square lg:w-[45%] lg:flex-shrink-0">
					{firstImage ? (
						<ProductImageWrapper
							priority={true}
							alt={firstImage.alt ?? ""}
							width={672}
							height={672}
							sizes="(max-width: 1024px) 100vw, 45vw"
							src={firstImage.url}
							fallbackSrc={fallbackImageUrl}
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center rounded-lg border border-neutral-100 bg-neutral-50">
							<span className="text-neutral-300">No image</span>
						</div>
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
							variantId={selectedVariant?.id}
							channel={params.channel}
							quantityAvailable={selectedVariant?.quantityAvailable ?? 0}
							disabled={!selectedVariant?.id || !selectedVariant?.quantityAvailable}
							maxQuantity={selectedVariant?.quantityAvailable ?? undefined}
						/>
					</div>

					{/* Other printings — Suspense for code-splitting + PPR prep */}
					<Suspense fallback={<div className="mt-8 h-48 animate-pulse rounded bg-neutral-100" />}>
						<LazyOtherPrintings
							productName={product.name}
							currentProductId={product.id}
							channel={params.channel}
						/>
					</Suspense>
				</div>
			</div>

			{/* More Info section */}
			{product.attributes && (
				<div className="mt-12 border-t border-neutral-100 pt-8">
					<MTGCardAttributes attributes={product.attributes} />
				</div>
			)}

			{/* Related Products — Suspense for code-splitting + PPR prep */}
			{product.category?.id && (
				<Suspense fallback={<div className="mt-12 h-64 animate-pulse rounded bg-neutral-100" />}>
					<LazyRelatedProducts
						categoryId={product.category.id}
						categoryName={product.category.name ?? undefined}
						productId={product.id}
						channel={params.channel}
					/>
				</Suspense>
			)}
		</section>
	);
}
