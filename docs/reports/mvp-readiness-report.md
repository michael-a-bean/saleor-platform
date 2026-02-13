# MVP Readiness Report: Saleor Hobby Gaming Platform

**Date:** February 13, 2026
**Branch:** `feature/mvp-readiness-report`
**Prepared for:** Stakeholder Presentation & Staging Demo
**Overall Status:** **68% MVP-Ready | 3 Critical Blockers | 4-6 Week Remediation Path**

---

## Executive Summary

This platform extends Saleor (a production-grade Django/GraphQL commerce engine) to serve the **Magic: The Gathering singles secondary market** at local game stores. After 6 months of development (340 commits), the project has substantial working infrastructure but **three critical blockers** prevent MVP launch:

1. **MTG Import App** -- Infrastructure deployed, **zero implementation code** committed. Cannot populate product catalog.
2. **Price Sync Writeback** -- Prices calculated from Scryfall but **never published to storefront**. Customers see stale/null prices.
3. **POS Tax Calculation** -- Hardcoded to $0. Blocks any jurisdiction requiring sales tax.

Everything else -- costing layer (95%), buylist (100%), POS core (95%), singles-builder (95%), ecommerce storefront (85%), Meilisearch search (80%) -- is substantially complete. The architecture is sound, the custom work is differentiated, and the market window is favorable.

**Staging cost:** $220/month (already optimized). Demo-quality performance confirmed.

