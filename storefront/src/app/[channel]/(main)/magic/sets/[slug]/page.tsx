import { notFound } from "next/navigation";
import { type ResolvingMetadata, type Metadata } from "next";
import Link from "next/link";
import { ProductListByCollectionDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { ProductList } from "@/ui/components/ProductList";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { MagicSubNav } from "@/ui/components/MagicSubNav";

export const dynamic = "force-dynamic";

export const generateMetadata = async (
	props: { params: Promise<{ slug: string; channel: string }> },
	parent: ResolvingMetadata,
): Promise<Metadata> => {
	const params = await props.params;
	const collectionSlug = `mtg-set-${params.slug}`;

	const { collection } = await executeGraphQL(ProductListByCollectionDocument, {
		variables: { slug: collectionSlug, channel: params.channel },
		revalidate: 60,
	});

	return {
		title: `${collection?.name || params.slug.toUpperCase()} | ${(await parent).title?.absolute}`,
		description: collection?.seoDescription || `Browse ${collection?.name || params.slug.toUpperCase()} Magic: The Gathering products`,
	};
};

export default async function SetDetailPage(props: {
	params: Promise<{ slug: string; channel: string }>;
	searchParams: Promise<{ tab?: string }>;
}) {
	const params = await props.params;
	const searchParams = await props.searchParams;
	const collectionSlug = `mtg-set-${params.slug}`;
	const activeTab = searchParams.tab || "all";

	const { collection } = await executeGraphQL(ProductListByCollectionDocument, {
		variables: { slug: collectionSlug, channel: params.channel },
		revalidate: 60,
	});

	if (!collection || !collection.products) {
		notFound();
	}

	const allProducts = collection.products.edges.map((e) => e.node);

	// Split products by checking category slug patterns
	const singles = allProducts.filter((p) =>
		p.category?.name === "Singles" ||
		!p.category?.name?.toLowerCase().includes("booster") &&
		!p.category?.name?.toLowerCase().includes("bundle") &&
		!p.category?.name?.toLowerCase().includes("deck") &&
		!p.category?.name?.toLowerCase().includes("kit") &&
		!p.category?.name?.toLowerCase().includes("secret")
	);
	const sealed = allProducts.filter((p) =>
		p.category?.name?.toLowerCase().includes("booster") ||
		p.category?.name?.toLowerCase().includes("bundle") ||
		p.category?.name?.toLowerCase().includes("deck") ||
		p.category?.name?.toLowerCase().includes("kit") ||
		p.category?.name?.toLowerCase().includes("secret")
	);

	// Filter based on active tab
	const displayProducts =
		activeTab === "singles" ? singles : activeTab === "sealed" ? sealed : allProducts;

	const tabs = [
		{ id: "all", label: "All Products", count: allProducts.length },
		{ id: "singles", label: "Singles", count: singles.length },
		{ id: "sealed", label: "Sealed", count: sealed.length },
	];

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Magic", href: "/magic" },
					{ label: "Sets", href: "/magic/sets" },
					{ label: collection.name },
				]}
				className="mb-4"
			/>
			<MagicSubNav />

			<h1 className="pb-2 text-2xl font-bold">{collection.name}</h1>
			{collection.description && (
				<p className="pb-4 text-neutral-500">{collection.description}</p>
			)}

			<div className="mb-8 flex gap-2 border-b border-neutral-200">
				{tabs.map((tab) => (
					<Link
						key={tab.id}
						href={`/${params.channel}/magic/sets/${params.slug}${tab.id === "all" ? "" : `?tab=${tab.id}`}`}
						className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
							activeTab === tab.id
								? "border-purple-600 text-purple-600"
								: "border-transparent text-neutral-500 hover:text-neutral-700"
						}`}
					>
						{tab.label}
						<span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
							{tab.count}
						</span>
					</Link>
				))}
			</div>

			{displayProducts.length > 0 ? (
				<ProductList products={displayProducts} />
			) : (
				<p className="py-8 text-center text-neutral-500">
					No {activeTab === "singles" ? "singles" : activeTab === "sealed" ? "sealed products" : "products"} found
					in this set.
				</p>
			)}

			<div className="mt-12 flex gap-4 border-t border-neutral-200 pt-8">
				<Link
					href={`/${params.channel}/magic/sets`}
					className="inline-flex items-center text-purple-600 hover:text-purple-700"
				>
					← All Sets
				</Link>
				<Link
					href={`/${params.channel}/magic/sealed`}
					className="inline-flex items-center text-purple-600 hover:text-purple-700"
				>
					Sealed Products →
				</Link>
			</div>
		</div>
	);
}
