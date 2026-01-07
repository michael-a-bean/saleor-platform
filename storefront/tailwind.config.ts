import TypographyPlugin from "@tailwindcss/typography";
import FormPlugin from "@tailwindcss/forms";
import ContainerQueriesPlugin from "@tailwindcss/container-queries";
import { type Config } from "tailwindcss";

/**
 * Shuffle and Cut Games - Tailwind Configuration
 *
 * Brand tokens are centralized in src/lib/brand.ts and globals.css.
 * This config extends Tailwind with brand-specific utilities.
 *
 * IMPORTANT: MTG colors (WUBRG, rarity) are NOT defined here.
 * They are managed separately in src/lib/filters/mtgConstants.ts.
 */

const config: Config = {
	content: ["./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			// Brand color palette
			colors: {
				brand: {
					// Primary brand colors
					"deep-purple": "var(--brand-deep-purple)",
					"bright-blue": "var(--brand-bright-blue)",

					// Accent colors
					"sunny-yellow": "var(--brand-sunny-yellow)",
					"fresh-green": "var(--brand-fresh-green)",
					"bleached-bone": "var(--brand-bleached-bone)",

					// Semantic aliases
					primary: "var(--brand-primary)",
					secondary: "var(--brand-secondary)",
					highlight: "var(--brand-highlight)",
					success: "var(--brand-success)",
					surface: "var(--brand-surface)",
				},
			},

			// Brand typography
			fontFamily: {
				display: ["var(--font-display)"],
				text: ["var(--font-text)"],
			},

			// Subtle border radius adjustments (brand uses slightly rounded corners)
			borderRadius: {
				brand: "0.375rem", // 6px - consistent with brand style
			},
		},
	},
	plugins: [TypographyPlugin, FormPlugin, ContainerQueriesPlugin],
};

export default config;
