import { type Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { SuppliesSubNav } from "@/ui/components/SuppliesSubNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Gaming Supplies",
	description: "Card sleeves, deck boxes, playmats, dice, and more gaming accessories.",
};

// Static category list - these slugs should match categories in Saleor
const SUPPLY_CATEGORIES = [
	{ name: "Card Sleeves", slug: "card-sleeves", description: "Protective sleeves for trading cards", emoji: "🃏" },
	{ name: "Deck Boxes", slug: "deck-boxes", description: "Storage and carrying cases for decks", emoji: "📦" },
	{ name: "Playmats", slug: "playmats", description: "Gaming surface mats and accessories", emoji: "🎯" },
	{ name: "Binders", slug: "binders", description: "Card storage binders and pages", emoji: "📒" },
	{ name: "Dice & Counters", slug: "dice-counters", description: "Dice sets, life counters, and tokens", emoji: "🎲" },
	{ name: "Card Storage", slug: "card-storage", description: "Bulk card storage boxes and solutions", emoji: "🗃️" },
	{ name: "Hobby Supplies", slug: "hobby-supplies", description: "Paints, brushes, basing, and modeling supplies", emoji: "🎨" },
];

export default async function SuppliesPage(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Supplies" },
				]}
				className="mb-4"
			/>
			<SuppliesSubNav />

			<h1 className="pb-2 text-2xl font-bold">Gaming Supplies</h1>
			<p className="pb-8 text-neutral-500">
				Everything you need to protect, store, and enhance your gaming experience.
			</p>

			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{SUPPLY_CATEGORIES.map((cat) => (
					<Link
						key={cat.slug}
						href={`/${params.channel}/supplies/${cat.slug}`}
						className="group relative flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
					>
						<div className="flex h-32 items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-600">
							<span className="text-4xl">{cat.emoji}</span>
						</div>
						<div className="flex flex-1 flex-col p-4">
							<h2 className="font-semibold text-neutral-900 group-hover:text-emerald-600">
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
