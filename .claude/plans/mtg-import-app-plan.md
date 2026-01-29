# MTG Import Saleor App - Design & Implementation Plan

**Created**: 2026-01-28
**Status**: IMPLEMENTATION COMPLETE - See mtg-import-build-report.md
**Build Date**: 2026-01-28

---

## Executive Summary

Build a dedicated Saleor App for MTG singles bulk import to replace the current fragmented script-based approach. The app will solve the 72+ hour import time, token expiry failures, and environment discrepancy issues.

---

## Problem Statement

### Current Issues (Verified)

| Issue | Evidence | Impact |
|-------|----------|--------|
| **Staging has 9,564 fewer products** | Local: 99,576 / Staging: 90,012 | Data inconsistency |
| **Singles-builder channel empty on staging** | 97,588 local / 0 staging | Employee workflow broken |
| **72+ hour imports** | Sequential processing | Unattended operation fails |
| **Token expiry every 5 min** | User tokens, not app tokens | Manual intervention required |
| **Direct ORM bypasses webhooks** | `import_command.py` uses Django | inventory-ops doesn't see products |
| **discounted_price_amount NULL** | ORM bypass skips validation | Frontend crashes |

### Root Causes

1. **No dedicated import infrastructure** - Ad-hoc scripts, no job queue
2. **Wrong token type** - User tokens expire; app tokens don't
3. **Sequential processing** - No parallelization
4. **No checkpointing** - Can't resume failed imports
5. **No reconciliation** - No way to detect/fix drift

---

## User Requirements (Confirmed via Questions)

| Requirement | User Choice | Implications |
|-------------|-------------|--------------|
| Speed vs Completeness | **Two-tier** | Initial bulk = complete; new sets = fast + worker |
| Import Strategy | **Hybrid** | Direct DB for bulk speed, GraphQL for updates (webhooks) |
| New Set Trigger | **Manual Dashboard** | Staff clicks when Scryfall has new set data |
| Discrepancy Fix | **App-first** | New app becomes the solution for staging sync |
| Audit Capability | **Required** | Verify sets/collections are fully imported |

### Import Strategy (Revised)

**Initial Bulk Import (100k existing products):**
- Direct DB writes for speed (target: <1 hour)
- **Fully complete** with ALL attributes in a single pass
- No background enrichment needed - worth the time to get complete data
- One-time operation to establish baseline

**New Set Imports (ongoing, ~300-500 cards per set):**
- Fast import via direct DB (base product + variants + pricing)
- Attributes filled in by background worker if needed
- Small enough that GraphQL is also viable for full-attribute import
- Triggered manually when Scryfall has new set data

### Audit Capability (New Requirement)

**Purpose:** Verify that sets or collections are fully and correctly imported.

**Audit Types:**
| Audit Type | Description | Example |
|------------|-------------|---------|
| Set audit | Compare Scryfall set against Saleor | `audit set:neo` |
| Collection audit | Custom query-based audit | `audit rarity:mythic set:one` |
| Attribute audit | Check for missing attributes | `audit attributes:incomplete` |
| Variant audit | Verify all finishes have variants | `audit variants:missing` |

**Audit Output:**
- Missing cards (in Scryfall, not in Saleor)
- Extra cards (in Saleor, not in Scryfall - e.g., deleted/renamed)
- Missing attributes (card exists but attributes incomplete)
- Missing variants (card exists but not all finishes have variants)
- Pricing gaps (variants without channel listings)

**Remediation:**
- Generate fix jobs from audit results
- One-click "import missing" for cards
- One-click "enrich" for missing attributes

---

## Research Findings

### Scryfall API

| Endpoint | Use Case | Notes |
|----------|----------|-------|
| Bulk Data (`default-cards`) | Initial import | 501MB JSON, ~100k English paper cards |
| Set API (`/sets`) | New set detection | Returns all sets, check `released_at` |
| Cards Search (`/cards/search?q=set:xxx`) | Per-set import | Paginated, follow `next_page` |

