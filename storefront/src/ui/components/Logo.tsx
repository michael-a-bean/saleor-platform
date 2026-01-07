"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import { LinkWithChannel } from "../atoms/LinkWithChannel";

const COMPANY_NAME = "Shuffle and Cut Games";

/**
 * Brand logo component for header navigation.
 * Uses the horizontal wordmark (logotype) for best fit in navigation.
 *
 * Logo variant: S+C_Logotype_FullColor.png
 * Minimum width: 120px per brand guidelines
 */
export const Logo = () => {
	const pathname = usePathname();

	const logoContent = (
		<Image
			src="/brand/logo-full-color.png"
			alt={COMPANY_NAME}
			width={180}
			height={19}
			className="h-auto w-[140px] sm:w-[180px]"
			priority
		/>
	);

	if (pathname === "/") {
		return (
			<h1 className="flex items-center" aria-label="homepage">
				{logoContent}
			</h1>
		);
	}

	return (
		<div className="flex items-center">
			<LinkWithChannel aria-label="homepage" href="/">
				{logoContent}
			</LinkWithChannel>
		</div>
	);
};
