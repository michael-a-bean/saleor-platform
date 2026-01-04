import { type MetadataRoute } from "next";
import { executeGraphQL } from "@/lib/graphql";
import { SitemapDataDocument } from "@/gql/graphql";

export const dynamic = "force-dynamic";
export const revalidate = 86400; // Revalidate daily

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const baseUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3000";
	const channel = process.env.DEFAULT_CHANNEL || "default-channel";

	const entries: MetadataRoute.Sitemap = [
		{
			url: baseUrl,
			lastModified: new Date(),
			changeFrequency: "daily",
			priority: 1,
		},
	];

	try {
		const data = await executeGraphQL(SitemapDataDocument, {
			variables: { channel },
			revalidate: 86400,
			withAuth: false,
		});

		// Add categories
		data.categories?.edges?.forEach(({ node }) => {
			if (node.slug) {
				entries.push({
					url: `${baseUrl}/${channel}/categories/${node.slug}`,
					changeFrequency: "weekly",
					priority: 0.8,
				});
			}
		});

		// Add collections
		data.collections?.edges?.forEach(({ node }) => {
			if (node.slug) {
				entries.push({
					url: `${baseUrl}/${channel}/collections/${node.slug}`,
					changeFrequency: "weekly",
					priority: 0.8,
				});
			}
		});

		// Add CMS pages
		data.pages?.edges?.forEach(({ node }) => {
			if (node.slug) {
				entries.push({
					url: `${baseUrl}/${channel}/pages/${node.slug}`,
					changeFrequency: "monthly",
					priority: 0.5,
				});
			}
		});

		// Add products (most recently modified)
		data.products?.edges?.forEach(({ node }) => {
			if (node.slug) {
				entries.push({
					url: `${baseUrl}/${channel}/products/${encodeURIComponent(node.slug)}`,
					lastModified: node.updatedAt ? new Date(node.updatedAt) : undefined,
					changeFrequency: "daily",
					priority: 0.7,
				});
			}
		});
	} catch (error) {
		// Log error but return basic sitemap
		if (process.env.NODE_ENV === "development") {
			console.error("Sitemap generation error:", error);
		}
	}

	return entries;
}
