---
name: storefront-branding
description: Add official WotC/MTG graphics and branding to the storefront. Use when implementing marketing materials, banners, or visual identity updates.
---

# Storefront Branding Skill

## When to Use

Use this skill when you need to:
- Add official WotC/MTG marketing graphics
- Create or update banner components
- Implement category-specific theming (MTG colors)
- Update store logo/branding elements

## Prerequisites

### WPN Marketing Materials Access

Official assets require WPN retailer login:
- **Portal**: https://wpn.collaterate.com/content/loginOrRegister
- **Materials Index**: https://wpn.wizards.com/en/marketing-materials
- **Policy**: Review Marketing Materials Policy before use

Available asset categories:
- MTG set-specific (Tarkir: Dragonstorm, Final Fantasy, Innistrad Remastered, etc.)
- MTG Evergreen branding
- Dungeons & Dragons
- Avalon Hill / Hasbro Gaming

## Implementation Plan

### Phase 1: Asset Organization

Create directory structure for marketing assets:

```bash
mkdir -p storefront/public/images/marketing/{banners,logos,sets,colors}
```

Expected asset organization:
```
storefront/public/images/marketing/
├── banners/
│   ├── hero-mtg.jpg           # Homepage hero (1920x400 recommended)
│   ├── hero-mtg-mobile.jpg    # Mobile variant (768x300)
│   └── search-header.jpg      # Search results banner
├── logos/
│   ├── store-logo.svg         # Primary store logo
│   ├── store-logo-light.svg   # Light variant for dark backgrounds
│   └── wpn-badge.svg          # WPN member badge (if applicable)
├── sets/
│   └── {set-code}/            # Per-set marketing art
│       ├── banner.jpg
│       └── icon.svg
└── colors/
    ├── white.jpg              # MTG color identity banners
    ├── blue.jpg
    ├── black.jpg
    ├── red.jpg
    └── green.jpg
```

### Phase 2: Homepage Hero Component

**File**: `storefront/src/ui/components/HeroBanner.tsx`

```typescript
import Image from "next/image";

interface HeroBannerProps {
  title: string;
  subtitle?: string;
  imageSrc: string;
  mobileImageSrc?: string;
}

export function HeroBanner({ title, subtitle, imageSrc, mobileImageSrc }: HeroBannerProps) {
  return (
    <section className="relative h-64 md:h-80 lg:h-96 overflow-hidden">
      {/* Desktop image */}
      <Image
        src={imageSrc}
        alt=""
        fill
        className="object-cover hidden md:block"
        priority
      />
      {/* Mobile image */}
      {mobileImageSrc && (
        <Image
          src={mobileImageSrc}
          alt=""
          fill
          className="object-cover md:hidden"
          priority
        />
      )}
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />
      {/* Content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center text-white px-4">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-2">{title}</h1>
        {subtitle && <p className="text-lg md:text-xl opacity-90">{subtitle}</p>}
      </div>
    </section>
  );
}
```

**Integration point**: `storefront/src/app/[channel]/(main)/page.tsx`

Replace current hero gradient section with HeroBanner component.

### Phase 3: Category Header Component

**File**: `storefront/src/ui/components/CategoryHeader.tsx`

