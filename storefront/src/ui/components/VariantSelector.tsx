import { clsx } from "clsx";
import { redirect } from "next/navigation";
import { LinkWithChannel } from "../atoms/LinkWithChannel";
import { type ProductListItemFragment, type VariantDetailsFragment } from "@/gql/graphql";
import { getHrefForVariant } from "@/lib/utils";

// Condition order for MTG cards
const CONDITION_ORDER = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

// Finish order for MTG cards
const FINISH_ORDER = ["Non-Foil", "Foil", "Etched", "Glossy"];

// Short labels for conditions
const CONDITION_SHORT_LABELS: Record<string, string> = {
	"Near Mint": "NM",
	"Lightly Played": "LP",
	"Moderately Played": "MP",
	"Heavily Played": "HP",
	"Damaged": "DMG",
};

/**
 * Parse variant name to extract condition and finish.
 * Variant names follow patterns:
 * - "Card Name - Near Mint" (legacy non-foil)
 * - "Card Name - Near Mint (Foil)"
 * - "Card Name - Near Mint (Etched)"
 */
function parseVariantName(variantName: string): { condition: string; finish: string } {
	const parts = variantName.split(" - ");
	if (parts.length < 2) {
		return { condition: variantName, finish: "Non-Foil" };
	}

	const lastPart = parts[parts.length - 1];

	// Check for finish in parentheses: "Near Mint (Foil)"
	const finishMatch = lastPart.match(/^(.+?)\s*\((\w+)\)$/);
	if (finishMatch) {
		const condition = finishMatch[1].trim();
		const finish = finishMatch[2];
		return { condition, finish };
	}

	// Legacy format without finish - assume Non-Foil
	if (CONDITION_ORDER.includes(lastPart)) {
		return { condition: lastPart, finish: "Non-Foil" };
	}

	return { condition: lastPart, finish: "Non-Foil" };
}

/**
 * Extract just the condition from a variant name.
 */
function getConditionFromVariant(variantName: string): string {
	return parseVariantName(variantName).condition;
}

/**
 * Extract the finish from a variant name.
 */
function getFinishFromVariant(variantName: string): string {
	return parseVariantName(variantName).finish;
}

/**
 * Get available finishes from variants.
 */
function getAvailableFinishes(variants: readonly VariantDetailsFragment[]): string[] {
	const finishes = new Set<string>();
	for (const v of variants) {
		finishes.add(getFinishFromVariant(v.name));
	}
	return FINISH_ORDER.filter((f) => finishes.has(f));
}

/**
 * Sort variants by condition order (NM first, DMG last).
 */
function sortVariantsByCondition(variants: readonly VariantDetailsFragment[]): VariantDetailsFragment[] {
	return [...variants].sort((a, b) => {
		const aCondition = getConditionFromVariant(a.name);
		const bCondition = getConditionFromVariant(b.name);
		const aIndex = CONDITION_ORDER.indexOf(aCondition);
		const bIndex = CONDITION_ORDER.indexOf(bCondition);

		if (aIndex !== -1 && bIndex !== -1) {
			return aIndex - bIndex;
		}
		if (aIndex !== -1) return -1;
		if (bIndex !== -1) return 1;
		return aCondition.localeCompare(bCondition);
	});
}

/**
 * Find the best available variant by condition order within a finish.
 */
function findBestAvailableVariant(
	variants: readonly VariantDetailsFragment[],
	preferredFinish?: string,
): VariantDetailsFragment | undefined {
	// If a finish is preferred, try to find an available variant in that finish
	if (preferredFinish) {
		const finishVariants = variants.filter((v) => getFinishFromVariant(v.name) === preferredFinish);
		const sorted = sortVariantsByCondition(finishVariants);
		const found = sorted.find((v) => v.quantityAvailable && v.quantityAvailable > 0);
		if (found) return found;
	}

	// Fall back to any available variant, preferring Non-Foil first
	for (const finish of FINISH_ORDER) {
		const finishVariants = variants.filter((v) => getFinishFromVariant(v.name) === finish);
		const sorted = sortVariantsByCondition(finishVariants);
		const found = sorted.find((v) => v.quantityAvailable && v.quantityAvailable > 0);
		if (found) return found;
	}

	return undefined;
}

/**
 * Find variant matching a specific finish and condition.
 */
