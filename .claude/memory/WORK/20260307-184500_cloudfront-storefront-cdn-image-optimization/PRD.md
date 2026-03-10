---
task: CloudFront storefront CDN with image optimization
slug: 20260307-184500_cloudfront-storefront-cdn-image-optimization
effort: advanced
phase: complete
progress: 28/28
mode: interactive
started: 2026-03-07T18:45:00-08:00
updated: 2026-03-07T18:50:00-08:00
---

## Context

Add a CloudFront distribution in front of the Next.js storefront to serve static assets and optimized images from edge locations, matching the speed of Scryfall-served MTG card images. The existing media CDN (S3-backed CloudFront) stays unchanged. This includes pre-optimizing oversized source images and switching the hero banner to use Next.js Image for AVIF conversion.

### Architecture
- New CloudFront distribution with ALB as origin (storefront only)
- ACM cert in us-east-1 (CloudFront requirement) — provider alias already exists
- DNS cutover: `staging.michaelbean.org` + `www.staging.michaelbean.org` → CloudFront
- API, dashboard, apps DNS records stay pointing to ALB
- Cache behaviors tuned for ecommerce: static assets cached aggressively, HTML respects existing s-maxage=60
- Existing media CDN (E1D0RKJ52XDEZO) unchanged

### Risks
- CloudFront requires ACM cert in us-east-1; existing cert only covers `michaelbean.org` + `www`, not `staging.*`
- ALB host-based routing needs CloudFront to forward Host header correctly
- Checkout/cart must never be cached (already handled by middleware DYNAMIC_PATHS exclusion)
- Certificate validation via DNS may take a few minutes

## Criteria

### Terraform Module: CloudFront Storefront
- [x] ISC-1: New module directory `modules/cloudfront-storefront/` exists with main.tf
- [x] ISC-2: CloudFront distribution has ALB DNS name as custom origin
- [x] ISC-3: Origin protocol policy set to HTTPS-only (ALB has HTTPS)
- [x] ISC-4: Cache behavior for `/_next/static/*` with immutable TTL (31536000s)
- [x] ISC-5: Cache behavior for `/images/*` with immutable TTL (31536000s)
- [x] ISC-6: Cache behavior for `/_next/image*` with 24h TTL and query string forwarding
- [x] ISC-7: Default cache behavior respects origin Cache-Control headers (s-maxage=60)
- [x] ISC-8: Host header forwarded to ALB origin for host-based routing
- [x] ISC-9: Compression enabled on all cache behaviors
- [x] ISC-10: Distribution uses PriceClass_100 (US/Europe)

### ACM Certificate (us-east-1)
- [x] ISC-11: ACM cert resource in us-east-1 for `staging.michaelbean.org` + `*.staging.michaelbean.org`
- [x] ISC-12: DNS validation records created in Route53
- [x] ISC-13: CloudFront distribution references the us-east-1 cert ARN

### DNS Cutover
- [x] ISC-14: Route53 `staging.michaelbean.org` (apex) points to CloudFront alias
- [x] ISC-15: Route53 `www.staging.michaelbean.org` points to CloudFront alias
- [x] ISC-16: Route53 `api.staging.michaelbean.org` still points to ALB (unchanged)
- [x] ISC-17: Route53 `dashboard.staging.michaelbean.org` still points to ALB (unchanged)

### Terraform Integration
- [x] ISC-18: Module wired in root main.tf with `enable_storefront_cdn` variable
- [x] ISC-19: Variables added to variables.tf with defaults (disabled by default)
- [x] ISC-20: staging.tfvars enables `enable_storefront_cdn = true`
- [x] ISC-21: Outputs for storefront CDN distribution ID and domain name
- [x] ISC-22: Common tags applied to all new resources

### Image Optimization: Source Resize
- [x] ISC-23: Product images (MTGECL_EN_DspBx_*, MTGECL_EN_OtrBx_*) resized to max 512px width
- [x] ISC-24: Hero banner images remain at original dimensions (needed for full-bleed)

### Image Optimization: Hero Banner
- [x] ISC-25: AVIF versions of both hero crops generated alongside WebP originals
- [x] ISC-26: `<picture>` sources include AVIF with higher priority than WebP
- [x] ISC-27: `<link rel="preload">` tags updated to include AVIF type

### Anti-Criteria
- [x] ISC-A1: Existing media CloudFront (E1D0RKJ52XDEZO) not modified

## Decisions

- **Hero keeps `<picture>` (art direction)**: The hero uses different crops for mobile (1080x1080) vs desktop (1640x680). `next/image` doesn't support art direction. Instead, pre-generate AVIF versions and add as `<source>` in existing `<picture>`. CloudFront caches both at edge.
- **Preorder product images use `next/image` already**: They just need source resizing (900px → 512px) to reduce optimization overhead.
- **New module, not extending existing cloudfront module**: The media CDN (S3 origin + OAC) and storefront CDN (ALB origin + Host forwarding) are fundamentally different. Separate modules prevent coupling.

## Verification
