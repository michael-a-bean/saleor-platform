# MVP Implementation Plan: 0% → 100% Readiness

**Date:** February 13, 2026
**Baseline:** 68% MVP-Ready (per MVP Readiness Report)
**Target:** 100% MVP-Ready with validated, tested functionality
**Method:** Iterative multi-pass validation (Ralph Wiggum loops)
**Branch:** `feature/*` branches merged to `platform/main`

---

## How This Plan Works

This is not a single-pass checklist. The plan defines **6 implementation phases** with **3 validation loops** that sweep all 8 MVP requirements at increasing levels of rigor:

```
PHASE 1-2: Build critical blockers
  └─→ VALIDATION LOOP 1: Component-level verification (unit tests, isolated function checks)
PHASE 3-4: Integration & polish
  └─→ VALIDATION LOOP 2: Cross-component integration (data flows between systems)
PHASE 5-6: End-to-end & hardening
  └─→ VALIDATION LOOP 3: Full user workflow verification (real scenarios, real data)
```

Each validation loop checks **ALL 8 requirements**, not just the ones recently worked on. If a loop fails, work returns to the appropriate phase to fix issues before re-running the loop. This is the "Ralph Wiggum" pattern — you keep looping through the requirements until every single one passes at the current verification level.

```
  ┌──────────────────────────────────────┐
  │   "I'm in danger"                    │
  │                                      │
  │   ┌─→ Check requirement 1 ─┐        │
  │   │   Check requirement 2  │        │
  │   │   Check requirement 3  │        │
  │   │   ...                  │        │
  │   │   Check requirement 8  │        │
  │   │         │              │        │
  │   │    All pass? ──NO──→ Fix ──┘    │
  │   │         │                       │
  │   │        YES                      │
  │   │         ↓                       │
  │   │   Advance to next phase         │
  │   └─────────────────────────────────┘
  └──────────────────────────────────────┘
```

---

## Current State: The 68% Baseline

| # | Requirement | Current | Target | Gap |
|---|-------------|---------|--------|-----|
| 1 | Customer-Facing Ecommerce | 85% | 100% | Shipping, email, analytics |
| 2 | Costing Layer + Bulk Import | 75% | 100% | Import UI, collection UI |
| 3 | Buylist with Costing Integration | 95% | 100% | E2E integration test |
| 4 | Minimal POS | 90% | 100% | Tax calculation |
| 5 | Singles-Builder Cart | 95% | 100% | Meilisearch search upgrade |
| 6 | Meilisearch Sync | 80% | 100% | Real-time webhooks |
| 7 | MTG Card Import App | 10% | 100% | **Everything** |
| 8 | Price Sync | 60% | 100% | Saleor writeback |

**Weighted baseline: 68%**

---

## Milestone Map: 0% → 100%

| Milestone | Phase | Weighted % | Gate |
|-----------|-------|-----------|------|
| **68%** | — | Baseline | Current state |
| **75%** | Phase 1 complete | +7% | MTG Import App functional |
| **82%** | Phase 2 complete | +7% | Price Sync + Tax resolved |
| **85%** | VL1 passes | +3% | All components verified individually |
| **90%** | Phase 3 complete | +5% | Meilisearch real-time, demo polish |
| **93%** | Phase 4 complete | +3% | Integration tests passing |
| **95%** | VL2 passes | +2% | Cross-component data flows verified |
| **98%** | Phase 5 complete | +3% | E2E user workflows verified |
| **100%** | VL3 passes | +2% | Full production-ready validation |

VL = Validation Loop

---

## Phase 1: Catalog Foundation (68% → 75%)

**Duration:** 2 weeks | **Effort:** 40-60 hours
**Focus:** Resolve Blocker #1 — MTG Import App
**Dependency:** None — can start immediately

### 1.1 MTG Import App — Full Implementation

**Why this first:** Without the import app, there is no product catalog. Price sync, Meilisearch, storefront — all downstream systems depend on products existing in Saleor. The legacy Python script works but bypasses GraphQL (no webhooks, no validation, causes the `discounted_price_amount = NULL` crash documented in `.claude/rules/database.md`).

**Research input:** Per Gemini lifecycle research, the import must generate 15 variants per card (5 conditions × 3 finishes) with proper SKU format `{scryfall_uuid}-{condition}-{finish}`. Per Grok contrarian analysis, Scryfall is the only viable free data source (TCGPlayer API closed to new developers).

#### Tasks

