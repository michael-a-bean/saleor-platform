"use client";

/**
 * Environment Banner Component
 *
 * Displays a fixed banner at the bottom of the screen in non-production environments.
 * Shows the current environment and API hostname for debugging.
 *
 * Usage:
 *   // In layout.tsx or a root component:
 *   import { EnvBanner } from "@/ui/components/EnvBanner";
 *
 *   export default function Layout({ children }) {
 *     return (
 *       <>
 *         {children}
 *         <EnvBanner />
 *       </>
 *     );
 *   }
 */

import { useSyncExternalStore } from "react";
import { getEnvironment, getApiUrl, isProduction } from "@/lib/env";

const noop = () => () => {};

export function EnvBanner() {
	// useSyncExternalStore with differing server/client snapshots handles hydration safely
	const mounted = useSyncExternalStore(noop, () => true, () => false);

	// Don't render anything in production
	if (isProduction()) {
		return null;
	}

	// Don't render until mounted (avoids hydration issues)
	if (!mounted) {
		return null;
	}

	const env = getEnvironment();
	const apiUrl = getApiUrl();

	// Extract hostname from API URL
	let apiHost = "unknown";
	try {
		apiHost = new URL(apiUrl).hostname;
	} catch {
		apiHost = apiUrl;
	}

	// Environment-specific colors
	const colors: Record<string, { bg: string; text: string }> = {
		staging: { bg: "#f59e0b", text: "#000000" }, // Amber
		local: { bg: "#3b82f6", text: "#ffffff" }, // Blue
	};

	const { bg, text } = colors[env] || colors.local;

	return (
		<div
			style={{
				position: "fixed",
				bottom: 0,
				left: 0,
				right: 0,
				padding: "6px 12px",
				backgroundColor: bg,
				color: text,
				fontSize: "12px",
				fontFamily: "monospace",
				textAlign: "center",
				zIndex: 9999,
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				gap: "16px",
			}}
		>
			<span style={{ fontWeight: "bold" }}>{env.toUpperCase()}</span>
			<span>|</span>
			<span>API: {apiHost}</span>
		</div>
	);
}
