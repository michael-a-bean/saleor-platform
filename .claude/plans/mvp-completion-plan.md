# MVP Completion Plan

**Created**: 2026-01-03
**Last Updated**: 2026-01-03
**Goal**: Complete remaining MVP items for hobby gaming commerce platform

---

## Current State: ~95% Complete

### Completed This Session (2026-01-03)

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

## Remaining MVP Gaps (2 items)

### 1. Buylist Rule Preview UI - 2 days

**Impact**: Users can't test pricing rules before deploying
**Status**: `pricing.rules.preview` tRPC endpoint exists, no UI surface

#### File to Create
`saleor-apps/apps/buylist/src/pages/pricing/rules/test.tsx`

Features needed:
- Policy selector dropdown
- Input fields: market price, set code, rarity, condition, finish, qty on hand
- "Calculate Offer" button calling `pricing.rules.preview`
- Results panel showing:
  - Base offer calculation
  - Condition multiplier applied
  - List of applied rules with before/after
  - List of skipped rules with reasons
  - Final offer amount

#### Files to Modify
- `buylist/src/pages/_app.tsx` - Add `/pricing/rules/test` to allowedPathNames
- `buylist/src/pages/pricing/rules/index.tsx` - Add "Test Rules" button linking to test page

---

### 2. Buylist → Cost Event Integration - 2-3 days (CAN DEFER)

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
- ✅ Scryfall price sync (CLI and now dashboard)
- ✅ Buylist rule engine (all 5 action types)
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
3. **Next task**: Buylist Rule Preview UI (highest value remaining item)

### Quick Start
```bash
cd /home/michael/saleor-platform
git branch --show-current  # Verify on platform/main
docker compose ps          # Verify services running

# Start buylist app for development
cd saleor-apps/apps/buylist
pnpm dev
```

### Files for Rule Preview UI
```
saleor-apps/apps/buylist/
├── src/pages/pricing/rules/test.tsx     # CREATE - test page
├── src/pages/pricing/rules/index.tsx    # MODIFY - add link
└── src/pages/_app.tsx                   # MODIFY - whitelist route
```

---

## Commits Made This Session

```
48e84fa feat(storefront): add MVP webstore features
         - Cookie consent, sitemap, robots.txt, order detail, contact form
         - Footer with legal links, legal pages via script

[pending] feat(inventory-ops): add price sync dashboard
         - PriceSyncJob schema for job tracking
         - tRPC mutations: triggerFullSync, triggerDeltaSync, cancelJob
         - Dashboard UI with trigger buttons and job status
         - Jobs history page with filtering
```

---

## Estimated Remaining Work

| Task | Days | Priority |
|------|------|----------|
| Buylist Rule Preview UI | 2 | High |
| Buylist Cost Integration | 2-3 | Low (has workaround) |
| Price Sync Worker | 1 | Medium |

**Total to 100% MVP: 3-4 days** (excluding deferrable cost integration)
