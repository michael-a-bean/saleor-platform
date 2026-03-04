import { type Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { MiniaturesSubNav } from "@/ui/components/MiniaturesSubNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Miniatures",
	description: "Miniature wargames and models - Warhammer 40K, Age of Sigmar, Star Wars Legion, and more.",
};

// Static category list - these slugs should match categories in Saleor
const MINIATURE_CATEGORIES = [
	{ name: "Warhammer 40K", slug: "warhammer-40k", description: "Warhammer 40,000 miniatures and games", emoji: "⚔️" },
	{ name: "Warhammer AoS", slug: "warhammer-aos", description: "Age of Sigmar miniatures and games", emoji: "🏰" },
	{ name: "Star Wars Legion", slug: "star-wars-legion", description: "Star Wars Legion miniatures", emoji: "🌟" },
	{ name: "Other Wargames", slug: "other-wargames", description: "Other miniature wargames and systems", emoji: "🎖️" },
];

export default async function MiniaturesPage(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Miniatures" },
				]}
				className="mb-4"
			/>
			<MiniaturesSubNav />

			<h1 className="pb-2 text-2xl font-bold">Miniatures & Wargames</h1>
			<p className="pb-8 text-neutral-500">
				Miniature wargames and models from Warhammer 40K, Age of Sigmar, Star Wars Legion, and more.
			</p>

			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{MINIATURE_CATEGORIES.map((cat) => (
					<Link
						key={cat.slug}
						href={`/${params.channel}/miniatures/${cat.slug}`}
						className="group relative flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
					>
						<div className="flex h-32 items-center justify-center bg-gradient-to-br from-red-600 to-rose-600">
							<span className="text-4xl">{cat.emoji}</span>
						</div>
						<div className="flex flex-1 flex-col p-4">
							<h2 className="font-semibold text-neutral-900 group-hover:text-red-600">
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