| Task | Hours | Acceptance Criteria |
|------|-------|-------------------|
| **1.1.1** Scaffold app (package.json, tsconfig, next.config, Prisma schema) | 2 | `pnpm build` succeeds, `prisma migrate` creates tables |
| **1.1.2** Scryfall API client with rate limiting (10 req/sec) and local bulk data cache | 6 | Client fetches card data, respects rate limit, caches bulk JSON locally |
| **1.1.3** Prisma schema: `ImportJob`, `ImportedProduct`, `SetAudit` tables | 2 | Migration runs clean, all FK constraints valid |
| **1.1.4** Job queue with priority (0=prerelease, 1=reprint, 2=backfill) | 4 | Jobs enqueue/dequeue in priority order, concurrent safety via row locking |
| **1.1.5** Import pipeline: 1 card → 15 variants via `productBulkCreate` GraphQL | 12 | Single card creates product + 15 variants in Saleor with correct attributes |
| **1.1.6** Both `price_amount` AND `discounted_price_amount` set on every channel listing | 2 | SQL query `WHERE discounted_price_amount IS NULL AND price_amount IS NOT NULL` returns 0 rows |
| **1.1.7** Attribute mapping: all 23 MTG attributes from Scryfall to Saleor | 4 | Spot-check 10 random cards: all attributes match Scryfall source data |
| **1.1.8** Channel listing creation for `webstore` and `singles-builder` channels | 2 | Products visible in both channels via GraphQL query |
| **1.1.9** On-demand set import trigger (new set released = import available) | 3 | Trigger import for a specific set code, only that set's cards imported |
| **1.1.10** Dashboard UI: job list, progress bar, error log, retry button | 6 | UI shows running job progress, completed jobs with stats, failed jobs with error details |
| **1.1.11** Resume capability: interrupted imports pick up where they left off | 3 | Kill import at 50%, restart, confirm it resumes from card #50% not card #1 |
| **1.1.12** Import validation test suite | 6 | Import 1 complete set (500 cards → 7,500 variants) in <5 minutes with 0 errors |

**Total:** 52 hours (midpoint of 40-60 range)

#### Key Technical Decisions (Research-Informed)

- **Use GraphQL mutations, not Django ORM:** Legacy script bypasses webhooks and validation. The new app must use `productBulkCreate` to trigger proper webhook events for downstream systems (Meilisearch sync, inventory tracking).
- **SKU format:** `{scryfall_uuid}-{condition}-{finish}` (e.g., `ff1b8fc5-NM-NF`). This matches the existing SKU parsing in price sync cron (`route.ts:L200+`).
- **Condition codes:** NM, LP, MP, HP, DMG (matching the 5-tier industry standard per Gemini research).
- **Finish codes:** NF (non-foil), F (foil), E (etched) (matching existing price sync logic).
- **Bulk data strategy:** Download Scryfall `default-cards` bulk file (~200MB JSON), parse locally. Never call individual card endpoints at import scale.

#### Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Scryfall bulk data format changes | Pin to known schema version, validate before processing |
| GraphQL rate limiting on bulk create | Batch operations (50-100 variants per mutation), configurable concurrency |
| Import takes too long | Progress checkpoint every 100 cards, resume capability (task 1.1.11) |
| `discounted_price_amount` NULL crash | Explicit check in pipeline AND SQL validation query post-import (task 1.1.6) |

---

## Phase 2: Price & Tax Resolution (75% → 82%)

**Duration:** 1 week | **Effort:** 16-28 hours
**Focus:** Resolve Blockers #2 and #3
**Dependencies:** Phase 1 complete (products must exist for price sync)

### 2.1 Price Sync Writeback — Complete the Loop

**Why:** Prices are calculated from Scryfall and staged in `SellPriceSnapshot` / `PendingPriceUpdate` tables, but never pushed to Saleor. The storefront shows stale/null prices. This is an 8-12 hour fix because the infrastructure is 95% there.

**Research input:** Per Gemini lifecycle research, "prices should be considered dangerously stale after 24 hours." Per Claude buylist economics, pricing accuracy directly impacts margin at 5-10% net margin LGS businesses. Current system has an anomaly threshold at 10% change.

#### Tasks

