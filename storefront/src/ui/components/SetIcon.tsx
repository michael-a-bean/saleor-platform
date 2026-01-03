// Rarity colors for set icons (traditional MTG rarity colors)
const RARITY_ICON_COLORS: Record<string, string> = {
	common: "#1a1a1a",
	uncommon: "#707883",
	rare: "#C9A227",
	mythic: "#D45019",
};

interface SetIconProps {
	setCode: string;
	rarity?: string;
	size?: "sm" | "md" | "lg";
}

const SIZES = {
	sm: "h-4 w-4",
	md: "h-5 w-5",
	lg: "h-6 w-6",
};

export function SetIcon({ setCode, rarity, size = "md" }: SetIconProps) {
	const color = RARITY_ICON_COLORS[rarity?.toLowerCase() || ""] || "#1a1a1a";

	return (
		<span
			className={`inline-block flex-shrink-0 ${SIZES[size]}`}
			style={{
				WebkitMaskImage: `url(https://svgs.scryfall.io/sets/${setCode.toLowerCase()}.svg)`,
				maskImage: `url(https://svgs.scryfall.io/sets/${setCode.toLowerCase()}.svg)`,
				WebkitMaskSize: "contain",
				maskSize: "contain",
				WebkitMaskRepeat: "no-repeat",
				maskRepeat: "no-repeat",
				WebkitMaskPosition: "center",
				maskPosition: "center",
				backgroundColor: color,
			}}
			title={`Set: ${setCode.toUpperCase()}`}
		/>
	);
}
