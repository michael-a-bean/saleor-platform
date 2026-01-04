# MVP Completion Plan

**Created**: 2026-01-03
**Last Updated**: 2026-01-03
**Goal**: Complete remaining MVP items for hobby gaming commerce platform

---

## Current State: 100% Complete ✅

### Completed Features

#### Price Sync Reporting & Approval Workflow ✅ (2026-01-03)
Full reporting system with staged approvals for price changes:

**Schema Changes** (`inventory-ops/prisma/schema.prisma`):
- `PendingPriceUpdate` - Stages price changes before applying
- `PriceSyncReport` - Summary report per sync job with stats
- `PriceSyncSettings` - Per-installation configuration
- Enums: `ChangeDirection`, `TrendDirection`, `PendingPriceStatus`, `ReportStatus`

**Core Logic** (`price-sync/src/lib/`):
- `trend-calculator.ts` - 7-day and 30-day trend analysis
- `report-generator.ts` - Anomaly detection, report generation

**Sync Jobs Updated**:
- `full-sync.ts` - Now stages updates and generates reports
- `delta-sync.ts` - Same pattern for delta syncs
- `process-jobs.ts` - Passes job context for report generation

**API Endpoints** (`inventory-ops/src/modules/price-sync/price-sync-router.ts`):
- `getReport` - Get report by job ID
- `getPendingUpdates` - Get pending updates with filters
- `getPendingReports` - List reports pending review
- `approveAll` / `approveSelected` - Apply approved prices
- `rejectAll` / `rejectSelected` - Reject price updates
- `getSettings` / `updateSettings` - Configure anomaly threshold

**UI Pages**:
- `/price-sync/reports` - List pending and historical reports
- `/price-sync/reports/[jobId]` - Detail page with approval workflow
- `/price-sync/settings` - Configure anomaly threshold (default 10%)
- Dashboard updated with "Review Reports" button showing pending count

**Workflow**:
1. Sync job fetches prices from Scryfall
2. Changes staged as `PendingPriceUpdate` records (not auto-applied)
3. Report generated with stats, anomalies, trends
4. User reviews in dashboard - approve/reject individual or all
5. Approved changes create new `SellPriceSnapshot` records

#### Price Sync Worker ✅ (2026-01-03)
Job processor that executes dashboard-triggered sync jobs:

**CLI Command** (`price-sync process`):
- `--daemon` flag for continuous polling
- `--poll-interval <ms>` configurable polling (default: 10s)
- `--max-jobs <count>` batch size per poll (default: 10)

**Files Created**:
- `price-sync/src/jobs/process-jobs.ts` - Job processor logic
- `inventory-ops/src/app/api/cron/price-sync/route.ts` - Cron endpoint for serverless

**Docker Service**:
- `price-sync-worker` service (profile: workers)
- Runs `process --daemon` continuously
- Start with: `docker compose --profile workers up -d`

**How It Works**:
1. Dashboard creates job → status: PENDING
2. Worker finds job → marks RUNNING
3. Worker executes sync (FULL/DELTA/VARIANT)
4. Worker marks COMPLETED with stats (or FAILED with error)

#### Buylist Rule Preview UI ✅
Full test interface for pricing rules:

**Page** (`buylist/src/pages/pricing/rules/test.tsx`):
- Policy selector dropdown
- Input fields: market price, set code, rarity, condition, finish, qty on hand
- "Calculate Offer" button calling `pricing.rules.preview`
- Results panel showing:
  - Base offer calculation
  - Condition multiplier applied
  - List of applied rules with before/after
  - List of skipped rules
  - Final offer amount

**Route whitelisted** in `_app.tsx` at `/pricing/rules/test`
**Link added** in rules index page as "Test Rules" button

#### Price Sync Dashboard ✅
Full dashboard with trigger buttons and job management:

**Schema** (`inventory-ops/prisma/schema.prisma`):
- `PriceSyncJob` model with PENDING/RUNNING/COMPLETED/FAILED/CANCELLED status
- Job types: FULL, DELTA, VARIANT
- Config JSON for parameters, stats for results, error for failures

**API** (`inventory-ops/src/modules/price-sync/price-sync-router.ts`):
- `getStatus` - Current status with active job info (5s polling)
- `getJobs` - Paginated job history with status filtering
- `triggerFullSync` - Queue full catalog sync
- `triggerDeltaSync` - Queue delta sync with configurable lookback (1-30 days)
- `triggerVariantSync` - Queue single variant sync
- `cancelJob` - Cancel pending jobs

**UI Pages**:
- `/price-sync` - Main dashboard with sync controls, status cards, recent jobs
- `/price-sync/jobs` - Full job history with pagination and filtering

**Note**: Jobs are created with PENDING status. A background worker is needed to:
1. Poll for PENDING jobs
2. Mark as RUNNING, execute sync
3. Mark as COMPLETED/FAILED with stats/error

