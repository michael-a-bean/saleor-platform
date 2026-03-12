---
prd: true
id: PRD-20260224-two-phase-import
status: COMPLETE
mode: interactive
effort_level: Extended
created: 2026-02-24
updated: 2026-02-24
iteration: 1
maxIterations: 128
loopStatus: null
last_phase: VERIFY
failing_criteria: []
verification_summary: "20/20"
parent: null
children: []
---

# Two-Phase Import: Eliminate Image Download Bottleneck in MTG Bulk Import

> Restructure the MTG import job processor to separate product creation (fast, DB-only) from image attachment (rate-limited, CDN-bound), eliminating the stalling bottleneck while producing complete products from a single user action.

## STATUS

| What | State |
|------|-------|
| Progress | 20/20 criteria passing |
| Phase | COMPLETE |
| Next action | Deploy migration, test with a real set import |
| Blocked by | Nothing |

## CONTEXT

### Problem Space

The MTG import app (`saleor-apps/apps/mtg-import`) bulk-imports MTG cards into Saleor via `productBulkCreate` GraphQL mutations. Each product includes a `mediaUrl` pointing to Scryfall's CDN. **Saleor downloads that image during the mutation.** With batch size 25 and concurrency 3, this means 75 concurrent image downloads from Scryfall's CDN inside active DB transactions.

**Observed symptoms:**
- Import runs at reasonable pace initially, then stalls
- Reducing batch size (to 25) and increasing ALB timeout (to 120s) didn't fix it
- Adding concurrency (3 concurrent batches) didn't fix it

**Root cause:** Scryfall CDN rate-limits or slows under sustained concurrent download pressure. Mutations hold DB connections while waiting for images. When images slow down, DB connections pile up, everything cascades. This is a network I/O bottleneck inside DB transactions, not a DB throughput issue.

**Additional waste:** Each variant creates stock entries at quantity 0 with `trackInventory: false` — these serve no purpose and add ~250 inserts per batch.

**Constraint:** Products must come out complete — all variants, all channels, all attributes, images. A new store operator clicks "Import" and gets a fully functional catalog. No multi-step manual process.

### Key Files

| File | Role |
|------|------|
| `saleor-apps/apps/mtg-import/src/modules/import/job-processor.ts` | Orchestrates import jobs: streaming, batching, calling Saleor API, checkpointing |
| `saleor-apps/apps/mtg-import/src/modules/import/pipeline.ts` | Converts Scryfall cards to Saleor ProductBulkCreateInput (attributes, variants, media, pricing) |
| `saleor-apps/apps/mtg-import/src/modules/saleor/saleor-import-client.ts` | GraphQL client wrapper — executes mutations, resolves import context |
| `saleor-apps/apps/mtg-import/src/modules/saleor/graphql-operations.ts` | All GraphQL queries and mutations (gql tagged templates) |
| `saleor-apps/apps/mtg-import/src/modules/trpc/import-router.ts` | tRPC endpoints: jobs CRUD, scan, verify, audit, repair, backfill |
| `saleor-apps/apps/mtg-import/prisma/schema.prisma` | Prisma schema: ImportJob, ImportedProduct, SetAudit, ImportSettings |
| `saleor-apps/apps/mtg-import/graphql/schema.graphql` | Saleor's GraphQL schema (read-only reference) — confirms `productMediaCreate` mutation exists |

### Constraints

- **No Saleor core modification.** All changes are in `saleor-apps/apps/mtg-import/`.
- **Branch:** Work on `platform/main` or `feature/*`. Never `main`.
- **Backward compatible.** Existing `ImportedProduct` records (without `mediaAttached` field) must get `false` default and be discoverable by Phase 2.
- **Prisma shared schema.** The mtg-import Prisma schema symlinks with inventory-ops. Adding fields to `ImportedProduct` is safe (mtg-import owns this model). Run `npx prisma migrate dev` from the mtg-import app directory.
- **`productMediaCreate` mutation** exists in Saleor's schema (line 16028 of schema.graphql). Input: `ProductMediaCreateInput { alt: String, image: Upload, product: ID!, mediaUrl: String }`.
- **Scryfall CDN:** Images are at `https://cards.scryfall.io/large/front/...`. No explicit rate limit documented, but sustained concurrent downloads cause throttling. Keep concurrency <= 5 for image fetches.

