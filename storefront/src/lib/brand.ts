/**
 * Shuffle and Cut Games - Brand Tokens
 *
 * This is the SINGLE SOURCE OF TRUTH for brand colors and typography.
 * Do NOT add brand hex values elsewhere in the codebase.
 *
 * MTG-specific colors (WUBRG, rarity, etc.) are defined separately
 * in src/lib/filters/mtgConstants.ts and must not be overridden.
 */

// ============================================================================
// BRAND COLORS
// ============================================================================

export const brandColors = {
	// Primary Brand Colors
	deepPurple: "#07074E",
	brightBlue: "#00B3C5",

	// Accent Colors
	sunnyYellow: "#FFCF01",
	freshGreen: "#005B23",
	bleachedBone: "#E3D2B2",
} as const;

// Semantic color mapping for UI elements
export const semanticColors = {
	// Primary action color (buttons, important CTAs)
	primary: brandColors.deepPurple,

	// Secondary/accent color (links, focus states, interactive elements)
	secondary: brandColors.brightBlue,

	// Highlight color (badges, alerts, promotions - use sparingly)
	highlight: brandColors.sunnyYellow,

	// Success states
	success: brandColors.freshGreen,

	// Subtle background surfaces
	surface: brandColors.bleachedBone,
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const typography = {
	// Display font for headings and logos
	// Polymath Display is the brand typeface - fallbacks for when unavailable
	display: "'Polymath Display', 'Montserrat', 'Helvetica Neue', sans-serif",

	// Text font for body copy
	// Polymath Text is the brand typeface - fallbacks for when unavailable
	text: "'Polymath Text', 'Open Sans', 'Helvetica Neue', sans-serif",

	// Mono font for code/technical content (unchanged from system)
	mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
} as const;

// ============================================================================
// DESIGN TOKENS
// ============================================================================

export const designTokens = {
	// Border radius scale
	radius: {
		sm: "0.25rem", // 4px
		md: "0.375rem", // 6px
		lg: "0.5rem", // 8px
		xl: "0.75rem", // 12px
		full: "9999px",
	},

	// Focus ring for accessibility
	focus: {
		ring: `0 0 0 2px ${brandColors.brightBlue}`,
		ringOffset: "2px",
	},
} as const;

// ============================================================================
// CSS VARIABLE NAMES
// These map to the CSS custom properties defined in globals.css
// ============================================================================

export const cssVars = {
	// Colors
	"--brand-deep-purple": brandColors.deepPurple,
	"--brand-bright-blue": brandColors.brightBlue,
	"--brand-sunny-yellow": brandColors.sunnyYellow,
	"--brand-fresh-green": brandColors.freshGreen,
	"--brand-bleached-bone": brandColors.bleachedBone,

	// Semantic
	"--brand-primary": semanticColors.primary,
	"--brand-secondary": semanticColors.secondary,
	"--brand-highlight": semanticColors.highlight,
	"--brand-success": semanticColors.success,
	"--brand-surface": semanticColors.surface,

	// Typography
	"--font-display": typography.display,
	"--font-text": typography.text,
} as const;

// Type exports for TypeScript consumers
export type BrandColor = keyof typeof brandColors;
export type SemanticColor = keyof typeof semanticColors;