| Task | Hours | Acceptance Criteria |
|------|-------|-------------------|
| **2.1.1** Implement `publishApprovedPrices()` function that calls `productVariantChannelListingUpdate` GraphQL mutation | 4 | Approved price in `PendingPriceUpdate` table reflected in Saleor within 60 seconds |
| **2.1.2** Set BOTH `price_amount` AND `discounted_price_amount` in the mutation | 1 | SQL check: 0 rows where `discounted_price_amount IS NULL AND price_amount IS NOT NULL` |
| **2.1.3** Add batch processing (100 variants per GraphQL call) with error handling | 2 | 1,000 price updates complete in <2 minutes with 0 data loss on partial failure |
| **2.1.4** Wire `publishApprovedPrices()` into `approveAll` and `approveSelected` tRPC mutations | 2 | Dashboard "Approve" button → prices visible on storefront within 5 minutes |
| **2.1.5** Add auto-approve path for changes below configurable threshold (default: 5%) | 2 | Price changes <5% auto-publish without manual review |
| **2.1.6** Writeback test suite: price change → approval → storefront verification | 3 | Automated test confirms price visible on storefront after approval |

**Total:** 14 hours

#### Technical Approach

The writeback function slots into the existing approval workflow in `price-sync-router.ts`:

```
Current:  approveAll() → update PendingPriceUpdate status → create SellPriceSnapshot → DONE
Fixed:    approveAll() → update PendingPriceUpdate status → create SellPriceSnapshot
                       → publishApprovedPrices() → Saleor GraphQL mutation → DONE
```

The GraphQL mutation is `productVariantChannelListingUpdate` with:
```graphql
mutation {
  productVariantChannelListingUpdate(
    id: "variant-id"
    input: [{
      channelId: "webstore-channel-id"
      price: { amount: 5.99, currency: "USD" }
    }]
  ) { ... }
}
```

### 2.2 POS Tax Calculation — Implement Core

**Why:** Tax hardcoded to $0.00 is illegal in most US jurisdictions. This is a business decision gate — the approach chosen affects implementation complexity.

**Research input:** Per Grok contrarian analysis, store credit on balance sheet is subject to escheatment laws. Tax compliance varies by jurisdiction. Per MVP report recommendation: Saleor native tax rules (fast) or AvaTax (thorough) or defer (Oregon-only launch).

#### Decision Gate: Tax Approach

This requires a business decision before implementation can proceed:

| Option | Effort | Accuracy | MVP Viable? |
|--------|--------|----------|-------------|
| **A: Saleor Tax Rules** (flat rate per tax class) | 8 hrs | Good for single jurisdiction | Yes |
| **B: AvaTax Integration** (already in saleor-apps) | 16 hrs | Excellent, multi-jurisdiction | Yes but more work |
| **C: Defer** (launch in Oregon or tax-exempt scenarios) | 0 hrs | N/A | Yes with disclosure |

**Recommended:** Option A for MVP, upgrade to B post-launch.

#### Tasks (Option A: Saleor Tax Rules)

| Task | Hours | Acceptance Criteria |
|------|-------|-------------------|
| **2.2.1** Configure tax class for "MTG Cards" product type in Saleor | 1 | Tax class exists with correct rate for target jurisdiction |
| **2.2.2** Configure tax rate for target launch jurisdiction (e.g., Washington state 10.25%) | 1 | Rate stored in Saleor tax configuration |
| **2.2.3** Update POS transaction creation to fetch tax from Saleor instead of hardcoded $0 | 4 | POS transaction for $10.00 card shows correct tax ($1.03 at 10.25%) |
| **2.2.4** Update receipt generation to display tax breakdown | 1 | Receipt shows subtotal, tax amount, tax rate, and total |
| **2.2.5** Tax calculation test suite | 2 | 5 test scenarios: zero-tax item, single item, multi-item, mixed tax/no-tax, rounding |

**Total:** 9 hours

---

## VALIDATION LOOP 1: Component-Level Verification (→ 85%)

**Gate:** All 8 requirements verified at the component/unit level.
**Duration:** 2-3 days
**Method:** Sweep every requirement, run its tests, verify its individual acceptance criteria.

### VL1 Checklist

Run this checklist. ANY failure → fix → re-run ENTIRE checklist (not just the failed item).

| # | Requirement | Verification Method | Pass Criteria |
|---|-------------|-------------------|---------------|
| 1 | **Ecommerce** | `pnpm build` storefront, load homepage, browse products | Build succeeds, products display with images and prices |
| 2 | **Costing** | Run inventory-ops test suite: `pnpm test` | 307+ assertions pass, 0 failures |
| 3 | **Buylist** | Run buylist test suite: `pnpm test` | All existing tests pass |
| 4 | **POS** | Run POS test suite + manual tax check | Tests pass, tax calculation returns correct amount for test jurisdiction |
| 5 | **Singles Builder** | Navigate to `/singles-builder/`, search, add to cart | Staff-only auth works, search returns results, cart persists on refresh |
| 6 | **Meilisearch** | Run `meilisearch-reconcile.py` | Count match within 1% of Saleor product count |
| 7 | **MTG Import** | Import test set (e.g., "Foundations" ~300 cards) | 300 products × 15 variants = 4,500 variants created, 0 NULL `discounted_price_amount` |
| 8 | **Price Sync** | Trigger delta sync → approve → check storefront | Price change visible on storefront within 5 minutes of approval |

