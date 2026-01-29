# MTG Import Saleor App - Design & Implementation Plan

**Created**: 2026-01-28
**Status**: PLANNING - Ready for Council Debate & Implementation
**Session Handoff**: Context at 10%, continue in new session

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
| Speed vs Completeness | **Incremental** | Fast base import, attributes fill in via background jobs |
| Import Strategy | **Hybrid** | Direct DB for bulk speed, GraphQL for updates (webhooks) |
| New Set Trigger | **Manual Dashboard** | Staff clicks when Scryfall has new set data |
| Discrepancy Fix | **App-first** | New app becomes the solution for staging sync |

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

## Key Design Decisions (To Be Debated by Council)

### 1. Direct DB vs GraphQL - When to Use Each

**Proposed Split:**
| Operation | Method | Reason |
|-----------|--------|--------|
| Initial bulk import (100k products) | Direct DB | Speed (10x faster) |
| Variant creation (750k variants) | Direct DB | Speed |
| Price updates | GraphQL | Triggers webhooks for Meilisearch |
| New set imports (<500 products) | GraphQL | Small enough, proper events |
| Attribute enrichment | GraphQL | Triggers search re-index |

### 2. Webhook Triggering After Direct DB

**Options:**
1. **Manual sync trigger** - After bulk import, call Meilisearch sync script
2. **Batch webhook emission** - Custom code to emit events post-import
3. **Hybrid** - Direct DB + explicit Meilisearch sync + inventory-ops notification

**Recommended:** Option 3 - Accept that initial bulk import is a special case

### 3. Job Queue Architecture

**Options:**
| Option | Pros | Cons |
|--------|------|------|
| Prisma queue | Simple, no new infra | Limited concurrency |
| Redis/BullMQ | Powerful, battle-tested | New dependency |
| Serverless (Vercel cron) | No infra | 5-min timeout |

**Recommended:** Prisma queue + CLI worker for heavy jobs

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
- [ ] Direct DB bulk insert for products
- [ ] Direct DB bulk insert for variants
- [ ] Checkpoint/resume capability
- [ ] Post-import validation and fixes

### Phase 3: Dashboard UI (1-2 days)
- [ ] Import status page
- [ ] New set import trigger
- [ ] Job history and logs

### Phase 4: Enrichment Worker (1 day)
- [ ] Background job for attribute enrichment
- [ ] GraphQL mutations for updates (triggers webhooks)
- [ ] Progress tracking

### Phase 5: Reconciliation (1 day)
- [ ] Environment comparison (local vs staging vs prod)
- [ ] Diff report generation
- [ ] One-click sync fixes

### Phase 6: Channel Sync (0.5 days)
- [ ] Ensure all products in configured channels
- [ ] Fix singles-builder gap

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

1. [ ] Resume Council debate with 4 agents (Architect, Engineer, Secondary Market, Saleor Expert)
2. [ ] Finalize design decisions from debate
3. [ ] Create app scaffold
4. [ ] Implement Phase 1: Core Infrastructure
5. [ ] Test bulk import on staging (fix the 9,564 product gap)

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

**What was accomplished this session:**
1. ✅ Archived all open plans (POS, Square Terminal, MVP Tests)
2. ✅ Created focused issues for remaining work
3. ✅ Deep research on Scryfall API, Saleor bulk mutations, MTG data modeling
4. ✅ Gathered user requirements via questions
5. ✅ Compared local vs staging environments (found 9,564 product gap)
6. ⏳ Council debate started but not completed

**What needs to happen next session:**
1. Complete Council debate on architecture decisions
2. Begin app implementation (Phase 1)
3. Use new app to fix staging discrepancy

**Context preserved:**
- All research findings in this document
- User requirements confirmed
- Architecture proposed
- Implementation phases defined
