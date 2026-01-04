import { type MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	const baseUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3000";

	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: ["/checkout", "/checkout/*", "/cart", "/orders", "/orders/*", "/api/*"],
			},
		],
		sitemap: `${baseUrl}/sitemap.xml`,
	};
}
