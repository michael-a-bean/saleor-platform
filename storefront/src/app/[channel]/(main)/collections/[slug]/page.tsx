import { type ResolvingMetadata, type Metadata } from "next";
import Link from "next/link";
import { ProductListByCollectionDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { ProductList } from "@/ui/components/ProductList";
import { Breadcrumb } from "@/ui/components/Breadcrumb";
import { Clock, ArrowLeft } from "lucide-react";

export const generateMetadata = async (
	props: { params: Promise<{ slug: string; channel: string }> },
	parent: ResolvingMetadata,
): Promise<Metadata> => {
	const params = await props.params;
	const { collection } = await executeGraphQL(ProductListByCollectionDocument, {
		variables: { slug: params.slug, channel: params.channel },
		revalidate: 60,
	});

	return {
		title: `${collection?.name || "Collection"} | ${collection?.seoTitle || (await parent).title?.absolute}`,
		description:
			collection?.seoDescription || collection?.description || collection?.seoTitle || collection?.name,
	};
};

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ slug: string; channel: string }> }) {
	const params = await props.params;
	const { collection } = await executeGraphQL(ProductListByCollectionDocument, {
		variables: { slug: params.slug, channel: params.channel },
		revalidate: 60,
	});

	// Format slug as display name
	const displayName = params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

	if (!collection || !collection.products) {
		// Show coming soon instead of 404
		return (
			<div className="mx-auto max-w-7xl p-8 pb-16">
				<Breadcrumb
					items={[
						{ label: "Collections", href: `/${params.channel}/collections` },
						{ label: displayName },
					]}
					className="mb-4"
				/>

				<div className="flex min-h-[40vh] flex-col items-center justify-center py-16">
					<div className="text-center">
						<div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-deep-purple/10">
							<Clock className="h-8 w-8 text-brand-deep-purple" />
						</div>
						<h1 className="text-2xl font-bold text-neutral-900">{displayName}</h1>
						<p className="mt-2 text-lg font-medium text-brand-deep-purple">Coming Soon</p>
						<p className="mx-auto mt-4 max-w-md text-neutral-600">
							This collection is being prepared. Check back soon for exciting products!
						</p>
						<Link
							href={`/${params.channel}/`}
							className="mt-6 inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
						>
							<ArrowLeft className="h-4 w-4" />
							Back to Home
						</Link>
					</div>
				</div>
			</div>
		);
	}

	const { name, products } = collection;

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<Breadcrumb
				items={[
					{ label: "Collections", href: `/${params.channel}/collections` },
					{ label: name },
				]}
				className="mb-4"
			/>
			<h1 className="pb-8 text-xl font-semibold">{name}</h1>
			{products.edges.length > 0 ? (
				<ProductList products={products.edges.map((e) => e.node)} />
			) : (
				<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
					<p className="text-neutral-500">No products found in this collection.</p>
					<Link
						href={`/${params.channel}/`}
						className="mt-4 inline-flex items-center text-brand-deep-purple hover:text-brand-bright-blue"
					>
						← Back to home
					</Link>
				</div>
			)}
		</div>
	);
}
