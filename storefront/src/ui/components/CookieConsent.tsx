"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

const CONSENT_KEY = "cookie-consent";

const noop = () => () => {};
function getHasConsent() {
	try {
		return !!localStorage.getItem(CONSENT_KEY);
	} catch {
		return false;
	}
}

export function CookieConsent({ channel }: { channel: string }) {
	// Read localStorage via useSyncExternalStore to avoid setState-in-effect
	// Server snapshot: true (assume consent → don't render banner during SSR)
	const hasConsent = useSyncExternalStore(noop, getHasConsent, () => true);
	const [dismissed, setDismissed] = useState(false);

	const handleAccept = () => {
		try {
			localStorage.setItem(CONSENT_KEY, "accepted");
		} catch {
			// Ignore if localStorage is not available
		}
		setDismissed(true);
	};

	const handleDecline = () => {
		try {
			localStorage.setItem(CONSENT_KEY, "declined");
		} catch {
			// Ignore if localStorage is not available
		}
		setDismissed(true);
	};

	if (hasConsent || dismissed) {
		return null;
	}

	return (
		<div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-900 p-4 text-white shadow-lg">
			<div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
				<p className="text-sm text-neutral-200">
					We use cookies to enhance your browsing experience and analyze site traffic. By clicking
					&quot;Accept&quot;, you consent to our use of cookies.{" "}
					<Link href={`/${channel}/pages/privacy-policy`} className="underline hover:text-white">
						Learn more
					</Link>
				</p>
				<div className="flex shrink-0 gap-2">
					<button
						onClick={handleDecline}
						className="rounded border border-neutral-500 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-neutral-800"
					>
						Decline
					</button>
					<button
						onClick={handleAccept}
						className="rounded bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
					>
						Accept
					</button>
				</div>
			</div>
		</div>
	);
}
