# Investigation: Staging Image Display Issues

**Date:** 2026-01-25
**Status:** Root cause identified, solution pending
**Priority:** High

---

## Executive Summary

Images display correctly in local Docker environment but fail to load in staging (AWS ECS). Root cause identified: ProductMedia records exist with `external_url` references to Scryfall, but no actual image files were uploaded to S3. Saleor's `/thumbnail/` endpoint returns 404 because it cannot serve external URLs.

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
storefront/src/middleware.ts  # Added missing Scryfall CSP domains
```

### Created
```
docs/ops/investigations/staging-images-2026-01-25.md  # This document
```

---

## Next Steps (Priority Order)

### Immediate (This Week)

1. **[ ] Deploy CSP fix to staging**
   - Commit the middleware.ts change
   - Rebuild and deploy storefront

2. **[ ] Create staging App token**
   - Dashboard → Configuration → Apps
   - Permissions: `MANAGE_PRODUCTS`
   - Save token securely

3. **[ ] Test backfill script**
   ```bash
   # Test locally first
   python scripts/backfill_product_media.py --channel webstore --limit 10 --dry-run
   ```

4. **[ ] Run backfill against staging**
   - Start with --limit 100
   - Monitor S3 bucket for files
   - Verify images display

### Short-term (Next Sprint)

5. **[ ] Verify product parity**
   - Compare product counts: local vs staging
   - Identify attribute differences
   - Run import if needed

6. **[ ] Document backfill runbook**
   - Add to `docs/ops/runbooks/`

### Long-term (Future Sprints)

7. **[ ] Design Scryfall App**
   - Architecture document
   - Module breakdown
   - Migration plan from scripts

8. **[ ] Implement image caching layer**
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

**What was accomplished:**
- Full root cause analysis of staging image issue
- Council debate with 4 agents (3 rounds)
- Scryfall API guidelines researched
- CSP fix applied (not deployed)
- This documentation created

**What remains:**
- Deploy CSP fix
- Run backfill_product_media.py against staging
- Verify images display
- Consider Scryfall App for long-term

**Key insight:** The issue is NOT about Scryfall access or CSP - it's that Saleor's ProductMedia records have `external_url` set but no actual files in S3. The `/thumbnail/` endpoint can't proxy external URLs.
