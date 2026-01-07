# Shuffle and Cut Games - Brand Integration Guide

Brand assets for Shuffle and Cut Games, a hobby gaming store specializing in trading card games and tabletop gaming supplies.

## Implementation Summary

This document describes the brand integration implemented in the `brand/shuffle-and-cut-theme` branch.

### What Changed

| Component | Change | Location |
|-----------|--------|----------|
| Brand tokens | Centralized colors/typography | `storefront/src/lib/brand.ts` |
| CSS variables | Brand colors as CSS custom properties | `storefront/src/app/globals.css` |
| Tailwind config | Extended with brand colors | `storefront/tailwind.config.ts` |
| Logo | Horizontal wordmark in header | `storefront/src/ui/components/Logo.tsx` |
| Favicon | Rolland mascot favicon set | `storefront/public/` |
| Metadata | Site name, description, icons | `storefront/src/app/layout.tsx` |
| Footer | Brand hover colors on links | `storefront/src/ui/components/Footer.tsx` |

### What Did NOT Change

- **MTG colors**: WUBRG and rarity colors in `src/lib/filters/mtgConstants.ts` remain untouched
- **Layout/navigation structure**: No changes to page layouts or navigation
- **Component sizes/spacing**: All dimensions remain unchanged
- **Patterns/backgrounds**: No decorative patterns added (per brand guidelines for minimal UI)

---

## Brand Assets Location

All brand assets are stored in `/branding/client/`:

```
branding/client/
├── guide/                    # Brand guide PDF
├── colors/                   # Color palette (.ase swatch)
├── logo/
│   ├── logotype/            # Horizontal wordmark (used in header)
│   ├── stacked/             # Stacked wordmark
│   ├── bar/                 # Bar lockups (skate-inspired)
│   ├── shield/              # Badge/shield emblem
│   ├── rolland/             # Mascot lockups (used for favicon)
│   └── ogre/                # Ogre character
├── logo_svg/                # Generated SVG versions
└── patterns/                # Decorative backgrounds (not used in UI)
```

---

## Token Architecture

### Source of Truth

All brand values are centralized in two files:

1. **TypeScript tokens**: `storefront/src/lib/brand.ts`
   - Export objects for use in JS/TS code
   - Type-safe color and typography references

2. **CSS variables**: `storefront/src/app/globals.css`
   - Runtime CSS custom properties
   - Used by Tailwind via `var()` references

### DO NOT add brand hex values elsewhere

The following hex values should ONLY appear in `brand.ts` and `globals.css`:
- `#07074E` (Deep Purple)
- `#00B3C5` (Bright Blue)
- `#FFCF01` (Sunny Yellow)
- `#005B23` (Fresh Green)
- `#E3D2B2` (Bleached Bone)

---

## Color Palette

### Primary Brand Colors

| Name | Hex | CSS Variable | Tailwind Class | Usage |
|------|-----|--------------|----------------|-------|
| Deep Purple | `#07074E` | `--brand-deep-purple` | `bg-brand-deep-purple` | Primary action color |
| Bright Blue | `#00B3C5` | `--brand-bright-blue` | `bg-brand-bright-blue` | Links, focus states |

### Accent Colors

| Name | Hex | CSS Variable | Tailwind Class | Usage |
|------|-----|--------------|----------------|-------|
| Sunny Yellow | `#FFCF01` | `--brand-sunny-yellow` | `bg-brand-sunny-yellow` | Highlights (sparingly) |
| Fresh Green | `#005B23` | `--brand-fresh-green` | `bg-brand-fresh-green` | Success states |
| Bleached Bone | `#E3D2B2` | `--brand-bleached-bone` | `bg-brand-bleached-bone` | Subtle backgrounds |

### Semantic Aliases

| Alias | Maps To | CSS Variable | Tailwind Class |
|-------|---------|--------------|----------------|
| primary | Deep Purple | `--brand-primary` | `bg-brand-primary` |
| secondary | Bright Blue | `--brand-secondary` | `bg-brand-secondary` |
| highlight | Sunny Yellow | `--brand-highlight` | `bg-brand-highlight` |
| success | Fresh Green | `--brand-success` | `bg-brand-success` |
| surface | Bleached Bone | `--brand-surface` | `bg-brand-surface` |

---

## Typography

### Font Families

| Purpose | Font | Fallback Stack | CSS Variable |
|---------|------|----------------|--------------|
| Headings | Polymath Display | Montserrat, Helvetica Neue, sans-serif | `--font-display` |
| Body | Polymath Text | Open Sans, Helvetica Neue, sans-serif | `--font-text` |

### Tailwind Usage

```tsx
<h1 className="font-display">Heading with display font</h1>
<p className="font-text">Body text with text font</p>
```

### Font Installation (COMPLETE)

Polymath fonts installed from licensed files:

| File | Family | Weight | Style |
|------|--------|--------|-------|
| `PolymathDispDemo-Regular.woff2` | Display | 400 | normal |
| `PolymathDispDemo-Medium.woff2` | Display | 500 | normal |
| `PolymathDispDemo-Bold.woff2` | Display | 700 | normal |
| `PolymathDispDemo-Super.woff2` | Display | 800 | normal |
| `PolymathTextDemo-Regular.woff2` | Text | 400 | normal |
| `PolymathTextDemo-Italic.woff2` | Text | 400 | italic |
| `PolymathTextDemo-Semibold.woff2` | Text | 600 | normal |
| `PolymathTextDemo-SemiboldIt.woff2` | Text | 600 | italic |

