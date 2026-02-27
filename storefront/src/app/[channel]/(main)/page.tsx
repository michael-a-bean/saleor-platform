import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SearchIcon, Package, Sparkles, Users, Calendar } from "lucide-react";
import { ProductList } from "@/ui/components/ProductList";
import { getLatestSets, getTrendingProducts } from "@/lib/filters";

// ISR: serve cached page, revalidate in background every 60s
export const revalidate = 60;

export const metadata = {
	title: "Shuffle and Cut Games - Magic: The Gathering & More",
	description:
		"Your local game store for Magic: The Gathering, board games, miniatures, and gaming supplies. Shop singles, sealed products, and preorder the latest releases.",
};

// Lorwyn Eclipsed Preorder Products - link directly to product pages
const ECL_PREORDER_PRODUCTS = [
	{
		name: "Play Booster Box",
		image: "/images/sets/ecl/MTGECL_EN_DspBx_Play_01_01.webp",
		description: "36 Play Boosters",
		href: (channel: string) => `/${channel}/products/ecl-lorwyn-eclipsed-play-booster-box`,
	},
	{
		name: "Collector Booster Box",
		image: "/images/sets/ecl/MTGECL_EN_DspBx_Clctr_01_01.webp",
		description: "12 Collector Boosters",
		href: (channel: string) => `/${channel}/products/ecl-lorwyn-eclipsed-collector-booster-box`,
	},
	{
		name: "Bundle",
		image: "/images/sets/ecl/MTGECL_EN_OtrBx_Bndl_01_01.webp",
		description: "8 Play Boosters + Accessories",
		href: (channel: string) => `/${channel}/products/ecl-lorwyn-eclipsed-bundle`,
	},
	{
		name: "Prerelease Kit",
		image: "/images/sets/ecl/MTGECL_EN_OtrBx_Prrls_01_01.webp",
		description: "6 Play Boosters + Promo",
		href: (channel: string) => `/${channel}/products/ecl-lorwyn-eclipsed-prerelease-pack`,
	},
	{
		name: "Commander: Dance of Elements",
		image: "/images/sets/ecl/MTGECL_EN_OtrBx_Cmndr_01_01.webp",
		description: "100-Card Commander Deck",
		href: (channel: string) => `/${channel}/products/lorwyn-eclipsed-commander-deck-dance-of-the-elements`,
	},
	{
		name: "Commander: Blight Curse",
		image: "/images/sets/ecl/MTGECL_EN_OtrBx_Cmndr_02_01.webp",
		description: "100-Card Commander Deck",
		href: (channel: string) => `/${channel}/products/lorwyn-eclipsed-commander-deck-blight-curse`,
	},
];

// Store categories
const STORE_CATEGORIES = [
	{
		name: "Magic: The Gathering",
		href: (channel: string) => `/${channel}/magic`,
		icon: Sparkles,
		description: "Singles, sealed products, and supplies",
	},
	{
		name: "Board Games",
		href: (channel: string) => `/${channel}/board-games`,
		icon: Users,
		description: "Strategy, party, and family games",
	},
	{
		name: "Miniatures",
		href: (channel: string) => `/${channel}/miniatures`,
		icon: Package,
		description: "Warhammer, paints, and hobby supplies",
	},
	{
		name: "Events",
		href: (channel: string) => `/${channel}/events`,
		icon: Calendar,
		description: "Tournaments, prereleases, and game nights",
	},
];

