import { LinkWithChannel } from "../atoms/LinkWithChannel";
import { ProductImageWrapper } from "@/ui/atoms/ProductImageWrapper";
import { SetIcon } from "./SetIcon";
import { ImageIcon } from "lucide-react";

import type { ProductListItemFragment } from "@/gql/graphql";
import { formatMoneyRange } from "@/lib/utils";

function formatPrice(product: ProductListItemFragment): string {
	const range = product?.pricing?.priceRange;
	if (!range?.start?.gross && !range?.stop?.gross) {
		return "Price unavailable";
	}
	return formatMoneyRange({
		start: range?.start?.gross,
		stop: range?.stop?.gross,
	}) || "Price unavailable";
}

function getAttributeValue(product: ProductListItemFragment, slug: string): string | null {
	const attr = product.attributes?.find((a) => a.attribute.slug === slug);
	return attr?.values[0]?.name || attr?.values[0]?.slug || null;
}

function getTotalQuantity(product: ProductListItemFragment): number {
	return product.variants?.reduce((sum, v) => sum + (v.quantityAvailable ?? 0), 0) ?? 0;
}

function formatQuantity(qty: number): string {
	if (qty === 0) return "Out of stock";
	return qty > 12 ? "12+ in stock" : `${qty} in stock`;
}

export function ProductElement({
	product,
	loading = "lazy",
	priority,
}: { product: ProductListItemFragment } & { loading?: "eager" | "lazy"; priority?: boolean }) {
	// Primary: external media URL (Scryfall). Fallback: Saleor-generated thumbnail (CloudFront).
	const primaryUrl = product?.media?.[0]?.url;
	const fallbackUrl = product?.thumbnail?.url;
	const imageUrl = primaryUrl || fallbackUrl;
	const imageAlt = product?.media?.[0]?.alt || product?.thumbnail?.alt || "";

	const setCode = getAttributeValue(product, "mtg-set-code");
	const setName = getAttributeValue(product, "mtg-set-name");
	const rarity = getAttributeValue(product, "mtg-rarity");
	const quantity = getTotalQuantity(product);
	const isOutOfStock = quantity === 0;

	return (
		<li data-testid="ProductElement">
			<LinkWithChannel href={`/products/${product.slug}`} key={product.id}>
				<div>
					{imageUrl ? (
						<ProductImageWrapper
							loading={loading}
							src={imageUrl}
							fallbackSrc={primaryUrl ? fallbackUrl : undefined}
							alt={imageAlt}
							width={488}
							height={680}
							sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 256px"
							priority={priority}
						/>
					) : (
						<div className="flex aspect-square items-center justify-center rounded-lg bg-neutral-100">
							<ImageIcon className="h-16 w-16 text-neutral-300" />
						</div>
					)}
					<div className="mt-2">
						<div className="flex justify-between">
							<h3 className="text-sm font-semibold text-neutral-900">{product.name}</h3>
							<p className="text-sm font-medium text-neutral-900" data-testid="ProductElement_PriceRange">
								{formatPrice(product)}
							</p>
						</div>
						<div className="mt-1 flex items-center gap-1 text-xs text-neutral-500" title={setName || undefined}>
							{setCode && <SetIcon setCode={setCode} rarity={rarity || undefined} size="sm" />}
							<span className="truncate">{setName || "Unknown Set"}</span>
						</div>
						<div className={`mt-1 text-xs ${isOutOfStock ? "text-red-600" : "text-green-600"}`}>
							{formatQuantity(quantity)}
						</div>
					</div>
				</div>
			</LinkWithChannel>
		</li>
	);
}
