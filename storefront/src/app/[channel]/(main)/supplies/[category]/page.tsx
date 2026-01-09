import { type ResolvingMetadata, type Metadata } from "next";
import Link from "next/link";
import { ProductListByCategoryDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { SuppliesSubNav } from "@/ui/components/SuppliesSubNav";
import { ProductList } from "@/ui/components/ProductList";
import { Clock, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Same categories as in supplies/page.tsx for consistency
const SUPPLY_CATEGORIES = [
	{ name: "Card Sleeves", slug: "card-sleeves" },
	{ name: "Deck Boxes", slug: "deck-boxes" },
	{ name: "Playmats", slug: "playmats" },
	{ name: "Binders", slug: "binders" },
	{ name: "Dice & Counters", slug: "dice-counters" },
	{ name: "Card Storage", slug: "card-storage" },
	{ name: "Hobby Supplies", slug: "hobby-supplies" },
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
		title: `${category?.name || "Category"} | Gaming Supplies | ${(await parent).title?.absolute}`,
		description:
			category?.seoDescription ||
			`Browse ${category?.name || ""} gaming supplies and accessories`,
	};
};

export default async function SuppliesCategoryPage(props: {
	params: Promise<{ category: string; channel: string }>;
}) {
	const params = await props.params;
	const { category } = await executeGraphQL(ProductListByCategoryDocument, {
		variables: { slug: params.category, channel: params.channel },
		revalidate: 60,
	});

	// Find the category info from our static list
	const categoryInfo = SUPPLY_CATEGORIES.find((c) => c.slug === params.category);
	const categoryName = categoryInfo?.name || params.category.replace(/-/g, " ");

	if (!category || !category.products) {
		// Show coming soon instead of 404
		return (
			<div className="mx-auto max-w-7xl p-8 pb-16">
				<Breadcrumb
					items={[
						{ label: "Supplies", href: `/${params.channel}/supplies` },
						{ label: categoryName },
					]}
					className="mb-4"
				/>
				<SuppliesSubNav />

				<div className="flex min-h-[40vh] flex-col items-center justify-center py-16">
					<div className="text-center">
						<div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
							<Clock className="h-8 w-8 text-emerald-600" />
						</div>
						<h1 className="text-2xl font-bold text-neutral-900">{categoryName}</h1>
						<p className="mt-2 text-lg font-medium text-emerald-600">Coming Soon</p>
						<p className="mx-auto mt-4 max-w-md text-neutral-600">
							We're working on adding products to this category. Check back soon!
						</p>
						<Link
							href={`/${params.channel}/supplies`}
							className="mt-6 inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
						>
							<ArrowLeft className="h-4 w-4" />
							Back to Supplies
						</Link>
					</div>
				</div>
			</div>
		);
	}

	const { name, products } = category;

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Supplies", href: "/supplies" },
					{ label: name },
				]}
				className="mb-4"
			/>
			<SuppliesSubNav />

			<div className="flex flex-col gap-8 lg:flex-row">
				{/* Sidebar */}
				<aside className="lg:w-64 lg:flex-shrink-0">
					<div className="sticky top-24 rounded-lg border border-neutral-200 bg-white p-4">
						<h2 className="mb-4 font-semibold text-neutral-900">Supply Categories</h2>
						<nav className="space-y-1">
							{SUPPLY_CATEGORIES.map((cat) => {
								const isActive = cat.slug === params.category;
								return (
									<Link
										key={cat.slug}
										href={`/${params.channel}/supplies/${cat.slug}`}
										className={`block rounded-md px-3 py-2 text-sm transition-colors ${
											isActive
												? "bg-emerald-100 font-medium text-emerald-700"
												: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
										}`}
									>
										{cat.name}
									</Link>
								);
							})}
						</nav>
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
						<ProductList products={products.edges.map((e) => e.node)} />
					) : (
						<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
							<p className="text-neutral-500">No products found in this category.</p>
							<Link
								href={`/${params.channel}/supplies`}
								className="mt-4 inline-flex items-center text-emerald-600 hover:text-emerald-700"
							>
								← Back to all supplies
							</Link>
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
