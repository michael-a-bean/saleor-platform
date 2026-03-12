# Pipeline Audit: MTG Import -> Buylist -> Inventory-Ops -> Webstore/Singles-Builder

**Date:** 2026-02-23
**Status:** Diagnosis complete, fixes pending
**Branch:** `platform/main` at commit `b546466`

---

## Executive Summary

Two bugs reported in the storefront pipeline:
1. **Webstore:** Condition/Finish selector headers render but buttons are empty
2. **Singles-builder:** All cards show "No variants"

Root causes traced to a combination of stale deployment, stale Meilisearch data, and a rapid sequence of interdependent fixes that each assumed prior fixes were deployed and data reprocessed.

---

## Bug 1: Webstore Condition/Finish Selector Buttons Missing

### Symptom
Product pages on the webstore channel show the "Condition" and "Finish" `<legend>` headers but render zero buttons underneath them.

### Key Files
- `storefront/src/ui/components/VariantSelector.tsx` — the component
- `storefront/src/graphql/VariantDetailsFragment.graphql` — GraphQL fragment
- `storefront/src/gql/graphql.ts` — generated types and query documents

### The Three-Commit Chain

These three commits rapidly modified VariantSelector.tsx within hours on Feb 22:

#### Commit 1: `ea7f01d` — Added selectors (WORKED)
- Added Condition and Finish fieldsets with name-parsing approach
- Parser expected format: `"Card Name - Condition (Finish)"`
- Actual mtg-import format: `"Near Mint - Non-Foil"`
- Parser accidentally worked for some cases, buttons were visible

#### Commit 2: `bed6297` — Fixed name format (PARTIALLY BROKEN)
- Changed to expect short codes: `"NM - Nonfoil"`
- **Critical bug:** `FINISH_ORDER = ["Nonfoil", "Foil", "Etched"]`
- Actual variant names use `"Non-Foil"` (with hyphen)
- `"Non-Foil" !== "Nonfoil"` — non-foil variants don't match FINISH_ORDER
- Result: For non-foil-only cards, no finish buttons render
- `CONDITION_ORDER = ["NM", "LP", "MP", "HP", "DMG"]` (short codes)
- Actual condition from names: `"Near Mint"` — doesn't match short codes
- Condition buttons still render (sorted by localeCompare) but with full names

#### Commit 3: `7bfacc2` — Switched to attributes (CORRECT)
- Added `attributes` field to VariantDetailsFragment.graphql
- Reads `mtg-condition` / `mtg-finish` from variant attributes
- Falls back to parsing variant name `"Near Mint - Non-Foil"` when attributes empty
- **Correct constants:** `FINISH_ORDER = ["Non-Foil", "Foil", "Etched", "Glossy"]`
- **Correct lookup:** `CONDITION_ORDER = { "Near Mint": 0, "Lightly Played": 1, ... }`
- Should work correctly with both attribute data and name fallback

### Ranked Hypotheses

#### Hypothesis 1 (MOST LIKELY): Stale Deployment — `bed6297` Running
The CI/CD pipeline (`deploy-staging.yml`) uses `dorny/paths-filter` to detect `storefront/**` changes. A git tracking anomaly was discovered: `git ls-files storefront/` returns nothing despite storefront files being in the git tree. This may cause the path filter to not detect storefront changes, meaning the `7bfacc2` build never triggered.

**Evidence:**
- `git ls-tree -r HEAD -- storefront/` returns 0 files (anomalous)
- `git show HEAD:storefront/src/ui/components/VariantSelector.tsx` DOES return content
- The `bed6297` code has the exact Nonfoil/Non-Foil mismatch that would produce empty buttons for non-foil cards

**Verification:**
```bash
# Check which image is running on ECS
aws ecs describe-services --cluster saleor-platform-staging --services storefront \
  --query 'services[0].deployments[0].taskDefinition' --output text
# Then check the image tag on that task definition
aws ecs describe-task-definition --task-definition <ARN> \
  --query 'taskDefinition.containerDefinitions[0].image' --output text
```

#### Hypothesis 2: Empty Variants Array from Saleor API
If products lack `ProductVariantChannelListing` entries for the webstore channel, the GraphQL API returns products with `variants: []`. Both selector sections render headers but no buttons.

