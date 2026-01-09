import { type Metadata } from "next";
import Link from "next/link";
import { getAllSets } from "@/lib/filters";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { MagicSubNav } from "@/ui/components/MagicSubNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "MTG Sets",
	description: "Browse all Magic: The Gathering sets - view singles and sealed products by expansion.",
};

export default async function SetsPage(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;
	const allSets = await getAllSets();

	// Group sets by first letter for easier browsing
	const groupedSets: Record<string, typeof allSets> = {};
	allSets.forEach((set) => {
		const firstChar = set.name.charAt(0).toUpperCase();
		const key = /[A-Z0-9]/.test(firstChar) ? firstChar : "#";
		if (!groupedSets[key]) {
			groupedSets[key] = [];
		}
		groupedSets[key].push(set);
	});

	const sortedKeys = Object.keys(groupedSets).sort((a, b) => {
		if (a === "#") return 1;
		if (b === "#") return -1;
		return a.localeCompare(b);
	});

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Magic", href: "/magic" },
					{ label: "Sets" },
				]}
				className="mb-4"
			/>
			<MagicSubNav />

			<h1 className="pb-2 text-2xl font-bold">MTG Sets</h1>
			<p className="pb-4 text-neutral-500">
				Browse Magic: The Gathering by set. Each set includes both singles and sealed products.
			</p>

			<div className="mb-8 flex flex-wrap gap-2">
				{sortedKeys.map((letter) => (
					<a
						key={letter}
						href={`#section-${letter}`}
						className="flex h-8 w-8 items-center justify-center rounded bg-neutral-100 text-sm font-medium text-neutral-700 hover:bg-purple-100 hover:text-purple-700"
					>
						{letter}
					</a>
				))}
			</div>

			<div className="mb-6 rounded-lg bg-purple-50 p-4">
				<p className="text-sm text-purple-800">
					<strong>{allSets.length}</strong> sets available
				</p>
			</div>

			{sortedKeys.map((letter) => (
				<div key={letter} id={`section-${letter}`} className="mb-8">
					<h2 className="mb-4 border-b border-neutral-200 pb-2 text-lg font-semibold">{letter}</h2>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{groupedSets[letter].map((set) => (
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
									<h3 className="truncate font-semibold text-neutral-900 group-hover:text-brand-bright-blue">
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
			))}
		</div>
	);
}
