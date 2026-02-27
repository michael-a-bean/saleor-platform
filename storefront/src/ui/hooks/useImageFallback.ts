"use client";

import { useState, useCallback } from "react";

type FallbackState = "primary" | "fallback" | "placeholder";

export function useImageFallback(
	primarySrc: string | undefined,
	fallbackSrc?: string,
) {
	const [state, setState] = useState<FallbackState>("primary");

	const src = state === "primary" ? primarySrc : state === "fallback" ? fallbackSrc : undefined;

	const onError = useCallback(() => {
		setState((prev) => {
			if (prev === "primary" && fallbackSrc) return "fallback";
			return "placeholder";
		});
	}, [fallbackSrc]);

	return { src, onError, hasError: state === "placeholder" } as const;
}