**Evidence:**
- The VariantSelector guards with `{variants && (` which is truthy for `[]`
- Empty array → `getAvailableFinishes([])` returns `[]` → no buttons

**Verification:**
```graphql
query {
  product(slug: "pick-any-card-slug", channel: "webstore") {
    name
    variants {
      id
      name
      quantityAvailable
      attributes { attribute { slug } values { name } }
    }
  }
}
```

#### Hypothesis 3: Attribute Value Mismatch
If variant attributes return truthy but non-matching values (e.g., wrong case or slug format), the attribute code path returns a value that bypasses the name-parsing fallback but doesn't match FINISH_ORDER.

**Evidence:** Least likely — the attribute reading uses `?.values[0]?.name` which should return the full display name.

### The VariantSelector Rendering Logic (Current Code)

```
getAvailableFinishes(variants):
  for each variant → getFinishFromVariant(variant)
    1. Read variant.attributes.find(slug === "mtg-finish").values[0].name
    2. If truthy → return it
    3. Else → parse variant.name.split(" - ")[1] || "Non-Foil"
  Filter FINISH_ORDER by collected finishes
  → If NONE match FINISH_ORDER → empty array → no finish buttons

currentFinish = selectedVariant's finish || availableFinishes[0] || "Non-Foil"
variantsForFinish = variants.filter(finish === currentFinish)
sortedConditionVariants = sort variantsForFinish by CONDITION_ORDER
  → If variantsForFinish is empty → no condition buttons
```

