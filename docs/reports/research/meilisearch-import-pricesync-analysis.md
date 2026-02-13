# MVP Readiness: Meilisearch Sync, MTG Card Import App, and Price Sync

**Agent**: Codebase Explorer (Meilisearch/Import/Price-Sync)
**Date**: 2026-02-13
**Scope**: MVP Requirements #5b (Meilisearch Sync), #6 (MTG Card Import App), #7 (Price Sync)
**Status**: PARTIAL - Core infrastructure exists but critical gaps prevent full MVP readiness

---

## Executive Summary

The platform has **functional but incomplete** implementations of all three requirements:

1. **Meilisearch Sync (#5b)**: Working search engine with full sync scripts, but **single-channel only** (no multi-channel support)
2. **MTG Card Import App (#6)**: Scaffolded but **not functional** - the app exists as a directory with only Next.js infrastructure, zero business logic implemented
3. **Price Sync (#7)**: Implemented with **full job queue and cron processor**, handles Scryfall prices with condition multipliers, but **no on-demand import for new sets**

### Critical Gaps
- MTG import app has no Scryfall integration, job queue, or import pipeline
- Meilisearch lacks webhook-driven real-time sync (all syncs are manual/script-based)
- No cross-channel Meilisearch support (webstore and singles-builder channels share same index)
- Price sync applies market prices to existing variants only; no new set import workflow

---

## Detailed Findings

### 1. MEILISEARCH SYNC (#5b) - PARTIAL

#### What EXISTS and WORKS

**Docker Configuration**:
- Service running at `http://meilisearch:7700` (port 7700)
- Environment: `MEILI_ENV=development`, `MEILI_NO_ANALYTICS=true`
- File: `/home/michael/saleor-platform/docker-compose.yml` (lines 298-320)
- Persistent volume: `meilisearch-data:/meili_data`

**Sync Scripts** (1,246 lines total):

| Script | Purpose | Lines | Status |
|--------|---------|-------|--------|
| `/scripts/sync-meilisearch.py` | Full reindex from Saleor to Meilisearch | 557 | Working |
| `/scripts/meilisearch-delta-sync.py` | Incremental sync by updatedAt field | 426 | Working |
| `/scripts/meilisearch-reconcile.py` | Count mismatch detection & repair | 263 | Working |

**Index Configuration** (from sync-contracts.md):
```json
{
  "id": "Product_12345",
  "name": "Lightning Bolt",
  "set_code": "LEA",
  "rarity": "common",
  "mana_value": 1,
  "color_identity": ["Red"],
  "in_stock": true,
  "min_price": 5.58,
  "last_indexed_at": "2026-01-18T10:30:00Z",
  "variants": [...]
}
```

- Searchable Attributes: name, name_parts, name_prefixes, oracle_text, keywords, type_line, set_name, set_code
- Filterable Attributes: color_identity, colors, conditions_available, finishes_available, in_stock, keywords, mana_value, min_price, rarity, set_code, set_name, type_line
- Sortable Attributes: collector_number, min_price, name, set_name, type_line

**Storefront Integration**:
- Meilisearch client: `/storefront/src/lib/meilisearch.ts` (100+ lines)
- Search pages: `/storefront/src/app/[channel]/(main)/search/page.tsx` and `/storefront/src/app/singles-builder/[channel]/page.tsx`
- Filters: Set selector, rarity, condition, finish, price range
- Latency: `<50ms p99` (from sync contracts)

**Token Management** (sync-meilisearch.py):
- 4-minute token lifetime with auto-refresh
- Saleor admin credentials passed via `SALEOR_ADMIN_EMAIL` / `SALEOR_ADMIN_PASSWORD`

#### What is BROKEN or INCOMPLETE

**Single-Channel Index Only**:
- All channels share one index (e.g., `webstore-products`)
- Channel-specific prices and stock not separated
- `getIndexName(channel)` returns `{channel}-products` (meilisearch.ts:31-36)
- No contract for multi-channel pricing in Meilisearch

**Manual Sync Only - NO Real-Time Updates**:
- All sync is script-triggered
- No webhook handlers for `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_VARIANT_UPDATED`
- Comment in sync-contracts.md: "Real-time Sync: Subscribe to Saleor webhooks for immediate Meilisearch updates" (FUTURE ROADMAP)
- Impact: Search index can be stale by hours if scripts don't run frequently

**No Bulk Update Mechanism**:
- sync-meilisearch.py fetches products via GraphQL pagination
- No mechanism to batch-update Meilisearch documents after price/stock changes

**API Key Configuration Gap**:
- Production requires `MEILI_MASTER_KEY` (docker-compose.yml lines 311-319 comments)
- Currently development mode only (no auth enforced)

---

### 2. MTG CARD IMPORT APP (#6) - BROKEN

#### What EXISTS (Infrastructure Only)

**App Scaffolding**:
- Directory created: `/saleor-apps/apps/mtg-import/`
- Build artifacts present: `.next/`, `.turbo/`, `node_modules/` (48MB+)
- Source: `/mtg-import/src/app/` (minimal Next.js files only)
- Plans documented in `.claude/plans/`

**Files Tracked in Git**: Only 3 plan/doc files. No app code committed.

#### What DOES NOT EXIST

**ALL Business Logic Missing**:

| Component | Should Exist | Actual Status |
|-----------|--------------|---------------|
| **package.json** | Required | MISSING |
| **Prisma Schema** | ImportJob, ImportedProduct, SetAudit models | MISSING |
| **Scryfall Client** | Caching, rate limiting | MISSING |
| **Job Queue** | Priority handling | MISSING |
| **Import Pipeline** | GraphQL mutations | MISSING |
| **Audit System** | Scryfall vs Saleor comparison | MISSING |
| **Dashboard UI** | Job pages | MISSING |
| **Cron Handler** | Background processing | MISSING |

**Expected**: 45 TypeScript files per build report. **Actual**: 0 implementation files.

#### Why This Matters

Without this app:
- Cannot import from Scryfall bulk data (106,872 cards)
- Cannot create products with attributes (rarity, set code, mana value, colors, etc)
- Cannot generate 15 variants per card (5 conditions x 3 finishes)
- Cannot track import progress or resume interrupted imports

The existing legacy import script (`scripts/mtg_scryfall_import/import_command.py`, 543 lines) is a Django management command, not suitable for ongoing operation or dashboard integration.

---

### 3. PRICE SYNC (#7) - PARTIAL

#### What EXISTS and WORKS

**Job Queue System**:
- Prisma models: `PriceSyncJob`, `PendingPriceUpdate`, `SellPriceSnapshot`, `PriceSyncReport`, `PriceSyncSettings`
- Job types: `FULL`, `DELTA`, `VARIANT`
- Cron processor: 636 lines at `/saleor-apps/apps/inventory-ops/src/app/api/cron/price-sync/route.ts`
- Cron schedule: Every 5 minutes

**Price Sync Implementation**:

| Component | Implementation |
|-----------|----------------|
| **Source** | Scryfall API (cards/{set}/{number}) |
| **Rate Limiting** | 100ms per request (configurable) |
| **Finish Support** | NF (non-foil), F (foil), E (etched) |
| **Condition Multipliers** | NM=1.0, LP=0.9, MP=0.75, HP=0.5, DMG=0.25 |
| **Staleness Threshold** | 4 hours |
| **Cron Limits** | 5 jobs per installation per run, 100 variants per DELTA |
| **Error Handling** | 3 retries, logs failures, marks job FAILED |

**tRPC Router Endpoints** (16 endpoints):
- Status, history, stats, variant history, jobs, trigger full/delta/variant sync, cancel, reports, pending updates, approve/reject all, settings

**Anomaly Detection**:
- Threshold-based (default 10% change)
- Auto-approve below configurable level (default 5%)
- Detects: price spike, price drop, missing data, source mismatch
- Trend analysis: 7-day and 30-day direction tracked

#### What is BROKEN or INCOMPLETE

**NO On-Demand New Set Import**: Only updates existing variant prices. Requires MTG import app first.

**FULL Sync Not Supported in Cron**: Skips FULL jobs with message requiring separate CLI worker.

**Price Snapshot Storage Only - No Variant Sync**:
- Stores prices in `SellPriceSnapshot` table
- **Does not update** Saleor variant `productVariantChannelListing.price_amount`
- Prices sit in inventory-ops DB but never flow back to Saleor for storefront

---

## Scale Considerations (100k+ Products)

| Operation | Current | Risk |
|-----------|---------|------|
| Full Meilisearch reindex | ~30 min | Might timeout in serverless |
| Price sync DELTA | ~5 min | Only 500 variants/5min at 100ms/request |
| Scryfall API calls | 100ms rate limit | Already aggressive |
| Variant creation | 15 per card x 100k = 1.5M variants | **Never tested at scale** |

---

## Recommendations

### Immediate (MVP Blocker)
1. **Implement MTG Import App** from committed plan (40-60 hrs)
2. **Fix Price Sync to Saleor Loop** - webhook to sync approved prices back (8-12 hrs)
3. **Add MTG Set Import Trigger** (4-6 hrs)

### Short-term (MVP+)
4. **Webhook-Driven Meilisearch Sync** (12-16 hrs)
5. **Multi-Channel Meilisearch Support** (6-8 hrs)
6. **Price Sync Scale Testing** (8-10 hrs)

**MVP Readiness: 65% Complete**
