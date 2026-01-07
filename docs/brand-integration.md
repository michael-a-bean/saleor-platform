# Shuffle and Cut Games - Brand Integration Guide

Brand assets for Shuffle and Cut Games, a hobby gaming store specializing in trading card games and tabletop gaming.

## Brand Assets Location

All brand assets are stored in `/branding/client/`:

```
branding/client/
├── guide/                    # Brand guide PDF
├── colors/                   # Color palette (.ase swatch)
├── logo/
│   ├── logotype/            # Horizontal wordmark
│   ├── stacked/             # Stacked wordmark
│   ├── bar/                 # Bar lockups (skate-inspired)
│   ├── shield/              # Badge/shield emblem
│   ├── rolland/             # Mascot lockups
│   └── ogre/                # Ogre character
└── patterns/                # Decorative backgrounds
```

## Color Palette

### Primary Brand Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Deep Purple | `#07074E` | rgb(7, 7, 78) | Primary background, text |
| Bright Blue | `#00B3C5` | rgb(0, 179, 197) | Primary accent, highlights |

### Accent Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Sunny Yellow | `#FFCF01` | rgb(255, 207, 1) | CTAs, highlights, alerts |
| Fresh Green | `#005B23` | rgb(0, 91, 35) | Success states, secondary accent |
| Bleached Bone | `#E3D2B2` | rgb(227, 210, 178) | Neutral backgrounds |

### CSS Variables

```css
:root {
  /* Primary */
  --color-deep-purple: #07074E;
  --color-bright-blue: #00B3C5;

  /* Accent */
  --color-sunny-yellow: #FFCF01;
  --color-fresh-green: #005B23;
  --color-bleached-bone: #E3D2B2;

  /* Semantic aliases */
  --color-primary: var(--color-deep-purple);
  --color-secondary: var(--color-bright-blue);
  --color-accent: var(--color-sunny-yellow);
  --color-success: var(--color-fresh-green);
  --color-surface: var(--color-bleached-bone);
}
```

## Typography

### Primary Typeface: Polymath Display

Used for headings, display text, and the logotype.

| Weight | Usage |
|--------|-------|
| Regular | Body text, subtle details |
| Medium | Subheadings, secondary emphasis |
| Bold | Strong emphasis, key messaging |
| Super | Headlines, display purposes |

### Secondary Typeface: Polymath Text

Used for body copy and extended reading.

| Weight | Usage |
|--------|-------|
| Regular | Body copy |
| Italic | Emphasis within body |
| Semibold | Subtle emphasis |
| Semibold Italic | Combined emphasis |

### Font Licensing

**TODO**: Polymath Display and Polymath Text are commercial fonts. Obtain proper licensing before web deployment. Contact font foundry for webfont licenses.

### Web Font Fallback

Until licensed fonts are available:
```css
font-family: 'Polymath Display', 'Montserrat', 'Helvetica Neue', sans-serif;
font-family: 'Polymath Text', 'Open Sans', 'Helvetica Neue', sans-serif;
```

## Logo Usage

### Recommended for Web

| Context | Asset | Path |
|---------|-------|------|
| Navigation (light bg) | Full Color Logotype | `logo/logotype/S+C_Logotype_FullColor.png` |
| Navigation (dark bg) | White Logotype | `logo/logotype/S+C_Logotype_White.png` |
| Favicon | Shield | `logo/shield/S+C_Logo_Shield_FullColor.png` |
| Footer | Stacked Full Color | `logo/stacked/S+C_Logo_Stacked_FullColor.png` |
| Social/OG Image | Bar lockup | `logo/bar/S+C_Bar_01.png` |

### Clear Space

Maintain clear space equal to the x-height of the "S" character around all logos.

### Minimum Sizes

- Logotype: 120px width minimum
- Stacked: 80px width minimum
- Shield: 32px width minimum

## Mascot: Rolland

Rolland is a friendly 20-sided die (d20) that can:
- Emote and express personality
- Change colors (blue, yellow, green, gradient)
- Move and animate

Use Rolland for:
- Welcome/greeting contexts
- Success celebrations
- Community/social content
- Playful empty states

Assets: `/branding/client/logo/rolland/`

## Patterns

Decorative patterns featuring Rolland in a mid-century geometric design.

| Variant | Usage |
|---------|-------|
| PurpleBlue | Primary brand backgrounds |
| YellowPurple | Accent sections, promotions |

Available in Large and Small scales.

## Implementation TODOs

- [ ] Obtain Polymath Display/Text web font licenses
- [ ] Generate favicon set from shield logo (16x16, 32x32, 180x180, etc.)
- [ ] Create optimized WebP versions of PNG logos
- [ ] Set up logo in storefront header
- [ ] Apply color palette to Tailwind config
- [ ] Create OG image template with bar lockup

## Source Files

The original brand guide PDF is at:
`/branding/client/guide/S+C_BrandGuide_1.0_04.2025.pdf`

Adobe Swatch Exchange file for colors:
`/branding/client/colors/S+C_ColorPalette_1.0_05.2025.ase`

## Missing/Ambiguous Items

1. **SVG logos**: Source only provides EPS (print) and PNG (web-ready). SVG versions would need to be recreated or requested from designer.
2. **Font files**: Polymath Display/Text fonts not included - requires separate licensing.
3. **Favicon set**: Not provided - needs to be generated from shield logo.
