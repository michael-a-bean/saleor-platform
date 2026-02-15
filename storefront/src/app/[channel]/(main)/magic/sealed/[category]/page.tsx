import { notFound } from "next/navigation";
import { type ResolvingMetadata, type Metadata } from "next";
import Link from "next/link";
import { ProductListByCategoryDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { MagicSubNav } from "@/ui/components/MagicSubNav";
import { SealedCategoryFilter } from "@/ui/components/SealedCategoryFilter";

export const revalidate = 60;

// Same categories as in sealed/page.tsx for consistency
const SEALED_CATEGORIES = [
	{ name: "Play Booster Boxes", slug: "play-booster-boxes" },
	{ name: "Collector Booster Boxes", slug: "collector-booster-boxes" },
	{ name: "Draft Booster Boxes", slug: "draft-booster-boxes" },
	{ name: "Set Booster Boxes", slug: "set-booster-boxes" },
	{ name: "Play Booster Packs", slug: "play-booster-packs" },
	{ name: "Collector Booster Packs", slug: "collector-booster-packs" },
	{ name: "Jumpstart Boosters", slug: "jumpstart-boosters" },
	{ name: "Bundles", slug: "bundles" },
	{ name: "Commander Decks", slug: "commander-decks" },
	{ name: "Challenger Decks", slug: "challenger-decks" },
	{ name: "Starter Kits", slug: "starter-kits" },
	{ name: "Prerelease Kits", slug: "prerelease-kits" },
	{ name: "Secret Lair", slug: "secret-lair" },
	{ name: "Premium Collections", slug: "premium-collections" },
];

export const generateMetadata = async (
	props: { params: Promise<{ category: string; channel: string }> },
	parent: ResolvingMetadata,
): Promise<Metadata> => {
	const params = await props.params;
	const { category } = await executeGraphQL(ProductListByCategoryDocument, {
		variables: { slug: params.category, channel: params.channel },
		revalidate: 60,
	});

	return {
		title: `${category?.name || "Category"} | Magic: The Gathering Sealed | ${(await parent).title?.absolute}`,
		description:
			category?.seoDescription ||
			`Browse ${category?.name || "sealed"} Magic: The Gathering products`,
	};
};

export default async function SealedCategoryPage(props: {
	params: Promise<{ category: string; channel: string }>;
}) {
	const params = await props.params;
	const { category } = await executeGraphQL(ProductListByCategoryDocument, {
		variables: { slug: params.category, channel: params.channel },
		revalidate: 60,
	});

	if (!category || !category.products) {
		notFound();
	}

	const { name, products } = category;

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Magic: The Gathering", href: "/magic" },
					{ label: "Sealed", href: "/magic/sealed" },
					{ label: name },
				]}
				className="mb-4"
			/>
			<MagicSubNav />

			<div className="flex flex-col gap-8 lg:flex-row">
				{/* Sidebar */}
				<aside className="lg:w-64 lg:flex-shrink-0">
					<div className="sticky top-24 rounded-lg border border-neutral-200 bg-white p-4">
						<h2 className="mb-4 font-semibold text-neutral-900">Sealed Categories</h2>
						<nav className="space-y-1">
							{SEALED_CATEGORIES.map((cat) => {
								const isActive = cat.slug === params.category;
								return (
									<Link
										key={cat.slug}
										href={`/${params.channel}/magic/sealed/${cat.slug}`}
										className={`block rounded-md px-3 py-2 text-sm transition-colors ${
											isActive
												? "bg-purple-100 font-medium text-purple-700"
												: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
										}`}
									>
										{cat.name}
									</Link>
								);
							})}
						</nav>

						<div className="mt-6 border-t border-neutral-200 pt-4">
							<Link
								href={`/${params.channel}/magic/sets`}
								className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700"
							>
								<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
									/>
								</svg>
								Browse by Set
							</Link>
						</div>
					</div>
				</aside>

				{/* Main Content */}
				<main className="flex-1">
					<div className="mb-6">
						<h1 className="text-2xl font-bold">{name}</h1>
						<p className="mt-1 text-neutral-500">
							{products.edges.length} {products.edges.length === 1 ? "product" : "products"}
						</p>
					</div>

					{products.edges.length > 0 ? (
						<SealedCategoryFilter products={products.edges.map((e) => e.node)} />
					) : (
						<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
							<p className="text-neutral-500">No products found in this category.</p>
							<Link
								href={`/${params.channel}/magic/sealed`}
								className="mt-4 inline-flex items-center text-purple-600 hover:text-purple-700"
							>
								← Back to all sealed products
							</Link>
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
