"use client";

import { useState } from "react";

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
	const [hasError, setHasError] = useState(false);
	const color = RARITY_ICON_COLORS[rarity?.toLowerCase() || ""] || "#1a1a1a";
	// Use local proxy to avoid CORS issues with CSS mask-image
	const iconUrl = `/api/scryfall-icon?set=${setCode.toLowerCase()}`;

	// Use CSS mask for the icon with color support
	if (!hasError) {
		return (
			<>
				{/* Hidden img to detect load errors */}
				<img
					src={iconUrl}
					alt=""
					className="hidden"
					onError={() => setHasError(true)}
				/>
				<span
					className={`inline-block flex-shrink-0 ${SIZES[size]}`}
					style={{
						WebkitMaskImage: `url(${iconUrl})`,
						maskImage: `url(${iconUrl})`,
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
			</>
		);
	}

	// Fallback: show set code in a styled badge
	return (
		<span
			className={`inline-flex flex-shrink-0 items-center justify-center rounded ${SIZES[size]} text-[8px] font-bold`}
			style={{
				backgroundColor: color,
				color: color === "#1a1a1a" ? "#888" : "#fff",
				fontSize: size === "sm" ? "6px" : size === "md" ? "7px" : "8px",
			}}
			title={`Set: ${setCode.toUpperCase()}`}
		>
			{setCode.slice(0, 3).toUpperCase()}
		</span>
	);
}
