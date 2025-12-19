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
	if (!selectedVariant && variants.length === 1 && variants[0]?.quantityAvailable) {
		redirect("/" + channel + getHrefForVariant({ productSlug: product.slug, variantId: variants[0].id }));
	}

	const sortedVariants = sortVariantsByCondition(variants);

	return (
		sortedVariants.length > 1 && (
			<fieldset className="my-4" role="radiogroup" data-testid="VariantSelector">
				<legend className="sr-only">Condition</legend>
				<div className="flex flex-wrap gap-3">
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
									isCurrentVariant
										? "border-transparent bg-neutral-900 text-white hover:bg-neutral-800"
										: "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100",
									"relative flex min-w-[5ch] items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded border p-3 text-center text-sm font-semibold focus-within:outline focus-within:outline-2 aria-disabled:cursor-not-allowed aria-disabled:bg-neutral-100 aria-disabled:text-neutral-800 aria-disabled:opacity-50",
									isDisabled && "pointer-events-none",
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
