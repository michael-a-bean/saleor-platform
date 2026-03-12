/** @type {import('next').NextConfig} */
const config = {
	reactCompiler: true,
	experimental: {
		optimizePackageImports: ["lucide-react", "lodash-es"],
		instrumentationHook: true,
	},
	images: {
		remotePatterns: [
			// Scryfall card images and SVGs (mana symbols, set icons)
			{
				protocol: "https",
				hostname: "cards.scryfall.io",
			},
			{
				protocol: "https",
				hostname: "*.scryfall.io",
			},
			// CloudFront CDN for Saleor product media and thumbnails
			{
				protocol: "https",
				hostname: "*.cloudfront.net",
			},
			// S3 direct access (staging — will be removed when CloudFront-only enforced)
			{
				protocol: "https",
				hostname: "*.s3.amazonaws.com",
			},
			{
				protocol: "https",
				hostname: "*.s3.*.amazonaws.com",
			},
			// Saleor API media/thumbnail endpoint (local and deployed)
			{
				protocol: "http",
				hostname: "localhost",
			},
			{
				protocol: "https",
				hostname: "*.saleor.cloud",
			},
			// Saleor API thumbnail proxy (staging/production — returns 302 to CloudFront)
			{
				protocol: "https",
				hostname: "*.michaelbean.org",
			},
		],
		// Enable WebP and AVIF for modern browsers
		formats: ["image/avif", "image/webp"],
		// Device sizes optimized for card grids and detail pages
		deviceSizes: [320, 420, 640, 768, 1024, 1280],
		// Image sizes for card thumbnails and icons
		imageSizes: [64, 96, 128, 256, 384],
		// Cache optimized images for 24 hours
		minimumCacheTTL: 86400,
		// RISK ACCEPTANCE: dangerouslyAllowSVG enables SVG optimization through Next.js
		// Image. This is safe because remotePatterns above restrict sources to trusted
		// domains only (Scryfall for mana/set SVGs). XSS risk is mitigated by source
		// restriction — no user-uploaded SVGs are processed through this path.
		dangerouslyAllowSVG: true,
		// Enable optimization for Scryfall (external HTTPS), disable for localhost/Saleor
		// The remotePatterns above allow Next.js to optimize Scryfall images
		// while localhost URLs will fall through unoptimized
		unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === "true",
	},
	async headers() {
		const isDev = process.env.NODE_ENV === "development";
		return [
			// Versioned static assets (hashed filenames) — cache forever
			{
				source: "/_next/static/:path*",
				has: [{ type: "query", key: "v" }],
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=31536000, immutable",
					},
				],
			},
			// Static images — cache forever (immutable filenames)
			{
				source: "/images/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=31536000, immutable",
					},
				],
			},
			// Public assets (fonts, manifest, non-hashed images) — 30 days with SWR
			{
				source: "/fonts/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=2592000, stale-while-revalidate=86400",
					},
				],
			},
			// Development: prevent aggressive caching of dynamic chunks
			...(isDev
				? [
						{
							source: "/_next/static/chunks/:path*",
							headers: [
								{
									key: "Cache-Control",
									value: "no-store, must-revalidate",
								},
							],
						},
					]
				: []),
		];
	},
	typedRoutes: false,
	// used in the Dockerfile
	output:
		process.env.NEXT_OUTPUT === "standalone"
			? "standalone"
			: process.env.NEXT_OUTPUT === "export"
				? "export"
				: undefined,
};

export default config;