**Key Fields for Commerce:**
- `id` (Scryfall UUID) - Primary identifier
- `oracle_id` - Links all reprints
- `tcgplayer_id` - Price sync mapping
- `finishes` - Array: `["nonfoil", "foil", "etched"]`
- `prices.usd`, `prices.usd_foil`, `prices.usd_etched`
- `image_uris.normal` - Product images

**Rate Limits:** 10 req/sec for API, unlimited for bulk file downloads

### Saleor Bulk Mutations

| Mutation | Limit | Webhook Behavior |
|----------|-------|------------------|
| `productBulkCreate` | No explicit limit | Emits `PRODUCT_CREATED` |
| `productVariantBulkCreate` | 250 per call | Emits `PRODUCT_VARIANT_CREATED` |
| `productVariantChannelListingUpdate` | Batch supported | No dedicated webhook |

**Error Policy:** Use `IGNORE_FAILED` for partial success handling

### Existing Infrastructure

```
saleor-apps/apps/
├── inventory-ops/    # Prisma DB for WAC/COGS
├── buylist/          # Card buybacks
├── pos/              # Point of sale
└── [NEW] mtg-import/ # This app
```

**Token Handling:** App tokens (via APL) don't expire - critical for long-running jobs

---

## Proposed Architecture

### App Structure

```
saleor-apps/apps/mtg-import/
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── manifest/route.ts
│   │       ├── register/route.ts
│   │       └── cron/
│   │           ├── process-jobs/route.ts      # Job processor
│   │           └── attribute-enrichment/route.ts
│   ├── modules/
│   │   ├── import/
│   │   │   ├── bulk-import.ts           # Direct DB bulk loader
│   │   │   ├── graphql-import.ts        # GraphQL for updates
│   │   │   ├── scryfall-client.ts       # Scryfall API wrapper
│   │   │   ├── transform.ts             # Scryfall → Saleor mapping
│   │   │   └── checkpoint.ts            # Progress tracking
│   │   ├── jobs/
│   │   │   ├── job-queue.ts             # Prisma-based queue
│   │   │   ├── job-types.ts             # BULK_IMPORT, NEW_SET, ENRICH, SYNC
│   │   │   └── job-processor.ts         # Worker logic
│   │   ├── reconciliation/
│   │   │   ├── diff-checker.ts          # Compare environments
│   │   │   └── sync-fixer.ts            # Apply fixes
│   │   └── trpc/
│   │       └── trpc-router.ts           # Dashboard API
│   ├── pages/
│   │   ├── index.tsx                    # Dashboard home
│   │   ├── import.tsx                   # Bulk import UI
│   │   ├── new-set.tsx                  # New set import
│   │   ├── enrichment.tsx               # Attribute status
│   │   └── reconciliation.tsx           # Environment diff
│   └── lib/
│       ├── prisma.ts
│       └── saleor-client.ts
├── prisma/
│   └── schema.prisma                    # Job queue models
└── cli/
    └── process-jobs.ts                  # Heavy job runner (non-serverless)
```

### Database Schema (Prisma)

```prisma
model ImportJob {
  id              String   @id @default(uuid())
  installationId  String
  jobType         JobType
  status          JobStatus
  progress        Int      @default(0)
  totalItems      Int?
  checkpoint      Json?    // Resume data
  error           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  completedAt     DateTime?

  @@index([installationId, status])
}

model ImportedProduct {
  id              String   @id @default(uuid())
  scryfallId      String   @unique
  saleorProductId String
  lastSyncedAt    DateTime
  attributeStatus String   @default("BASE") // BASE, ENRICHED

  @@index([attributeStatus])
}

enum JobType {
  BULK_IMPORT
  NEW_SET
  ATTRIBUTE_ENRICHMENT
  CHANNEL_SYNC
  RECONCILIATION
  AUDIT
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}
```

---

## Key Design Decisions (Council Resolved - 2026-01-28)

### 1. Direct DB vs GraphQL - When to Use Each

**Two-Tier Strategy (Council Consensus):**

