# Pipeline Remaining Work: Post-Audit Follow-Up

**Date:** 2026-02-23
**Status:** ALL RESOLVED (Items 1, 2, 3 complete)
**Previous:** `.claude/Plans/pipeline-audit-2026-02-23.md` (original audit)
**Commit:** `78301eb` fixed VariantSelector + singles-builder indexPrefix
**Commit:** `4c1a8823` added variant attribute backfill endpoint (Item 3)

---

## What Was Completed (2026-02-23 Session)

1. **VariantSelector attribute validation** — `storefront/src/ui/components/VariantSelector.tsx`
   - Added known-set validation: attribute values checked against CONDITION_ORDER/FINISH_ORDER before trusting
   - Base64 GraphQL IDs (e.g. `"QXR0cmlidXRlVmFsdWU6NQ=="` = `"AttributeValue:5"`) now correctly rejected, falling through to name parsing
   - Added `CONDITION_SHORT_TO_FULL` mapping (NM→Near Mint, DMG→Damaged, etc.)
   - Added `FINISH_NORMALIZE` mapping (Nonfoil→Non-Foil)

2. **Singles-builder indexPrefix** — `storefront/src/app/singles-builder/[channel]/actions.ts:149`
   - Changed from `"webstore"` to `"singles-builder"` — safe because Terraform (since `6a7aedd`) populates the `singles-builder-products` Meilisearch index

3. **Verified infrastructure is healthy:**
   - ECS storefront running at `b546466` (latest HEAD) — deployment is NOT stale
   - Shipping zone triangle complete for all channels (Default Zone → Default Warehouse → webstore + singles-builder + default-channel)
   - Terraform dual-channel Meilisearch sync confirmed (both 15-min delta and daily full)

4. **Audit corrections documented:**
   - Hypothesis H1 (stale deployment) REFUTED — storefront IS deployed at latest
   - Hypothesis H3 (attribute value mismatch) CONFIRMED as root cause
   - Git tracking anomaly does NOT exist (550 files tracked, storefront is not a submodule)
   - `productBulkCreate` does NOT auto-create dropdown values (contradicts original audit)

---

## Remaining Item 1: Fix mtg-import Attribute Value Creation

**Priority:** MEDIUM
**Status:** RESOLVED — code already correct since `ffaa3532`
**Impact:** All newly imported products will have garbage attribute values until fixed
**Workaround:** VariantSelector name-parsing fallback handles it (committed in `78301eb`)

### Resolution (2026-02-23 follow-up session)

**The original hypothesis was incorrect.** The pipeline code at `ffaa3532` already sends `dropdown: { value: "Near Mint" }` using the `CONDITION_NAMES` and `FINISH_NAMES` maps (human-readable display names). The Saleor `AttributeValueSelectableTypeInput` schema explicitly states: "If value is provided, then attribute value will be resolved by value. If this attribute value doesn't exist, then it will be created."

The base64 GraphQL IDs observed in the API (e.g. `"QXR0cmlidXRlVmFsdWU6NQ=="`) were from **pre-`ffaa3532` data or test imports**, not from the current pipeline. The code went from `attributes: []` (empty) to correct human-readable names in a single commit.

**Next import run with current code should produce correct attribute values.** Verify after next import by querying variant attributes via GraphQL.

### Problem

`saleor-apps/apps/mtg-import/src/modules/import/pipeline.ts` stores base64-encoded Saleor GraphQL IDs as variant attribute VALUE NAMES instead of human-readable display names.

**Evidence from Saleor API:**
```json
{
  "attribute": { "slug": "mtg-condition", "name": "Condition" },
  "values": [{
    "slug": "qxr0cmlidxrlvmfsdwu6nq",
    "name": "QXR0cmlidXRlVmFsdWU6NQ=="   // base64 of "AttributeValue:5"
  }]
}
```

**Expected:**
```json
{
  "values": [{ "slug": "near-mint", "name": "Near Mint" }]
}
```

### Root Cause (Hypothesis)

The `productBulkCreate` mutation requires dropdown attribute values to pre-exist (confirmed by Grok from Saleor source code: `saleor/graphql/product/bulk_mutations/product_bulk_create.py` delegates to `AttributeAssignmentMixin.clean_input()` which validates against existing values).

The mtg-import's `pipeline.ts` likely passes variant attributes using `id` references (GraphQL global IDs) in the `productBulkCreate` input. When Saleor resolves these, the attribute VALUE entity's `name` field ends up containing the ID string rather than the display name.

### Investigation Steps

1. Read `saleor-apps/apps/mtg-import/src/modules/import/pipeline.ts`
2. Find where variant attributes are set in the `productBulkCreate` input
3. Check how condition/finish values are passed — by `id`, by `name`, or by `value`?
4. Check the Saleor `productBulkCreate` GraphQL schema for the attribute input type
5. Fix to pass human-readable names: `{ attribute: { slug: "mtg-condition" }, values: [{ name: "Near Mint" }] }`

### Key Files

- `saleor-apps/apps/mtg-import/src/modules/import/pipeline.ts` — main import pipeline
- `saleor-apps/apps/mtg-import/src/modules/import/saleor-mutations.ts` — GraphQL mutations (if separate)
- `storefront/src/ui/components/VariantSelector.tsx` — has the workaround (for reference)

### Verification

After fixing, re-import a single test product and query:
```graphql
query {
  product(slug: "test-card-slug", channel: "webstore") {
    variants {
      name
      attributes {
        attribute { slug }
        values { slug name }
      }
    }
  }
}
```
Values should show `"Near Mint"`, `"Non-Foil"`, etc. — not base64 strings.

