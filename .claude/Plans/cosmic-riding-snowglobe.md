# Plan: Fix VariantSelector to Read Attributes Instead of Parsing Names

## Context

The `VariantSelector` component on product detail pages parses variant **names** to extract condition and finish. This is broken because:

1. The mtg-import pipeline creates names like `"Near Mint - Non-Foil"` (full names)
2. The VariantSelector constants expect short codes: `"NM"`, `"Nonfoil"` (no hyphen)
3. The `VariantDetailsFragment` GraphQL fragment doesn't include `attributes` at all

The proper fix: add attributes to the fragment and read `mtg-condition` / `mtg-finish` attributes directly, with a name-parsing fallback. This is the same pattern the singles-builder's `SinglesResultItem` already uses successfully.

**Only 2 files change.** Everything else (mtg-import, sync-meilisearch, singles-builder, buylist, POS) already works correctly.

---

## Step 1: Extend GraphQL Fragment

**File:** `storefront/src/graphql/VariantDetailsFragment.graphql`

Add `attributes` block (matches the pattern already used by `SinglesBuilderSearch.graphql`):

```graphql
fragment VariantDetails on ProductVariant {
  id
  name
  quantityAvailable
  pricing {
    price {
      gross {
        currency
        amount
      }
    }
  }
  attributes {
    attribute {
      slug
      name
    }
    values {
      slug
      name
    }
  }
}
```

`ProductDetails.graphql` already uses `...VariantDetails` — it gains attributes automatically.

## Step 2: Run Codegen

```bash
cd storefront && pnpm run generate
```

This regenerates `src/gql/graphql.ts` with the new `VariantDetailsFragment` type including `attributes`. Verify the generated type has the `attributes` array.

## Step 3: Rewrite VariantSelector.tsx

**File:** `storefront/src/ui/components/VariantSelector.tsx`

### 3a. Replace Constants

Replace the short-code constants with full-name constants matching Saleor attribute values:

| Old | New |
|-----|-----|
| `CONDITION_ORDER = ["NM", "LP", ...]` | `CONDITION_ORDER: Record<string, number> = { "Near Mint": 0, "Lightly Played": 1, ... }` |
| `FINISH_ORDER = ["Nonfoil", "Foil", "Etched"]` | `FINISH_ORDER_LIST = ["Non-Foil", "Foil", "Etched", "Glossy"]` |
| `CONDITION_LABELS = { "NM": "NM" }` | `CONDITION_ABBREVIATIONS = { "Near Mint": "NM", ... }` |
| `FINISH_LABELS = { "Nonfoil": "Non-Foil" }` | `FINISH_LABELS = { "Non-Foil": "Non-Foil", ... }` |

Add attribute slug constants:
```typescript
const CONDITION_SLUG = "mtg-condition";
const FINISH_SLUG = "mtg-finish";
```

### 3b. Replace Parse Functions

Remove `parseVariantName()`. Replace `getConditionFromVariant(name: string)` and `getFinishFromVariant(name: string)` with attribute-reading versions that take a full variant object:

```typescript
function getConditionFromVariant(variant: VariantDetailsFragment): string {
  const value = variant.attributes
    ?.find((a) => a.attribute.slug === CONDITION_SLUG)
    ?.values[0]?.name;
  if (value) return value;
  // Fallback: parse name "Near Mint - Non-Foil"
  return variant.name.split(" - ")[0]?.trim() || variant.name;
}

function getFinishFromVariant(variant: VariantDetailsFragment): string {
  const value = variant.attributes
    ?.find((a) => a.attribute.slug === FINISH_SLUG)
    ?.values[0]?.name;
  if (value) return value;
  return variant.name.split(" - ")[1]?.trim() || "Non-Foil";
}
```

### 3c. Update All Callers

Every function that calls `getConditionFromVariant` or `getFinishFromVariant` now passes the variant object instead of `variant.name`:

- `getAvailableFinishes(variants)` — internal calls change
- `sortVariantsByCondition(variants)` — internal calls change
- `findBestAvailableVariant(variants, finish)` — internal calls change
- `findVariantByFinishAndCondition(variants, finish, condition)` — internal calls change
- Component body — `currentFinish`, `currentCondition`, button rendering

### 3d. Update JSX Rendering

- Condition buttons: use `CONDITION_ABBREVIATIONS[conditionFull]` for label, full name for tooltip
- Finish buttons: comparison uses `"Non-Foil"` / `"Foil"` / `"Etched"` (full attribute values)
- Foil styling triggers on `finish === "Foil"` (unchanged)
- Etched styling triggers on `finish === "Etched"` (unchanged)
- Default finish string changes from `"Nonfoil"` to `"Non-Foil"`

## Step 4: Build and Verify

```bash
cd storefront && pnpm run build
```

Note: API must be running for build (GraphQL introspection).

### Manual Verification Checklist

- [ ] Condition buttons show NM, LP, MP, HP, DMG labels (abbreviated)
- [ ] Condition sort: NM first, DMG last
- [ ] Finish buttons show Non-Foil, Foil, Etched as available
- [ ] Foil has amber gradient styling, Etched has slate gradient
- [ ] Out-of-stock variants are grayed/disabled
- [ ] Auto-redirect to best available variant works (NM Non-Foil preferred)
- [ ] Switching finish preserves condition when available
- [ ] Singles-builder still works (uses separate fragments, unaffected)
- [ ] Cart page displays variant names correctly

---

## Files Changed

| File | Change Type |
|------|-------------|
| `storefront/src/graphql/VariantDetailsFragment.graphql` | Add attributes field |
| `storefront/src/ui/components/VariantSelector.tsx` | Rewrite constants + helpers + rendering |
| `storefront/src/gql/graphql.ts` | Auto-regenerated (do not hand-edit) |

## Reference Files (read-only, for patterns)

| File | Why |
|------|-----|
| `storefront/src/app/singles-builder/[channel]/components/SinglesResultItem.tsx` | Working attribute-reading pattern |
| `storefront/src/graphql/SinglesBuilderSearch.graphql` | GraphQL attributes sub-selection |
| `saleor-apps/apps/mtg-import/src/modules/import/pipeline.ts` | Authoritative variant name format |

## Follow-up (Not Part of This Plan)

- **Saleor Configurator**: Add `config.yml` to repo for schema-as-code (product types, attributes, channels). Use in rebuild sequence: terraform apply -> configurator deploy -> mtg-import.
