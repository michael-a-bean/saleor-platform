"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { SetIcon } from "./SetIcon";
import type { OtherPrintingsQuery } from "@/gql/graphql";

type PrintingProduct = NonNullable<OtherPrintingsQuery["products"]>["edges"][number]["node"];

interface OtherPrintingsProps {
	printings: PrintingProduct[];
	currentProductId: string;
	channel: string;
}

function getAttributeValue(
	attributes: PrintingProduct["attributes"],
	slug: string,
): string | null {
	const attr = attributes.find((a) => a.attribute.slug === slug);
	return attr?.values[0]?.name || attr?.values[0]?.slug || null;
}

function isInStock(variants: PrintingProduct["variants"]): boolean {
	return variants?.some((v) => (v.quantityAvailable ?? 0) > 0) ?? false;
}

export function OtherPrintings({ printings, currentProductId, channel }: OtherPrintingsProps) {
	// Filter to only exact name matches and exclude current product
	const otherPrintings = printings.filter((p) => p.id !== currentProductId);

	if (otherPrintings.length === 0) {
		return null;
	}

	return (
		<div className="mt-8 border-t border-neutral-100 pt-6">
			<p className="mb-3 text-sm font-medium text-neutral-600">
				Other printings ({otherPrintings.length})
			</p>
			<div className="flex flex-wrap gap-2">
				{otherPrintings.map((printing) => {
					const setCode = getAttributeValue(printing.attributes, "mtg-set-code");
					const setName = getAttributeValue(printing.attributes, "mtg-set-name");
					const rarity = getAttributeValue(printing.attributes, "mtg-rarity");
					const inStock = isInStock(printing.variants);
					const price = printing.pricing?.priceRange?.start?.gross;

					return (
						<Link
							key={printing.id}
							href={`/${channel}/products/${printing.slug}`}
							className={`group flex flex-shrink-0 items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
								inStock
									? "border-neutral-200 bg-white hover:border-neutral-400 hover:bg-neutral-50"
									: "border-neutral-100 bg-neutral-50 opacity-60 hover:opacity-80"
							}`}
							title={setName || setCode || "Unknown set"}
						>
							{/* Set icon with rarity color */}
							{setCode && (
								<span className={inStock ? "" : "grayscale"}>
									<SetIcon setCode={setCode} rarity={rarity || undefined} size="md" />
								</span>
							)}
							<div className="flex flex-col">
								<span className="text-xs font-medium uppercase text-neutral-700">
									{setCode || "???"}
								</span>
								{price ? (
									<span
										className={`text-xs ${inStock ? "text-neutral-900" : "text-neutral-500"}`}
									>
										{formatMoney(price.amount, price.currency)}
									</span>
								) : (
									<span className="text-xs text-neutral-400">--</span>
								)}
							</div>
						</Link>
					);
				})}
			</div>
		</div>
	);
}
