---
name: storefront-dev
description: Develop and build the Next.js storefront. Use for component development, GraphQL codegen, and Docker builds.
---

# Storefront Development Skill

## When to Use

Use this skill when you need to:
- Build or rebuild the storefront Docker image
- Generate GraphQL types
- Run storefront in development mode
- Debug Next.js issues

## Directory Structure

```
storefront/
├── src/
│   ├── app/[channel]/      # Pages (App Router)
│   ├── ui/components/      # React components
│   ├── lib/                # Utilities
│   ├── graphql/            # .graphql files
│   └── gql/                # Generated types (don't edit)
├── Dockerfile
└── package.json
```

## Common Operations

### Build Docker Image

```bash
# Ensure API is running first
docker compose up -d api

# Build with network access for GraphQL introspection
docker build --network=host \
  --build-arg NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/ \
  --build-arg NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_DEFAULT_CHANNEL=webstore \
  -t saleor-storefront:local ./storefront

# Restart container
docker compose up -d --force-recreate storefront
```

### Regenerate GraphQL Types

After modifying `.graphql` files in `storefront/src/graphql/`:

```bash
# Run codegen in container
docker run --rm --network=host \
  -v $(pwd)/storefront:/app -w /app \
  -e NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/ \
  node:20-alpine sh -c "corepack enable && pnpm install && pnpm graphql-codegen"

# Then rebuild Docker image
```

### View Logs

```bash
docker compose logs -f storefront
```

### Check Build Output

```bash
docker compose exec storefront ls -la /app/.next/
```

## Key Patterns

### Dynamic Rendering

Pages using `notFound()`, `redirect()`, or dynamic features need:

```typescript
export const dynamic = "force-dynamic";
```

### Server Components

Default in App Router. Use `"use client"` only when needed.

### GraphQL Queries

1. Create query in `src/graphql/MyQuery.graphql`
2. Run codegen
3. Import from `@/gql/graphql`

```typescript
import { MyQueryDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";

const data = await executeGraphQL(MyQueryDocument, {
  variables: { ... },
  revalidate: 60,
});
```

### Null Safety

Always handle null pricing:

```typescript
const price = product.pricing?.priceRange?.start?.gross
  ? formatMoney(
      product.pricing.priceRange.start.gross.amount,
      product.pricing.priceRange.start.gross.currency
    )
  : "";
```

## Image Serving Strategy

The storefront uses CloudFront CDN with different cache behaviors for different image paths. Choosing the right approach matters for performance.

### Decision: `<img>` vs `next/image`

| Image Type | Use | Why |
|------------|-----|-----|
| **Static assets** in `public/images/` (logos, banners, product marketing) | Direct `<img>` tag | Served from `/images/*` CloudFront cache (immutable, 1 year). No server-side processing. |
| **Art-directed images** (different crops per breakpoint) | `<picture>` with `<source>` | `next/image` doesn't support art direction. Use AVIF sources first, WebP fallback. |
| **Dynamic/external images** (Saleor media, Scryfall CDN) | `next/image` `<Image>` | Needs on-demand resizing and format conversion. Served via `/_next/image` CloudFront cache (24h). |

### Static Image Best Practices

For images in `storefront/public/images/`:

1. **Pre-optimize before committing** — resize to max display size, compress WebP quality
   ```bash
   # Resize to max 512px width (product thumbnails)
   convert input.webp -resize 512x -quality 80 output.webp

   # Generate AVIF for hero/large images (~55% smaller than WebP)
   convert input.webp -quality 50 output.avif
   ```

2. **Use direct `<img>` tags** — bypasses `/_next/image` server-side processing
   ```tsx
   <img
     src="/images/sets/ecl/product.webp"
     alt="Product name"
     width={256}
     height={128}
     loading="eager"        // "lazy" for below-the-fold
     fetchPriority="high"   // "auto" for below-the-fold
     decoding="async"
     className="object-contain"
   />
   ```

3. **Add `<link rel="preload">` for above-the-fold images**
   ```tsx
   {/* In the page component's return, before the main content */}
   <link rel="preload" as="image" href="/images/sets/ecl/product.webp" />

   {/* For art-directed images, specify type and media */}
   <link rel="preload" as="image" type="image/avif"
     href="/images/hero-desktop.avif" media="(min-width: 768px)" />
   ```

4. **Art-directed hero pattern** — AVIF first, WebP fallback
   ```tsx
   <picture>
     <source media="(max-width: 767px)" srcSet="/images/hero-mobile.avif"
       type="image/avif" width={1080} height={1080} />
     <source media="(min-width: 768px)" srcSet="/images/hero-desktop.avif"
       type="image/avif" width={1640} height={680} />
     <source media="(max-width: 767px)" srcSet="/images/hero-mobile.webp"
       type="image/webp" width={1080} height={1080} />
     <source media="(min-width: 768px)" srcSet="/images/hero-desktop.webp"
       type="image/webp" width={1640} height={680} />
     <img src="/images/hero-desktop.webp" alt="..." fetchPriority="high"
       decoding="async" className="h-full w-full object-cover" />
   </picture>
   ```

### CloudFront Cache Behaviors

| Path | TTL | Use Case |
|------|-----|----------|
| `/_next/static/*` | 1 year (immutable) | Hashed JS/CSS bundles |
| `/images/*` | 1 year (immutable) | Static marketing/product images |
| `/_next/image*` | 24h (Accept header in cache key) | Next.js on-demand image optimization |
| `*.ico` | 1 year (immutable) | Favicon |
| Default | Respects origin `s-maxage` (60s) | Dynamic HTML pages |

### Anti-Patterns

- **Don't use `next/image` for static assets in `/public`** — adds unnecessary server-side processing latency on first request. The images are already optimized.
- **Don't commit unoptimized images** — resize to max display dimensions first. A 900px source image displayed at 256px wastes bandwidth.
- **Don't skip `loading="lazy"` on below-the-fold images** — the first 2-4 visible images should be eager, everything else lazy.
- **Don't forget `decoding="async"`** — prevents image decode from blocking the main thread.

## Debugging

### Check API Connectivity

```bash
docker compose exec storefront wget -qO- http://localhost:8000/graphql/ --post-data='{"query":"{__typename}"}' || echo "API unreachable"
```

### View Generated Types

```bash
cat storefront/src/gql/graphql.ts | head -100
```

### Check Environment

```bash
docker compose exec storefront env | grep NEXT
```
