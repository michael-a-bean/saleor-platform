import { type Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { BoardGamesSubNav } from "@/ui/components/BoardGamesSubNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Board Games",
	description: "Strategy games, party games, family games, and more tabletop entertainment.",
};

// Static category list - these slugs should match categories in Saleor
const BOARDGAME_CATEGORIES = [
	{ name: "Strategy Games", slug: "strategy-games", description: "Deep strategy and euro-style games", emoji: "♟️" },
	{ name: "Party Games", slug: "party-games", description: "Fun games for groups and gatherings", emoji: "🎉" },
	{ name: "Family Games", slug: "family-games", description: "Games for all ages and skill levels", emoji: "👨‍👩‍👧‍👦" },
	{ name: "Cooperative Games", slug: "cooperative-games", description: "Work together to win", emoji: "🤝" },
	{ name: "Card Games", slug: "card-games", description: "Non-collectible card games", emoji: "🃏" },
	{ name: "RPG & Adventure", slug: "rpg-adventure", description: "Role-playing and adventure games", emoji: "🗡️" },
];

export default async function BoardGamesPage(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Board Games" },
				]}
				className="mb-4"
			/>
			<BoardGamesSubNav />

			<h1 className="pb-2 text-2xl font-bold">Board Games</h1>
			<p className="pb-8 text-neutral-500">
				From quick party games to deep strategy experiences - find your next favorite tabletop game.
			</p>

			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{BOARDGAME_CATEGORIES.map((cat) => (
					<Link
						key={cat.slug}
						href={`/${params.channel}/board-games/${cat.slug}`}
						className="group relative flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
					>
						<div className="flex h-32 items-center justify-center bg-gradient-to-br from-amber-600 to-orange-600">
							<span className="text-4xl">{cat.emoji}</span>
						</div>
						<div className="flex flex-1 flex-col p-4">
							<h2 className="font-semibold text-neutral-900 group-hover:text-amber-600">
								{cat.name}
							</h2>
							<p className="mt-1 line-clamp-2 text-sm text-neutral-500">{cat.description}</p>
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}
