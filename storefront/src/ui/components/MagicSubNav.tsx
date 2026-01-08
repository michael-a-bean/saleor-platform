"use client";

import { usePathname } from "next/navigation";
import { LinkWithChannel } from "../atoms/LinkWithChannel";

const NAV_ITEMS = [
	{ label: "Overview", href: "/magic", match: (path: string) => path.endsWith("/magic") },
	{ label: "Singles", href: "/magic/singles", match: (path: string) => path.includes("/magic/singles") },
	{ label: "Sealed", href: "/magic/sealed", match: (path: string) => path.includes("/magic/sealed") },
	{ label: "Browse by Set", href: "/magic/sets", match: (path: string) => path.includes("/magic/sets") },
];

export function MagicSubNav() {
	const pathname = usePathname();

	return (
		<nav className="mb-8 flex gap-1 overflow-x-auto border-b border-neutral-200">
			{NAV_ITEMS.map((item) => {
				const isActive = item.match(pathname);
				return (
					<LinkWithChannel
						key={item.href}
						href={item.href}
						className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
							isActive
								? "border-purple-600 text-purple-600"
								: "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
						}`}
					>
						{item.label}
					</LinkWithChannel>
				);
			})}
		</nav>
	);
}