| Operation | Method | Completeness | Reason |
|-----------|--------|--------------|--------|
| **Initial bulk import** (100k products) | Direct DB | **Full attributes** | One-time, worth complete data |
| Variant creation (750k variants) | Direct DB | **Full** | Speed |
| Channel listings | Direct DB | **Full** | Speed |
| **New set imports** (<500 products) | Direct DB | Base + worker | Fast for time-sensitive releases |
| New set enrichment | Background worker | Deferred | Fills in attributes async |
| Price updates | GraphQL | N/A | Triggers webhooks for Meilisearch |
| Attribute updates (post-audit) | GraphQL | N/A | Triggers search re-index |

**Key Insight:** Initial bulk import happens once and establishes the baseline. Worth spending extra time to get ALL attributes correct. New sets need speed (customers want new cards fast), so base import + async enrichment is acceptable.

### 2. Webhook Triggering After Direct DB

**DECIDED: Hybrid Approach**
- GraphQL mutations for product/variant creation (triggers Saleor webhooks)
- Direct COPY for bulk pricing updates (owned data, no webhook needed)
- Explicit Meilisearch sync call after bulk operations
- Search sync is **blocking** for prerelease priority, async for backfill

### 3. Job Queue Architecture

**DECIDED: Prisma-based Queue with QueueService Interface**

| Component | Implementation |
|-----------|----------------|
| Queue storage | Prisma `ImportJob` model |
| Priority handling | `priority` column (0=prerelease, 1=reprint, 2=backfill) |
| Worker | CLI process polling for jobs |
| Interface | `QueueService` abstraction for future BullMQ migration |
| Deferred | Redis/BullMQ only if prerelease load testing proves insufficient |

**Why not BullMQ now:** Small team, bursty workload (not continuous), avoid operational complexity of another service to monitor.

### 4. Audit Strategy

**DECIDED: "Sellable Completeness" Metric**

Track per-set:
- `variant_count` - cards imported
- `priced_count` - cards with pricing
- `indexed_count` - cards in Meilisearch
- `sellable_timestamp` - when set became fully sellable

Audit must answer: **"Can I sell this card?"** (existence + pricing + indexed)

### 4. Achieving <4 Hour Import

**Strategy:**
1. **Parallel workers** - 8-10 concurrent DB connections
2. **Batch inserts** - 1000 products per INSERT
3. **Defer variant creation** - Create products first, variants second
4. **Skip validation** - Trust Scryfall data quality
5. **Bulk channel listings** - Single query per channel

**Estimated:**
- 100k products at 1000/batch = 100 batches
- At 2 sec/batch = 200 seconds for products
- 750k variants at 5000/batch = 150 batches
- At 3 sec/batch = 450 seconds for variants
- **Total: ~15 minutes** (vs 72+ hours)

### 5. Idempotency Strategy

**Approach:**
- Use `scryfallId` as external reference
- Check existence before insert
- Store processed IDs in `ImportedProduct` table
- Checkpoint every 1000 products

**Resume Logic:**
```python
last_checkpoint = get_checkpoint(job_id)
for card in scryfall_cards[last_checkpoint:]:
    if not exists_in_imported(card.id):
        import_card(card)
    save_checkpoint(current_index)
```

### 6. Handling discounted_price_amount NULL

**Approach:**
- In direct DB writes, always set both `price_amount` AND `discounted_price_amount`
- Post-import validation query to catch any NULLs
- Auto-fix: `UPDATE ... SET discounted_price_amount = price_amount WHERE NULL`

---

## Implementation Phases

### Phase 1: Core Infrastructure (2-3 days)
- [ ] Create app scaffold (`saleor-apps/apps/mtg-import`)
- [ ] Set up Prisma schema for job queue
- [ ] Implement Scryfall client (bulk download + caching)
- [ ] Create job queue and processor

### Phase 2: Bulk Import (2-3 days)
- [ ] Direct DB bulk insert for products **with ALL attributes**
- [ ] Direct DB bulk insert for variants (all finishes)
- [ ] Direct DB channel listings (both channels)
- [ ] Checkpoint/resume capability
- [ ] Post-import validation and fixes

### Phase 3: Dashboard UI (1-2 days)
- [ ] Import status page
- [ ] New set import trigger
- [ ] Audit trigger UI
- [ ] Job history and logs