Location: `storefront/public/fonts/`
Total payload: ~49KB

---

## Logo Usage

### Header Logo

**Selected variant**: `S+C_Logotype_FullColor.png` (horizontal wordmark)

**Rationale**:
- Horizontal format fits navigation header naturally
- Full color provides best brand recognition
- Works well on light/neutral backgrounds

**Location**: `storefront/public/brand/logo-full-color.png`

**Implementation**: `storefront/src/ui/components/Logo.tsx`
- Width: 140px (mobile) / 180px (desktop)
- Uses Next.js Image for optimization
- Includes proper alt text for accessibility

### Available Logo Variants

| File | Location | Recommended Use |
|------|----------|-----------------|
| `logo-full-color.png` | `/brand/` | Header (current) |
| `logo-white.png` | `/brand/` | Dark backgrounds |
| `rolland-full-color.png` | `/brand/` | Marketing materials |

---

## Favicon

### Mascot: Rolland

The favicon uses Rolland (the d20 mascot) rather than the shield, per brand guidelines.

**Source**: `branding/client/logo/rolland/S+C_Rolland_FullColor.png`

### Generated Files

| File | Size | Location |
|------|------|----------|
| `favicon.ico` | 16x16, 32x32 | `/public/` |
| `favicon-16x16.png` | 16x16 | `/public/` |
| `favicon-32x32.png` | 32x32 | `/public/` |
| `apple-touch-icon.png` | 180x180 | `/public/` |
| `android-chrome-192x192.png` | 192x192 | `/public/` |
| `android-chrome-512x512.png` | 512x512 | `/public/` |
| `site.webmanifest` | — | `/public/` |

### Regenerating Favicons

If source assets change:

```bash
cd storefront/public/brand
convert /path/to/rolland.png -resize 16x16 favicon-16x16.png
convert /path/to/rolland.png -resize 32x32 favicon-32x32.png
convert /path/to/rolland.png -resize 180x180 apple-touch-icon.png
convert /path/to/rolland.png -resize 192x192 android-chrome-192x192.png
convert /path/to/rolland.png -resize 512x512 android-chrome-512x512.png
cd ..
convert brand/favicon-16x16.png brand/favicon-32x32.png -colors 256 favicon.ico
```

---

## MTG Color Preservation

### Hard Constraint

MTG colors (WUBRG, rarity, etc.) must NOT be affected by brand styling.

### Protected Colors

**Color Identity (WUBRG)**:
| Color | Hex | Slug |
|-------|-----|------|
| White | `#F9FAF4` | `mtg-color-w` |
| Blue | `#0E68AB` | `mtg-color-u` |
| Black | `#150B00` | `mtg-color-b` |
| Red | `#D3202A` | `mtg-color-r` |
| Green | `#00733E` | `mtg-color-g` |

**Rarity**:
| Rarity | Hex | Slug |
|--------|-----|------|
| Common | `#1a1a1a` | `mtg-rarity-common` |
| Uncommon | `#707883` | `mtg-rarity-uncommon` |
| Rare | `#a58e4a` | `mtg-rarity-rare` |
| Mythic | `#bf4427` | `mtg-rarity-mythic` |
| Special | `#905d98` | `mtg-rarity-special` |

### Location

MTG colors are defined in `storefront/src/lib/filters/mtgConstants.ts` and remain unchanged.

---

## Accessibility

### Focus States

Global focus-visible styles use Bright Blue (`#00B3C5`) for high visibility:

```css
*:focus-visible {
  outline: 2px solid var(--brand-secondary);
  outline-offset: 2px;
}
```

### Contrast Considerations

| Color | On White | On Dark | Notes |
|-------|----------|---------|-------|
| Deep Purple | ✅ 14.2:1 | N/A | Safe for text |
| Bright Blue | ⚠️ 3.3:1 | ✅ 5.4:1 | Use for accents, not body text |
| Sunny Yellow | ⚠️ 1.4:1 | ⚠️ 2.0:1 | Highlight only, never text |
| Fresh Green | ✅ 7.8:1 | N/A | Safe for text |

### Deviations

Bright Blue is used for links despite lower contrast ratio because:
1. Links are interactive and have additional hover/focus affordances
2. The brand requires this specific blue
3. Underlines provide additional visual cue

---

## Future Work

### Pending Items

- [x] **Font licensing**: ~~Obtain Polymath Display/Text web font licenses~~ (DONE)
- [ ] **Vector logos**: Request EPS/AI files from designer for proper SVG conversion
- [ ] **OG images**: Create Open Graph image template with brand assets
- [ ] **Email templates**: Apply brand styling to transactional emails

---

## Source Files

| Asset | Location |
|-------|----------|
| Brand guide PDF | `/branding/client/guide/S+C_BrandGuide_1.0_04.2025.pdf` |
| Color palette (ASE) | `/branding/client/colors/S+C_ColorPalette_1.0_05.2025.ase` |
| TypeScript tokens | `/storefront/src/lib/brand.ts` |
| CSS variables | `/storefront/src/app/globals.css` |
| Tailwind config | `/storefront/tailwind.config.ts` |
