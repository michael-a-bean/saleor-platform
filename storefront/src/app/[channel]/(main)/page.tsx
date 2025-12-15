import { redirect } from "next/navigation";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { ProductList } from "@/ui/components/ProductList";
import { getLatestSets, getTrendingProducts } from "@/lib/filters";

// Force dynamic rendering for pages with dynamic nav components
export const dynamic = "force-dynamic";

export const metadata = {
	title: "MTG Card Marketplace",
	description:
		"Browse over 100,000 Magic: The Gathering cards. Find commons, rares, mythics, and more.",
};

export default async function Page(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;

	// Fetch trending products and latest sets in parallel
	const [trendingProducts, latestSets] = await Promise.all([
		getTrendingProducts(params.channel, 12),
		getLatestSets(params.channel, 9),
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
			{/* Hero Section */}
			<section className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 py-16 text-white">
				<div className="mx-auto max-w-4xl px-8 text-center">
					<h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
						MTG Card Marketplace
					</h1>
					<p className="mt-4 text-lg text-neutral-300">
						Browse over 100,000 Magic: The Gathering cards
					</p>

					{/* Hero Search */}
					<form action={handleSearch} className="mx-auto mt-8 max-w-xl">
						<div className="relative">
							<input
								type="text"
								name="search"
								placeholder="Search for cards... (e.g., Lightning Bolt, Black Lotus)"
								className="h-14 w-full rounded-lg border-2 border-neutral-600 bg-neutral-800 px-5 pr-14 text-lg text-white placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
							/>
							<button
								type="submit"
								className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-amber-500 p-2.5 text-neutral-900 transition-colors hover:bg-amber-400"
							>
								<SearchIcon className="h-5 w-5" />
								<span className="sr-only">Search</span>
							</button>
						</div>
					</form>
				</div>
			</section>

			{/* Browse Latest Sets */}
			{latestSets.length > 0 && (
				<section className="border-b border-neutral-200 bg-neutral-50 py-10">
					<div className="mx-auto max-w-7xl px-8">
						<div className="mb-6 flex items-center justify-between">
							<h2 className="text-xl font-bold text-neutral-900">Browse Latest Sets</h2>
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
										/>
									</div>
									<div className="min-w-0 flex-1">
										<h3 className="truncate font-semibold text-neutral-900 group-hover:text-amber-600">
											{set.name}
										</h3>
										<p className="text-sm text-neutral-500">
											{set.productCount.toLocaleString()} cards
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
			<section className="mx-auto max-w-7xl p-8 pb-16">
				<div className="mb-8 flex items-center justify-between">
					<h2 className="text-2xl font-bold text-neutral-900">Trending Cards</h2>
					<Link
						href={`/${params.channel}/products`}
						className="text-sm font-medium text-amber-600 hover:text-amber-700"
					>
						View all cards →
					</Link>
				</div>
				{trendingProducts.length > 0 ? (
					<ProductList products={trendingProducts} />
				) : (
					<p className="py-12 text-center text-neutral-500">No products found</p>
				)}
			</section>
		</div>
	);
}
