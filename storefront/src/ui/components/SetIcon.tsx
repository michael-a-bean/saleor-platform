"use client";

import { useEffect, useSyncExternalStore } from "react";

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

// Module-level cache shared across all SetIcon instances.
// Prevents repeated network requests for set codes that already 404'd.
type IconState = "loading" | "ok" | "error";
const iconStatus = new Map<string, IconState>();
const listeners = new Set<() => void>();

function getIconSnapshot() {
	return iconStatus;
}

function getIconServerSnapshot() {
	return iconStatus;
}

function subscribeToIcons(callback: () => void) {
	listeners.add(callback);
	return () => listeners.delete(callback);
}

function setIconStatus(key: string, status: IconState) {
	iconStatus.set(key, status);
	for (const listener of listeners) {
		listener();
	}
}

function probeIcon(key: string, iconUrl: string) {
	if (iconStatus.has(key)) return;
	iconStatus.set(key, "loading");
	const img = new Image();
	img.src = iconUrl;
	img.onload = () => setIconStatus(key, "ok");
	img.onerror = () => setIconStatus(key, "error");
}

export function SetIcon({ setCode, rarity, size = "md" }: SetIconProps) {
	const key = setCode.toLowerCase();
	const color = RARITY_ICON_COLORS[rarity?.toLowerCase() || ""] || "#1a1a1a";
	const iconUrl = `/api/scryfall-icon?set=${key}`;

	const store = useSyncExternalStore(subscribeToIcons, getIconSnapshot, getIconServerSnapshot);
	const status = store.get(key) ?? "loading";

	useEffect(() => {
		probeIcon(key, iconUrl);
	}, [key, iconUrl]);

	if (status === "loading" || status === "ok") {
		return (
			<span
				className={`inline-block flex-shrink-0 ${SIZES[size]}`}
				style={{
					WebkitMaskImage: status === "ok" ? `url(${iconUrl})` : undefined,
					maskImage: status === "ok" ? `url(${iconUrl})` : undefined,
					WebkitMaskSize: "contain",
					maskSize: "contain",
					WebkitMaskRepeat: "no-repeat",
					maskRepeat: "no-repeat",
					WebkitMaskPosition: "center",
					maskPosition: "center",
					backgroundColor: status === "ok" ? color : "transparent",
				}}
				title={`Set: ${setCode.toUpperCase()}`}
			/>
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
