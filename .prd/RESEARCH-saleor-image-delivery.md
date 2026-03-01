# Saleor Image Delivery Architecture — Deep Research Report

> **Date:** 2026-02-28
> **Saleor Version:** 3.22
> **Context:** After completing Phases 1-3 of image optimization (responsive images, WebP conversion, `/_next/image` proxy bypass, CDN-first sourcing), we hit a wall: Saleor's thumbnail API returns a 302 redirect (~170ms) before serving from CloudFront. This report investigates the architecture deeply and identifies all viable strategies to go further WITHOUT modifying Saleor core.

---

## Table of Contents

1. [Thumbnail Generation Pipeline](#1-thumbnail-generation-pipeline)
2. [Media Storage Architecture](#2-media-storage-architecture)
3. [The 302 Redirect — Why It Exists](#3-the-302-redirect--why-it-exists)
4. [Thumbnail API Parameters & Options](#4-thumbnail-api-parameters--options)
5. [Community Findings](#5-community-findings)
6. [GitHub Forks & PRs](#6-github-forks--prs)
7. [CDN & Infrastructure Strategies](#7-cdn--infrastructure-strategies)
8. [Direct CloudFront URL Construction](#8-direct-cloudfront-url-construction)
9. [Actionable Recommendations (Ranked)](#9-actionable-recommendations-ranked)
10. [Sources](#10-sources)

---

## 1. Thumbnail Generation Pipeline

### Image Processing Library: Pillow (PIL)

Saleor uses Python's **Pillow** library for all image processing. The implementation lives in:
- `saleor/thumbnail/utils.py` — `ProcessedImage` class
- `saleor/thumbnail/views.py` — `handle_thumbnail()` view
- `saleor/thumbnail/models.py` — `Thumbnail` model
- `saleor/thumbnail/__init__.py` — Constants (sizes, quality)

### Generation Flow (Lazy, On-Demand)

Thumbnails are generated **on first request**, not on upload. The full flow:

```
                                    ┌─────────────────────┐
                                    │  GraphQL Query       │
                                    │  thumbnail(size:256, │
                                    │  format:WEBP)        │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  Dataloader checks   │
                                    │  Thumbnail table     │
                                    │  for (media_id,      │
                                    │   size, format)      │
                                    └──────────┬──────────┘
                                               │
                              ┌────────────────┴────────────────┐
                              │                                 │
                     ┌────────▼────────┐              ┌────────▼────────┐
                     │  FOUND:          │              │  NOT FOUND:      │
                     │  Return direct   │              │  Return proxy    │
                     │  CDN URL         │              │  URL             │
                     │  (0ms overhead)  │              │  (/thumbnail/    │
                     └─────────────────┘              │   {b64id}/       │
                                                      │   {size}/        │
                                                      │   {format}/)     │
                                                      └────────┬────────┘
                                                               │
                                                    ┌──────────▼──────────┐
                                                    │  Browser follows     │
                                                    │  proxy URL           │
                                                    └──────────┬──────────┘
                                                               │
                                                    ┌──────────▼──────────┐
                                                    │  handle_thumbnail()  │
                                                    │  1. Check DB again   │
                                                    │  2. Download from S3 │
                                                    │  3. Pillow resize    │
                                                    │  4. Upload to S3     │
                                                    │  5. Create DB record │
                                                    │  6. 302 redirect     │
                                                    │     to CDN URL       │
                                                    └──────────┬──────────┘
                                                               │
                                                    ┌──────────▼──────────┐
                                                    │  CloudFront serves   │
                                                    │  from S3             │
                                                    │  (~170ms wasted on   │
                                                    │   the 302 hop)       │
                                                    └─────────────────────┘
```

### ProcessedImage Internals

- Uses `python-magic` for MIME type detection (from bytes, not extension)
- Opens source with `PIL.Image.open()`
- Handles EXIF orientation correction (rotates 90/180/270)
- Preserves ICC color profiles
- Resizes using `image.thumbnail((size, size))` — maintains aspect ratio within bounding box
- **Hardcoded quality settings:**
  - JPEG: 70
  - WebP: 70 (lossy)
  - AVIF: 70
- WebP is lossy by default (`LOSSLESS_WEBP = False`), except icon thumbnails
- Progressive JPEG disabled (`PROGRESSIVE_JPEG = False`)
- **None of these are configurable** — no env vars, no settings, no admin panel

---

## 2. Media Storage Architecture

### S3 Key Structure

```
S3 Bucket (saleor-media-staging-*)
├── products/
│   └── product-media/
│       ├── boot.jpg              ← Original upload
│       └── ...
├── thumbnails/
│   ├── products/
│   │   └── product-media/
│   │       ├── boot_thumbnail_128.webp    ← Generated thumbnails
│   │       ├── boot_thumbnail_256.webp
│   │       └── boot_thumbnail_1024.webp
│   └── ...
├── category-backgrounds/         ← Category images
└── collection-backgrounds/       ← Collection images
```

The `Thumbnail` model uses `upload_to="thumbnails"`, so all generated thumbnails go under the `thumbnails/` S3 prefix.

**Filename pattern** (from `prepare_thumbnail_file_name()`):
```
{original_name_without_extension}_thumbnail_{size}.{format}
```

### CloudFront Distribution

Our existing CloudFront (`d30pbahsk8hi4i.cloudfront.net`) already has a dedicated cache behavior for thumbnails:

```hcl
ordered_cache_behavior {
  path_pattern     = "thumbnails/*"
  target_origin_id = "S3-${var.s3_bucket_name}"
  min_ttl          = 3600      # 1 hour
  default_ttl      = 86400     # 24 hours
  max_ttl          = 604800    # 7 days
}
```

**Key insight:** The infrastructure to serve thumbnails directly from S3 via CloudFront already exists. The 302 redirect is only needed because the Saleor API acts as a generation middleman.

### Storage Backend Classes

Defined in `saleor/core/storages.py`:
- `S3MediaStorage(S3Boto3Storage)` — uses `AWS_MEDIA_BUCKET_NAME` + `AWS_MEDIA_CUSTOM_DOMAIN`
- When `AWS_MEDIA_CUSTOM_DOMAIN` is set, `thumbnail.image.url` returns `https://{custom_domain}/{key}` (our CloudFront URL)
- Without it, returns a direct S3 URL (possibly pre-signed)

---

## 3. The 302 Redirect — Why It Exists

### The Code

In `saleor/thumbnail/views.py`, line ~130:
```python
return HttpResponseRedirect(thumbnail.image.url)
```

This is Django's `HttpResponseRedirect`, which returns HTTP 302 by default.

### Why 302, Not 301?

1. **Not a deliberate architectural decision** — The code uses Django's default redirect class with no comment explaining the choice. It appears to be a reasonable default, not a consciously defended decision.
2. **Proxy URL is transient** — The proxy URL's purpose is to trigger thumbnail creation. Once the thumbnail exists, subsequent GraphQL queries return the direct CDN URL instead. The proxy URL was never meant to be permanent.
3. **Storage URLs can change** — Migration between storage backends, credential rotation, or CDN changes would invalidate cached 301 redirects.

### What About Caching the 302?

- **Saleor sets NO cache headers** on the 302 response — no `Cache-Control`, no `ETag`
- **CloudFront default behavior:** Does NOT cache 302 redirects unless explicitly configured
- **Browsers:** Generally do not cache 302 redirects
- This means **every browser visit** to a proxy URL results in a round-trip to the Saleor API server

### The Second-Order Problem

The 302 puts the Saleor API server in the critical rendering path for every product image. For a catalog with 100k+ products, this means:
- API server CPU consumed by redirect handling
- Network latency added to every image load (~170ms measured)
- Risk of API overload during traffic spikes (confirmed by Issue #18655)

---

## 4. Thumbnail API Parameters & Options

### GraphQL Schema

```graphql
type Product {
  thumbnail(size: Int = 4096, format: ThumbnailFormatEnum = ORIGINAL): Image
}

enum ThumbnailFormatEnum {
  ORIGINAL
  WEBP
  AVIF
}
```

Available on: `Product`, `ProductMedia`, `ProductImage`, `Category`, `Collection`, `User`, `OrderLine`

### Valid Sizes (Hardcoded)

Requested sizes are mapped to the nearest value in: `[32, 64, 128, 256, 512, 1024, 2048, 4096]`

There is **no way to request arbitrary sizes** — the `get_thumbnail_size()` function snaps to the nearest valid value.

### Format Support

| Format | Status | Notes |
|--------|--------|-------|
| ORIGINAL | Works | Returns in source format |
| WEBP | Works | Lossy, quality 70 |
| AVIF | Works (with bug) | Quality 70, **transparency broken** (Issue #14236, still open) |

### Configuration Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PUBLIC_URL` | Base URL for proxy URLs | None |
| `AWS_MEDIA_BUCKET_NAME` | S3 bucket for media | None |
| `AWS_MEDIA_CUSTOM_DOMAIN` | CDN domain for direct URLs | None |
| `AWS_QUERYSTRING_AUTH` | Sign S3 URLs | False |

**Cannot be configured (hardcoded):**
- Image quality (70 for all formats)
- Progressive JPEG (disabled)
- Lossless WebP (disabled except icons)
- Available sizes
- Redirect type (302)
- Storage prefix (`thumbnails/`)

---

## 5. Community Findings

### GitHub Issues — Thumbnail Performance

| Issue | Date | Status | Key Finding |
|-------|------|--------|-------------|
| [#18655](https://github.com/saleor/saleor/issues/18655) | 2025 | **OPEN** | **Saleor 3.22 freezes under ~20k image thumbnail load.** User i-barry built custom bulk-generation management command. Saleor CTO (patrys) says scale by connections, not CPU. |
| [#1436](https://github.com/saleor/saleor/issues/1436) | 2017 | Closed | Original performance concern — on-demand generation could trigger 80 simultaneous thumbnails per page load |
| [#4948](https://github.com/saleor/saleor/issues/4948) | 2019 | Closed (stale) | CDN support requested. **Zero Saleor team response.** Closed by stale bot. |
| [#7432](https://github.com/saleor/saleor/issues/7432) | 2021 | Closed | WebP upload broke thumbnails. Fixed architecturally in 3.6 rewrite. |
| [#14236](https://github.com/saleor/saleor/issues/14236) | 2023 | **OPEN** | AVIF transparency bug. Accepted, unfixed. |
| [#17120](https://github.com/saleor/saleor/issues/17120) | 2024 | Closed | Nginx must proxy `/thumbnail/` to Saleor API — it's a Django view, not static. |

### GitHub Discussions

| Discussion | Key Insight |
|------------|-------------|
| [#11117](https://github.com/saleor/saleor/discussions/11117) | Clearest explanation from patrys: "As of 3.12, missing thumbnails return proxy URLs pointing to internal view that builds images on-demand and redirects." |
| [#12285](https://github.com/saleor/saleor/discussions/12285) | 3.6 upgrade broke GCS thumbnails. Unanswered. Shows rough transition for self-hosted. |

### Community Surface Area

- **Stack Overflow:** Zero results for "saleor thumbnail"
- **Reddit:** Zero results for "saleor thumbnail performance"
- **Discord:** Not web-indexable (discord.saleor.io)
- **Primary channel:** GitHub Issues + Discussions only

### Critical Finding: Nobody Has Solved This

No community member has publicly proposed eliminating the 302 hop. The issues filed are about "thumbnails are broken" (configuration), not "thumbnails are slow" (performance). **We appear to be the first to deeply profile this specific latency.**

---

## 6. GitHub Forks & PRs

### The Critical Unmerged PR

**[PR #14663 — "Fix handling thumbnails"](https://github.com/saleor/saleor/pull/14663)** (NEVER MERGED)
- **Author:** jakubkuc (Saleor team member)
- **Date:** 2023-11-07
- **What it proposed:**
  - Change `HttpResponseRedirect` (302) to `HttpResponsePermanentRedirect` (301)
  - Add `Content-Type` header to redirect responses
  - Fix `allow_redirects=True` for image URL validation
- **Status:** CLOSED without merge
- **Why it matters:** This is exactly the 302→301 fix. A Saleor team member proposed it and it was rejected/abandoned. The 301 would let browsers cache the redirect permanently.

### Key PRs That Built the Current System

| PR | Date | What |
|----|------|------|
| [#9988](https://github.com/saleor/saleor/pull/9988) | 2022-07-15 | **THE BIG REWRITE.** Replaced django-versatileimagefield with custom Thumbnail model. Introduced proxy URL + 302 redirect. Added WebP. This created the current architecture. |
| [#11998](https://github.com/saleor/saleor/pull/11998) | 2023-02-16 | Added AVIF + ORIGINAL format support |
| [#13841](https://github.com/saleor/saleor/pull/13841) | 2023-09-26 | Introduced `PUBLIC_URL` env var. Fixed proxy URLs pointing to localhost. |
| [#15698](https://github.com/saleor/saleor/pull/15698) | 2024-03-26 | Uses read replica for thumbnail DB lookups |
| [#18853](https://github.com/saleor/saleor/pull/18853) | 2026-02-24 | Pillow 12 with native AVIF (very recent) |

### Fork Analysis

**No fork has substantially modified the thumbnail system.** Examined forks:
- khaidSmartOSC/saleor_fork — No thumbnail changes
- carlosa54/saleor-fork — No thumbnail changes
- MIYAKAGROUP/miyaka — No thumbnail changes
- marsdevs-com/saleor-backend — Standard Saleor thumbnails

### Official Storefront Comparison

The official [saleor/storefront](https://github.com/saleor/storefront) still:
- Uses standard Next.js `<Image>` without `unoptimized`
- Allows all remote patterns (`hostname: "*"`)
- Double-processes images through `/_next/image`

**We are already ahead of the official implementation** with our `unoptimized` bypass and CDN-first sourcing.

---

## 7. CDN & Infrastructure Strategies

### Strategy A: Pre-Warm All Thumbnails (Highest ROI)

**Concept:** After product import, programmatically hit every proxy URL to force thumbnail generation. Once the `Thumbnail` DB record exists, GraphQL returns the direct CDN URL — the 302 never happens.

**Implementation:**
```typescript
// pre-warm-thumbnails.ts
const SIZES = [128, 256, 1024]; // Our GraphQL query sizes
const FORMAT = 'webp';
const API_BASE = process.env.SALEOR_API_URL;

async function prewarmProduct(mediaId: string) {
  for (const size of SIZES) {
    const proxyUrl = `${API_BASE}/thumbnail/${btoa(`ProductMedia:${mediaId}`)}/` +
                     `${size}/${FORMAT}/`;
    await fetch(proxyUrl, { redirect: 'follow' });
  }
}
```

Run as scheduled ECS task after imports. Similar approach confirmed working by user i-barry in Issue #18655.

**Latency saved:** ~170ms (eliminates proxy URL from GraphQL entirely)
**Cost:** $0 (ECS task)
**Complexity:** Low (1-2 days)

### Strategy B: CloudFront 302 Caching

**Concept:** Put a CloudFront behavior in front of the Saleor API's `/thumbnail/*` path to cache the 302 responses at the edge.

**Key AWS fact:** CloudFront caches 302 responses but does NOT follow them. The browser still makes two HTTP requests. However, the first hop becomes ~10-30ms (edge) instead of ~170ms (API server).

**Latency saved:** ~100-130ms (partial — still two hops, but first hop is cached at edge)
**Cost:** $0
**Complexity:** Low (0.5 days)

### Strategy C: Nginx Sidecar Redirect Follower

**Concept:** Nginx reverse proxy intercepts `/thumbnail/` requests, follows the 302 server-side, caches the final image, and returns it directly.

```nginx
location /thumbnail/ {
  proxy_pass http://saleor_api;
  proxy_cache thumbnails;
  proxy_intercept_errors on;
  error_page 301 302 307 = @handle_redirect;
}

location @handle_redirect {
  set $redirect_target $upstream_http_location;
  proxy_pass $redirect_target;
  proxy_cache thumbnails;
  proxy_cache_valid 200 7d;
}
```

**Latency saved:** ~170ms (first visit: transparent; subsequent: served from nginx cache, ~1-5ms)
**Cost:** ~$5/mo (ECS compute)
**Complexity:** Medium (2-3 days)

### Strategy D: Lambda@Edge Image Processing

**Concept:** Replace Saleor's thumbnail system entirely with CloudFront + Lambda@Edge. Client requests `https://cdn.example.com/products/boot.jpg?w=256&fmt=webp`. Lambda@Edge resizes from S3 originals, caches at edge.

AWS provides a turnkey CloudFormation template: [Dynamic Image Transformation for Amazon CloudFront](https://aws.amazon.com/solutions/implementations/dynamic-image-transformation-for-amazon-cloudfront/)

**Latency saved:** ~170ms + eliminates Saleor from image path entirely
**Cost:** ~$10-20/mo
**Complexity:** Medium-High (3-5 days)

### Strategy E: External Image CDN (imgix, Cloudinary, Bunny)

**Concept:** Point an image CDN directly at S3. It processes, caches, and serves thumbnails without Saleor involvement.

- **imgix:** Connects to S3 as origin source. Priced by origin images (good for large catalogs). ~$100-300/mo.
- **Bunny CDN Optimizer:** Cheapest option ($9.50/mo for 500k images).
- **Cloudinary:** Most features, highest cost.

**Latency saved:** ~170ms (first request ~100-200ms via image CDN, subsequent ~10-30ms from edge cache)
**Cost:** $10-300/mo depending on provider
**Complexity:** Low-Medium (1-2 days)

### Strategy F: imgproxy Self-Hosted

**Concept:** Deploy imgproxy (Go-based, uses libvips) as a sidecar or separate ECS service. Fastest in benchmarks. Docker-ready. Supports AVIF/WebP.

**Latency saved:** ~170ms (replaces Saleor thumbnail processing entirely)
**Cost:** ~$10-30/mo (ECS compute)
**Complexity:** Medium (2-3 days)

---

## 8. Direct CloudFront URL Construction

### Can We Bypass the Proxy Entirely?

**Yes — if thumbnails are pre-warmed.** The S3 key pattern is predictable:

```
thumbnails/{original_path}_thumbnail_{size}.{format}
```

If the original image is at `products/product-media/boot.jpg` and we request 256px WebP:
```
S3 key:  thumbnails/products/product-media/boot_thumbnail_256.webp
CDN URL: https://d30pbahsk8hi4i.cloudfront.net/thumbnails/products/product-media/boot_thumbnail_256.webp
```

### The Catch

The proxy URL uses a base64-encoded GraphQL ID (`UHJvZHVjdE1lZGlhOjE=` = `ProductMedia:1`), NOT the original file path. To construct direct URLs, you need to know the original file path, which requires either:
1. The `ProductMedia.image` field from GraphQL (available via `productMedia { image { url } }`)
2. A database query on the `Thumbnail` model
3. Pre-warming + using the direct URL that GraphQL returns after the `Thumbnail` record exists

### Most Practical Approach

Pre-warm thumbnails (Strategy A), then GraphQL automatically returns direct CloudFront URLs. No URL construction needed.

### Alternative: Build-Time URL Mapping

Query the `thumbnail_thumbnail` table directly:
```sql
SELECT product_media_id, size, format, image
FROM thumbnail_thumbnail
WHERE product_media_id IS NOT NULL;
```

Export as a JSON lookup table for the storefront. This bypasses GraphQL entirely for thumbnail URLs.

---

## 9. Actionable Recommendations (Ranked)

### Tier 1: Quick Wins (Do This Week)

| # | Strategy | Latency Saved | Effort | Cost | Notes |
|---|----------|--------------|--------|------|-------|
| 1 | **Pre-warm thumbnails** after import | ~170ms (eliminates proxy URL) | 1-2 days | $0 | Run as ECS task. Confirmed approach by community (Issue #18655). |
| 2 | **CloudFront 302 caching** | ~100-130ms (partial) | 0.5 days | $0 | Add CloudFront behavior for `/thumbnail/*` with API origin. Safety net for un-warmed thumbnails. |

### Tier 2: Architecture Improvements (Next Sprint)

| # | Strategy | Latency Saved | Effort | Cost | Notes |
|---|----------|--------------|--------|------|-------|
| 3 | **Nginx redirect follower** | ~170ms (cached) | 2-3 days | ~$5/mo | ECS sidecar. Transparent to browser. Catches any pre-warming gaps. |
| 4 | **Service worker cache** | ~170ms on repeat visits | 1 day | $0 | Browser-side. Cache thumbnails in Cache API after first load. |

### Tier 3: Full Replacement (When Ready)

| # | Strategy | Latency Saved | Effort | Cost | Notes |
|---|----------|--------------|--------|------|-------|
| 5 | **Lambda@Edge image processing** | ~170ms + future-proofs | 3-5 days | ~$10-20/mo | AWS-native. Eliminates Saleor from image path entirely. |
| 6 | **imgproxy self-hosted** | ~170ms + better quality | 2-3 days | ~$10-30/mo | Fastest engine. Supports modern formats. |
| 7 | **imgix/Bunny CDN** | ~170ms + managed | 1-2 days | $10-300/mo | Least operational overhead. |

### NOT Recommended

| Strategy | Why Not |
|----------|---------|
| Apply PR #14663 locally (302→301) | Modifies Saleor core. Maintenance burden on upgrades. |
| Modify thumbnail quality settings | Requires core changes. Hardcoded at 70. |
| Switch thumbnail library | Saleor built custom system in 3.6. Library swap = major fork. |

### Recommended Combination

**Pre-warm (Strategy A) + CloudFront 302 caching (Strategy B).**

- Pre-warming ensures 99%+ of GraphQL queries return direct CDN URLs (zero redirect).
- CloudFront 302 caching is a safety net for the 1% of thumbnails not yet warmed (new imports, edge cases).
- Zero additional monthly cost. Total effort: ~2 days.
- If we want to go further later, Lambda@Edge (Strategy D) provides a clean migration path.

---

## 10. Sources

### Saleor Source Code
- [saleor/thumbnail/views.py](https://github.com/saleor/saleor/blob/main/saleor/thumbnail/views.py) — Thumbnail generation view with 302 redirect
- [saleor/thumbnail/utils.py](https://github.com/saleor/saleor/blob/main/saleor/thumbnail/utils.py) — ProcessedImage class, Pillow processing
- [saleor/thumbnail/models.py](https://github.com/saleor/saleor/blob/main/saleor/thumbnail/models.py) — Thumbnail model (`upload_to="thumbnails"`)
- [saleor/thumbnail/__init__.py](https://github.com/saleor/saleor/blob/main/saleor/thumbnail/__init__.py) — Constants (sizes, quality, formats)
- [saleor/core/storages.py](https://github.com/saleor/saleor/blob/main/saleor/core/storages.py) — S3/GCS storage backends
- [saleor/urls.py](https://github.com/saleor/saleor/blob/main/saleor/urls.py) — URL routing for `/thumbnail/`

### GitHub Issues
- [#18655 — Saleor 3.22 thumbnail performance crisis](https://github.com/saleor/saleor/issues/18655) (OPEN)
- [#14236 — AVIF transparency bug](https://github.com/saleor/saleor/issues/14236) (OPEN)
- [#4948 — CDN for media assets](https://github.com/saleor/saleor/issues/4948) (Closed, unanswered)
- [#1436 — Images generation performance](https://github.com/saleor/saleor/issues/1436) (Closed)
- [#7432 — WebP thumbnail bug](https://github.com/saleor/saleor/issues/7432) (Closed)
- [#17120 — All thumbnails broken](https://github.com/saleor/saleor/issues/17120) (Closed)
- [#11267 — Thumbnail URL localhost](https://github.com/saleor/saleor/issues/11267) (Closed)
- [#12748 — PUBLIC_URL env var](https://github.com/saleor/saleor/issues/12748) (Closed)

### GitHub Pull Requests
- [#9988 — Better media thumbnails + WebP (THE REWRITE)](https://github.com/saleor/saleor/pull/9988) (Merged 2022-07)
- [#14663 — Fix handling thumbnails (302→301, NEVER MERGED)](https://github.com/saleor/saleor/pull/14663) (Closed 2023-11)
- [#13841 — PUBLIC_URL env var](https://github.com/saleor/saleor/pull/13841) (Merged 2023-09)
- [#11998 — AVIF + ORIGINAL format](https://github.com/saleor/saleor/pull/11998) (Merged 2023-02)
- [#15698 — Read replica for thumbnail views](https://github.com/saleor/saleor/pull/15698) (Merged 2024-03)
- [#18853 — Pillow 12 native AVIF](https://github.com/saleor/saleor/pull/18853) (Merged 2026-02)
- [#1947 — VersatileImageField prewarmer](https://github.com/saleor/saleor/pull/1947) (Merged 2018-03)

### GitHub Discussions
- [#11117 — Thumbnail URL localhost](https://github.com/saleor/saleor/discussions/11117) — patrys explains proxy URL flow
- [#12285 — v3.6 breaks GCS thumbnails](https://github.com/saleor/saleor/discussions/12285) — Unanswered

### Official Documentation
- [Saleor Thumbnails](https://docs.saleor.io/developer/thumbnails)
- [S3 Media Configuration](https://docs.saleor.io/setup/media-s3)
- [Environment Variables](https://docs.saleor.io/setup/configuration)
- [Product API Reference](https://docs.saleor.io/api-reference/products/objects/product)

### AWS Documentation
- [CloudFront HTTP 3xx processing](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-3xx-status-codes.html)
- [Dynamic Image Transformation for CloudFront](https://aws.amazon.com/solutions/implementations/dynamic-image-transformation-for-amazon-cloudfront/)
- [Lambda@Edge Image Resizing](https://aws.amazon.com/blogs/networking-and-content-delivery/resizing-images-with-amazon-cloudfront-lambdaedge-aws-cdn-blog/)

### External Tools
- [imgproxy](https://imgproxy.net/) — Go-based image processing server
- [imgix S3 Source Setup](https://docs.imgix.com/setup/creating-sources/amazon-s3)
- [Pre-3.6 Thumbnail Architecture](https://saleor-fork.readthedocs.io/en/latest/architecture/thumbnails.html)
