"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import { LinkWithChannel } from "../atoms/LinkWithChannel";

const COMPANY_NAME = "Shuffle and Cut Games";

/**
 * Brand logo component for header navigation.
 * Uses Rolland mascot logo for brand personality.
 *
 * Logo variant: S+C_Logo_Rolland_FullColor.png
 * Original dimensions: 2700x583 (ratio ~4.6:1)
 */
export const Logo = () => {
	const pathname = usePathname();

	const logoContent = (
		<Image
			src="/brand/logo-rolland-full-color.png"
			alt={COMPANY_NAME}
			width={230}
			height={50}
			className="h-auto w-[180px] sm:w-[230px]"
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
