import { notFound } from "next/navigation";
import { type ResolvingMetadata, type Metadata } from "next";
import { ProductListByCategoryDocument } from "@/gql/graphql";

export const dynamic = "force-dynamic";
import { executeGraphQL } from "@/lib/graphql";
import { getPaginatedListVariables } from "@/lib/utils";
import { ProductList } from "@/ui/components/ProductList";
import { Pagination } from "@/ui/components/Pagination";

export const generateMetadata = async (
	props: { params: Promise<{ slug: string; channel: string }> },
	parent: ResolvingMetadata,
): Promise<Metadata> => {
	const params = await props.params;
	const { category } = await executeGraphQL(ProductListByCategoryDocument, {
		variables: { slug: params.slug, channel: params.channel },
		revalidate: 60,
	});

	return {
		title: `${category?.name || "Category"} | ${category?.seoTitle || (await parent).title?.absolute}`,
		description: category?.seoDescription || category?.description || category?.seoTitle || category?.name,
	};
};

export default async function Page(props: {
	params: Promise<{ slug: string; channel: string }>;
	searchParams: Promise<{ cursor?: string; direction?: string }>;
}) {
	const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

	const paginationVars = getPaginatedListVariables({ params: searchParams, pageSize: 24 });

	const { category } = await executeGraphQL(ProductListByCategoryDocument, {
		variables: { slug: params.slug, channel: params.channel, ...paginationVars },
		revalidate: 60,
	});

	if (!category || !category.products) {
		notFound();
	}

	const { name, products } = category;
	// Type assertion: codegen types are stale (missing pageInfo/totalCount that exist in .graphql source)
	const productsWithPagination = products as typeof products & {
		totalCount?: number;
		pageInfo?: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor?: string | null; endCursor?: string | null };
	};

	return (
		<div className="mx-auto max-w-7xl p-8 pb-16">
			<h1 className="pb-8 text-xl font-semibold">{name}</h1>
			{productsWithPagination.totalCount != null && (
				<p className="pb-4 text-sm text-neutral-500">{productsWithPagination.totalCount} products</p>
			)}
			<ProductList products={products.edges.map((e) => e.node)} />
			{productsWithPagination.pageInfo && <Pagination pageInfo={productsWithPagination.pageInfo} />}
		</div>
	);
}