Both headers ALWAYS render (they're static `<legend>` elements). Buttons only render from `.map()` calls on computed arrays.

---

## Bug 2: Singles-Builder "No Variants" for All Cards

### Symptom
Every card in the singles-builder channel shows "No variants" text instead of variant rows.

### Key Files
- `storefront/src/app/singles-builder/[channel]/actions.ts` — Meilisearch search + transform
- `storefront/src/app/singles-builder/[channel]/components/SinglesResultItem.tsx` — display
- `scripts/sync-meilisearch.py` — Meilisearch sync script

### Root Cause: Stale Meilisearch Data

**The data flow:**
1. `sync-meilisearch.py` queries Saleor API for products + variant attributes
2. Before `613b66d`: if variant `attributes: []`, condition/finish stored as `null` in Meilisearch
3. After `613b66d`: falls back to parsing variant name → correct values
4. `transformMeilisearchProduct()` in `actions.ts` constructs variant objects from Meilisearch data:
   ```javascript
   name: `${v.condition} - ${v.finish}`,  // "null - null" if data is stale
   attributes: [{ attribute: { slug: "mtg-condition" }, values: [{ name: v.condition }] }]
   ```
5. `SinglesResultItem` filters: `condition === "Near Mint" || inStock || isInCart`
6. With null condition: `null !== "Near Mint"` → filtered out → "No variants"

**The Meilisearch index was last synced BEFORE `613b66d` added the name-parsing fallback**, so all condition/finish values are null.

### Singles-Builder Index Strategy

**Timeline of the index strategy:**

| Date | Event | State |
|------|-------|-------|
| Dec 2025 | Meilisearch integration created | sync script defaults to `--channel singles-builder` |
| Feb 2026 | Terraform task definition set | Hardcoded `--channel webstore` only |
| Feb 22 | `3ea1751` committed | Changed storefront to read `webstore` index (because `singles-builder-products` never existed) |
| Feb 23 | `6a7aedd` committed | Terraform now syncs BOTH channels in scheduled tasks |

**Current state:**
- Terraform 15-min delta sync: runs for BOTH webstore and singles-builder channels
- Terraform 6AM full sync: runs for BOTH channels
- Storefront singles-builder: reads from `webstore` index (should revert to own index)
- `singles-builder-products` index: NOW being populated (since 6a7aedd)

**Recommendation:** Revert `3ea1751` — singles-builder should read from its own dedicated index now that Terraform populates it. This provides clean channel separation.

---

## Saleor Channel/Warehouse/Shipping Zone Audit

### The Critical Triangle

For a variant to show `quantityAvailable > 0`, ALL three must be connected:

```
    Channel ←── Shipping Zone ──→ Warehouse
        │                             │
        │    Must form a connected    │
        │    graph for stock to be    │
        │    visible & purchasable    │
        └─────────────────────────────┘
```

### Key Saleor Behaviors

1. **Stock is warehouse-scoped, NOT channel-scoped** — both channels share physical inventory from the same warehouse(s)
2. **`quantityAvailable` computation:**
   - Variant must have `ProductVariantChannelListing` for the channel
   - Warehouse must be linked to the channel
   - A shipping zone must connect the warehouse to the channel
   - Without address: returns max from any single shipping zone
   - With address: sums across eligible warehouses
3. **Dropdown attribute values auto-created** by `productBulkCreate` — no pre-creation needed
4. **Product needs BOTH** `ProductChannelListing` (product-level visibility) AND `ProductVariantChannelListing` (variant-level pricing) per channel

### Our Apps' Conformance

#### mtg-import (pipeline.ts)
- Creates `ProductChannelListing` for all configured channels (default: webstore + singles-builder) ✅
- Creates `ProductVariantChannelListing` with both `price` and `costPrice` per channel ✅
- Sets both `price_amount` and `discounted_price_amount` (prevents NULL crash) ✅
- Initializes stock at all warehouses with qty=0 ✅
- After `ffaa3532`: sets mtg-condition/mtg-finish variant attributes ✅
- Before `ffaa3532`: variants had `attributes: []` ⚠️ (100k+ products need backfill)

#### buylist BOH (boh-router.ts)
- SKU parsing: now handles 3-segment format `{prefix}-{condition}-{finish}` ✅ (fixed in `a48150d`)
- Throws on missing condition variant instead of silent fallback ✅ (fixed in `9f229b0`)
- Adds stock to the CORRECT condition-specific variant ✅
- Uses specific warehouse (`buylist.saleorWarehouseId`) ✅
- Hardcodes channel to "webstore" for variant searches ⚠️ (works but not flexible)

#### inventory-ops
- Updates variant pricing per channel via `productVariantChannelListingUpdate` ✅
- Queries warehouses with their shipping zones ✅

#### sync-meilisearch.py
- Reads condition/finish from variant attributes ✅
- Falls back to name parsing when attributes empty ✅ (added in `613b66d`)
- Queries products with channel parameter ✅

### Potential Gap: Singles-Builder Shipping Zone

If the `singles-builder` channel doesn't have a shipping zone linking its warehouse(s), `quantityAvailable` will be 0 for all variants in that channel. This needs verification:

```graphql
query {
  channels {
    name
    slug
    warehouses { name slug }
  }
}
# Then check shipping zones for each warehouse
```

---

## Existing Product Data Issues

### 100k+ Products with Empty Variant Attributes

Products imported before `ffaa3532` (Feb 22) have `attributes: []` on all variants. This means:
- Saleor stores no mtg-condition/mtg-finish values for these variants
- GraphQL queries return variants with empty attribute values arrays
- The name-parsing fallback in VariantSelector handles this correctly
- The Meilisearch sync script's name-parsing fallback handles this correctly
- **But:** direct attribute-based lookups will fail until backfilled

### Meilisearch Index Data

If synced before `613b66d`, all variants have `condition: null, finish: null`. This breaks:
- Singles-builder variant display (condition filter fails)
- Any Meilisearch-based filtering by condition/finish

---

## Fix Plan (Ordered Steps)

### Step 1: Verify Deployed Storefront Version
**Priority: CRITICAL — do this first**

```bash
# Check which task definition is running
aws ecs describe-services --cluster saleor-platform-staging --services storefront \
  --query 'services[0].deployments[0].taskDefinition' --output text

# Check the image tag on that task definition
aws ecs describe-task-definition --task-definition <TASK_DEF_ARN> \
  --query 'taskDefinition.containerDefinitions[0].image' --output text

# The image tag should match the SHA of a commit AFTER 7bfacc2
# If it matches bed6297 or ea7f01d, the storefront needs a forced redeploy
```

### Step 2: Force Redeploy Storefront (if stale)
**Priority: CRITICAL**

```bash
# Option A: Trigger via GitHub Actions
gh workflow run deploy-staging.yml -f force_all=true

# Option B: Manual ECS force deployment
aws ecs update-service --cluster saleor-platform-staging --service storefront \
  --force-new-deployment
```

### Step 3: Verify Saleor API Variant Data
**Priority: HIGH — confirms or rules out hypothesis 2**

Run this GraphQL query against the staging API to check if variants are returned:

```graphql
query {
  product(slug: "pick-any-known-card-slug", channel: "webstore") {
    name
    variants {
      id
      name
      quantityAvailable
      attributes {
        attribute { slug name }
        values { slug name }
      }
      pricing {
        price { gross { amount currency } }
      }
    }
  }
}
```

**Expected:** Variants array should be non-empty. If empty, investigate channel listings.

### Step 4: Run Full Meilisearch Re-sync
**Priority: HIGH — fixes singles-builder immediately**

```bash
# Run locally if Meilisearch is accessible, or trigger ECS task
export SALEOR_ADMIN_EMAIL='...'
export SALEOR_ADMIN_PASSWORD='...'

# Full reindex for both channels
python scripts/sync-meilisearch.py --full --channel webstore
python scripts/sync-meilisearch.py --full --channel singles-builder
```

This will:
- Delete and recreate both indexes
- Fetch all products from Saleor with variant attributes
- Use name-parsing fallback for variants with empty attributes
- Populate correct condition/finish values

### Step 5: Revert Singles-Builder to Own Index
**Priority: MEDIUM — clean architecture**

In `storefront/src/app/singles-builder/[channel]/actions.ts` line ~149:

```typescript
// CHANGE FROM:
indexPrefix: "webstore",
// CHANGE TO:
indexPrefix: "singles-builder",
```

This is safe now because Terraform (since `6a7aedd`) populates the `singles-builder-products` index.

### Step 6: Verify Shipping Zone Configuration
**Priority: MEDIUM — ensures quantityAvailable works for singles-builder**

In Saleor Dashboard:
1. Go to Configuration → Shipping Zones
2. Verify that EACH warehouse assigned to the `singles-builder` channel has a shipping zone connecting it
3. If missing, create a shipping zone for the singles-builder channel covering the relevant warehouse(s)

### Step 7: Backfill Variant Attributes (Long-term)
**Priority: LOW — the name-parsing fallback handles this**

For the 100k+ products imported before `ffaa3532`, variant attributes are `[]`. Options:
- **Re-import:** Run mtg-import with the updated pipeline (will create new products, not update existing)
- **Bulk update mutation:** Write a script using `productVariantBulkUpdate` to set mtg-condition/mtg-finish on existing variants
- **Accept fallback:** The name-parsing fallback works correctly — this is cosmetic/architectural

---

## Git Tracking Anomaly (Side Finding)

During investigation, discovered that `git ls-files storefront/` and `git ls-tree -r HEAD -- storefront/` return 0 results, despite:
- `git show HEAD:storefront/src/...` working correctly
- Commits showing storefront file changes in `--name-only`
- `git rev-parse HEAD:storefront/...` returning valid blob hashes

This may affect the CI `dorny/paths-filter` change detection. **Recommendation:** Investigate why storefront files are in the git tree but not in `git ls-files`. This could be the root cause of missed deployments.

---

## Commit Reference (Chronological)

| Commit | Date | Description | Impact |
|--------|------|-------------|--------|
| `ea7f01d` | Feb 22 11:45 | feat: show separate Condition and Finish variant selectors | Added selectors (name-parsing, partial bugs) |
| `bed6297` | Feb 22 ~13:00 | fix: parse variant names matching actual data format | Changed to short codes — introduced Nonfoil/Non-Foil mismatch |
| `3ea1751` | Feb 22 ~14:00 | fix: singles builder reads from webstore Meilisearch index | Pointed singles-builder at webstore index (correct at the time) |
| `7bfacc2` | Feb 22 15:07 | fix: read variant attributes instead of parsing names | Switched to attributes + correct name fallback |
| `613b66d` | Feb 22 18:04 | fix(sync): parse variant name as fallback when attributes empty | Added name fallback to Meilisearch sync |
| `ffaa3532` | Feb 22 18:04 | fix(mtg-import): set condition/finish variant attributes during import | Fixed import to populate variant attributes |
| `3f98ee0` | Feb 22 18:04 | chore: update saleor-apps submodule (mtg-import variant attributes) | Updated submodule pointer |
| `a48150d` | Feb 23 11:16 | fix(buylist): rewrite SKU parsing for three-segment format | Fixed {prefix}-{condition}-{finish} parsing |
| `9f229b0` | Feb 23 11:16 | fix(buylist): throw on missing condition variant | Prevents silent WAC corruption |
| `6a7aedd` | Feb 23 ~11:30 | fix(infra): switch meilisearch catchup from full to delta sync | Terraform now syncs both channels |
| `b546466` | Feb 23 11:18 | chore: update saleor-apps submodule (buylist SKU + safety fixes) | Latest submodule pointer |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MTG-IMPORT (pipeline.ts)                      │
│  Scryfall API → productBulkCreate                                   │
│  Channels: [webstore, singles-builder] (from ImportSettings)        │
│  Variants: 5 conditions x N finishes per card                       │
│  Each variant gets: SKU, name, price, costPrice, attributes, stock  │
│  ⚠ Pre-ffaa3532: attributes: []                                    │
│  ✅ Post-ffaa3532: attributes: [{mtg-condition}, {mtg-finish}]      │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      SALEOR (PostgreSQL)                             │
│                                                                      │
│  ProductChannelListing        → product visible in channel           │
│  ProductVariantChannelListing → variant has price in channel         │
│  Stock (per warehouse)        → warehouse-scoped, NOT channel-scoped │
│                                                                      │
│  ⚠ quantityAvailable requires:                                      │
│    variant channel listing + warehouse linked to channel +           │
│    shipping zone connecting warehouse to channel                     │
└───────┬──────────────────┬──────────────────┬───────────────────────┘
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌──────────────────────────┐
│   WEBSTORE    │  │  MEILISEARCH  │  │     BUYLIST BOH          │
│  Product Page │  │  SYNC WORKER  │  │                          │
│               │  │               │  │  SKU: {pfx}-{cond}-{fin} │
│  GraphQL →    │  │ sync-meili-   │  │  getConditionVariantId() │
│  ProductDe-   │  │ search.py     │  │  → stock to correct var  │
│  tailsQuery   │  │               │  │  → WAC per condition     │
│               │  │ Reads attrs   │  │                          │
│  VariantSe-   │  │ Falls back to │  │  ⚠ Throws on missing    │
│  lector.tsx   │  │ name parsing  │  │    (was silent fallback) │
└───────────────┘  └──┬────────┬───┘  └──────────────────────────┘
                      ▼        ▼
              ┌─────────┐ ┌──────────────┐
              │webstore-│ │singles-      │
              │products │ │builder-      │
              │ index   │ │products index│
              └────┬────┘ └──────┬───────┘
                   ▼             ▼
              ┌──────────────────────────────┐
              │      SINGLES-BUILDER         │
              │                              │
              │  searchWithMeilisearch()     │
              │  → transformMeilisearchProd  │
              │  → SinglesResultItem         │
              │                              │
              │  Filter: NM || inStock ||    │
              │          inCart              │
              │  ⚠ Currently reads webstore │
              │    index (should use own)    │
              └──────────────────────────────┘
```

---

## Quick Reference: What's Currently Broken vs Fixed in Code

| Component | Code Status | Data/Deploy Status |
|-----------|------------|-------------------|
| VariantSelector.tsx | ✅ Correct at `7bfacc2` | ⚠️ May not be deployed |
| VariantDetailsFragment.graphql | ✅ Includes attributes | ✅ Codegen matches |
| sync-meilisearch.py | ✅ Has name fallback | ⚠️ Indexes need re-sync |
| mtg-import pipeline.ts | ✅ Sets variant attrs | ⚠️ 100k existing products unpatched |
| buylist SKU parsing | ✅ 3-segment format | ✅ Deployed |
| buylist error handling | ✅ Throws on missing | ✅ Deployed |
| Terraform sync config | ✅ Both channels | ⚠️ Needs `terraform apply` verification |
| Singles-builder index prefix | ⚠️ Points to webstore | Should revert to singles-builder |
