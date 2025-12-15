import { LinkWithChannel } from "../atoms/LinkWithChannel";
import { ProductImageWrapper } from "@/ui/atoms/ProductImageWrapper";

import type { ProductListItemFragment } from "@/gql/graphql";
import { formatMoneyRange } from "@/lib/utils";

function getSetName(product: ProductListItemFragment): string | null {
	const setAttr = product.attributes?.find((attr) => attr.attribute.slug === "mtg-set-name");
	return setAttr?.values[0]?.name || null;
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
	loading,
	priority,
}: { product: ProductListItemFragment } & { loading: "eager" | "lazy"; priority?: boolean }) {
	// Prefer media URL (external images) over thumbnail URL (Saleor-generated)
	const imageUrl = product?.media?.[0]?.url || product?.thumbnail?.url;
	const imageAlt = product?.media?.[0]?.alt || product?.thumbnail?.alt || "";

	const setName = getSetName(product);
	const quantity = getTotalQuantity(product);
	const isOutOfStock = quantity === 0;

	return (
		<li data-testid="ProductElement">
			<LinkWithChannel href={`/products/${product.slug}`} key={product.id}>
				<div>
					{imageUrl && (
						<ProductImageWrapper
							loading={loading}
							src={imageUrl}
							alt={imageAlt}
							width={512}
							height={512}
							sizes={"512px"}
							priority={priority}
						/>
					)}
					<div className="mt-2">
						<div className="flex justify-between">
							<h3 className="text-sm font-semibold text-neutral-900">{product.name}</h3>
							<p className="text-sm font-medium text-neutral-900" data-testid="ProductElement_PriceRange">
								{formatMoneyRange({
									start: product?.pricing?.priceRange?.start?.gross,
									stop: product?.pricing?.priceRange?.stop?.gross,
								})}
							</p>
						</div>
						<div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
							<span className="truncate" title={setName || undefined}>
								{setName || "Unknown Set"}
							</span>
							<span className={isOutOfStock ? "text-red-600" : "text-green-600"}>
								{formatQuantity(quantity)}
							</span>
						</div>
					</div>
				</div>
			</LinkWithChannel>
		</li>
	);
}
