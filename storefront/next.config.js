/** @type {import('next').NextConfig} */
const config = {
	images: {
		remotePatterns: [
			{
				hostname: "*",
			},
		],
		// Skip image optimization to avoid Docker networking issues with localhost URLs
		dangerouslyAllowSVG: true,
		unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED !== "false",
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