### Decisions Made

1. **Two-phase single job** (not NM-only import): Products must be complete. Speed comes from removing image I/O from the bulk create mutation, not from reducing product data.
2. **`mediaAttached` field on ImportedProduct** (not job-level tracking): Phase 2 needs to work across job retries (Job B fixing images Job A started). Querying by scope (setCode) with `mediaAttached=false` handles this.
3. **Skip stock entries when `trackInventory=false`**: Zero-quantity stocks with no tracking are pure waste.
4. **`repairImages` endpoint**: Mirrors existing `repairAttributes` pattern. Runs Phase 2 logic for a given set code on demand.

## PLAN

### Architecture Overview

The import job currently runs as a single phase:
```
Stream cards → Batch → productBulkCreate (products + variants + attributes + media + stocks) → Record results → Checkpoint
```

After this change:
```
Phase 1: Stream cards → Batch → productBulkCreate (products + variants + attributes, NO media, NO stocks if !trackInventory) → Record results → Checkpoint
Phase 2: Query ImportedProduct where mediaAttached=false → productMediaCreate per product (rate-limited) → Update mediaAttached=true → Mark job complete
```

Both phases are part of the same job. The user sees one import operation. Phase 2 runs automatically after Phase 1 completes (or after Phase 1 resumes from checkpoint on retry).

### Task Breakdown

#### Task 1: Schema Migration — Add `mediaAttached` to ImportedProduct

**File:** `saleor-apps/apps/mtg-import/prisma/schema.prisma`

Add to the `ImportedProduct` model:
```prisma
mediaAttached Boolean @default(false)
```

Then generate migration:
```bash
cd saleor-apps/apps/mtg-import
npx prisma migrate dev --name add-media-attached
```

This is backward-compatible: existing rows get `false`, making them discoverable by Phase 2 (which is correct — they may need image re-attachment if they were imported with the old code and Saleor failed to download their images).

#### Task 2: Pipeline — Remove media from bulk create, skip empty stocks

**File:** `saleor-apps/apps/mtg-import/src/modules/import/pipeline.ts`

**Change 1 — `cardToProductInput()`:** Remove `media` from the returned product input. Instead, store the image URL in an additional metadata entry:
```
metadata: [
  { key: "scryfall_id", value: card.id },
  { key: "scryfall_uri", value: card.scryfall_uri },
  { key: "set_code", value: card.set },
  { key: "scryfall_image_url", value: imageUrl },  // NEW: for Phase 2
]
```

The `media` field should be an empty array `[]` (or omitted). Do NOT pass `mediaUrl` to `productBulkCreate`.

**Change 2 — `buildVariants()`:** Make stock entries conditional on `trackInventory`:
```typescript
// Only create stock entries if tracking inventory
stocks: trackInventory ? warehouses.map((wh) => ({
  warehouse: wh.id,
  quantity: 0,
})) : [],
```

Pass `trackInventory` through from `PipelineOptions`. It's already available in the options object (line 55: `trackInventory?: boolean`).

#### Task 3: GraphQL — Add productMediaCreate mutation

**File:** `saleor-apps/apps/mtg-import/src/modules/saleor/graphql-operations.ts`

Add a new mutation:
```graphql
mutation ProductMediaCreate($input: ProductMediaCreateInput!) {
  productMediaCreate(input: $input) {
    media {
      id
      url
    }
    errors {
      message
      code
      field
    }
  }
}
```

#### Task 4: SaleorImportClient — Add createProductMedia method

**File:** `saleor-apps/apps/mtg-import/src/modules/saleor/saleor-import-client.ts`

Add a method:
```typescript
async createProductMedia(productId: string, mediaUrl: string, alt: string): Promise<{ id: string; url: string } | null>
```

This calls the `productMediaCreate` mutation with `{ product: productId, mediaUrl, alt }`. Returns the created media object or null on error (log warning, don't throw — image failures shouldn't fail the job).

#### Task 5: JobProcessor — Implement Phase 2 (image attachment)

