# Backfill Product Attributes — Session Log (2026-02-27)

## Context

After importing ~76k MTG products into Saleor, 7 new product-level attributes were added to the `mtg-card` product type but existing products lacked values. A `backfillProductAttributes` tRPC endpoint was built to populate them from Scryfall bulk data.

## The 7 New Attributes

| Slug | Type | Example Value |
|------|------|---------------|
| `mtg-color-identity` | MULTISELECT | W, U, B, R, G |
| `mtg-colors` | MULTISELECT | W, U, B, R, G |
| `mtg-card-type` | MULTISELECT | Creature, Instant, Sorcery, Artifact, Enchantment, Legendary |
| `mtg-set-type` | DROPDOWN | expansion, core, masters, draft_innovation |
| `mtg-frame` | DROPDOWN | 1993, 1997, 2003, 2015, future |
| `mtg-border-color` | DROPDOWN | black, white, borderless, silver, gold |
| `is-oversized` | BOOLEAN | true/false |

## Bug 1: `productBulkUpdate` Does Not Exist in Saleor 3.22

### Symptom
Clicking "Backfill Product Attrs" in the mtg-import app UI → every batch fails with:
```
Unknown type "ProductBulkUpdateInput"
Cannot query field "productBulkUpdate" on type "Mutation"
```

### Root Cause
The `productBulkUpdate` GraphQL mutation was hallucinated by Claude during the Feb 20 "complete app" commit (`71948922`). It does not exist in Saleor 3.22 schema. The mutation and client method sat as dead code for a week. On Feb 27 (`629d455d`), the `backfillProductAttributes` endpoint was built on top of it — first time the broken mutation was invoked.

### Schema Reality (Saleor 3.22.26)
- `productBulkCreate` — exists
- `productBulkDelete` — exists
- `productBulkTranslate` — exists
- `productUpdate` — exists (single product, takes `id` + `ProductInput`)
- `productVariantBulkUpdate` — exists
- **`productBulkUpdate` — DOES NOT EXIST**

Confirmed via live schema introspection:
```bash
curl -s https://api.staging.michaelbean.org/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { mutationType { fields { name } } } }"}' | grep productBulk
```

### Fix (commit `8f22fbab` in saleor-apps)

**3 files changed:**

1. **`graphql-operations.ts`** — Replaced `PRODUCT_BULK_UPDATE_MUTATION` with `PRODUCT_UPDATE_MUTATION`:
   ```graphql
   mutation ProductUpdate($id: ID!, $input: ProductInput!) {
     productUpdate(id: $id, input: $input) {
       product { id name slug }
       errors { message code field }
     }
   }
   ```
   Replaced `ProductBulkUpdateResult` interface with `ProductUpdateResult`.

2. **`saleor-import-client.ts`** — Replaced `bulkUpdateProducts()` with:
   - `updateProduct(id, input)` — single product update
   - `updateProductsBatch(products, concurrency=10)` — concurrent wrapper using `Promise.allSettled`, processes N products at a time

3. **`import-router.ts`** — Updated `flushBatch()` to call `updateProductsBatch()`. Tracks `totalUpdated` separately from `totalErrors`.

4. **`index.ts`** — Updated barrel exports.

**Throughput:** Batches of 25 products, 10 concurrent calls per batch = ~50 products/sec. Full 76k catalog = ~25-30 min background job.

## Bug 2: Sentinel `saleorProductId: "existing"` Not Filtered

### Symptom
After fixing Bug 1, the mutations work but logs filled with:
```
Invalid ID: existing. Expected: Product.
```

### Root Cause
When the import job processor encounters a duplicate product (slug already exists in Saleor), it records the `ImportedProduct` row with `saleorProductId: "existing"` as a sentinel value — because the bulk create error doesn't return the existing product's ID.

The backfill query loaded ALL `ImportedProduct` rows including these sentinels, then tried to call `productUpdate(id: "existing", ...)`.

Every other query in the codebase already filters with `saleorProductId: { not: "existing" }` — the backfill was the only one missing it.

### Data Impact
- 78,026 total `ImportedProduct` rows
- ~84% have real Saleor IDs (created by their original import job)
- ~16% have `"existing"` sentinel (duplicates from re-imports)
- The 16% with sentinels CANNOT be backfilled without a separate ID resolution step

### Fix (commit `6b3d82e6` in saleor-apps)
One line added to the Prisma query in `backfillProductAttributes`:
```typescript
saleorProductId: { not: "existing" },
```

### Future: Resolving Sentinel IDs
To backfill the remaining ~16%, a separate step would need to:
1. Query Saleor for products by slug (constructed from card name + set code + collector number)
2. Update the `ImportedProduct.saleorProductId` from `"existing"` to the real ID
3. Then re-run the attribute backfill

This is tracked as a known gap but not blocking — 84% coverage is sufficient for now.

## Verification

After deploying the fix, confirmed via GraphQL that attributes were populated:
```bash
# Query most recently updated products
curl -s https://api.staging.michaelbean.org/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query":"{ products(first:3, channel:\"webstore\", sortBy:{field:LAST_MODIFIED_AT, direction:DESC}) { edges { node { name attributes { attribute { slug } values { name } } } } } }"}'
```

**Confirmed working on:**
- Delver of Secrets (ISD) — card-type: Creature, frame: 2003, border: black
- Lumbering Worldwagon (DFT) — colors: G, card-type: Artifact, border: borderless
- Lure (CHK) — colors: G, card-type: Enchantment, frame: 2003

First run got to batch 100 (2,500 products, 2,091 updated) before container restarted for new deploy. Needs re-trigger from Dashboard to process remaining ~63k products with real IDs.

## Commits

| Repo | Hash | Message |
|------|------|---------|
| saleor-apps | `8f22fbab` | fix(mtg-import): replace non-existent productBulkUpdate with concurrent productUpdate |
| saleor-apps | `6b3d82e6` | fix(mtg-import): exclude sentinel saleorProductId from backfill query |
| saleor-platform | `a6a9655` | chore: update saleor-apps submodule (fix backfillProductAttributes) |
| saleor-platform | `d9438e9` | chore: update saleor-apps submodule (exclude sentinel IDs from backfill) |

## Lessons

1. **Always introspect the live GraphQL schema before writing mutations.** Never treat existing code (even your own) as proof of API existence.
2. **Check sentinel/placeholder values in data.** When building new queries against an existing table, search the codebase for filter patterns already in use (e.g., `{ not: "existing" }`).
3. **The `productBulkUpdate` gap in Saleor 3.22 is real.** Individual `productUpdate` with concurrency is the workaround. `productVariantBulkUpdate` does exist for variant-level updates.

## How to Re-Run the Backfill

1. Open Saleor Dashboard → Apps → MTG Import → Sets page
2. Click **"Backfill Product Attrs"** button (top of page)
3. Monitor logs: `aws logs tail /ecs/saleor-platform-staging/mtg-import-app --follow --format short`
4. Look for progress every 100 batches and final "complete" message
5. Verify: query any product's attributes via GraphQL or Dashboard