export default async function Page(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;

	// Fetch trending products and latest sets in parallel
	const [trendingProducts, latestSets] = await Promise.all([
		getTrendingProducts(params.channel, 8),
		getLatestSets(params.channel, 6),
	]);

	async function handleSearch(formData: FormData) {
		"use server";
		const search = formData.get("search") as string;
		if (search && search.trim().length > 0) {
			redirect(`/${encodeURIComponent(params.channel)}/search?query=${encodeURIComponent(search)}`);
		}
	}

	return (
		<div className="min-h-screen">
			{/* Lorwyn Eclipsed Hero Banner */}
			<section className="relative overflow-hidden bg-gradient-to-br from-[#1a3a2f] via-[#2d4a3f] to-[#1f2f3a]">
				{/* Background Image */}
				<div className="absolute inset-0">
					<picture>
						<source
							media="(max-width: 767px)"
							srcSet="/images/sets/ecl/ECL_sma_key_1080x1080_en.webp"
							type="image/webp"
							width={1080}
							height={1080}
						/>
						<source
							media="(min-width: 768px)"
							srcSet="/images/sets/ecl/ECL_sma_key_1640x680_en.webp"
							type="image/webp"
							width={1640}
							height={680}
						/>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/images/sets/ecl/ECL_sma_key_1640x680_en.webp"
							alt="Lorwyn Eclipsed"
							fetchPriority="high"
							decoding="async"
							className="h-full w-full object-cover object-left opacity-95"
						/>
					</picture>
					<div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />
				</div>

				{/* Content */}
				<div className="relative mx-auto max-w-7xl px-8 py-20 lg:py-28">
					<div className="max-w-xl">
						<div className="mb-4 inline-flex items-center rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
							<span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-green-400"></span>
							Now Available for Preorder
						</div>
						<h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
							Lorwyn Eclipsed
						</h1>
						<p className="mt-4 text-lg text-white/80">
							Return to the idyllic plane of Lorwyn—and witness its transformation into the dark realm of Shadowmoor.
							Preorder now and be among the first to explore this beloved world reimagined.
						</p>
						<div className="mt-8 flex flex-wrap gap-4">
							<Link
								href="#preorder-products"
								className="inline-flex items-center rounded-lg bg-white px-6 py-3 font-semibold text-neutral-900 transition-colors hover:bg-neutral-100"
							>
								Shop Preorders
								<svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
								</svg>
							</Link>
							<Link
								href={`/${params.channel}/magic/singles?set=Lorwyn+Eclipsed`}
								className="inline-flex items-center rounded-lg border border-white/30 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
							>
								Browse Singles
							</Link>
						</div>
					</div>
				</div>
			</section>

			{/* Preorder Products Grid */}
			<section id="preorder-products" className="scroll-mt-20 bg-gradient-to-b from-neutral-100 to-white py-12">
				<div className="mx-auto max-w-7xl px-8">
					<div className="mb-8 text-center">
						<h2 className="font-display text-2xl font-bold text-neutral-900">Lorwyn Eclipsed Products</h2>
						<p className="mt-2 text-neutral-600">Secure your preorder today—releases Spring 2026</p>
					</div>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
						{ECL_PREORDER_PRODUCTS.map((product, index) => (
							<Link
								key={product.name}
								href={product.href(params.channel)}
								className="group flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:border-brand-bright-blue hover:shadow-lg"
							>
								<div className="relative mb-3 h-32 w-full">
									<Image
										src={product.image}
										alt={product.name}
										fill
										sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 256px"
										className="object-contain transition-transform group-hover:scale-105"
										loading="eager"
										priority={index < 4}
									/>
								</div>
								<h3 className="text-center text-sm font-semibold text-neutral-900 group-hover:text-brand-bright-blue">
									{product.name}
								</h3>
								<p className="mt-1 text-center text-xs text-neutral-500">{product.description}</p>
							</Link>
						))}
					</div>
				</div>
			</section>

			{/* Search Section */}
			<section className="border-y border-neutral-200 bg-white py-10">
				<div className="mx-auto max-w-3xl px-8 text-center">
					<h2 className="font-display text-xl font-bold text-neutral-900">Find Your Cards</h2>
					<p className="mt-2 text-neutral-600">Search over 100,000 Magic: The Gathering cards</p>
					<form action={handleSearch} className="mx-auto mt-6 max-w-xl">
						<div className="relative">
							<input
								type="text"
								name="search"
								placeholder="Search for cards... (e.g., Lightning Bolt, Black Lotus)"
								className="h-14 w-full rounded-lg border-2 border-neutral-300 bg-white px-5 pr-14 text-lg text-neutral-900 placeholder:text-neutral-400 focus:border-brand-bright-blue focus:outline-none focus:ring-2 focus:ring-brand-bright-blue/20"
							/>
							<button
								type="submit"
								className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-brand-deep-purple p-2.5 text-white transition-colors hover:bg-brand-bright-blue"
							>
								<SearchIcon className="h-5 w-5" />
								<span className="sr-only">Search</span>
							</button>
						</div>
					</form>
				</div>
			</section>

			{/* Store Categories */}
			<section className="bg-white py-10">
				<div className="mx-auto max-w-7xl px-8">
					<h2 className="mb-6 font-display text-xl font-bold text-neutral-900">Shop by Category</h2>
					<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
						{STORE_CATEGORIES.map((category) => {
							const IconComponent = category.icon;
							return (
								<Link
									key={category.name}
									href={category.href(params.channel)}
									className="group flex items-center gap-4 rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:border-brand-deep-purple hover:shadow-md"
								>
									<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-deep-purple/10 text-brand-deep-purple transition-colors group-hover:bg-brand-bright-blue group-hover:text-white">
										<IconComponent className="h-6 w-6" />
									</div>
									<div>
										<h3 className="font-semibold text-neutral-900">
											{category.name}
										</h3>
										<p className="text-sm text-neutral-500">{category.description}</p>
									</div>
								</Link>
							);
						})}
					</div>
				</div>
			</section>

			{/* Recent Magic Sets */}
			{latestSets.length > 0 && (
				<section className="border-t border-neutral-200 bg-neutral-50 py-10">
					<div className="mx-auto max-w-7xl px-8">
						<div className="mb-6 flex items-center justify-between">
							<h2 className="font-display text-xl font-bold text-neutral-900">Recent Magic: The Gathering Sets</h2>
							<Link
								href={`/${params.channel}/magic/sets`}
								className="text-sm font-medium text-mtg-mythic hover:text-mtg-rare"
							>
								View all sets →
							</Link>
						</div>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{latestSets.map((set) => (
								<Link
									key={set.code}
									href={`/${params.channel}/search?query=${encodeURIComponent(set.name)}&set=${encodeURIComponent(set.name)}`}
									className="group flex items-center gap-4 rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 hover:shadow-md"
								>
									{/* Set Icon */}
									<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-100 p-2 group-hover:bg-neutral-200">
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img
											src={set.iconUri}
											alt={`${set.name} set icon`}
											className="h-8 w-8 object-contain"
											style={{ filter: "brightness(0)" }}
											fetchPriority="low"
											loading="lazy"
											onError={(e) => { e.currentTarget.style.display = "none"; }}
										/>
									</div>
									<div className="min-w-0 flex-1">
										<h3 className="truncate font-semibold text-neutral-900 group-hover:text-mtg-mythic">
											{set.name}
										</h3>
										<p className="text-sm text-neutral-500">
											{set.cardCount.toLocaleString()} cards
											<span className="mx-1.5">·</span>
											<span className="uppercase">{set.code}</span>
										</p>
									</div>
								</Link>
							))}
						</div>
					</div>
				</section>
			)}

			{/* Trending Products */}
			{trendingProducts.length > 0 && (
				<section className="mx-auto max-w-7xl p-8 pb-16">
					<div className="mb-8 flex items-center justify-between">
						<h2 className="font-display text-2xl font-bold text-neutral-900">Trending Cards</h2>
						<Link
							href={`/${params.channel}/magic/singles`}
							className="text-sm font-medium text-brand-bright-blue hover:text-brand-deep-purple"
						>
							View all singles →
						</Link>
					</div>
					<ProductList products={trendingProducts} />
				</section>
			)}
		</div>
	);
}