**Path to MVP:** 4-6 weeks focused engineering. See [Timeline](#actionable-timeline) below.

---

## Table of Contents

1. [MVP Requirements Scorecard](#1-mvp-requirements-scorecard)
2. [Component-by-Component Analysis](#2-component-by-component-analysis)
3. [Critical Blockers](#3-critical-blockers)
4. [Staging Environment & Costs](#4-staging-environment--costs)
5. [Development Drift & Scope Analysis](#5-development-drift--scope-analysis)
6. [Missing Features & Implied Requirements](#6-missing-features--implied-requirements)
7. [Market Research: MTG Singles Lifecycle](#7-market-research-mtg-singles-lifecycle)
8. [Competitive Landscape](#8-competitive-landscape)
9. [Actionable Timeline](#9-actionable-timeline)
10. [Risk Register](#10-risk-register)
11. [Recommendations](#11-recommendations)

---

## 1. MVP Requirements Scorecard

| # | Requirement | Status | Score | Blocker? |
|---|-----------|--------|-------|----------|
| 1 | Customer-Facing Ecommerce Platform | Substantially Complete | **85%** | No |
| 2 | Costing Layer (Inventory Ops) + Bulk Import | Backend Complete, Import UI Missing | **75%** | Partial |
| 3 | Buylist with Costing Integration | Fully Operational | **95%** | No |
| 4 | Minimal POS (Buylist Cash Payout Tracking) | Core Complete, Tax Missing | **90%** | Yes (Tax) |
| 5 | Employee-Only Singles-Builder Cart | Fully Operational | **95%** | No |
| 6 | Meilisearch Sync Across All Channels | Sync Scripts Work, No Real-Time | **80%** | No |
| 7 | MTG Card Import App + On-Demand Set Import | **Not Implemented** | **10%** | **YES** |
| 8 | Price Sync | Calculates Prices, Never Publishes | **60%** | **YES** |

**Weighted Overall: 68% MVP-Ready**

---

## 2. Component-by-Component Analysis

### 2.1 Customer-Facing Ecommerce (85%)

**What Works:**
- Modern Next.js 16 + React 19 storefront with 100k+ MTG products loaded
- Advanced MTG filtering: rarity, color identity (WUBRG), condition (NM/LP/MP/HP/DMG), finish (foil/etched), set, mana value, type line, price range, Reserved List
- Full shopping cart -> checkout -> Stripe payment flow
- User authentication with order history, address book, password reset
- Meilisearch-powered search with GraphQL fallback (<50ms p99)
- Mobile-responsive design across all breakpoints
- Scryfall card images via CloudFront CDN
- Mana symbol rendering, rarity color-coding, oracle text display
- Comprehensive CSP security headers

**What's Missing/Incomplete:**
- Shipping rates likely hardcoded (no carrier integration)
- Email notifications unverified (Mailpit dev-only, SMTP not confirmed)
- No order tracking/tracking numbers
- No analytics (GA4, Klaviyo loaded but not configured)
- Product attribute sync partially complete (some oracle text/flavor text gaps)

**Key Files:** `storefront/src/app/[channel]/(main)/`, `storefront/src/lib/meilisearch.ts`, `storefront/src/lib/brand.ts`

---

### 2.2 Costing Layer / Inventory Ops (75%)

**What Works (95% of core):**
- **WAC Calculation**: 3,683 LOC with O(1) optimized lookups, 307+ test assertions
- **Append-only cost ledger**: 9 event types (GOODS_RECEIPT, BUYLIST_RECEIPT, SALE, etc.)
- **Purchase Orders**: Full lifecycle (DRAFT -> APPROVED -> RECEIVED)
- **Goods Receipts**: Posted receipts create cost events via Saleor mutations
- **Landed Costs**: Freight/duty/insurance allocation (VALUE/QUANTITY methods)
- **COGS Tracking**: ORDER_FULFILLED webhook calculates revenue minus costs
- **Reconciliation**: Event-driven + daily 02:00 UTC cron with Sentry alerts
- **Circuit Breaker**: Webhook protection (opens after 3 failures)
- **Collection Imports (Backend)**: CSV parser, card matcher (fuzzy + TCGPlayer ID), cost allocation

**What's Missing (Blocks "Bulk Import" Requirement):**
- **No UI for collection imports** -- CSV upload, match preview, conflict resolution, cost allocation screens all missing
- Backend API is complete; needs frontend pages
- Workaround: CLI/API calls (not presentable for demo)

**Test Coverage:** 12+ test files, 307+ assertions. Strong unit tests, weak integration tests.

**Key Files:** `saleor-apps/apps/inventory-ops/src/modules/cost-layers/wac-service.ts`, `prisma/schema.prisma` (2080 lines, 50+ tables)

---

### 2.3 Buylist with Costing Integration (95%)

**What Works:**
- **FOH (Front of House)**: `createAndPay` endpoint -- customer brings cards, staff quotes, customer paid immediately
- **BOH (Back of House)**: Verification queue, `verifyAndReceive` posts stock to Saleor + creates BUYLIST_RECEIPT cost events
- **Pricing Rule Engine**: 1,100+ LOC with 5 condition types, 4 action types, multiplicative/additive stacking
- **Condition Grading**: NM/LP/MP/HP/DMG with configurable multipliers
- **Payout Methods**: Cash, store credit, check, bank transfer, PayPal
- **POS Register Integration**: Cash payouts linked to register sessions
- **Idempotency**: Duplicate prevention on all financial operations

**Cost Flow (Working):**
```
Customer sells cards -> FOH quotes & pays -> BOH verifies ->
Stock posted to Saleor -> BUYLIST_RECEIPT cost event created ->
WAC recalculated (aggregates across all sources) -> COGS available for margin analysis
```

**Gap:** No end-to-end integration test covering the full FOH -> BOH -> stock -> cost event -> WAC flow. Individual components tested well.

**Key Files:** `saleor-apps/apps/buylist/src/modules/{buylists,boh,pricing}/`

---

### 2.4 Minimal POS / Buylist Cash Payout Tracking (90%)

**What Works:**
- **Register Management**: Open/close with denomination-based cash counting, variance reconciliation
- **Transaction Processing**: SALE, RETURN, EXCHANGE, NO_SALE types with full status workflow
- **Cash Payments**: Amount tendered, automatic change calculation using Decimal.js (no float rounding)
- **Cash Movement Audit**: Complete record of all cash in/out including PAYOUT type for buylist payouts
- **Store Credit System**: CustomerCredit with balance tracking, issuance from buylist, redemption at POS
- **Receipt Generation**: HTML receipt with barcode, print audit trail
- **Saleor Order Creation**: Draft order on completion, maps POS lines to variants
- **Buylist Payout Integration**: Cash payouts create CashMovement records, linked to register sessions

**What's Missing:**
- **Tax calculation hardcoded to $0** -- CRITICAL for any taxable jurisdiction
- Card payment processing (Stripe Terminal) -- 40% infrastructure, not production-ready
- Discount/override UI (backend complete, frontend missing)
- Returns workflow (placeholder UI only)

**Key Files:** `saleor-apps/apps/pos/src/modules/{register,transactions,payments,customers,receipts}/`

---

### 2.5 Employee-Only Singles-Builder Cart (95%)

**What Works:**
- **Staff Authentication**: Route-level `isStaff` enforcement, non-staff redirected
- **Dedicated Channel**: `singles-builder` channel with 106,882 products / 534,410 variants synced
- **Advanced Search**: Debounced 300ms, virtualized list (handles 500k+ variants), Meilisearch-powered
- **Comprehensive Filtering**: Set name, rarity, price range, in-stock, condition, finish
- **Persistent Cart**: Zustand + localStorage, survives page refresh/restart
- **POS Handoff**: Auto-generated 6-char lookup code, metadata in Saleor checkout
- **POS Import**: One-click import from POS app via lookup code, loads all items into active transaction

**Complete Workflow:**
```
Staff searches cards -> Adds to cart -> Enters customer name/notes ->
Auto-generates lookup code (e.g., "ABC123") -> POS detects pending cart ->
Staff clicks "Import Cart" -> Items load into transaction -> Complete payment
```

**Minor Gaps:** Search uses Saleor GraphQL (200-500ms) instead of Meilisearch (sub-50ms); real-time stock not implemented; single cart per session.

**Key Files:** `storefront/src/app/singles-builder/`, `storefront/src/app/api/singles-builder/lookup/route.ts`

---

### 2.6 Meilisearch Sync (80%)

**What Works:**
- Full reindex script (557 lines) -- pulls all products via GraphQL, recreates index
- Delta sync script (426 lines) -- incremental by `updatedAt` field
- Reconciliation script (263 lines) -- detects count mismatches, auto-repairs
- Storefront integration with filters, sorting, pagination
- Health check with automatic GraphQL fallback

**What's Missing:**
- **No real-time webhook sync** -- product updates don't reflect until next manual sync run
- **Multi-channel pricing strategy undefined** -- single index works for webstore, but wholesale/different channels need separate price handling
- Documented as "Future Roadmap" in sync-contracts.md

**Performance:** <50ms p99 search latency. 100k+ documents indexed.

**Key Files:** `scripts/sync-meilisearch.py`, `scripts/meilisearch-delta-sync.py`, `storefront/src/lib/meilisearch.ts`

---

### 2.7 MTG Card Import App (10%) -- CRITICAL BLOCKER

**Current State:** Directory exists at `saleor-apps/apps/mtg-import/`. Contains 3 documentation files. **Zero implementation code.**

**What's Missing (Everything):**
- package.json, tsconfig, next.config
- Scryfall client with rate limiting and caching
- Prisma schema (ImportJob, ImportedProduct, SetAudit)
- Job queue with priority (0=prerelease, 1=reprint, 2=backfill)
- Import pipeline: 1 card -> 15 variants (5 conditions x 3 finishes)
- Channel listing creation with both price fields set
- Dashboard UI for job management
- On-demand new set import trigger
- Cron handler for background processing

**Planned:** 45 TypeScript/TSX files per build report. **Delivered:** 0.

**Legacy Alternative:** `scripts/mtg_scryfall_import/import_command.py` (543 lines, Django ORM). Creates products but bypasses GraphQL (no webhooks, no validation), doesn't generate condition/finish variants, and causes the known `discounted_price_amount = NULL` crash.

**Impact:** Cannot populate product catalog for MVP. The 100k+ products currently loaded were imported via the legacy script.

**Remediation:** 40-60 engineering hours (see Timeline).

---

### 2.8 Price Sync (60%) -- CRITICAL BLOCKER

**What Works:**
- Job queue: PriceSyncJob table with FULL/DELTA/VARIANT types
- Scryfall integration: Fetches prices, applies condition multipliers (NM=1.0, LP=0.9, MP=0.75, HP=0.5, DMG=0.25)
- Finish-aware pricing: Non-foil, foil, etched at different base prices
- Cron processor: Every 5 minutes, processes 100 variants per run
- Anomaly detection: 10% threshold triggers review, auto-approve below 5%
- Dashboard UI: Job management, pending updates, approval workflow
- tRPC endpoints: triggerFullSync, triggerDeltaSync, getReport, approveAll

**What's Broken (CRITICAL):**
```
Scryfall API -> Calculate price -> Store in SellPriceSnapshot -> ??? STUCK
```
**Prices never sync back to Saleor.** No GraphQL mutation calls `updateProductVariantChannelListing`. Storefront shows stale/null prices.

**Additional Gaps:**
- FULL sync not supported in cron (requires separate CLI worker)
- 100 variants per 5-min run = 500 hours to sync 100k variants
- Manual approval workflow not viable at scale (100k products)
- Single price source (Scryfall only)

**Remediation:** 8-12 engineering hours for writeback. See Timeline.

---

## 3. Critical Blockers

### Blocker 1: MTG Import App (Severity: CRITICAL)

| Aspect | Detail |
|--------|--------|
| **What** | App scaffolded, zero code implemented |
| **Impact** | Cannot create product catalog, cannot import new sets |
| **Workaround** | Legacy Django script (lacks variants, causes price bugs) |
| **Fix Effort** | 40-60 hours |
| **Dependencies** | None -- can start immediately |
| **Success Criteria** | Import test set (500 cards -> 7,500 variants) in <5 min |

### Blocker 2: Price Sync Writeback (Severity: CRITICAL)

| Aspect | Detail |
|--------|--------|
| **What** | Prices calculated but never published to Saleor storefront |
| **Impact** | Customers see null/stale prices |
| **Workaround** | Manual SQL updates (not sustainable) |
| **Fix Effort** | 8-12 hours |
| **Dependencies** | Products must exist (depends on Blocker 1) |
| **Success Criteria** | Price change visible on storefront within 5 minutes |

### Blocker 3: POS Tax Calculation (Severity: HIGH)

| Aspect | Detail |
|--------|--------|
| **What** | Tax hardcoded to $0.00 |
| **Impact** | Illegal in most US jurisdictions |
| **Workaround** | Launch in tax-exempt scenarios only (e.g., Oregon, resale-only) |
| **Fix Effort** | 8-16 hours (Saleor tax rules) or 1-2 weeks (AvaTax) |
| **Dependencies** | Business decision on tax approach |
| **Success Criteria** | Correct tax applied at POS checkout |

---

## 4. Staging Environment & Costs

### Current Architecture ($220/month)

| Service | Config | Monthly Cost |
|---------|--------|-------------|
| ECS Fargate (9 services) | 256-1024 CPU, 512-2048 MB | $84 |
| NAT Gateway (single-AZ) | 1x staging | $32 |
| RDS PostgreSQL | db.t3.small, 100 GB | $23 |
| Application Load Balancer | Path-based routing | $9 |
| ElastiCache Redis | cache.t3.micro | $7 |
| CloudFront CDN | PriceClass_100 | $5 |
| CloudWatch, S3, ECR, misc | Various | $10 |
| **Total** | | **$220/month** |

### Performance for Demo

All services running at <5% CPU utilization. API has 98.7% headroom. Database at 5.3% CPU with 55% free memory. Search returns in <50ms. Images cached via CloudFront at ~100ms. **Demo performance will be excellent.**

### Optimization Already Applied (Feb 2026)

$94/month savings already achieved: VPC endpoints removed (-$29), RDS right-sized (-$26), Dashboard scaled to 0 (-$9), Container Insights disabled (-$9), Worker/Meilisearch right-sized (-$11), MTG Import on-demand only (-$10).

### Further Optimization Available

| Option | Savings | Demo Impact | Recommendation |
|--------|---------|-------------|----------------|
| Fargate Spot (non-critical) | -$18/mo | None | Post-MVP |
| Scheduled shutdown (off-hours) | -$83/mo | Requires 2-5 min warm-up | Post-MVP |
| **Both combined** | -$101/mo | Minimal | Post-MVP |

**Recommendation:** Keep current $220/month configuration for MVP demo. No changes needed.

---

## 5. Development Drift & Scope Analysis

### Quantified Scope Expansion

| Metric | MVP Estimate | Actual | Multiple |
|--------|-------------|--------|----------|
| Terraform Modules | 2-3 | 12 | 4-6x |
| Custom Saleor Apps | 3 | 5 | 1.67x |
| Docker Services | 8-10 | 16 | 1.6-2x |
| Database Tables | 20-30 | 80+ | 2.7-4x |
| Infrastructure Commits | 5-10 | 37 | 3.7-7.4x |

### What Was Built Beyond MVP Requirements

**Infrastructure over-engineering (intentional, well-governed):**
- Full AWS VPC with multi-AZ architecture
- CloudFront CDN with Scryfall proxy
- Secrets management (SSM Parameter Store)
- IAM roles/policies, ECR registries
- DynamoDB for Stripe APL
- Comprehensive observability (Jaeger, OpenTelemetry, Sentry)

**POS built far beyond "minimal":**
- Full register session management with denomination tracking
- Transaction cart with SKU scanning, price overrides, discounts
- Multi-payment-method support (cash, card stubs, store credit)
- Receipt system with barcode generation
- Customer credit ledger (5 phases designed, Phase 1 complete)

**Additional systems built:**
- Store credit system (CustomerCredit with full ledger)
- Multi-tenant architecture across all apps
- Comprehensive audit logging (append-only events)
- 1,246 lines of Meilisearch sync automation

### Technical Debt Indicators

| Issue | Severity | Count |
|-------|----------|-------|
| POS test coverage | Critical | 1 test file for entire app |
| TODO/FIXME comments | Medium | 50+ across codebase |
| GraphQL deprecated usages | Medium | 909+ |
| React Compiler ESLint disabled | Low | Formik compatibility |
| Stale documentation | Low | 47 issues per council review |

### Assessment

The drift is **intentional and well-governed** (ADR-001, council reviews, drift prevention infrastructure). The infrastructure is production-grade. The concern is that it delayed MVP-critical features (MTG import, price sync writeback) in favor of production hardening that could have waited.

---

## 6. Missing Features & Implied Requirements

### Features Implied by MVP but Not Listed

| Feature | Implied By | Status | MVP-Critical? |
|---------|-----------|--------|---------------|
| Store credit system | Buylist payouts | Built | Yes |
| Customer accounts / auth | Ecommerce, POS | Built | Yes |
| Condition grading | Buylist, pricing | Built | Yes |
| Multi-channel management | Meilisearch req | Partial | Yes |
| Shipping configuration | Ecommerce | Missing | For online sales |
| Tax configuration | POS | Missing (hardcoded $0) | Yes |
| Email notifications | Ecommerce | Unverified | Yes |
| Reporting / analytics | Costing layer | Backend only | Nice-to-have |
| Sealed product cost allocation | Costing layer | Not built | Post-MVP |
| Multi-marketplace sync (TCGPlayer) | Price sync | Not built | Post-MVP |
| Offline POS mode | POS | Designed only | Post-MVP |

### Features Built But Not in Requirements (Scope Bloat)

| Feature | Cost to Build | Cost to Maintain | Should Keep? |
|---------|---------------|------------------|-------------|
| CloudFront CDN | 4+ commits | $5/month | Yes (fast images) |
| OpenTelemetry/Jaeger | Significant | $50-100/month | Defer to post-MVP |
| Multi-tenant architecture | Fundamental | Low | Yes (good design) |
| DynamoDB (Stripe APL) | 1 module | $1/month | Yes (needed) |
| 8 standard Saleor apps | Loaded | Cognitive overhead | Remove unused |

---

## 7. Market Research: MTG Singles Lifecycle

### The Complete Singles Lifecycle at an LGS

```
ACQUIRE -> GRADE -> PRICE -> LIST -> SELL -> SHIP -> TRACK COGS
```

**Acquire** through 4 channels: buylists (most profitable, 40-60% of market), collection purchases (bulk lots), cracking sealed product (high risk), and cross-platform arbitrage.

**Grade** using industry-standard 5-tier system (NM/LP/MP/HP/DMG). Condition directly determines price: LP = 80-90% of NM, MP = 60-75%, HP = 40-50%.

**Price** against TCGPlayer Market/Low as reference. Stores apply percentage-of-market rules, floor prices, condition multipliers. Prices must update minimum every 6 hours. Market shifts from bans, tournament results, and spoilers can move prices 300% overnight.

**List** across 2-4 channels simultaneously: own website, TCGPlayer, eBay, physical display case.

**Sell** through in-store POS (20-40% of revenue), TCGPlayer (30-50%), own website (5-15%), eBay (5-15%), events (5-10%).

**Ship** via PWE for orders under $20-30 (~$0.83 total, no tracking) or tracked bubble mailer for higher value (~$3.50-5.00).

**Track COGS** using Weighted Average Cost across all acquisition channels. This is the single biggest gap in existing platforms and our primary differentiator.

### Market Size & Timing

- **MTG revenue:** $1.7 billion in 2025 (59% YoY increase)
- **TCG market:** $7.5-8.4 billion (2025), projected $11.5-16.9 billion by 2031-2035
- **US game stores:** ~10,045 total, 6,088 single-owner (60.6%)
- **LGS net margins:** 5-10% -- "minimum threshold for business viability"
- **Buylist typical rates:** Cash 40-50% of market, Store Credit 60-70%

### Key Pain Points This Platform Solves

1. **Multi-channel inventory sync** -- overselling destroys marketplace reputation
2. **Pricing velocity** -- manual updates across 100k+ SKUs impossible
3. **COGS opacity** -- stores currently guess at margins (our #1 differentiator)
4. **Fee pressure** -- TCGPlayer 10.75% + $0.30/transaction makes low-value singles unprofitable

### Why the Window Is Open Now

- TCGPlayer/eBay facing FTC complaints for anti-competitive behavior
- BinderPOS locked exclusively to TCGPlayer post-acquisition
- Crystal Commerce losing 65% of users YoY
- TCGPlayer API closed to new developers
- Organized seller revolt (ROCC petition, formal complaints)
- No existing platform solves the full lifecycle well

---

## 8. Competitive Landscape

| Platform | Status | Strength | Weakness |
|----------|--------|----------|----------|
| **TCGPlayer Pro** | Dominant | Network effects, largest buyer pool | Rising fees (10.75%), closed API, FTC scrutiny |
| **BinderPOS** | TCGPlayer-exclusive | Vertical integration | Locked to TCGPlayer only, no independence |
| **Crystal Commerce** | Declining (-65% YoY) | Legacy base | Aging tech, outages, stores fleeing |
| **TCGSync** | Niche | Shopify sync, 0% sales fees | High price ($14,999 GBP/year) |
| **SortSwift** | Rising | Hardware+software integration | Newer, smaller ecosystem |
| **ShadowPOS** | New entrant | Auto-pricing, multi-channel | Unproven |
| **Syncrostore** | New entrant | AI-powered POS | Unproven |

### Our Differentiation

**WAC/COGS tracking is the genuine gap.** No competitor handles the full buylist-to-inventory-with-costing pipeline correctly. At 5-10% net margins, the difference between guessing and knowing your true cost basis is the difference between profit and loss.

### Honest Assessment of Saleor as Foundation

Saleor provides ~30-40% of what the MVP needs (commerce API, multi-channel, webhooks, checkout, auth). The remaining 60-70% (buylist, POS, pricing sync, condition handling, COGS) is the actual value proposition. This is an extension play, not a configuration exercise.

---

## 9. Actionable Timeline

### Phase 0: Critical Blockers (Weeks 1-3)

| Task | Effort | Dependencies | Deliverable |
|------|--------|-------------|------------|
| **Build MTG Import App** | 40-60 hrs | None | Import 500-card set -> 7,500 variants in <5 min |
| **Fix Price Sync Writeback** | 8-12 hrs | Products exist | Price changes visible on storefront in <5 min |
| **Implement Tax Calculation** | 8-16 hrs | Business decision | Correct tax at POS checkout |
| **Sync saleor-apps submodule** | 0.5 hrs | None | Local code matches remote |
| **End-to-end integration tests** | 16-24 hrs | Blockers 1&2 resolved | Buylist->costing, GR->reconciliation passing |

**Total Phase 0:** 73-113 hours (3-4 weeks at 25-30 hrs/week)

### Phase 1: Demo Polish (Weeks 3-4)

| Task | Effort | Deliverable |
|------|--------|------------|
| Configure 1-2 shipping methods | 2 hrs | Realistic rates in checkout |
| Verify email notifications | 4 hrs | Order confirmation emails working |
| Run full Meilisearch sync | 1 hr | Search index current |
| Test Stripe payment end-to-end | 2 hrs | Complete checkout in staging |
| Pre-populate demo inventory | 4 hrs | Key cards in stock for demo |
| Test full buylist->POS payout flow | 4 hrs | Complete cycle verified |
| Clean up stale branches | 0.5 hrs | Clear working tree |

**Total Phase 1:** ~18 hours (1 week)

### Phase 2: Post-Demo Hardening (Weeks 5-8)

| Task | Effort | Priority |
|------|--------|----------|
| POS test coverage (payment logic) | 40-60 hrs | P0 |
| Collection import UI (bulk import) | 20-30 hrs | P1 |
| Real-time Meilisearch webhooks | 12-16 hrs | P1 |
| Returns workflow | 20 hrs | P2 |
| Discount/override UI | 12-16 hrs | P2 |
| Reporting dashboard UI | 16-24 hrs | P2 |
| Documentation cleanup | 20-30 hrs | P2 |

### Phase 3: Market Readiness (Months 2-3)

| Task | Effort | Priority |
|------|--------|----------|
| Stripe Terminal (card payments at POS) | 2 weeks | P1 |
| Carrier integration (shipping rates) | 3-5 days | P1 |
| Customer-facing buylist page | 2-3 days | P1 |
| Analytics integration | 1-2 days | P2 |
| Offline POS resilience | 1 week | P3 |
| Multi-marketplace sync | 2-3 weeks | P3 |

### Visual Timeline

```
Week 1-2:  [=== MTG Import App ===========================]
           [== Price Sync Fix ==]
           [=== Tax Calc ===]
           [= Submodule Sync =]

Week 3:    [=== Integration Tests ==========]
           [= Demo Polish =]

Week 4:    [= Final Demo Prep =]
           [STAGING DEMO] <-- Target presentation date

Week 5-8:  [=== POS Test Coverage =====================]
           [=== Collection Import UI ========]
           [== Meilisearch Webhooks ==]
```

---

## 10. Risk Register

### Pre-Presentation Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| MTG import app not ready in time | Critical | Medium | Prioritize over all else; legacy script as fallback |
| Price sync writeback fails | Critical | Low | Simpler fix; can manually update demo data |
| Meilisearch down during demo | Medium | Low | Health check with GraphQL fallback exists |
| Stripe payment fails in staging | Medium | Low | Test before demo; mock payment as fallback |
| Null prices crash storefront | High | Medium | Run SQL fix: `SET discounted_price_amount = price_amount` |

### Strategic Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Scryfall API dependency (volunteer-run, no SLA) | High | Local bulk data mirror; never in sync path; abstract data source |
| TCGPlayer API closed to new developers | High | Plan around constraint; manual export/import; JustTCG alternative |
| Tax compliance varies by jurisdiction | Medium | Document limitation; launch in known-state jurisdictions |
| Condition grading subjectivity | Medium | Photo documentation workflow; clear standards; configurable multipliers |
| Small TAM (~6,000 single-owner LGS) | Medium | Focus on operational backbone, not marketplace competition |
| Maintenance cost ($150-288K/year) | High | Break-even at 125-240 stores at $99/month |

---

## 11. Recommendations

### For the Presentation

1. **Lead with WAC/COGS** -- this is the genuine differentiator no competitor offers. Show a store owner their true margin per card.
2. **Demo the buylist workflow** -- FOH quote -> BOH verify -> stock posted -> cost event created -> WAC recalculated. This is the most complete and impressive flow.
3. **Show the singles-builder -> POS handoff** -- staff builds cart, generates code, POS imports with one click. This is unique functionality.
4. **Acknowledge shipping/fulfillment as Phase 2** -- honest framing prevents tough questions.
5. **Have answers for**: "Why not TCGPlayer Pro?" (COGS, no lock-in, FTC issues), "Is Saleor the right foundation?" (30-40% for free, extension model works), "What about offline?" (Phase 3, acceptable for MVP).

### For Engineering Priority

1. **MTG Import App is the gating item** -- nothing else matters if the product catalog can't be populated properly
2. **Price sync writeback is the highest-ROI fix** -- 8-12 hours to make prices visible
3. **Tax decision needed from business** -- Saleor tax rules (fast), AvaTax (thorough), or defer (Oregon-only launch)
4. **POS test coverage is the production-launch gate** -- cannot ship financial software without tests

### For Cost Management

- Keep staging at $220/month through demo (no changes needed)
- Post-demo: evaluate Fargate Spot (-$18/month) and scheduled shutdown (-$83/month)
- Long-term: $119/month achievable with both optimizations

### What NOT to Build for MVP

- Marketplace (don't compete with TCGPlayer's buyer pool)
- AI card recognition (fast autocomplete beats camera for experienced staff)
- Mobile native app (responsive web is sufficient)
- Multi-game support (nail MTG first)
- Social/community features (stores use Discord)
- Offline mode (Phase 3 -- internet required is acceptable)

---

## Appendix A: Key File Locations

| Component | Location |
|-----------|----------|
| Storefront | `storefront/src/app/[channel]/(main)/` |
| Singles Builder | `storefront/src/app/singles-builder/` |
| Inventory Ops | `saleor-apps/apps/inventory-ops/` |
| Buylist | `saleor-apps/apps/buylist/` |
| POS | `saleor-apps/apps/pos/` |
| MTG Import (empty) | `saleor-apps/apps/mtg-import/` |
| Price Sync | `saleor-apps/apps/inventory-ops/src/app/api/cron/price-sync/` |
| Meilisearch Sync | `scripts/sync-meilisearch.py`, `scripts/meilisearch-delta-sync.py` |
| Infrastructure | `infra/terraform/` |
| Sync Contracts | `docs/reference/sync-contracts.md` |
| Architecture | `docs/reference/architecture.md` |
| Staging Config | `infra/terraform/environments/staging.tfvars` |

## Appendix B: Research Sources

Market data sourced from: Hasbro Q4 2025 earnings ($1.7B MTG revenue), Mordor Intelligence TCG market sizing, FTC petition filings (ROCC, May 2024), TCGPlayer seller complaint letters (Jan 2024), Scryfall API documentation, TCGPlayer Card Conditioning Standards (March 2025), BinderPOS feature documentation, RenTech Digital game store census (10,045 US stores).

## Appendix C: Methodology

This report was produced through parallel analysis:
- 6 codebase exploration agents (storefront, inventory-ops/buylist, POS/singles-builder, Meilisearch/import/price-sync, infrastructure, scope drift)
- 3 market research agents (Gemini: lifecycle/competitors, Claude: operations/economics, Grok: contrarian/risks)
- All findings cross-referenced against actual code, git history (340 commits over 6 months), and Terraform state

---

*Report prepared February 13, 2026. Branch: `feature/mvp-readiness-report`*