### VL1 Fix Protocol

When a check fails:
1. Log the failure (which requirement, what happened, expected vs actual)
2. Root-cause the failure (don't just patch the symptom)
3. Fix the root cause
4. Re-run the ENTIRE VL1 checklist (not just the failed item)
5. Only advance to Phase 3 when ALL 8 pass in a single clean run

---

## Phase 3: Integration & Demo Polish (85% → 90%)

**Duration:** 1 week | **Effort:** 24-36 hours
**Focus:** Cross-system integration, demo readiness
**Dependencies:** VL1 passed

### 3.1 Meilisearch Real-Time Sync

**Why:** Currently manual script-only sync. Product updates don't reflect in search until next manual run. Per sync-contracts.md, this is documented as "Future Roadmap."

**Research input:** Per Meilisearch analysis, current sync scripts work well (557-line full sync, 426-line delta sync, 263-line reconciliation). The gap is real-time webhook-driven updates.

| Task | Hours | Acceptance Criteria |
|------|-------|-------------------|
| **3.1.1** Add webhook handler for `PRODUCT_CREATED` → Meilisearch document add | 4 | New product from import app appears in search within 30 seconds |
| **3.1.2** Add webhook handler for `PRODUCT_UPDATED` → Meilisearch document update | 3 | Price change from price sync reflected in search within 30 seconds |
| **3.1.3** Add webhook handler for `PRODUCT_VARIANT_STOCK_UPDATED` → update `in_stock` flag | 3 | Sold-out variant shows `in_stock: false` in search within 30 seconds |
| **3.1.4** Batch buffer: accumulate changes for 5 seconds before pushing | 2 | 100 simultaneous product updates result in 1 batch Meilisearch call, not 100 individual calls |

**Total:** 12 hours

### 3.2 Demo Polish

| Task | Hours | Acceptance Criteria |
|------|-------|-------------------|
| **3.2.1** Configure 2 shipping methods (PWE and tracked bubble mailer) | 2 | Checkout shows PWE ($0.83) for orders <$20, tracked ($4.50) for orders >$20 |
| **3.2.2** Verify email notifications (order confirmation) | 3 | Place test order → email received within 2 minutes |
| **3.2.3** Run full Meilisearch reindex post-import | 1 | Reconciliation shows 0 count mismatch |
| **3.2.4** Test Stripe payment end-to-end in staging | 2 | Test card `4242...` completes checkout, order created in Saleor |
| **3.2.5** Pre-populate demo inventory (high-value staples, popular Commander cards) | 3 | 50+ recognizable cards in stock with correct prices and images |
| **3.2.6** Test buylist → POS payout flow with real data | 3 | Customer sells 5 cards → cash payout → BOH verify → stock posted → WAC updated |

**Total:** 14 hours

### 3.3 Submodule & Branch Cleanup

| Task | Hours | Acceptance Criteria |
|------|-------|-------------------|
| **3.3.1** Sync `saleor-apps` submodule (10 commits behind) | 0.5 | `git submodule update` succeeds, no conflicts |
| **3.3.2** Resolve price-sync detached HEAD (at 7e33ae7) | 0.5 | Submodule tracking branch, not detached HEAD |
| **3.3.3** Clean up stale feature branches | 0.5 | Only active branches remain |

**Total:** 1.5 hours

---

## Phase 4: Integration Testing (90% → 93%)

**Duration:** 1 week | **Effort:** 24-40 hours
**Focus:** Cross-component integration tests that verify data flows correctly between systems
**Dependencies:** Phase 3 complete

### 4.1 Critical Integration Test Suites

These tests verify the **seams between systems** — where data crosses from one component to another.

#### 4.1.1 Import → Price Sync → Storefront Pipeline Test

| Step | Verifies | Pass Criteria |
|------|----------|--------------|
| Import 10 cards from Scryfall | MTG Import → Saleor | 10 products, 150 variants in Saleor |
| Trigger delta price sync | Price Sync → SellPriceSnapshot | 150 snapshots created with Scryfall prices |
| Auto-approve (below 5% threshold) | Approval → Saleor mutation | Prices updated in `productvariantchannellisting` |
| Verify storefront | Saleor → Storefront | All 10 cards show correct prices on website |
| Verify Meilisearch | Webhook → Meilisearch | All 10 cards searchable with correct `min_price` |

**Effort:** 8 hours | **Acceptance:** All 5 steps pass in a single automated run

#### 4.1.2 Buylist → Costing → WAC Flow Test

| Step | Verifies | Pass Criteria |
|------|----------|--------------|
| Create FOH buylist (5 cards, mixed conditions) | Buylist creation | 5 BuylistLine records created |
| Process payout (cash, $47.50) | Payment processing | CashMovement record with PAYOUT type |
| BOH verify and receive (accept 4, reject 1) | Partial acceptance | 4 accepted, 1 rejected |
| Stock posted to Saleor | Saleor stock mutation | 4 variants stock increased by accepted qty |
| Cost events created | BUYLIST_RECEIPT events | 4 CostLayerEvent records with correct unit costs |
| WAC recalculated | WAC service | New WAC = weighted average of old stock + new buylist stock |
| Reconciliation passes | Reconciliation service | 0 discrepancies |

**Effort:** 10 hours | **Acceptance:** All 7 steps pass in a single automated run

#### 4.1.3 Goods Receipt → Costing → Reconciliation Flow Test

| Step | Verifies | Pass Criteria |
|------|----------|--------------|
| Create PO with 3 line items | PO lifecycle | PO in APPROVED state |
| Post goods receipt (partial: 2 of 3 lines) | GR creation | GR posted, 2 lines received |
| Cost events created | GOODS_RECEIPT events | 2 CostLayerEvent records |
| WAC calculated | WAC service | Correct weighted average including landed costs |
| Add landed cost (freight $25, allocated by VALUE) | Landed cost allocation | Cost allocated proportionally to line values |
| Reconciliation | Daily reconciliation | Stock counts match, WAC values correct |

**Effort:** 6 hours | **Acceptance:** All 6 steps pass

#### 4.1.4 POS Transaction → Order → COGS Flow Test

| Step | Verifies | Pass Criteria |
|------|----------|--------------|
| Open register session | Register management | Session OPEN, opening float recorded |
| Create transaction with 3 items | Transaction creation | 3 PosTransactionLine records |
| Record cash payment | Payment processing | Payment recorded, change calculated via Decimal.js |
| Complete transaction | Transaction completion | Status → COMPLETED, Saleor draft order created |
| Fulfill order in Saleor | ORDER_FULFILLED webhook | Webhook fires to inventory-ops |
| COGS calculated | SALE cost events | 3 CostLayerEvent records with type=SALE |
| Close register | Register reconciliation | Cash counted, variance calculated |

**Effort:** 8 hours | **Acceptance:** All 7 steps pass

### 4.2 POS Test Coverage Expansion

**Why:** POS currently has 1 test file for the entire app. For financial software handling money, this is unacceptable.

| Task | Hours | Acceptance Criteria |
|------|-------|-------------------|
| **4.2.1** Payment router unit tests (cash, card, store credit, idempotency) | 8 | 20+ test cases covering all payment methods and edge cases |
| **4.2.2** Transaction lifecycle unit tests (create → suspend → resume → complete → void) | 6 | 15+ test cases covering all state transitions |
| **4.2.3** Register session unit tests (open, close, denomination counting, variance) | 4 | 10+ test cases including edge cases (negative variance, zero count) |
| **4.2.4** Tax calculation unit tests | 2 | 5+ test cases: zero tax, rounding, multi-item, mixed categories |

**Total:** 20 hours

---

## VALIDATION LOOP 2: Integration-Level Verification (→ 95%)

**Gate:** All cross-component data flows verified.
**Duration:** 2-3 days
**Method:** Run all 4 integration test suites. Additionally, re-run VL1 checklist to confirm nothing regressed.

### VL2 Checklist

| # | Test Suite | Pass Criteria |
|---|-----------|--------------|
| VL1 | Re-run entire VL1 checklist | All 8 component checks pass (regression gate) |
| IT1 | Import → Price Sync → Storefront | All 5 pipeline steps pass |
| IT2 | Buylist → Costing → WAC | All 7 flow steps pass |
| IT3 | Goods Receipt → Costing → Reconciliation | All 6 flow steps pass |
| IT4 | POS Transaction → Order → COGS | All 7 flow steps pass |
| UT1 | POS payment unit tests | 20+ assertions pass |
| UT2 | POS transaction unit tests | 15+ assertions pass |
| UT3 | POS register unit tests | 10+ assertions pass |
| UT4 | POS tax unit tests | 5+ assertions pass |

### VL2 Fix Protocol

Same as VL1: ANY failure → fix root cause → re-run ENTIRE VL2 checklist.

**Critical rule:** If an integration test failure reveals a component-level bug, you must also re-run VL1 after fixing it. The loops stack — VL2 includes VL1.

---

## Phase 5: End-to-End User Workflows (95% → 98%)

**Duration:** 1 week | **Effort:** 16-24 hours
**Focus:** Real user scenarios with real data, simulating actual store operations
**Dependencies:** VL2 passed

### 5.1 User Workflow Scenarios

These are **manual test scripts** that simulate a real day at the game store. Each scenario must be executed start-to-finish without errors.

#### Scenario A: "New Set Release Day"

```
1. MTG Import: Trigger import for new set (e.g., "Aetherdrift", ~300 cards)
2. Verify: 300 products × 15 variants = 4,500 variants created
3. Price Sync: Trigger full sync for new set
4. Verify: All 4,500 variants have non-null prices from Scryfall
5. Meilisearch: Confirm new set searchable within 2 minutes
6. Storefront: Browse new set page, filter by rarity, verify prices
7. Singles Builder: Staff searches for chase mythic from new set
8. POS: Add chase mythic to cart, complete cash transaction
9. COGS: Verify cost event created for sold card
```

**Duration:** 2 hours | **Pass:** All 9 steps complete without error or manual intervention

#### Scenario B: "Buylist Customer Walk-In"

```
1. POS: Open register, record opening float ($200)
2. Customer brings 10 mixed-condition cards to sell
3. Buylist FOH: Create buylist, system auto-quotes using pricing rules
4. Verify: Condition multipliers applied correctly (NM=100%, LP=90%, etc.)
5. Cash payout: $35 cash to customer
6. BOH: Staff verifies cards, accepts 8, downgrades 2 conditions
7. Verify: Stock posted to Saleor for 8 cards (correct variants/conditions)
8. Verify: BUYLIST_RECEIPT cost events created with correct unit costs
9. Verify: WAC recalculated for all 8 variants
10. Storefront: 8 newly-stocked cards show "In Stock"
11. POS: Close register, cash count matches expected
```

**Duration:** 3 hours | **Pass:** All 11 steps complete without error

#### Scenario C: "Online Order Fulfilled"

```
1. Storefront: Customer browses, adds 3 cards to cart
2. Checkout: Enter shipping info, pay with Stripe test card
3. Verify: Order created in Saleor, Stripe payment captured
4. Dashboard: Staff views order, creates fulfillment
5. ORDER_FULFILLED webhook fires → COGS calculated
6. Verify: 3 SALE cost events created with correct WAC-based COGS
7. Verify: Stock decremented for all 3 variants
8. Meilisearch: If any variant now out of stock, `in_stock: false` in search
9. Email: Order confirmation received (if SMTP configured)
```

**Duration:** 2 hours | **Pass:** All 9 steps complete without error

#### Scenario D: "Singles Builder → POS Handoff"

```
1. Singles Builder: Staff logs in (staff auth verified)
2. Search: Find 5 specific cards using Meilisearch
3. Cart: Add all 5 to singles-builder cart
4. Customer info: Enter name, notes
5. Generate lookup code (e.g., "ABC123")
6. POS: Open different browser/tab, open register
7. Import: Enter lookup code, all 5 items load
8. Payment: Process cash payment with correct total + tax
9. Complete: Transaction completes, Saleor order created
10. COGS: All 5 SALE events created
```

**Duration:** 1.5 hours | **Pass:** All 10 steps complete without error

### 5.2 Performance Validation

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| Meilisearch search latency | <50ms p99 | Run 100 queries, check 99th percentile |
| Storefront page load | <3s TTFB | Lighthouse audit on product listing page |
| Import throughput | 500 cards (7,500 variants) in <5 min | Timed import run |
| Price sync throughput | 1,000 variants in <5 min | Timed delta sync run |
| POS transaction creation | <2s | Timed from "Add to cart" to "Line added" |

### 5.3 Data Integrity Validation

| Check | Method | Pass Criteria |
|-------|--------|--------------|
| No NULL `discounted_price_amount` | SQL query | 0 rows returned |
| No orphaned variants (variant without product) | SQL query | 0 rows returned |
| WAC matches manual calculation for 10 random variants | Compare WAC service output vs spreadsheet | All 10 match within $0.01 |
| Meilisearch count matches Saleor | `meilisearch-reconcile.py` | <1% discrepancy |
| All cost events balance (receipts - sales = current stock value) | Reconciliation run | 0 discrepancies |

---

## VALIDATION LOOP 3: Full User Workflow Verification (→ 100%)

**Gate:** All user workflows pass, all performance targets met, all data integrity checks pass.
**Duration:** 2-3 days
**Method:** Execute all 4 scenarios, performance checks, and data integrity checks. Additionally, re-run VL2 (which includes VL1).

### VL3 Checklist

| # | Check | Pass Criteria |
|---|-------|--------------|
| VL2 | Re-run entire VL2 checklist | All integration tests + component tests pass |
| SA | Scenario A: New Set Release Day | All 9 steps pass |
| SB | Scenario B: Buylist Customer Walk-In | All 11 steps pass |
| SC | Scenario C: Online Order Fulfilled | All 9 steps pass |
| SD | Scenario D: Singles Builder → POS Handoff | All 10 steps pass |
| P1 | Search latency <50ms | p99 confirmed |
| P2 | Import throughput | 500 cards in <5 min |
| P3 | Price sync throughput | 1,000 variants in <5 min |
| DI1 | No NULL `discounted_price_amount` | 0 rows |
| DI2 | WAC accuracy | 10/10 spot checks match |
| DI3 | Meilisearch count match | <1% discrepancy |
| DI4 | Cost event balance | 0 discrepancies |

### VL3 Fix Protocol

Same pattern: ANY failure → root cause → fix → re-run ENTIRE VL3 checklist.

**If VL3 reveals a component bug:** Must re-run VL1, VL2, AND VL3 after fix.
**If VL3 reveals an integration bug:** Must re-run VL2 AND VL3 after fix.
**If VL3 reveals a scenario-specific bug:** Fix and re-run VL3 only.

---

## Phase 6: Production Hardening (Post-VL3)

**Duration:** 1-2 weeks | **Effort:** Variable
**Focus:** Items needed for production launch but not for demo/validation
**Dependencies:** VL3 passed (MVP functionally 100%)

### 6.1 Post-MVP Items (Prioritized)

| Priority | Task | Effort | Why |
|----------|------|--------|-----|
| P0 | Collection import UI (CSV upload, match preview, cost allocation) | 20-30 hrs | Backend complete, frontend missing. Required for bulk inventory intake. |
| P0 | POS discount/override UI | 12-16 hrs | Backend complete, frontend missing. Needed for real transactions. |
| P1 | Real-time Meilisearch webhook testing under load | 4-8 hrs | Verify webhook sync handles concurrent imports |
| P1 | Stripe Terminal integration (card payments at POS) | 40+ hrs | Cash-only is MVP acceptable, but production needs cards |
| P1 | Carrier shipping integration (real USPS/FedEx rates) | 24-40 hrs | Hardcoded rates work for MVP, real rates for production |
| P2 | Returns/exchange workflow | 16-24 hrs | Placeholder UI exists, needs completion |
| P2 | Analytics integration (GA4, Klaviyo) | 8-16 hrs | Loaded but not configured |
| P2 | Documentation cleanup (47 issues per council review) | 20-30 hrs | Technical debt |
| P3 | Offline POS resilience | 40+ hrs | Designed but not implemented |
| P3 | Multi-marketplace sync (TCGPlayer, eBay) | 80+ hrs | Major feature, post-MVP |

---

## Risk Register with Plan Step Pairing

Every risk identified in the MVP Readiness Report has a corresponding mitigation step in this plan.

| Risk | Severity | Mitigation Step | Phase |
|------|----------|----------------|-------|
| MTG import app not ready | Critical | Phase 1 (full implementation, 52 hours dedicated) | 1 |
| Price sync writeback fails | Critical | Phase 2.1 (14 hours, infrastructure 95% exists) | 2 |
| Null `discounted_price_amount` crash | High | Task 1.1.6 (explicit check) + VL1 (SQL validation query) + VL3 DI1 | 1,VL1,VL3 |
| Scryfall API dependency (no SLA) | High | Task 1.1.2 (local bulk cache, never synchronous) | 1 |
| TCGPlayer API closed | High | Architecture decision: Scryfall-only for MVP (per Grok research) | Design |
| POS tax compliance | High | Phase 2.2 (Saleor tax rules, 9 hours) | 2 |
| Meilisearch down during demo | Medium | Existing health check + GraphQL fallback (no additional work) | Existing |
| Stripe payment fails in staging | Medium | Task 3.2.4 (test before demo) | 3 |
| POS test coverage insufficient | High | Phase 4.2 (20 hours, 50+ new assertions) | 4 |
| Stock drift after buylist | High | Integration test IT2 (7-step flow verification) | 4 |
| Price staleness | Medium | Phase 3.1 (real-time Meilisearch webhooks) | 3 |
| WAC calculation inaccuracy | Medium | VL3 DI2 (10-variant spot check vs manual calculation) | VL3 |

---

## Timeline Summary

```
Week 1-2:  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  Phase 1: MTG Import App (52 hrs)
Week 3:    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓            Phase 2: Price Sync + Tax (23 hrs)
           ████████                      VL1: Component Verification (2-3 days)
Week 4:    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓          Phase 3: Meilisearch + Demo Polish (28 hrs)
Week 5:    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓    Phase 4: Integration Tests (40 hrs)
           ████████████                  VL2: Integration Verification (2-3 days)
Week 6:    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓            Phase 5: E2E User Workflows (24 hrs)
           ████████████████              VL3: Full Verification (2-3 days)
Week 7+:   ░░░░░░░░░░░░░░░░░░░░░░░░░░  Phase 6: Production Hardening

▓ = Implementation    █ = Validation Loop    ░ = Post-MVP hardening
```

**Total implementation effort:** ~180 hours (7 weeks at 25-30 hrs/week)
**Total validation effort:** ~40-50 hours across 3 loops (included in timeline)

---

## Research Integration Summary

This plan incorporates findings from 9 research documents:

| Research Source | How It Informed the Plan |
|----------------|------------------------|
| **Gemini: Singles Lifecycle** | Condition multipliers (NM/LP/MP/HP/DMG percentages), 15 variants per card, PWE vs tracked shipping thresholds, 6-hour pricing freshness requirement |
| **Claude: Buylist Economics** | WAC/COGS as primary differentiator, buylist spread (40-60% cash, 60-75% credit) as margin driver, emphasis on integration test IT2 |
| **Grok: Contrarian Analysis** | Scryfall-only strategy (TCGPlayer API closed), realistic maintenance costs ($150-300K/year), regulatory risks (tax, 1099, escheatment) |
| **Meilisearch/Import/Price Sync Analysis** | Real-time webhook gap, writeback as the critical missing piece, batch processing strategy |
| **Storefront/Ecommerce Analysis** | Shipping as MVP gap, email verification needed, attribute sync completeness |
| **POS/Singles Builder Analysis** | Tax as hardcoded $0, 1 test file for entire POS app, Singles Builder already 95% |
| **Inventory-Ops/Buylist/Costing Analysis** | WAC service completeness (3,683 LOC, 307+ assertions), missing FOH→BOH→Stock→Cost integration test |
| **Infrastructure/Cost Analysis** | $220/month staging stable, all services <5% utilization, no changes needed for MVP |
| **Scope Drift Analysis** | Intentional over-engineering in infrastructure, POS built beyond minimal, 50+ TODOs in codebase |

---

## Appendix: File Locations for Implementation

| Task Area | Key Files |
|-----------|-----------|
| MTG Import (new) | `saleor-apps/apps/mtg-import/` (empty, to be built) |
| Legacy Import (reference) | `scripts/mtg_scryfall_import/import_command.py` (543 lines) |
| Price Sync Writeback | `saleor-apps/apps/inventory-ops/src/modules/price-sync/price-sync-router.ts` (955 lines) |
| Price Sync Cron | `saleor-apps/apps/inventory-ops/src/app/api/cron/price-sync/route.ts` (636 lines) |
| POS Tax | `saleor-apps/apps/pos/src/modules/payments/payments-router.ts` (1200+ lines) |
| POS Tests | `saleor-apps/apps/pos/` (1 test file, needs 4 more) |
| Buylist | `saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts` |
| WAC Service | `saleor-apps/apps/inventory-ops/src/modules/cost-layers/wac-service.ts` (3,683 lines) |
| Meilisearch Sync | `scripts/sync-meilisearch.py` (557 lines) |
| Storefront | `storefront/src/app/[channel]/(main)/` |
| Singles Builder | `storefront/src/app/singles-builder/` |
| Prisma Schema | `saleor-apps/apps/inventory-ops/prisma/schema.prisma` (2,079 lines, symlinked to POS + Buylist) |
| Sync Contracts | `docs/reference/sync-contracts.md` |
| Architecture | `docs/reference/architecture.md` |

---

*Plan prepared February 13, 2026. Based on MVP Readiness Report, 9 research supplements, and codebase exploration.*
