import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { MagicSubNav } from "@/ui/components/MagicSubNav";

export const revalidate = 60;

export const metadata: Metadata = {
	title: "Magic: The Gathering",
	description:
		"Browse Magic: The Gathering singles, sealed products, and sets. Over 100,000 cards and 1,800+ sealed products available.",
};

const MAGIC_SECTIONS = [
	{
		name: "Sealed Products",
		slug: "sealed",
		href: (channel: string) => `/${channel}/magic/sealed`,
		description: "Factory-sealed booster boxes, bundles, commander decks, and more.",
		stats: "1,800+ products",
		image: "/images/categories/mtg-sealed.png",
	},
	{
		name: "Singles",
		slug: "singles",
		href: (channel: string) => `/${channel}/magic/singles`,
		description: "Individual cards from all sets. Near Mint to Heavily Played conditions available.",
		stats: "100,000+ cards",
		image: "/images/categories/mtg-singles.png",
	},
	{
		name: "Browse by Set",
		slug: "sets",
		href: (channel: string) => `/${channel}/magic/sets`,
		description: "Find cards and sealed products organized by expansion set.",
		stats: "264 sets",
		image: "/images/categories/mtg-sets.png",
	},
];

const QUICK_LINKS = [
	{ name: "Play Booster Boxes", href: (channel: string) => `/${channel}/categories/play-booster-boxes` },
	{ name: "Collector Boosters", href: (channel: string) => `/${channel}/categories/collector-booster-boxes` },
	{ name: "Commander Decks", href: (channel: string) => `/${channel}/categories/commander-decks` },
	{ name: "Bundles", href: (channel: string) => `/${channel}/categories/bundles` },
];

export default async function MagicLandingPage(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb items={[{ label: "Magic: The Gathering" }]} className="mb-4" />
			<MagicSubNav />

			{/* Hero Section */}
			<div className="mb-12 text-center">
				<h1 className="pb-4 font-display text-4xl font-bold text-neutral-900">Magic: The Gathering</h1>
				<p className="mx-auto max-w-2xl text-lg text-neutral-600">
					Your destination for Magic: The Gathering singles and sealed products. From the latest releases to classic
					sets, find everything you need to build your collection.
				</p>
			</div>

			{/* Main Sections */}
			<div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
				{MAGIC_SECTIONS.map((section) => (
					<Link
						key={section.slug}
						href={section.href(params.channel)}
						className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-all hover:shadow-lg"
					>
						<div className="relative h-48 overflow-hidden bg-gradient-to-br from-brand-deep-purple/5 to-brand-bright-blue/5">
							<Image
								src={section.image}
								alt={section.name}
								fill
								sizes="(max-width: 768px) 100vw, 33vw"
								className="object-contain p-4 transition-transform group-hover:scale-105"
							/>
						</div>
						<div className="flex flex-1 flex-col p-6">
							<div className="mb-2 flex items-center justify-between">
								<h2 className="font-display text-xl font-bold text-neutral-900 group-hover:text-brand-bright-blue">
									{section.name}
								</h2>
								<span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
									{section.stats}
								</span>
							</div>
							<p className="text-neutral-500">{section.description}</p>
							<div className="mt-4 flex items-center text-sm font-medium text-brand-bright-blue group-hover:text-brand-deep-purple">
								Browse {section.name}
								<svg
									className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 5l7 7-7 7"
									/>
								</svg>
							</div>
						</div>
					</Link>
				))}
			</div>

			{/* Quick Links */}
			<div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6">
				<h2 className="mb-4 font-display text-lg font-semibold text-neutral-900">Popular Categories</h2>
				<div className="flex flex-wrap gap-3">
					{QUICK_LINKS.map((link) => (
						<Link
							key={link.name}
							href={link.href(params.channel)}
							className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-bright-blue hover:bg-brand-bright-blue/5 hover:text-brand-deep-purple"
						>
							{link.name}
						</Link>
					))}
				</div>
			</div>

			{/* Info Banner */}
			<div className="mt-8 rounded-xl bg-gradient-to-r from-brand-deep-purple to-brand-bright-blue p-6 text-white">
				<div className="flex flex-col items-center justify-between gap-4 md:flex-row">
					<div>
						<h3 className="font-display text-lg font-semibold">Looking for something specific?</h3>
						<p className="text-white/80">
							Browse our singles catalog to find cards by name, set, or other attributes.
						</p>
					</div>
					<Link
						href={`/${params.channel}/magic/singles`}
						className="inline-flex items-center rounded-lg bg-white px-6 py-3 font-medium text-brand-deep-purple transition-colors hover:bg-brand-bright-blue/10"
					>
						Browse Cards
						<svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
					</Link>
				</div>
			</div>
		</div>
	);
}