function findVariantByFinishAndCondition(
	variants: readonly VariantDetailsFragment[],
	finish: string,
	condition: string,
): VariantDetailsFragment | undefined {
	return variants.find((v) => {
		const parsed = parseVariantName(v.name);
		return parsed.finish === finish && parsed.condition === condition;
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
	// Get available finishes for this product
	const availableFinishes = getAvailableFinishes(variants);
	const hasMultipleFinishes = availableFinishes.length > 1;

	// Determine current finish and condition from selected variant
	const currentFinish = selectedVariant ? getFinishFromVariant(selectedVariant.name) : availableFinishes[0] || "Non-Foil";
	const currentCondition = selectedVariant ? getConditionFromVariant(selectedVariant.name) : null;

	// Auto-select best available variant if none selected
	if (!selectedVariant && variants.length >= 1) {
		const bestVariant = findBestAvailableVariant(variants);
		if (bestVariant) {
			redirect("/" + channel + getHrefForVariant({ productSlug: product.slug, variantId: bestVariant.id }));
		}
	}

	// Filter variants by selected finish for condition display
	const variantsForFinish = variants.filter((v) => getFinishFromVariant(v.name) === currentFinish);
	const sortedConditionVariants = sortVariantsByCondition(variantsForFinish);

	// Common button styles
	const buttonBaseStyles =
		"relative flex min-w-[5ch] items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border px-4 py-2.5 text-center text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";
	const buttonActiveStyles = "border-neutral-900 bg-neutral-50 text-neutral-900 ring-2 ring-neutral-900 ring-offset-1";
	const buttonInactiveStyles = "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50";
	const buttonDisabledStyles = "pointer-events-none cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-400 opacity-60";

	// Foil-specific styling
	const foilActiveStyles = "border-amber-500 bg-gradient-to-br from-amber-50 to-yellow-50 text-amber-900 ring-2 ring-amber-500 ring-offset-1";
	const foilInactiveStyles = "border-amber-200 bg-gradient-to-br from-amber-50/50 to-yellow-50/50 text-amber-700 hover:border-amber-400";

	// Etched-specific styling
	const etchedActiveStyles = "border-slate-500 bg-gradient-to-br from-slate-100 to-zinc-100 text-slate-900 ring-2 ring-slate-500 ring-offset-1";
	const etchedInactiveStyles = "border-slate-300 bg-gradient-to-br from-slate-50 to-zinc-50 text-slate-600 hover:border-slate-400";

	return (
		<div className="mt-6 space-y-4" data-testid="VariantSelector">
			{/* Finish Selector - only show if multiple finishes available */}
			{hasMultipleFinishes && (
				<fieldset role="radiogroup">
					<legend className="mb-3 text-sm font-medium text-neutral-700">Finish</legend>
					<div className="flex flex-wrap gap-2">
						{availableFinishes.map((finish) => {
							const isSelected = finish === currentFinish;
							// Find best variant in this finish to link to
							const finishVariants = variants.filter((v) => getFinishFromVariant(v.name) === finish);

							// Try to maintain current condition when switching finishes
							let targetVariant: VariantDetailsFragment | undefined;
							if (currentCondition) {
								targetVariant = findVariantByFinishAndCondition(variants, finish, currentCondition);
							}
							// Fall back to best available in this finish
							if (!targetVariant || !targetVariant.quantityAvailable) {
								targetVariant = findBestAvailableVariant(finishVariants, finish);
							}
							// Final fallback to first variant in finish
							if (!targetVariant) {
								targetVariant = sortVariantsByCondition(finishVariants)[0];
							}

							const hasStock = finishVariants.some((v) => v.quantityAvailable && v.quantityAvailable > 0);
							const isDisabled = !hasStock;

							// Determine styling based on finish type
							let activeStyle = buttonActiveStyles;
							let inactiveStyle = buttonInactiveStyles;
							if (finish === "Foil") {
								activeStyle = foilActiveStyles;
								inactiveStyle = foilInactiveStyles;
							} else if (finish === "Etched") {
								activeStyle = etchedActiveStyles;
								inactiveStyle = etchedInactiveStyles;
							}

							return (
								<LinkWithChannel
									key={finish}
									prefetch={true}
									scroll={false}
									href={
										isDisabled || !targetVariant
											? "#"
											: getHrefForVariant({ productSlug: product.slug, variantId: targetVariant.id })
									}
									className={clsx(
										buttonBaseStyles,
										isSelected ? activeStyle : inactiveStyle,
										isDisabled && buttonDisabledStyles,
									)}
									role="radio"
									tabIndex={isDisabled ? -1 : undefined}
									aria-checked={isSelected}
									aria-disabled={isDisabled}
								>
									{finish}
								</LinkWithChannel>
							);
						})}
					</div>
				</fieldset>
			)}

			{/* Condition Selector */}
			{sortedConditionVariants.length > 1 && (
				<fieldset role="radiogroup">
					<legend className="mb-3 text-sm font-medium text-neutral-700">Condition</legend>
					<div className="flex flex-wrap gap-2">
						{sortedConditionVariants.map((variant) => {
							const isDisabled = !variant.quantityAvailable;
							const isCurrentVariant = selectedVariant?.id === variant.id;
							const condition = getConditionFromVariant(variant.name);
							const shortLabel = CONDITION_SHORT_LABELS[condition] || condition;

							return (
								<LinkWithChannel
									key={variant.id}
									prefetch={true}
									scroll={false}
									href={
										isDisabled ? "#" : getHrefForVariant({ productSlug: product.slug, variantId: variant.id })
									}
									className={clsx(
										buttonBaseStyles,
										isCurrentVariant ? buttonActiveStyles : buttonInactiveStyles,
										isDisabled && buttonDisabledStyles,
									)}
									role="radio"
									tabIndex={isDisabled ? -1 : undefined}
									aria-checked={isCurrentVariant}
									aria-disabled={isDisabled}
									title={condition}
								>
									{shortLabel}
								</LinkWithChannel>
							);
						})}
					</div>
				</fieldset>
			)}
		</div>
	);
}
