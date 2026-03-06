"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const useMobileFilters = () => {
	const [isOpen, setIsOpen] = useState(false);
	const pathname = usePathname();
	const searchParams = useSearchParams();

	// Close on route change — render-time adjustment instead of useEffect
	const prevRouteRef = useRef({ pathname, search: searchParams.toString() });
	const currentSearch = searchParams.toString();
	if (pathname !== prevRouteRef.current.pathname || currentSearch !== prevRouteRef.current.search) {
		prevRouteRef.current = { pathname, search: currentSearch };
		setIsOpen(false);
	}

	// Close on desktop breakpoint
	useEffect(() => {
		const handleResize = (ev: MediaQueryListEvent) => {
			if (ev.matches) setIsOpen(false);
		};
		const matchMedia = window.matchMedia("(min-width: 1024px)");
		matchMedia.addEventListener("change", handleResize, { passive: true });
		return () => matchMedia.removeEventListener("change", handleResize);
	}, []);

	return {
		isOpen,
		openFilters: useCallback(() => setIsOpen(true), []),
		closeFilters: useCallback(() => setIsOpen(false), []),
	};
};
