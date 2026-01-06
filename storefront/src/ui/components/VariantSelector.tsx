import { clsx } from "clsx";
import { redirect } from "next/navigation";
import { LinkWithChannel } from "../atoms/LinkWithChannel";
import { type ProductListItemFragment, type VariantDetailsFragment } from "@/gql/graphql";
import { getHrefForVariant } from "@/lib/utils";

// Condition order for MTG cards
const CONDITION_ORDER = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

/**
 * Extract display name from variant name.
 * For condition variants like "Card Name - Near Mint", returns just "Near Mint".
 * For other variants, returns the full name.
 */
function getVariantDisplayName(variantName: string): string {
	const parts = variantName.split(" - ");
	if (parts.length >= 2) {
		const lastPart = parts[parts.length - 1];
		// Check if the last part is a known condition
		if (CONDITION_ORDER.includes(lastPart)) {
			return lastPart;
		}
	}
	return variantName;
}

/**
 * Sort variants by condition order (NM first, DMG last).
 * Non-condition variants are sorted alphabetically at the end.
 */
function sortVariantsByCondition(variants: readonly VariantDetailsFragment[]): VariantDetailsFragment[] {
	return [...variants].sort((a, b) => {
		const aDisplay = getVariantDisplayName(a.name);
		const bDisplay = getVariantDisplayName(b.name);
		const aIndex = CONDITION_ORDER.indexOf(aDisplay);
		const bIndex = CONDITION_ORDER.indexOf(bDisplay);

		// Both are conditions - sort by condition order
		if (aIndex !== -1 && bIndex !== -1) {
			return aIndex - bIndex;
		}
		// Only a is a condition - a comes first
		if (aIndex !== -1) return -1;
		// Only b is a condition - b comes first
		if (bIndex !== -1) return 1;
		// Neither is a condition - sort alphabetically
		return aDisplay.localeCompare(bDisplay);
	});
}

/**
 * Find the best available variant by condition order.
 * Returns the first in-stock variant, prioritizing Near Mint > LP > MP > HP > DMG.
 */
function findBestAvailableVariant(variants: readonly VariantDetailsFragment[]): VariantDetailsFragment | undefined {
	const sorted = sortVariantsByCondition(variants);
	return sorted.find((v) => v.quantityAvailable && v.quantityAvailable > 0);
}

export function VariantSelector({
	variants,
	product,
	selectedVariant,
	channel,
}: {
	variants: readonly VariantDetailsFragment[];
	product: ProductListItemFragment;
	selectedVariant?: VariantDetailsFragment;
	channel: string;
}) {
	// Auto-select best available condition if none selected
	if (!selectedVariant && variants.length >= 1) {
		const bestVariant = findBestAvailableVariant(variants);
		if (bestVariant) {
			redirect("/" + channel + getHrefForVariant({ productSlug: product.slug, variantId: bestVariant.id }));
		}
	}

	const sortedVariants = sortVariantsByCondition(variants);

	return (
		sortedVariants.length > 1 && (
			<fieldset className="mt-6" role="radiogroup" data-testid="VariantSelector">
				<legend className="mb-3 text-sm font-medium text-neutral-700">Condition</legend>
				<div className="flex flex-wrap gap-2">
					{sortedVariants.map((variant) => {
						const isDisabled = !variant.quantityAvailable;
						const isCurrentVariant = selectedVariant?.id === variant.id;
						const displayName = getVariantDisplayName(variant.name);
						return (
							<LinkWithChannel
								key={variant.id}
								prefetch={true}
								scroll={false}
								href={
									isDisabled ? "#" : getHrefForVariant({ productSlug: product.slug, variantId: variant.id })
								}
								className={clsx(
									"relative flex min-w-[5ch] items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border px-4 py-2.5 text-center text-sm font-medium transition-all duration-150",
									isCurrentVariant
										? "border-neutral-900 bg-neutral-50 text-neutral-900 ring-2 ring-neutral-900 ring-offset-1"
										: "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2",
									isDisabled && "pointer-events-none cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-400 opacity-60",
								)}
								role="radio"
								tabIndex={isDisabled ? -1 : undefined}
								aria-checked={isCurrentVariant}
								aria-disabled={isDisabled}
							>
								{displayName}
							</LinkWithChannel>
						);
					})}
				</div>
			</fieldset>
		)
	);
}
