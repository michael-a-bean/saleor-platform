import { clsx } from "clsx";
import { redirect } from "next/navigation";
import { LinkWithChannel } from "../atoms/LinkWithChannel";
import { type ProductListItemFragment, type VariantDetailsFragment } from "@/gql/graphql";
import { getHrefForVariant } from "@/lib/utils";

// Attribute slugs for structured data access
const CONDITION_SLUG = "mtg-condition";
const FINISH_SLUG = "mtg-finish";

// Condition sort order (best to worst) — keys are full attribute value names from Saleor
const CONDITION_ORDER: Record<string, number> = {
	"Near Mint": 0,
	"Lightly Played": 1,
	"Moderately Played": 2,
	"Heavily Played": 3,
	"Damaged": 4,
};

// Finish sort order — full attribute value names from Saleor
const FINISH_ORDER = ["Non-Foil", "Foil", "Etched", "Glossy"];

// Full condition name -> abbreviated display label
const CONDITION_ABBREVIATIONS: Record<string, string> = {
	"Near Mint": "NM",
	"Lightly Played": "LP",
	"Moderately Played": "MP",
	"Heavily Played": "HP",
	"Damaged": "DMG",
};

// Short condition codes from variant names -> full names for normalization
const CONDITION_SHORT_TO_FULL: Record<string, string> = {
	NM: "Near Mint",
	LP: "Lightly Played",
	MP: "Moderately Played",
	HP: "Heavily Played",
	DMG: "Damaged",
};

// Normalize finish variants (e.g. "Nonfoil" -> "Non-Foil")
const FINISH_NORMALIZE: Record<string, string> = {
	Nonfoil: "Non-Foil",
	nonfoil: "Non-Foil",
};

// Finish display labels (attribute value -> display string)
const FINISH_LABELS: Record<string, string> = {
	"Non-Foil": "Non-Foil",
	"Foil": "Foil",
	"Etched": "Etched",
	"Glossy": "Glossy",
};

/**
 * Extract condition from variant attributes.
 * Only trusts attribute values that match known conditions (rejects base64 IDs).
 * Falls back to parsing variant name ("NM - Foil" or "Near Mint - Non-Foil" format).
 */
function getConditionFromVariant(variant: VariantDetailsFragment): string {
	const value = variant.attributes
		?.find((a) => a.attribute.slug === CONDITION_SLUG)
		?.values[0]?.name;
	if (value && value in CONDITION_ORDER) return value;

	// Fallback: parse variant name and normalize short codes
	const parts = variant.name.split(" - ");
	const raw = parts[0]?.trim() || variant.name;
	return CONDITION_SHORT_TO_FULL[raw] || (raw in CONDITION_ORDER ? raw : raw);
}

/**
 * Extract finish from variant attributes.
 * Only trusts attribute values that match known finishes (rejects base64 IDs).
 * Falls back to parsing variant name ("NM - Foil" or "Near Mint - Non-Foil" format).
 */
function getFinishFromVariant(variant: VariantDetailsFragment): string {
	const value = variant.attributes
		?.find((a) => a.attribute.slug === FINISH_SLUG)
		?.values[0]?.name;
	if (value && FINISH_ORDER.includes(value)) return value;

	// Fallback: parse variant name and normalize finish variants
	const parts = variant.name.split(" - ");
	const raw = parts[1]?.trim() || "Non-Foil";
	return FINISH_NORMALIZE[raw] || raw;
}

/**
 * Get available finishes from variants, sorted by FINISH_ORDER.
 */
function getAvailableFinishes(variants: readonly VariantDetailsFragment[]): string[] {
	const finishes = new Set<string>();
	for (const v of variants) {
		finishes.add(getFinishFromVariant(v));
	}
	return FINISH_ORDER.filter((f) => finishes.has(f));
}

/**
 * Sort variants by condition order (Near Mint first, Damaged last).
 */
function sortVariantsByCondition(variants: readonly VariantDetailsFragment[]): VariantDetailsFragment[] {
	return [...variants].sort((a, b) => {
		const aCondition = getConditionFromVariant(a);
		const bCondition = getConditionFromVariant(b);
		const aIndex = CONDITION_ORDER[aCondition] ?? 99;
		const bIndex = CONDITION_ORDER[bCondition] ?? 99;
		return aIndex - bIndex;
	});
}

/**
 * Find the best available variant by condition order within a finish.
 */
function findBestAvailableVariant(
	variants: readonly VariantDetailsFragment[],
	preferredFinish?: string,
): VariantDetailsFragment | undefined {
	if (preferredFinish) {
		const finishVariants = variants.filter((v) => getFinishFromVariant(v) === preferredFinish);
		const sorted = sortVariantsByCondition(finishVariants);
		const found = sorted.find((v) => v.quantityAvailable && v.quantityAvailable > 0);
		if (found) return found;
	}

	// Fall back to any available variant, preferring Non-Foil first
	for (const finish of FINISH_ORDER) {
		const finishVariants = variants.filter((v) => getFinishFromVariant(v) === finish);
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
		return getFinishFromVariant(v) === finish && getConditionFromVariant(v) === condition;
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
	// Determine current finish and condition from selected variant
	const currentFinish = selectedVariant ? getFinishFromVariant(selectedVariant) : availableFinishes[0] || "Non-Foil";
	const currentCondition = selectedVariant ? getConditionFromVariant(selectedVariant) : null;

	// Auto-select best available variant if none selected
	if (!selectedVariant && variants.length >= 1) {
		const bestVariant = findBestAvailableVariant(variants);
		if (bestVariant) {
			redirect("/" + channel + getHrefForVariant({ productSlug: product.slug, variantId: bestVariant.id }));
		}
	}

	// Filter variants by selected finish for condition display
	const variantsForFinish = variants.filter((v) => getFinishFromVariant(v) === currentFinish);
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
			{/* Condition Selector */}
			<fieldset role="radiogroup">
				<legend className="mb-3 text-sm font-medium text-neutral-700">Condition</legend>
				<div className="flex flex-wrap gap-2">
					{sortedConditionVariants.map((variant) => {
						const isDisabled = !variant.quantityAvailable;
						const isCurrentVariant = selectedVariant?.id === variant.id;
						const conditionFull = getConditionFromVariant(variant);
						const label = CONDITION_ABBREVIATIONS[conditionFull] || conditionFull;

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
								title={conditionFull}
							>
								{label}
							</LinkWithChannel>
						);
					})}
				</div>
			</fieldset>

			{/* Finish Selector */}
			<fieldset role="radiogroup">
				<legend className="mb-3 text-sm font-medium text-neutral-700">Finish</legend>
				<div className="flex flex-wrap gap-2">
					{availableFinishes.map((finish) => {
						const isSelected = finish === currentFinish;
						const finishVariants = variants.filter((v) => getFinishFromVariant(v) === finish);

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
								{FINISH_LABELS[finish] || finish}
							</LinkWithChannel>
						);
					})}
				</div>
			</fieldset>
		</div>
	);
}