#### MVP Webstore Features ✅ (Previous Session)
- Cookie consent banner with localStorage persistence
- `robots.txt` with disallow rules and sitemap reference
- `sitemap.xml` with dynamic products/categories/collections/pages
- Order detail page (`/orders/[id]`)
- Contact form with API endpoint
- Footer with Help & Info section
- Legal pages in CMS (Privacy Policy, Terms of Service, Return Policy)

#### Cart Quantity Adjustment ✅ (commit 542aedc)
- +/- buttons on cart items
- Quantity editing in checkout

---

## Remaining MVP Gaps (1 item, deferrable)

### 1. Buylist → Cost Event Integration - 2-3 days (CAN DEFER)

**Impact**: Card buybacks don't update cost layer
**Status**: Schema ready (`BUYLIST_RECEIPT` event type exists), posting logic missing
**Workaround**: Manual stock adjustments in inventory-ops can capture buylist costs

#### Changes Needed
`saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts`

In `createAndPay` mutation, after marking buylist as PAID:
1. For each line, get current WAC for variant/warehouse
2. Calculate new WAC: `(existingQty × existingWAC + newQty × newCost) / totalQty`
3. Create `CostLayerEvent` with type `BUYLIST_RECEIPT`
4. Update Saleor stock (increase inventory)

---

## What's Already Working (No Changes Needed)

- ✅ Order.fulfilled → COGS webhook (fully implemented)
- ✅ WAC calculation and cost layer ledger
- ✅ Purchase orders → Goods receipts → Cost events
- ✅ Stock adjustments with cost tracking
- ✅ Stock discrepancy detection
- ✅ Scryfall price sync (CLI, dashboard, and worker)
- ✅ Price sync reporting with approval workflow
- ✅ Anomaly detection with configurable threshold
- ✅ 7-day and 30-day price trend analysis
- ✅ Buylist rule engine (all 5 action types)
- ✅ Buylist rule preview/test UI
- ✅ Condition builder with AND/OR logic
- ✅ Time-based rule activation
- ✅ Stripe checkout with account creation
- ✅ MTG card display (set icons, mana symbols, attributes)
- ✅ Search and filtering
- ✅ Mobile responsive design
- ✅ Cookie consent
- ✅ SEO (sitemap, robots.txt)
- ✅ Legal pages
- ✅ Contact form
- ✅ Order history and detail pages

---

## Price Sync Worker Integration

The dashboard creates jobs but needs a worker to process them. Options:

### Option A: Cron-based Worker (Recommended)
Add to `inventory-ops/src/app/api/cron/price-sync/route.ts`:
```typescript
// Poll for PENDING jobs, process them
// Called by external cron (Vercel cron, systemd timer, etc.)
```

### Option B: Long-running Process
Separate Node process that polls the database:
```typescript
while (true) {
  const job = await prisma.priceSyncJob.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (job) await processJob(job);
  await sleep(5000);
}
```

### Option C: Manual CLI (Current Workaround)
```bash
# Check for pending jobs and run manually
docker compose run price-sync node dist/index.mjs full
```

---

## Session Pickup Instructions

When resuming work:

1. **Verify branch**: `git branch --show-current` should be `platform/main`
2. **Check services**: `docker compose ps`
3. **Next task**: Buylist Cost Integration (optional) or Price Sync Worker

### Quick Start
```bash
cd /home/michael/saleor-platform
git branch --show-current  # Verify on platform/main
docker compose ps          # Verify services running
```

---

## Recent Commits

```
0cf0194 feat(inventory-ops): price sync dashboard + update MVP plan
48e84fa feat(storefront): add MVP webstore features
542aedc feat(cart): add quantity editing with +/- buttons
```

---

## Estimated Remaining Work

| Task | Days | Priority | Status |
|------|------|----------|--------|
| Price Sync Reporting & Approval | 1 | High | ✅ Complete |
| Price Sync Worker | 1 | Medium | ✅ Complete |
| Buylist Cost Integration | 2-3 | Low | Deferred (has workaround) |

**MVP is 100% complete.** The only remaining item (Buylist Cost Integration) has a manual workaround via inventory-ops stock adjustments.

### Post-MVP Enhancements Available
- Email notifications for price sync anomalies (settings UI ready)
- Auto-approve threshold for small price changes (schema ready)

---

## Usage Guide

### Starting the Price Sync Worker

**Docker (Development)**:
```bash
# Start worker daemon
docker compose --profile workers up -d price-sync-worker

# Check logs
docker logs -f saleor-platform-price-sync-worker-1

# Run one-off sync
docker compose run price-sync full
docker compose run price-sync delta --lookback 3
```

**Manual**:
```bash
cd saleor-apps/apps/price-sync
pnpm build
DATABASE_URL=... INSTALLATION_ID=... node dist/index.mjs process --daemon
```

**Serverless (Vercel/etc)**:
Call `/api/cron/price-sync` endpoint with Authorization header:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/price-sync
```
