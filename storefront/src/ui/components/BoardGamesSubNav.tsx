"use client";

import { usePathname } from "next/navigation";
import { LinkWithChannel } from "../atoms/LinkWithChannel";

const NAV_ITEMS = [
	{ label: "All Games", href: "/board-games", match: (path: string) => path.endsWith("/board-games") },
	{ label: "Strategy", href: "/board-games/strategy-games", match: (path: string) => path.includes("/board-games/strategy-games") },
	{ label: "Party", href: "/board-games/party-games", match: (path: string) => path.includes("/board-games/party-games") },
	{ label: "Family", href: "/board-games/family-games", match: (path: string) => path.includes("/board-games/family-games") },
];

export function BoardGamesSubNav() {
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
								? "border-amber-600 text-amber-600"
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