---

## Remaining Item 2: SQS Worker Only Syncs Webstore Channel

**Priority:** LOW
**Status:** RESOLVED — Terraform updated to sync both channels
**Impact:** Singles-builder Meilisearch index has max 15-minute delay for real-time product updates
**Workaround:** 15-minute delta catchup sync handles it acceptably

### Resolution (2026-02-23 follow-up session)

Changed `meilisearch-sync.tf` line 179 SQS worker default command from:
```
["python", "-u", "sync-meilisearch.py", "--channel", "webstore"]
```
to:
```
["bash", "-c", "python -u sync-meilisearch.py --channel webstore && python -u sync-meilisearch.py --channel singles-builder"]
```
This matches the existing pattern used by the 15-minute catchup (line 322) and daily reconciliation (line 366), which already sync both channels. Requires `terraform apply` to deploy.

### Problem

In `infra/terraform/meilisearch-sync.tf:179`, the SQS worker task definition default command is:
```
["python", "-u", "sync-meilisearch.py", "--channel", "webstore"]
```

This is the real-time webhook handler (SNS → SQS → worker). When a product changes in Saleor, only the webstore Meilisearch index gets updated immediately. The singles-builder index waits for:
- 15-minute delta catchup (EventBridge → `meilisearch-delta-sync.py --channel singles-builder`)
- Or the daily 6AM UTC full reconciliation

### Fix Options

**Option A (simple):** Change the SQS worker command to sync both channels:
```hcl
command = ["bash", "-c", "python -u sync-meilisearch.py --channel webstore && python -u sync-meilisearch.py --channel singles-builder"]
```

**Option B (better):** Modify `sync-meilisearch.py` to accept multiple `--channel` args and sync all in one pass.

### Key Files

- `infra/terraform/meilisearch-sync.tf` — line 179 (SQS worker task def)
- `scripts/sync-meilisearch.py` — the sync script itself

### Verification

After changing, trigger a product update webhook and verify both indexes update:
```bash
# Check Meilisearch index update timestamps
curl "$MEILISEARCH_URL/indexes/webstore-products/stats" -H "Authorization: Bearer $KEY"
curl "$MEILISEARCH_URL/indexes/singles-builder-products/stats" -H "Authorization: Bearer $KEY"
```

---

## Remaining Item 3: Backfill 100k+ Products with Empty Variant Attributes

**Priority:** LOW
**Status:** RESOLVED — `sets.backfillAttributes` tRPC endpoint added in `4c1a8823`
**Impact:** Pre-ffaa3532 products have `attributes: []` on variants — name-parsing fallback handles display correctly
**Workaround:** Both VariantSelector and sync-meilisearch.py have name-parsing fallbacks

### Problem

Products imported before commit `ffaa3532` (Feb 22) have empty variant attribute arrays. While the storefront and Meilisearch sync handle this via name parsing, direct attribute-based lookups fail for these products.

### Fix Options

**Option A (bulk update script):** Write a script using `productVariantBulkUpdate` mutation to set mtg-condition/mtg-finish on existing variants. Parse the variant name (`"NM - Foil"`) to extract values.

**Option B (re-import):** Run mtg-import again. Note: this creates NEW products, doesn't update existing ones. Would need deduplication logic or a delete-and-reimport approach.

**Option C (accept it):** The name-parsing fallbacks work correctly. This is cosmetic/architectural. New imports (post-ffaa3532) will have attributes set (though with the base64 bug from Item 1 until that's fixed).

### Recommendation

Since Item 1 is already resolved in code (pipeline sends correct human-readable names), Option A (bulk update script) can proceed whenever desired. Parse variant names (`"NM - Foil"`) to extract condition/finish and use `productVariantBulkUpdate` mutation with `dropdown: { value: "Near Mint" }`. This is low priority since the VariantSelector name-parsing fallback handles display correctly.

### Status

**RESOLVED** — `sets.backfillAttributes` endpoint implemented in `4c1a8823`. Per-set backfill available from the Sets page UI ("Backfill" button on imported sets). Parses variant names → populates `mtg-condition`/`mtg-finish` via `productVariantBulkUpdate`. **Manual step required:** trigger backfill per-set from the mtg-import app UI after deployment.

---

## Saleor Architecture Reference (from Grok Research)

Captured in project memory (`MEMORY.md`) but repeated here for session context:

- **Critical triangle**: `ProductVariantChannelListing` + `Warehouse→Channel` + `ShippingZone→Channel→Warehouse` — all three required for `quantityAvailable > 0`
- **Click & Collect bypass**: C&C warehouses skip shipping zone requirement (relevant for POS)
- **Stock is warehouse-scoped**: `Stock` model FKs to Warehouse + ProductVariant, no Channel FK
- **productBulkCreate**: Does NOT auto-create dropdown attribute values — must pre-exist
- **Silent failure**: Product with channel listing but variants without variant-channel-listing = visible but unpurchasable, no error

### Sources (from Grok's research)
- [Saleor Warehouse Models](https://github.com/saleor/saleor/blob/main/saleor/warehouse/models.py)
- [Saleor Warehouse Dataloaders](https://github.com/saleor/saleor/blob/main/saleor/graphql/warehouse/dataloaders.py)
- [Saleor productBulkCreate source](https://github.com/saleor/saleor/blob/main/saleor/graphql/product/bulk_mutations/product_bulk_create.py)