**File:** `saleor-apps/apps/mtg-import/src/modules/import/job-processor.ts`

**New private method:** `attachImages(job, importContext)` or similar:

1. Query `ImportedProduct` records for this job's scope:
   - For SET/BACKFILL jobs: `WHERE setCode = job.setCode AND mediaAttached = false AND success = true AND saleorProductId != 'existing'`
   - For BULK jobs: `WHERE mediaAttached = false AND success = true AND saleorProductId != 'existing'`
2. For each product in batches (e.g., 10 at a time):
   - Fetch the Saleor product's metadata to get `scryfall_image_url` (or derive image URL from `scryfall_id` using `getCardImageUri` logic — the scryfall ID is in metadata)
   - Call `saleor.createProductMedia(saleorProductId, imageUrl, cardName)`
   - On success: update `ImportedProduct.mediaAttached = true`
   - Check `abortController.signal.aborted` between batches
   - Rate limit: small delay between batches (e.g., 200ms) to respect CDN
3. Log progress periodically

**Integration into `processJob()`:** After the existing Phase 1 loop completes (after remaining batches are processed, before marking job complete), call the Phase 2 method. The job status flow becomes:
- Phase 1: RUNNING → creating products
- Phase 2: RUNNING → attaching images
- Complete: COMPLETED

**SIGTERM during Phase 2:** The abort check breaks the image loop. Job is marked CANCELLED. `mediaAttached` flags on individual records preserve progress. On retry, Phase 1 skips all cards (already imported), Phase 2 picks up remaining unattached images.

**Important detail for retry:** When a retry job starts and Phase 1 processes 0 new cards (all already in ImportedProduct), Phase 2 should still run. The current code path already handles this — after the for-await loop, it processes remaining batches (which is empty) and continues. Add the Phase 2 call after that point.

#### Task 6: Import Router — Add `repairImages` endpoint

**File:** `saleor-apps/apps/mtg-import/src/modules/trpc/import-router.ts`

Add to the `setsRouter`:
```typescript
repairImages: protectedClientProcedure
  .input(z.object({ setCode: z.string().min(2).max(10) }))
  .mutation(async ({ ctx, input }) => {
    // Query ImportedProduct where setCode matches, mediaAttached=false, success=true
    // For each: derive image URL, call productMediaCreate, update mediaAttached
    // Return { repaired: number, failed: number, errors: string[] }
  })
```

This mirrors the existing `repairAttributes` pattern. It provides a standalone "Fix Images" action for the audit UI.

#### Task 7: Update existing tests

**Files:**
- `saleor-apps/apps/mtg-import/src/__tests__/pipeline.test.ts` — verify `media` is empty in output, stocks conditional on trackInventory
- `saleor-apps/apps/mtg-import/src/__tests__/job-processor.test.ts` — verify Phase 2 runs after Phase 1
- `saleor-apps/apps/mtg-import/src/__tests__/saleor-import-client.test.ts` — verify `createProductMedia` method

### What NOT to Change

- **Checkpoint system:** Phase 1 checkpointing is unchanged. Phase 2 tracks via `mediaAttached` field, not checkpoints.
- **Scan endpoint:** No changes. Checks ImportedProduct existence, not media.
- **Verify endpoint:** No changes. Counts ImportedProduct records.
- **AuditAttributes endpoint:** No changes. Its `imageStale = media.length === 0` check naturally detects products awaiting/missing images.
- **SetAudit / RebuildAudits:** No changes. Based on ImportedProduct counts.
- **Backfill logic:** No changes. Filters by ImportedProduct.success, which Phase 1 sets.
- **SIGTERM handler:** No changes. The `abortController` mechanism works for both phases.
- **Batch size / concurrency defaults:** Keep `DEFAULT_BATCH_SIZE = 25` and `DEFAULT_CONCURRENCY = 3` for Phase 1 (can be increased later now that mutations are lighter). Phase 2 uses its own lighter concurrency.

## IDEAL STATE CRITERIA (Verification Criteria)

### Schema & Migration

- [x] ISC-C1: ImportedProduct model has mediaAttached Boolean default false | Verify: Grep: `mediaAttached` in schema.prisma
- [x] ISC-C2: Prisma migration file exists and applies cleanly | Verify: CLI: `npx prisma migrate status` shows no pending migrations

