import { SetIcon } from "./SetIcon";

type AttributeValue = {
	slug?: string | null;
	name?: string | null;
};

type SelectedAttribute = {
	attribute: {
		slug?: string | null;
		name?: string | null;
	};
	values: AttributeValue[];
};

interface EssentialCardInfoProps {
	attributes: SelectedAttribute[];
}

// Rarity colors for badges
const RARITY_COLORS: Record<string, string> = {
	common: "bg-neutral-200 text-neutral-700",
	uncommon: "bg-slate-300 text-slate-800",
	rare: "bg-amber-100 text-amber-800",
	mythic: "bg-orange-100 text-orange-800",
};

export const EssentialCardInfo = ({ attributes }: EssentialCardInfoProps) => {
	const attrMap = new Map<string, string>();
	for (const attr of attributes) {
		const value = attr.values[0]?.name || attr.values[0]?.slug;
		if (attr.attribute.slug && value) {
			attrMap.set(attr.attribute.slug, value);
		}
	}

	const setCode = attrMap.get("mtg-set-code");
	const setName = attrMap.get("mtg-set-name");
	const rarity = attrMap.get("mtg-rarity");
	const collectorNumber = attrMap.get("mtg-collector-number");
	const isReserved = attrMap.get("mtg-reserved")?.toLowerCase() === "true";

	// Don't render if no essential info
	if (!setName && !rarity && !collectorNumber) {
		return null;
	}

	const rarityColorClass = RARITY_COLORS[rarity?.toLowerCase() || ""] || "bg-neutral-100 text-neutral-700";

	return (
		<div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
			{/* Set icon with rarity color */}
			{setCode && <SetIcon setCode={setCode} rarity={rarity || undefined} />}
			{setName && <span>{setName}</span>}
			{setName && rarity && <span className="text-neutral-300">|</span>}
			{rarity && (
				<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${rarityColorClass}`}>
					{rarity}
				</span>
			)}
			{collectorNumber && (
				<>
					<span className="text-neutral-300">|</span>
					<span className="font-mono text-xs">#{collectorNumber}</span>
				</>
			)}
			{isReserved && (
				<>
					<span className="text-neutral-300">|</span>
					<span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
						Reserved
					</span>
				</>
			)}
		</div>
	);
};