### Phase 4: New Set Import + Enrichment Worker (1-2 days)
- [ ] Fast base import for new sets (direct DB)
- [ ] Background job for attribute enrichment (new sets only)
- [ ] GraphQL mutations for updates (triggers webhooks)
- [ ] Progress tracking

### Phase 5: Audit & Reconciliation (2 days)
- [ ] Set-level audit (compare Scryfall set vs Saleor)
- [ ] Collection-level audit (custom queries)
- [ ] Missing card detection
- [ ] Missing attribute detection
- [ ] Missing variant detection
- [ ] Audit report generation (JSON + dashboard view)
- [ ] One-click remediation jobs from audit results

### Phase 6: Environment Sync (1 day)
- [ ] Environment comparison (local vs staging vs prod)
- [ ] Ensure all products in configured channels
- [ ] Fix singles-builder gap
- [ ] One-click sync fixes

---

## Files to Reference

### Existing Import Scripts (Learn From)
- `scripts/mtg_scryfall_import/import_graphql.py` - GraphQL approach
- `scripts/mtg_scryfall_import/import_command.py` - Django ORM approach
- `scripts/mtg_scryfall_import/chunked_import.py` - Per-set chunking

### Existing App Patterns (Copy From)
- `saleor-apps/apps/inventory-ops/` - Job queue pattern
- `saleor-apps/apps/search/` - Meilisearch sync pattern

### Documentation
- `docs/analysis/2026-01-18-mtg-inventory-generation-council-analysis.md` - Council analysis
- `docs/reference/sync-contracts.md` - Webhook contracts
- `.claude/rules/database.md` - discounted_price_amount fix

---

## Next Session Checklist

1. [x] Revise import strategy (two-tier: initial=complete, new sets=fast+worker)
2. [x] Add audit capability to plan
3. [x] Council debate on architecture decisions (COMPLETED)
4. [ ] Create app scaffold
5. [ ] Implement Phase 1: Core Infrastructure
6. [ ] Implement Phase 2: Bulk Import
7. [ ] Implement Phase 3: Dashboard UI
8. [ ] Implement Phase 4: New Set Import + Enrichment
9. [ ] Implement Phase 5: Audit & Reconciliation
10. [ ] Implement Phase 6: Environment Sync
11. [ ] Test bulk import on staging (fix the 9,564 product gap)

---

## Key Metrics to Track

| Metric | Current | Target |
|--------|---------|--------|
| Full import time | 72+ hours | <1 hour |
| Products on staging | 90,012 | 99,576 (match local) |
| Singles-builder variants (staging) | 0 | 487,940 (match local) |
| Token expiry failures | Frequent | Zero |
| Manual intervention required | Always | Never |

---

## Session Handoff Notes

**Session 1 (2026-01-28):**
1. ✅ Archived all open plans (POS, Square Terminal, MVP Tests)
2. ✅ Created focused issues for remaining work
3. ✅ Deep research on Scryfall API, Saleor bulk mutations, MTG data modeling
4. ✅ Gathered user requirements via questions
5. ✅ Compared local vs staging environments (found 9,564 product gap)
6. ⏳ Council debate started but not completed (10% context)

**Session 2 (2026-01-28, continued):**
1. ✅ Revised import strategy: two-tier (initial=complete, new sets=fast+worker)
2. ✅ Added audit capability requirement
3. ✅ Updated implementation phases
4. ✅ Council debate COMPLETED - all decisions resolved
5. ⏳ Implementation ready to begin

**Council Decisions (2026-01-28):**
| Decision | Resolution |
|----------|------------|
| Job Queue | Prisma-based with `QueueService` interface, priority column |
| Webhook Strategy | Hybrid: GraphQL for creates, COPY for pricing, explicit Meilisearch sync |
| Audit Approach | "Sellable completeness" metric per-set |
| Search Sync | Blocking for prerelease, async for backfill |
| BullMQ | Deferred until proven necessary by prerelease load testing |

**What needs to happen:**
1. ~~Council debate~~ DONE
2. Begin app implementation (all phases)
3. Use new app to fix staging discrepancy

**Context preserved:**
- All research findings in this document
- User requirements confirmed and refined
- Two-tier import strategy documented
- Audit capability specified
- Implementation phases defined
- **Council decisions finalized**