```typescript
import Image from "next/image";

// MTG color identity mapping
const MTG_COLORS: Record<string, { bg: string; accent: string }> = {
  white: { bg: "bg-[#F9FAF4]", accent: "text-amber-800" },
  blue: { bg: "bg-[#0E68AB]", accent: "text-white" },
  black: { bg: "bg-[#150B00]", accent: "text-gray-300" },
  red: { bg: "bg-[#D3202A]", accent: "text-white" },
  green: { bg: "bg-[#00733E]", accent: "text-white" },
};

interface CategoryHeaderProps {
  name: string;
  description?: string;
  colorIdentity?: keyof typeof MTG_COLORS;
  bannerSrc?: string;
}

export function CategoryHeader({ name, description, colorIdentity, bannerSrc }: CategoryHeaderProps) {
  const colors = colorIdentity ? MTG_COLORS[colorIdentity] : null;

  if (bannerSrc) {
    return (
      <div className="relative h-32 md:h-40 mb-8 rounded-lg overflow-hidden">
        <Image src={bannerSrc} alt="" fill className="object-cover" />
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 flex h-full items-center px-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white">{name}</h1>
        </div>
      </div>
    );
  }

  if (colors) {
    return (
      <div className={`${colors.bg} rounded-lg p-6 mb-8`}>
        <h1 className={`text-2xl md:text-3xl font-bold ${colors.accent}`}>{name}</h1>
        {description && <p className={`mt-2 ${colors.accent} opacity-80`}>{description}</p>}
      </div>
    );
  }

  return <h1 className="pb-8 text-xl font-semibold">{name}</h1>;
}
```

**Integration points**:
- `storefront/src/app/[channel]/(main)/categories/[slug]/page.tsx`
- `storefront/src/app/[channel]/(main)/collections/[slug]/page.tsx`

### Phase 4: Navigation Logo Update

**File**: `storefront/src/ui/components/nav/components/NavLinks.tsx`

Current: Text "ACME" link
Target: Replace with Image component using store logo

```typescript
import Image from "next/image";
import Link from "next/link";

// Replace text logo with:
<Link href="/">
  <Image
    src="/images/marketing/logos/store-logo.svg"
    alt="Store Name"
    width={120}
    height={40}
    className="h-10 w-auto"
    priority
  />
</Link>
```

### Phase 5: Footer Attribution

**File**: `storefront/src/ui/components/Footer.tsx`

Add WotC attribution section:

```typescript
<div className="border-t border-neutral-200 mt-8 pt-4 text-xs text-neutral-500">
  <p>
    Wizards of the Coast, Magic: The Gathering, and their logos are trademarks
    of Wizards of the Coast LLC. Used with permission.
  </p>
</div>
```

## Asset Requirements

### Recommended Dimensions

| Asset Type | Desktop | Mobile | Format |
|------------|---------|--------|--------|
| Hero banner | 1920x400 | 768x300 | JPG (optimized) |
| Category banner | 1200x200 | 768x150 | JPG |
| Store logo | 200x60 | - | SVG preferred |
| Set icons | 100x100 | - | SVG or PNG |
| Color banners | 1200x200 | - | JPG |

### Image Optimization

Before adding to `/public/images/`:
1. Compress JPGs to ~80% quality
2. Use WebP where possible (Next.js handles conversion)
3. Keep file sizes under 200KB for banners
4. SVGs for logos/icons (smaller, scalable)

## Testing Checklist

After implementing each phase:

- [ ] Images load on desktop and mobile viewports
- [ ] No layout shift (CLS) - use proper width/height or aspect-ratio
- [ ] Dark/light contrast is readable
- [ ] Lighthouse performance score maintained
- [ ] Responsive behavior at 768px, 1024px, 1440px breakpoints

## Build & Deploy

After adding new images:

```bash
# Rebuild storefront image
docker compose up -d api
docker build --network=host \
  --build-arg NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/ \
  --build-arg NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_DEFAULT_CHANNEL=webstore \
  -t saleor-storefront:local ./storefront

docker compose up -d --force-recreate storefront
```

## Related Files

Key files to modify:
- `storefront/src/app/[channel]/(main)/page.tsx` - Homepage
- `storefront/src/app/[channel]/(main)/categories/[slug]/page.tsx` - Categories
- `storefront/src/app/[channel]/(main)/collections/[slug]/page.tsx` - Collections
- `storefront/src/ui/components/nav/components/NavLinks.tsx` - Logo
- `storefront/src/ui/components/Footer.tsx` - Attribution

Existing MTG-specific components:
- `storefront/src/ui/components/MTGCardAttributes.tsx` - Color constants defined here
