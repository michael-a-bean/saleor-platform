"use client";

import { useEffect, useCallback, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Slim top-of-page progress bar that shows during route transitions.
 * Bridges the perceptual gap between "user clicks link" and "loading.tsx skeleton appears".
 *
 * Uses useSyncExternalStore to manage progress state outside React's render cycle,
 * avoiding setState-in-effect and ref-during-render lint violations.
 */

type ProgressState = { progress: number; visible: boolean; trackedUrl: string };

let state: ProgressState = { progress: 0, visible: false, trackedUrl: "" };
const listeners = new Set<() => void>();

function emit() {
	listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
	listeners.add(callback);
	return () => listeners.delete(callback);
}

function getSnapshot(): ProgressState {
	return state;
}

let animationInterval: ReturnType<typeof setInterval> | null = null;
let completionTimeout: ReturnType<typeof setTimeout> | null = null;

function startProgress() {
	if (completionTimeout) clearTimeout(completionTimeout);
	if (animationInterval) clearInterval(animationInterval);

	state = { ...state, visible: true, progress: 15 };
	emit();

	let current = 15;
	animationInterval = setInterval(() => {
		current += Math.max(1, (85 - current) * 0.08);
		if (current >= 85) {
			current = 85;
			if (animationInterval) clearInterval(animationInterval);
			animationInterval = null;
		}
		state = { ...state, progress: current };
		emit();
	}, 50);
}

function completeProgress() {
	if (animationInterval) {
		clearInterval(animationInterval);
		animationInterval = null;
	}
	state = { ...state, progress: 100 };
	emit();
	completionTimeout = setTimeout(() => {
		state = { ...state, visible: false, progress: 0 };
		emit();
		completionTimeout = null;
	}, 200);
}

/**
 * Called when the URL changes. If we were showing the progress bar,
 * complete it. Update the tracked URL in external state.
 */
function onUrlChange(newUrl: string) {
	if (state.trackedUrl && state.trackedUrl !== newUrl && state.visible) {
		completeProgress();
	}
	state = { ...state, trackedUrl: newUrl };
	// No emit needed — this is a bookkeeping update, not a render trigger
}

export function NavigationProgress() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const currentState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	const currentUrl = pathname + searchParams.toString();

	// Detect URL changes in an effect (not during render)
	useEffect(() => {
		onUrlChange(currentUrl);
	}, [currentUrl]);

	// Intercept all clicks on <a> tags to start the progress bar
	const handleClick = useCallback(
		(e: MouseEvent) => {
			const target = (e.target as HTMLElement).closest("a");
			if (!target) return;

			const href = target.getAttribute("href");
			if (!href) return;

			if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
			if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
			if (target.getAttribute("target") === "_blank") return;
			if (target.getAttribute("download")) return;
			if (href === pathname) return;

			startProgress();
		},
		[pathname],
	);

	useEffect(() => {
		document.addEventListener("click", handleClick, { capture: true });
		return () => document.removeEventListener("click", handleClick, { capture: true });
	}, [handleClick]);

	if (!currentState.visible) return null;

	return (
		<div
			className="fixed inset-x-0 top-0 z-[9999] h-0.5"
			role="progressbar"
			aria-valuenow={Math.round(currentState.progress)}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div
				className="h-full bg-brand-bright-blue transition-all duration-150 ease-out"
				style={{ width: `${currentState.progress}%` }}
			/>
		</div>
	);
}
