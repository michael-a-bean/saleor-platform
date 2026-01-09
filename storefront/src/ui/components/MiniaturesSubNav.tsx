"use client";

import { usePathname } from "next/navigation";
import { LinkWithChannel } from "../atoms/LinkWithChannel";

const NAV_ITEMS = [
	{ label: "All Miniatures", href: "/miniatures", match: (path: string) => path.endsWith("/miniatures") },
	{ label: "Warhammer 40K", href: "/miniatures/warhammer-40k", match: (path: string) => path.includes("/miniatures/warhammer-40k") },
	{ label: "Warhammer AoS", href: "/miniatures/warhammer-aos", match: (path: string) => path.includes("/miniatures/warhammer-aos") },
	{ label: "Star Wars Legion", href: "/miniatures/star-wars-legion", match: (path: string) => path.includes("/miniatures/star-wars-legion") },
];

export function MiniaturesSubNav() {
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
								? "border-red-600 text-red-600"
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
