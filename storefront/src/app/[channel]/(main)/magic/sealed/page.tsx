import { type Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { MagicSubNav } from "@/ui/components/MagicSubNav";

export const revalidate = 60;

export const metadata: Metadata = {
	title: "Magic: The Gathering Sealed Products",
	description: "Browse Magic: The Gathering sealed products - booster boxes, bundles, commander decks, and more.",
};

// Static category list - these slugs match the categories created in setup_sealed_schema.py
const SEALED_CATEGORIES = [
	{ name: "Play Booster Boxes", slug: "play-booster-boxes", description: "Factory-sealed Play Booster boxes (30 packs)" },
	{ name: "Collector Booster Boxes", slug: "collector-booster-boxes", description: "Premium Collector Booster boxes (12 packs)" },
	{ name: "Draft Booster Boxes", slug: "draft-booster-boxes", description: "Legacy Draft Booster boxes (36 packs)" },
	{ name: "Set Booster Boxes", slug: "set-booster-boxes", description: "Discontinued Set Booster boxes (30 packs)" },
	{ name: "Play Booster Packs", slug: "play-booster-packs", description: "Individual Play Booster packs" },
	{ name: "Collector Booster Packs", slug: "collector-booster-packs", description: "Individual Collector Booster packs" },
	{ name: "Jumpstart Boosters", slug: "jumpstart-boosters", description: "Themed 20-card Jumpstart packs" },
	{ name: "Bundles", slug: "bundles", description: "Bundle boxes with boosters and accessories" },
	{ name: "Commander Decks", slug: "commander-decks", description: "100-card preconstructed Commander decks" },
	{ name: "Challenger Decks", slug: "challenger-decks", description: "Tournament-ready 60-card decks" },
	{ name: "Starter Kits", slug: "starter-kits", description: "Learn-to-play starter products" },
	{ name: "Prerelease Kits", slug: "prerelease-kits", description: "Prerelease event kits" },
	{ name: "Secret Lair", slug: "secret-lair", description: "Limited edition Secret Lair drops" },
	{ name: "Premium Collections", slug: "premium-collections", description: "FTV, Spellbook, and other premium products" },
];

export default async function SealedPage(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Magic: The Gathering", href: "/magic" },
					{ label: "Sealed" },
				]}
				className="mb-4"
			/>
			<MagicSubNav />

			<h1 className="pb-2 text-2xl font-bold">Magic: The Gathering Sealed Products</h1>
			<p className="pb-8 text-neutral-500">
				Factory-sealed Magic: The Gathering products - booster boxes, bundles, commander decks, and more.
			</p>

			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{SEALED_CATEGORIES.map((cat) => (
					<Link
						key={cat.slug}
						href={`/${params.channel}/magic/sealed/${cat.slug}`}
						className="group relative flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
					>
						<div className="flex h-32 items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
							<span className="text-4xl">📦</span>
						</div>
						<div className="flex flex-1 flex-col p-4">
							<h2 className="font-semibold text-neutral-900 group-hover:text-purple-600">
								{cat.name}
							</h2>
							<p className="mt-1 line-clamp-2 text-sm text-neutral-500">{cat.description}</p>
						</div>
					</Link>
				))}
			</div>

			<div className="mt-12 border-t border-neutral-200 pt-8">
				<h2 className="pb-4 text-lg font-semibold">Browse by Set</h2>
				<p className="pb-4 text-neutral-500">
					Looking for a specific set? Browse all Magic: The Gathering sets with both singles and sealed products.
				</p>
				<Link
					href={`/${params.channel}/magic/sets`}
					className="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
				>
					View All Sets →
				</Link>
			</div>
		</div>
	);
}
