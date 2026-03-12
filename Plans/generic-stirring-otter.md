# Plan: Scryfall CDN Fallback & Image Delivery Enhancements

## Context

The storefront serves ~100k+ MTG card images directly from Scryfall's Cloudflare CDN (`cards.scryfall.io`), set icon SVGs via a proxy route (`svgs.scryfall.io`), and mana symbols inline. Saleor also generates thumbnails stored on S3/CloudFront for every imported product — but these exist as an unused fallback today.

This plan adds resilient fallback behavior so Scryfall outages don't break the storefront, and makes additional image delivery enhancements that stay within the extension-only constraint (no core Saleor changes).

---

## Component → Image Source Map

| Component | File | Primary Source | Fallback Today | Needs Work |
|-----------|------|---------------|----------------|------------|
| **ProductImageWrapper** | `src/ui/atoms/ProductImageWrapper.tsx` | Props (Scryfall via media[0].url) | None (shimmer stays) | **YES** — add onError fallback |
| **ProductElement** | `src/ui/components/ProductElement.tsx` | `media[0].url` (Scryfall) | `thumbnail.url` (Saleor/CloudFront) at URL-selection level only | **YES** — onError at image level |
| **ManaSymbol** | `src/ui/components/MTGCardAttributes.tsx:56` | `svgs.scryfall.io/card-symbols/` | None (silent fail) | **YES** — add onError hide |
| **SetIcon** | `src/ui/components/SetIcon.tsx` | `/api/scryfall-icon` proxy | Text badge fallback | OK — already handled |
| **SummaryItem** | `src/checkout/sections/Summary/SummaryItem.tsx` | Checkout/order media | PhotoIcon placeholder | OK — already handled |
| **OrderListItem** | `src/ui/components/OrderListItem.tsx` | `media[0].url` / `thumbnail.url` | Conditional render | **YES** — onError at image level |
| **SinglesResultItem** | `src/app/singles-builder/.../SinglesResultItem.tsx` | `thumbnail.url` / `media[0].url` | SVG icon | OK — already handled |
| **CartDrawer** | `src/app/singles-builder/.../CartDrawer.tsx` | `thumbnail.url` | SVG icon | OK — already handled |
| **Home page hero** | `src/app/[channel]/(main)/page.tsx` | Static WebP | N/A (local file) | No |
| **Home page set icons** | Same file, line ~282 | `set.iconUri` (Scryfall) | None | **YES** — add onError hide |
| **Logo/Footer** | Static files | Local `/brand/` | N/A | No |

---

## Changes

### 1. Create `useImageFallback` hook (NEW FILE)

**File:** `storefront/src/ui/hooks/useImageFallback.ts`

A reusable hook that encapsulates the fallback pattern:
- Accepts `primarySrc`, `fallbackSrc`, optional `placeholderSrc`
- Returns `{ src, onError, hasError }`
- On primary error → switches to fallback (single attempt)
- On fallback error → switches to placeholder (or null)
- **No retry loops** — state machine: primary → fallback → placeholder → done

```
States: PRIMARY → FALLBACK → PLACEHOLDER
Each transition fires exactly once via onError.
```

**~25 lines.** This prevents every component from reinventing error handling.

### 2. Upgrade `ProductImageWrapper` to support fallback

**File:** `storefront/src/ui/atoms/ProductImageWrapper.tsx`

- Accept new optional `fallbackSrc` prop
- Use `useImageFallback` hook internally
- On error: swap src to fallback, keep shimmer until fallback loads
- On both fail: remove image, show card-back placeholder or neutral icon
- Shimmer animation continues through fallback transition (no flash of broken image)

**Why here:** ProductImageWrapper is the single component through which all product card images flow. Fix it once, fix it everywhere.

### 3. Wire fallback in `ProductElement`

**File:** `storefront/src/ui/components/ProductElement.tsx`

Currently:
```tsx
const imageUrl = product?.media?.[0]?.url || product?.thumbnail?.url;
```

Change to pass both sources:
```tsx
const primaryUrl = product?.media?.[0]?.url;  // Scryfall
const fallbackUrl = product?.thumbnail?.url;   // Saleor/CloudFront
const imageUrl = primaryUrl || fallbackUrl;
// Pass fallbackSrc={primaryUrl ? fallbackUrl : undefined} to ProductImageWrapper
```

This means:
- If Scryfall URL exists → use it as primary, Saleor thumbnail as fallback
- If only thumbnail exists (non-Scryfall product) → use it directly, no fallback needed

