import { type Metadata } from "next";
import Link from "next/link";
import { CollectionsListDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { MagicSubNav } from "@/ui/components/MagicSubNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "MTG Sets",
	description: "Browse all Magic: The Gathering sets - view singles and sealed products by expansion.",
};

export default async function SetsPage(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;
	const { collections } = await executeGraphQL(CollectionsListDocument, {
		variables: { channel: params.channel },
		revalidate: 60,
	});

	// Filter to only MTG set collections (slug starts with "mtg-set-")
	const mtgSets =
		collections?.edges
			.map((e) => e.node)
			.filter((c) => c.slug.startsWith("mtg-set-"))
			.map((c) => ({
				...c,
				// Use collection name if available, otherwise extract from slug
				displayName: c.name || c.slug.replace("mtg-set-", "").toUpperCase(),
			}))
			.sort((a, b) => a.displayName.localeCompare(b.displayName)) || [];

	// Group sets by first letter for easier browsing
	const groupedSets: Record<string, typeof mtgSets> = {};
	mtgSets.forEach((set) => {
		const firstChar = set.displayName.charAt(0).toUpperCase();
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
					<strong>{mtgSets.length}</strong> sets available
				</p>
			</div>

			{sortedKeys.map((letter) => (
				<div key={letter} id={`section-${letter}`} className="mb-8">
					<h2 className="mb-4 border-b border-neutral-200 pb-2 text-lg font-semibold">{letter}</h2>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{groupedSets[letter].map((set) => (
							<Link
								key={set.id}
								href={`/${params.channel}/collections/${set.slug}`}
								className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 transition-colors hover:border-purple-300 hover:bg-purple-50"
							>
								<span className="font-medium text-neutral-900">{set.displayName}</span>
							</Link>
						))}
					</div>
				</div>
			))}

		</div>
	);
}
