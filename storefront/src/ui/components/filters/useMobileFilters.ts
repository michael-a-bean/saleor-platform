"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const useMobileFilters = () => {
	const [isOpen, setIsOpen] = useState(false);
	const pathname = usePathname();
	const searchParams = useSearchParams();

	// Close on route change — render-time adjustment
	const currentSearch = searchParams.toString();
	const [prevRoute, setPrevRoute] = useState({ pathname, search: currentSearch });
	if (pathname !== prevRoute.pathname || currentSearch !== prevRoute.search) {
		setPrevRoute({ pathname, search: currentSearch });
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
