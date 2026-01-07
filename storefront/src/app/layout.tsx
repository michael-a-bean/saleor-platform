import { Inter, Montserrat, Open_Sans } from "next/font/google";
import "./globals.css";
import { Suspense, type ReactNode } from "react";
import { type Metadata } from "next";
import { DraftModeNotification } from "@/ui/components/DraftModeNotification";

// Google Fonts as fallbacks for Polymath (loaded via @font-face in globals.css)
const montserrat = Montserrat({
	subsets: ["latin"],
	variable: "--font-display-fallback",
	display: "swap",
});

const openSans = Open_Sans({
	subsets: ["latin"],
	variable: "--font-text-fallback",
	display: "swap",
});

// Base sans-serif
const inter = Inter({ subsets: ["latin"] });

const SITE_NAME = "Shuffle and Cut Games";
const SITE_DESCRIPTION =
	"Your local game store for Magic: The Gathering singles, sealed products, and tabletop gaming supplies.";

export const metadata: Metadata = {
	title: {
		default: SITE_NAME,
		template: `%s | ${SITE_NAME}`,
	},
	description: SITE_DESCRIPTION,
	// Always provide a metadataBase to avoid warnings about OG/Twitter images
	// Falls back to localhost for development; should always be set in production via env
	metadataBase: new URL(process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3000"),
	// Favicon set using Rolland mascot
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "any" },
			{ url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
			{ url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
		],
		apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
	},
	manifest: "/site.webmanifest",
	openGraph: {
		title: SITE_NAME,
		description: SITE_DESCRIPTION,
		type: "website",
		siteName: SITE_NAME,
	},
	twitter: {
		card: "summary_large_image",
		title: SITE_NAME,
		description: SITE_DESCRIPTION,
	},
};

export default function RootLayout(props: { children: ReactNode }) {
	const { children } = props;

	return (
		<html lang="en" className="min-h-dvh">
			<body
				className={`${inter.className} ${montserrat.variable} ${openSans.variable} min-h-dvh`}
			>
				{children}
				<Suspense>
					<DraftModeNotification />
				</Suspense>
			</body>
		</html>
	);
}
