# Investigation: Staging Image Display Issues

**Date:** 2026-01-25
**Status:** ✅ RESOLVED (2026-01-26)
**Priority:** High

---

## Executive Summary

Images display correctly in local Docker environment but fail to load in staging (AWS ECS). Root cause identified: ProductMedia records exist with `external_url` references to Scryfall, but no actual image files were uploaded to S3. Saleor's `/thumbnail/` endpoint returns 404 because it cannot serve external URLs.

### Resolution Summary (2026-01-26)

**All issues have been resolved:**

1. **Added `AWS_MEDIA_BUCKET_NAME` env var** to ECS task definitions (API, Worker, Migrate)
2. **Cleaned up 92,609 broken ProductMedia records** using `cleanup_broken_media.py`
3. **Backfilled 92,549 images** (~10GB) to S3 using `backfill_product_media.py`
4. **Enabled public read access** on S3 bucket for products/* and thumbnails/*
5. **Thumbnail endpoint now returns valid images**

```bash
# Before: 404
curl -I "http://staging-alb.../thumbnail/.../256/"
# HTTP/1.1 404 Not Found

# After: 302 redirect to S3, then 200 OK
curl -sL "http://staging-alb.../thumbnail/.../256/" -o test.jpg
# JPEG image data, 184x256 pixels
```

---

## Problem Statement

1. **Images not displaying in staging** - Product images show broken/missing in staging storefront
2. **Products may have different attributes** between local and staging environments
3. **Need for consolidated Scryfall App** - Current architecture uses scattered scripts

---

## Investigation Findings

### 1. Image Display Root Cause

**Discovery Path:**
```
GraphQL query → media.url returns /thumbnail/... URLs → /thumbnail/ returns 404 → S3 bucket is empty
```

**Evidence:**

```bash
# Staging API returns thumbnail URLs
curl "http://staging-alb.../graphql/" -d '{"query": "{ products(first:1) { edges { node { media { url } } } } }"}'
# Returns: "url": "http://staging-alb.../thumbnail/UHJvZHVjdE1lZGlhOjM=/4096/"

# Thumbnail endpoint returns 404
curl -I "http://staging-alb.../thumbnail/UHJvZHVjdE1lZGlhOjM=/256/"
# Returns: HTTP/1.1 404 Not Found

# S3 bucket is nearly empty (no media files)
aws s3 ls s3://saleor-platform-media-staging-546464732019/ --recursive
# Returns: Only scripts/meili_sync.py (no images)
```

**Root Cause Chain:**
1. Staging import used `import_command.py` (Django management command)
2. This creates `ProductMedia` with `external_url` pointing to Scryfall CDN
3. No actual files uploaded to S3
4. Saleor's `/thumbnail/` endpoint expects files in S3/local storage
5. Cannot proxy external URLs → returns 404

### 2. Local vs Staging Differences

| Aspect | Local | Staging |
|--------|-------|---------|
| Products | Sealed products (no images) | MTG cards (with broken images) |
| Media Storage | Docker volume `/app/media/` | S3 bucket (empty) |
| ProductMedia | None or with files | `external_url` to Scryfall |
| Import Method | Unknown | `import_command.py` |

### 3. CSP Configuration Issue (Secondary)

**Fixed in this session:** Missing Scryfall domains in Content Security Policy.

```typescript
// storefront/src/middleware.ts - BEFORE
const TRUSTED_IMAGE_DOMAINS = [
  "https://cards.scryfall.io",
  "https://c2.scryfall.com",  // Missing c1!
  // Missing svgs.scryfall.io
];

// AFTER (fixed)
const TRUSTED_IMAGE_DOMAINS = [
  "https://cards.scryfall.io",
  "https://c1.scryfall.com",
  "https://c2.scryfall.com",
  "https://svgs.scryfall.io",
  // ...
];
```

**Note:** This fix alone won't resolve images - the primary issue is missing S3 files.

---

## Council Debate Summary

Convened 4-agent council (Architect, Engineer, Researcher, Security) for 3-round debate.

### Key Consensus Points

1. **Root cause is NOT CSP** - It's missing files in S3
2. **ProductMedia uses `external_url`** - Not uploaded files
3. **Saleor's `/thumbnail/` can't proxy external URLs**
4. **Scryfall App makes long-term sense** - Consolidate scattered scripts
5. **Image caching layer recommended** - Reduce Scryfall CDN dependency

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Future: Scryfall App                        │
├─────────────────────────────────────────────────────────────────┤
│  Modules:                                                       │
│  - Bulk Import (with progress tracking)                         │
│  - Incremental Updates (webhook-driven)                         │
│  - Price Sync (integrate existing price-sync worker)            │
│  - Image Proxy/Cache (optional: reduce Scryfall dependency)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scryfall API Guidelines (MUST FOLLOW)

**Source:** https://scryfall.com/docs/api

### Rate Limits
- **API (`api.scryfall.com`):** 50-100ms between requests (~10 req/sec)
- **Image CDN (`cards.scryfall.io`):** NO rate limit
- **Bulk data downloads:** NO rate limit

### Allowed Practices
- ✅ Hotlinking to `cards.scryfall.io`
- ✅ Caching images locally (encouraged for 24+ hours)
- ✅ Using bulk data files (updated every 12 hours)
- ✅ Downloading from image CDN (no rate limit)

### Prohibited Practices
- ❌ Paywalling Scryfall data
- ❌ Simply repackaging without adding value
- ❌ Cropping/covering copyright or artist names
- ❌ Distorting, blurring, or color-shifting images

### CDN Domain Changes (Important)
**Deprecated (being retired):**
- `c1.scryfall.com`
- `c2.scryfall.com`
- `c3.scryfall.com`

**New domain:**
- `cards.scryfall.io`

---

## Solutions

### Solution A: Run Backfill Script (Recommended - Quick Fix)

Run `backfill_product_media.py` against staging to download images from Scryfall and upload to S3.

**Script Location:** `scripts/backfill_product_media.py`

**What it does:**
1. Queries products without working media
2. Fetches card data from Scryfall API (respects 100ms rate limit)
3. Calls `productMediaCreate` with `mediaUrl` parameter
4. Saleor downloads image and stores in S3
5. Stores original Scryfall URL in metadata

**Commands:**
```bash
# Set environment variables
export SALEOR_API_URL="http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/graphql/"
export SALEOR_API_TOKEN="<staging-app-token>"  # Must be App token, not user token

# Test with small batch first
python scripts/backfill_product_media.py --channel webstore --limit 100 --dry-run

# Run actual backfill (start small)
python scripts/backfill_product_media.py --channel webstore --limit 100

# Full backfill (after testing)
python scripts/backfill_product_media.py --channel webstore
```

**Prerequisites:**
- Staging API must be running and healthy
- Need Saleor App token with `MANAGE_PRODUCTS` permission
- S3 bucket permissions must allow API to write

### Solution B: Build Scryfall App (Long-term)

Consolidate all Scryfall-related functionality into a dedicated Saleor App.

**Proposed Modules:**

| Module | Purpose | Priority |
|--------|---------|----------|
| `bulk-import` | Initial product/variant import with progress tracking | P1 |
| `image-sync` | Download and cache images to S3 | P1 |
| `price-sync` | Integrate existing price-sync worker | P2 |
| `incremental-update` | Webhook for new set releases | P3 |
| `image-proxy` | Optional CDN caching layer | P4 |

**Technology Stack:**
- Next.js (consistent with other apps)
- Prisma (if needs own database)
- Saleor App SDK

**Location:** `saleor-apps/apps/scryfall/`

---

## Files Changed in This Session

### Modified
```
storefront/src/middleware.ts          # Added missing Scryfall CSP domains
infra/terraform/modules/ecs/main.tf   # Added AWS_MEDIA_BUCKET_NAME env var
infra/terraform/modules/s3/main.tf    # Enabled public read for products/thumbnails
```

### Created
```
scripts/cleanup_broken_media.py                       # Delete broken ProductMedia records
docs/ops/investigations/staging-images-2026-01-25.md  # This document
```

---

## Next Steps (Priority Order)

### Completed ✅

1. **[x] Deploy CSP fix to staging** - Added Scryfall domains to middleware.ts
2. **[x] Create staging App token** - Created app with MANAGE_PRODUCTS permission
3. **[x] Add AWS_MEDIA_BUCKET_NAME** - Added to ECS task definitions
4. **[x] Run cleanup script** - Deleted 92,609 broken ProductMedia records
5. **[x] Run backfill against staging** - 92,549 images uploaded to S3 (~10GB)
6. **[x] Enable S3 public read** - products/* and thumbnails/* publicly readable
7. **[x] Verify images display** - Thumbnail endpoint returns valid JPEG images

### Remaining (Future)

8. **[ ] Verify product parity**
   - Compare product counts: local vs staging
   - Identify attribute differences
   - Run import if needed

9. **[ ] Document backfill runbook**
   - Add to `docs/ops/runbooks/`

10. **[ ] Design Scryfall App** (Long-term)
    - Architecture document
    - Module breakdown
    - Migration plan from scripts

11. **[ ] Implement image caching layer** (Long-term)
    - CloudFront or Cloudflare
    - Reduces Scryfall dependency

---

## Reference: Key Files

| File | Purpose |
|------|---------|
| `scripts/backfill_product_media.py` | Download & upload images via GraphQL |
| `scripts/backfill_product_images.py` | Alternative: multipart upload approach |
| `scripts/mtg_scryfall_import/import_graphql.py` | Product/variant import (no images) |
| `scripts/mtg_scryfall_import/import_command.py` | Django ORM import (sets external_url) |
| `storefront/src/middleware.ts` | CSP configuration |
| `infra/terraform/modules/s3/main.tf` | S3 media bucket config |
| `infra/terraform/modules/ecs/main.tf` | ECS task definitions with env vars |

---

## Reference: Useful Commands

```bash
# Check staging API health
curl http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/health/

# Query staging for products with media
curl -s "http://saleor-platform-staging-alb-...../graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ products(first: 5, channel: \"webstore\") { edges { node { name media { url } } } } }"}'

# Check S3 bucket contents
aws s3 ls s3://saleor-platform-media-staging-546464732019/ --recursive

# Test thumbnail endpoint
curl -I "http://saleor-platform-staging-alb-...../thumbnail/UHJvZHVjdE1lZGlhOjM=/256/"
```

---

## Session Context for Resume

### Session 1 (2026-01-25)

**What was accomplished:**
- Full root cause analysis of staging image issue
- Council debate with 4 agents (3 rounds)
- Scryfall API guidelines researched
- CSP fix applied (not deployed)
- This documentation created

### Session 2 (2026-01-26) - RESOLUTION

**What was accomplished:**
- ✅ Applied Terraform changes: Added `AWS_MEDIA_BUCKET_NAME` to ECS tasks
- ✅ Force redeployed API and Worker ECS services
- ✅ Ran `cleanup_broken_media.py` - deleted 92,609 broken ProductMedia records
- ✅ Ran `backfill_product_media.py` - uploaded 92,549 images to S3 (~10GB total)
- ✅ Updated S3 bucket policy for public read access on products/* and thumbnails/*
- ✅ Verified thumbnail endpoint returns valid JPEG images

**Backfill Results:**
- Total processed: 92,609 products
- Success: 92,549 (99.94%)
- Failed: 60 (mostly ConnectTimeout errors)
- S3 bucket now contains ~10GB of product images

**Key insight:** The issue had multiple layers:
1. Missing `AWS_MEDIA_BUCKET_NAME` env var (files written to container, not S3)
2. Broken ProductMedia records with `external_url` but no uploaded files
3. S3 bucket blocking all public access (thumbnails redirected to 403)

All three issues were fixed in this session.
