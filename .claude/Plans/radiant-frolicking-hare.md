> **ARCHIVED** — Feature now in inventory-ops (Mar 2026). Attribute creation handled within consolidated app.

# Plan: Auto-Create Missing Attributes from MTG Import Dashboard

## Context

The MTG import app's dashboard displays a "System Not Ready" status when Saleor is missing required attributes on the `mtg-card` product type. Currently 10 of 23 attributes are missing. The dashboard shows which attributes are missing but provides **no way to fix it** — users must manually create each attribute in the Saleor Dashboard and assign them to the product type.

This plan adds a "Create Missing Attributes" action button to the dashboard that programmatically creates the missing attributes via the Saleor GraphQL API and assigns them to the `mtg-card` product type.

## Files to Modify

| File | Change |
|------|--------|
| `saleor-apps/apps/mtg-import/src/modules/saleor/graphql-operations.ts` | Add `ATTRIBUTE_BULK_CREATE_MUTATION` and `PRODUCT_ATTRIBUTE_ASSIGN_MUTATION` + result types |
| `saleor-apps/apps/mtg-import/src/modules/saleor/saleor-import-client.ts` | Add `createMissingAttributes()` method |
| `saleor-apps/apps/mtg-import/src/modules/trpc/import-router.ts` | Add `system.setupAttributes` mutation |
| `saleor-apps/apps/mtg-import/src/pages/index.tsx` | Add fix button UI with loading/result states |

## Implementation Steps

### Step 1: GraphQL Mutations (`graphql-operations.ts`)

Add two new mutations and their result types:

**`ATTRIBUTE_BULK_CREATE_MUTATION`** — Creates multiple attributes in one call:
```graphql
mutation AttributeBulkCreate($attributes: [AttributeCreateInput!]!) {
  attributeBulkCreate(attributes: $attributes, errorPolicy: REJECT_FAILED_ROWS) {
    count
    results {
      attribute { id slug name inputType }
      errors { field message code }
    }
    errors { field message code }
  }
}
```

Each `AttributeCreateInput` maps from `ATTRIBUTE_DEFS`:
- `name` → `def.name` (e.g., "Scryfall ID")
- `slug` → `def.slug` (e.g., "mtg-scryfall-id")
- `type` → `PRODUCT_TYPE` (all are product-level, not variant-level)
- `inputType` → `def.inputType` (PLAIN_TEXT, DROPDOWN, NUMERIC, BOOLEAN)

**`PRODUCT_ATTRIBUTE_ASSIGN_MUTATION`** — Assigns created attributes to the product type:
```graphql
mutation ProductAttributeAssign($productTypeId: ID!, $operations: [ProductAttributeAssignInput!]!) {
  productAttributeAssign(productTypeId: $productTypeId, operations: $operations) {
    productType { id slug productAttributes { id slug } }
    errors { field message code }
  }
}
```

Each `ProductAttributeAssignInput`:
- `id` → the created attribute's ID
- `type` → `PRODUCT` (product-level attributes, not variant)

Add TypeScript interfaces:
- `AttributeBulkCreateResult` — mirrors the mutation response shape
- `ProductAttributeAssignResult` — mirrors the assign mutation response

### Step 2: Client Method (`saleor-import-client.ts`)

Add `createMissingAttributes(missingDefs: AttributeDef[], productTypeId: string)` method:

1. Call `ATTRIBUTE_BULK_CREATE_MUTATION` with the missing attribute definitions
2. Collect the created attribute IDs from the results
3. Call `PRODUCT_ATTRIBUTE_ASSIGN_MUTATION` to assign them to the product type
4. Return a structured result: `{ created: number, assigned: number, errors: string[] }`

Import `ATTRIBUTE_BULK_CREATE_MUTATION`, `PRODUCT_ATTRIBUTE_ASSIGN_MUTATION` from graphql-operations. Import `AttributeDef` type from attribute-map.

### Step 3: tRPC Endpoint (`import-router.ts`)

Add `setupAttributes` mutation to `systemRouter`:

```typescript
setupAttributes: protectedClientProcedure.mutation(async ({ ctx }) => {
  const saleor = new SaleorImportClient(ctx.apiClient!);

  // 1. Get the product type (throws if missing — can't create attrs without it)
  const productType = await saleor.getProductType();

  // 2. Find missing attribute slugs
  const existingSlugs = new Set(productType.productAttributes.map(a => a.slug));
  const missingDefs = ATTRIBUTE_DEFS.filter(d => !existingSlugs.has(d.slug));

  if (missingDefs.length === 0) {
    return { created: 0, assigned: 0, errors: [], message: "All attributes already exist" };
  }

  // 3. Create and assign
  const result = await saleor.createMissingAttributes(missingDefs, productType.id);
  return result;
});
```

Export `systemRouter` already happens — no changes to `trpc-router.ts` needed since it re-exports.

### Step 4: Dashboard UI (`pages/index.tsx`)

Modify the readiness panel to add a "Create Missing Attributes" button when the `attributes` check fails:

1. Add `trpcClient.system.setupAttributes.useMutation()` hook
2. In the check rendering loop, when `check.name === "attributes"` and `check.status === "fail"`:
   - Show a `Button` labeled "Create Missing Attributes"
   - On click, run the mutation
   - Show loading state via `InlineSpinner` during mutation
   - On success, show notification via `useDashboardNotification` and call `readiness.refetch()`
   - On error, show error text

The button sits inline with the attributes check row, after the detail text.

## Existing Patterns to Reuse

- **`SaleorImportClient`** pattern: constructor takes `Client`, methods call `this.client.query/mutation`, throw `SaleorApiError` on failure
- **`ATTRIBUTE_DEFS`** and `AttributeDef` type from `attribute-map.ts` — already has all attribute metadata
- **`InlineSpinner`** from `@/ui/components` — for loading states
- **`useDashboardNotification`** from `@saleor/apps-shared/use-dashboard-notification` — for success/error toasts
- **`protectedClientProcedure`** from the tRPC setup — ensures auth context

## Verification

1. **Lint**: `cd saleor-apps/apps/mtg-import && pnpm lint`
2. **Type check**: `cd saleor-apps/apps/mtg-import && pnpm check-types`
3. **Build**: `cd saleor-apps/apps/mtg-import && pnpm build`
4. **Functional**: After deploying, dashboard should show "System Not Ready" with attributes failing, click "Create Missing Attributes", watch it transition to "System Ready" after refetch