### 4. Add error handling to `ManaSymbol`

**File:** `storefront/src/ui/components/MTGCardAttributes.tsx`

The `ManaSymbol` component (line 56) uses `next/image` with no error handling. On Scryfall failure, it shows a broken image.

- Convert to client component (or extract `ManaSymbol` as client component)
- Add `onError` → hide the broken symbol (set display:none or replace with text like `{G}`)
- Lightweight: just prevent broken image icons from showing

### 5. Add error handling to home page set icons

**File:** `storefront/src/app/[channel]/(main)/page.tsx` (line ~282)

The latest sets section renders `<img src={set.iconUri}>` with no error handling.

- Add `onError` handler to hide the icon on failure
- This is a plain `<img>` tag — just needs `onError={(e) => e.currentTarget.style.display = 'none'}`

### 6. Add fallback to `OrderListItem`

**File:** `storefront/src/ui/components/OrderListItem.tsx`

Same pattern as ProductElement — pass `fallbackSrc` to the Image component. Order images use `thumbnail(size: 256, format: WEBP)` which goes through Saleor/CloudFront, so this is lower risk. But if the media[0].url is a Scryfall URL, it should fall back to thumbnail.

### 7. Add cache headers for static assets in middleware

**File:** `storefront/src/middleware.ts`

Currently the middleware matcher **excludes** static assets (`*.svg|png|jpg|jpeg|gif|webp`) — they bypass middleware entirely and get Next.js default cache headers.

Add a route for `/images/*` static assets with immutable caching:
- Extend matcher to include `/images/*` paths
- Set `Cache-Control: public, max-age=31536000, immutable` for marketing assets
- These are versioned by filename (e.g., `ECL_sma_key_1640x680_en.webp`) — safe to cache forever

**Alternative:** Use `next.config.js` `headers()` function instead of middleware — cleaner separation.

### 8. Enhance scryfall-icon proxy with stale-if-error

**File:** `storefront/src/app/api/scryfall-icon/route.ts`

Currently serves 502 on Scryfall failure. Enhance:
- Cache successful responses to a static file or in-memory Map (simple LRU)
- On Scryfall failure, serve stale cached version if available
- This makes set icons survive Scryfall outages for up to 24h

**Alternative (simpler):** The `next: { revalidate }` in the fetch already provides ISR-style caching. If Scryfall is down, Next.js serves the stale cached version automatically via SWR. Just need to verify this works correctly — the `stale-while-revalidate` header is already set.

---

## Files Modified (Summary)

| File | Change | Effort |
|------|--------|--------|
| `src/ui/hooks/useImageFallback.ts` | **NEW** — reusable fallback hook | 15 min |
| `src/ui/atoms/ProductImageWrapper.tsx` | Add fallback prop + onError | 15 min |
| `src/ui/components/ProductElement.tsx` | Pass primary + fallback URLs | 10 min |
| `src/ui/components/MTGCardAttributes.tsx` | ManaSymbol onError handling | 10 min |
| `src/ui/components/OrderListItem.tsx` | Add fallback pattern | 10 min |
| `src/app/[channel]/(main)/page.tsx` | Set icon onError handling | 5 min |
| `storefront/next.config.js` OR `middleware.ts` | Static asset cache headers | 10 min |
| `src/app/api/scryfall-icon/route.ts` | Verify SWR stale behavior | 10 min |

**Total estimated effort: ~85 minutes**

---

## What We're NOT Changing

- **No core Saleor modifications** — all changes in storefront/ only
- **No CDN infrastructure changes** — CloudFront for Saleor media already works
- **No image proxy service** — Scryfall direct remains primary, Saleor thumbnail is the fallback
- **No import pipeline changes** — `productBulkCreate` already stores both media URL and generates thumbnails
- **No Scryfall API changes** — only the image CDN (`*.scryfall.io`) is used for rendering

---

## Verification Plan

1. **Fallback behavior**: Block `cards.scryfall.io` in browser DevTools Network → verify product images fall back to Saleor thumbnails
2. **No retry loops**: Verify network tab shows at most 2 requests per image (primary + fallback), never more
3. **ManaSymbol graceful fail**: Block `svgs.scryfall.io` → verify mana costs don't show broken images
4. **Set icons**: Block Scryfall → verify set icons degrade to text badges (already working via SetIcon)
5. **Cache headers**: `curl -I` static assets → verify long-lived cache headers
6. **Build passes**: `next build` succeeds with no new errors
7. **Loading states**: Visual check that shimmer persists through fallback transition
