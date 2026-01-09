"use client";

import { usePathname } from "next/navigation";
import { LinkWithChannel } from "../atoms/LinkWithChannel";

const NAV_ITEMS = [
	{ label: "All Supplies", href: "/supplies", match: (path: string) => path.endsWith("/supplies") },
	{ label: "Card Sleeves", href: "/supplies/card-sleeves", match: (path: string) => path.includes("/supplies/card-sleeves") },
	{ label: "Deck Boxes", href: "/supplies/deck-boxes", match: (path: string) => path.includes("/supplies/deck-boxes") },
	{ label: "Playmats", href: "/supplies/playmats", match: (path: string) => path.includes("/supplies/playmats") },
	{ label: "Hobby Supplies", href: "/supplies/hobby-supplies", match: (path: string) => path.includes("/supplies/hobby-supplies") },
];

export function SuppliesSubNav() {
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
								? "border-emerald-600 text-emerald-600"
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