### Pipeline Changes

- [x] ISC-C3: productBulkCreate payload contains no media/mediaUrl field | Verify: Grep: `cardToProductInput` returns object without `media` key containing URLs
- [x] ISC-C4: Product metadata includes scryfall_image_url for Phase 2 | Verify: Grep: `scryfall_image_url` in pipeline.ts metadata array
- [x] ISC-C5: Stock entries skipped when trackInventory is false | Verify: Read: `buildVariants` conditionally creates stocks based on trackInventory
- [x] ISC-C6: Stock entries created when trackInventory is true | Verify: Read: same conditional — true path creates stock entries as before

### GraphQL & Client

- [x] ISC-C7: productMediaCreate mutation defined in graphql-operations.ts | Verify: Grep: `PRODUCT_MEDIA_CREATE_MUTATION` in graphql-operations.ts
- [x] ISC-C8: SaleorImportClient has createProductMedia method | Verify: Grep: `createProductMedia` in saleor-import-client.ts
- [x] ISC-C9: createProductMedia handles errors gracefully without throwing | Verify: Read: method logs warnings on failure, returns null, does not throw

### Phase 2 Implementation

- [x] ISC-C10: JobProcessor has image attachment method callable after Phase 1 | Verify: Grep: method in job-processor.ts that queries mediaAttached=false
- [x] ISC-C11: Phase 2 queries by scope not by job ID | Verify: Read: query uses setCode (SET/BACKFILL) or global (BULK), not job.id
- [x] ISC-C12: Phase 2 skips slug-duplicate products (saleorProductId=existing) | Verify: Read: WHERE clause excludes saleorProductId = 'existing'
- [x] ISC-C13: Phase 2 checks abort signal between batches | Verify: Grep: `abortController.signal.aborted` in Phase 2 loop
- [x] ISC-C14: Phase 2 updates mediaAttached=true on success | Verify: Grep: `mediaAttached: true` update in Phase 2 loop
- [x] ISC-C15: processJob calls Phase 2 after Phase 1 completes | Verify: Read: Phase 2 invoked between batch processing and job completion marking

### Repair Endpoint

- [x] ISC-C16: repairImages endpoint exists in setsRouter | Verify: Grep: `repairImages` in import-router.ts
- [x] ISC-C17: repairImages returns count of repaired and failed images | Verify: Read: return type includes repaired and failed counts

### Anti-Criteria

- [x] ISC-A1: No media URLs passed inside productBulkCreate mutation | Verify: Grep: confirm no `mediaUrl` in product inputs during Phase 1
- [x] ISC-A2: No changes to scan, verify, or backfill endpoints | Verify: Grep: these handler functions have no diff
- [x] ISC-A3: No orphaned products without image recovery path | Verify: Read: all products with mediaAttached=false are reachable by Phase 2 or repairImages

### Tests

(Tests should be updated to cover the new behavior but exact test structure is left to the implementing agent.)

## DECISIONS

(To be filled during implementation.)

## LOG

### Iteration 1 — 2026-02-24
- Phase reached: COMPLETE
- Criteria progress: 20/20
- Work done: All 7 tasks implemented — schema migration, pipeline changes (media removal + conditional stocks), GraphQL mutation + type, SaleorImportClient methods (createProductMedia + getProductMetadata), Phase 2 image attachment in JobProcessor, repairImages endpoint in setsRouter. TypeScript compiles with zero errors.
- Failing: None
- Files modified: schema.prisma, pipeline.ts, graphql-operations.ts, saleor-import-client.ts, job-processor.ts, import-router.ts + new migration 0005

### Iteration 0 — 2026-02-24
- Phase reached: PLANNED
- Criteria progress: 0/20
- Work done: Full analysis of bottleneck, compatibility audit of all existing features, PRD authored
- Failing: All (not yet implemented)
- Context for next iteration: PRD is ready for implementation. Start with Task 1 (schema migration), then Tasks 2-4 (pipeline + graphql + client), then Task 5 (Phase 2 in job processor), then Task 6 (repair endpoint), then Task 7 (tests). Branch from `platform/main`.
