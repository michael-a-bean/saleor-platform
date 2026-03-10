---
task: Add Meilisearch search to inventory-ops PO creator
slug: 20260304-inventory-ops-meilisearch-po-search
effort: standard
phase: complete
progress: 12/12
mode: interactive
started: 2026-03-04T12:00:00-06:00
updated: 2026-03-04T12:05:00-06:00
---

## Context

Inventory-ops PO variant search uses Saleor GraphQL `productVariants` filter — same slow path (380k rows) as buylist had. Already fixed buylist with Meilisearch-first search. Applying same pattern here.

Key difference: PO search returns individual variants (SaleorVariant shape), while Meilisearch stores products with embedded variant arrays. Must flatten product hits → variant results.

### Key Files
- `inventory-ops/src/modules/meilisearch/client.ts` — Existing write-only Meilisearch client, add search method
- `inventory-ops/src/lib/saleor-client.ts` — Add Meilisearch-first `searchVariants` with Saleor fallback
- `inventory-ops/src/ui/components/variant-search-input.tsx` — Add 300ms debounce, collector number placeholder
- `inventory-ops/src/modules/purchase-orders/purchase-orders-router.ts` — Router calls updated searchVariants

### Risks
- Meilisearch not running → fallback to Saleor handles this
- Variant ID format: Meilisearch stores `original_id` (base64 Saleor GraphQL ID) — must map back correctly
- Flattening products to variants may return more results than limit — need to handle

## Criteria

### Meilisearch Search Method
- [x] ISC-1: MeilisearchClient gains searchProducts method with query and limit params
- [x] ISC-2: searchProducts accepts optional setCode filter parameter
- [x] ISC-3: searchProducts accepts optional collectorNumber filter parameter
- [x] ISC-4: searchProducts has 3-second AbortController timeout
- [x] ISC-5: searchProducts escapes filter values to prevent injection

### Search Logic (saleor-client.ts)
- [x] ISC-6: parseCollectorNumber parses SET/NUM, SET-NUM, NUM-SET, NUM/SET formats
- [x] ISC-7: searchVariants tries Meilisearch first when configured
- [x] ISC-8: searchVariants falls back to Saleor GraphQL on Meilisearch failure
- [x] ISC-9: Meilisearch hits flattened from products to individual SaleorVariant objects

### UI (variant-search-input.tsx)
- [x] ISC-10: 300ms debounce added to search input
- [x] ISC-11: Placeholder text updated to mention collector number

### Build Verification
- [x] ISC-12: TypeScript compiles without errors in inventory-ops app

## Decisions

## Verification
