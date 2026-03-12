# Multi-Location Singles Builder — Implementation Plan

## Context

The Singles Builder is a staff-only storefront UI for building MTG card carts and handing them off to POS registers. Currently it's hardcoded to a single `singles-builder` channel with aggregated stock across all warehouses.

**Problem**: We need Singles Builder to work at multiple physical locations (retail store, collectible show, conventions, private stock) — each with its own warehouse-scoped inventory. Staff should clearly know which location they're working from, and the system should be easy to extend when spinning up new locations.

**User decisions**:
- Shared product catalog across all locations (same 76k+ cards, stock varies by warehouse)
- One Saleor channel per physical location (e.g., `retail-store`, `collectible-show`)
- Landing page selector + direct URL bookmarks for location access

## What Changes

### Phase 1: Dynamic Channel Config (Backend)

**Goal**: Replace hardcoded `CHANNELS = ["webstore", "singles-builder"]` with a configurable list that maps each channel to its warehouse.

**Approach**: Add a `MEILISEARCH_CHANNELS` env var (JSON) to inventory-ops. Format:
```json
[
  {"slug": "webstore", "warehouseId": null},
  {"slug": "retail-store", "warehouseId": "V2FyZWhvdXNlOjE="},
  {"slug": "collectible-show", "warehouseId": "V2FyZWhvdXNlOjI="}
]
```
`warehouseId: null` = aggregate all stock (current webstore behavior). With a warehouseId = scope stock to that warehouse.

**Files**:

| File | Change |
|------|--------|
| `saleor-apps/apps/inventory-ops/src/modules/meilisearch/channel-config.ts` | **NEW** — Parse `MEILISEARCH_CHANNELS` env var, export `getMeilisearchChannels()` |
| `saleor-apps/apps/inventory-ops/src/modules/meilisearch/sync-product.ts` (line 10) | Replace `const CHANNELS = [...]` with `getMeilisearchChannels()` |
| `saleor-apps/apps/inventory-ops/src/app/api/webhooks/saleor/product-created/route.ts` (line 13) | Same — replace hardcoded CHANNELS |
| `saleor-apps/apps/inventory-ops/src/app/api/webhooks/saleor/product-updated/route.ts` (line 13) | Same |
| `saleor-apps/apps/inventory-ops/src/app/api/webhooks/saleor/product-deleted/route.ts` (line 12) | Same |

**Verify**: Deploy with current two channels in env var, confirm webhooks still sync to both indexes identically.

---

### Phase 2: Warehouse-Scoped Meilisearch Indexing

**Goal**: Each channel's Meilisearch index contains stock scoped to that channel's warehouse only.

**Approach**: When syncing a product for a channel with a `warehouseId`, query Saleor's `stocks(warehouseIds: [$id])` instead of using the aggregated `quantityAvailable`. Each channel gets its own index (existing pattern: `{channel-slug}-products`).

**Files**:

| File | Change |
|------|--------|
| `saleor-apps/apps/inventory-ops/src/modules/meilisearch/document-transformer.ts` | Add optional `warehouseId` param. When set, compute variant stock from `stocks` array instead of `quantityAvailable` |
| `saleor-apps/apps/inventory-ops/src/modules/meilisearch/sync-product.ts` | Expand GraphQL query to include `stocks { warehouse { id } quantity quantityAllocated }`. For each channel config, pass warehouse-scoped stock data to transformer |
| Webhook subscription definitions (product-created, product-updated, stock-updated) | Add `stocks` field to subscription queries if not already present |
| `scripts/sync-meilisearch.py` | Add `--warehouse-id` flag. When set, query `stocks(warehouseIds: [...])` and compute per-warehouse stock. Support `MEILISEARCH_CHANNELS` env var for multi-channel sync |
| `scripts/meilisearch-delta-sync.py` | Same warehouse-scoped changes |

**Key detail**: Query all stocks in one GraphQL call (`stocks {}` without filter), then partition by warehouse in TypeScript. One query per product change → N index updates (one per channel). This is efficient since N is small (2-5 channels).

**Verify**:
- Run full sync for a test channel with a specific warehouse ID
- Compare document stock values against Saleor Dashboard's stock for that warehouse
- Confirm `webstore` channel still shows aggregated stock (backward compatible)

---

### Phase 3: Storefront Multi-Location UI

**Goal**: Location selector, location indicator, channel-scoped cart, pull list, remove hardcoded defaults.

#### 3a. Location Selector Landing Page

| File | Change |
|------|--------|
| `storefront/src/app/singles-builder/page.tsx` | Replace hardcoded redirect with a server component that queries Saleor `channels` API. Show cards for each active non-webstore channel with name, warehouse location, and link to `/singles-builder/[slug]` |
| `storefront/src/graphql/AvailableChannels.graphql` | **NEW** — `query AvailableChannels { channels { id slug name isActive warehouses { id name address { ... } } } }` |

**Filtering**: Show all active channels except `webstore`. Channel `name` (set in Dashboard) is the display name. Warehouse `name` shows the physical location.

#### 3b. Location Indicator Header

| File | Change |
|------|--------|
| `storefront/src/app/singles-builder/[channel]/layout.tsx` | Fetch channel display name. Render header banner: "Singles Builder — [Location Name]" with "Change Location" link back to `/singles-builder` |
| `storefront/src/app/singles-builder/layout.tsx` | Keep auth-only. Fix login redirect from `/singles-builder/webstore` → `/singles-builder` (line 37) |

#### 3c. Channel-Scoped Cart Store

| File | Change |
|------|--------|
| `storefront/src/app/singles-builder/[channel]/store/singlesCartStore.ts` | Change `STORAGE_KEY = "singles-builder-cart"` (line 104) to include channel. Simplest approach: add `currentChannel` field to state. On hydration, if channel doesn't match, clear cart. This avoids a Zustand factory pattern while preventing cross-location cart leakage |

#### 3d. Remove Hardcoded Defaults

| File | Change |
|------|--------|
| `storefront/src/app/singles-builder/[channel]/actions.ts` (line 149) | Remove `indexPrefix: "singles-builder"` from `meilisearchProducts()` call. The `channel` param already maps to `{channel}-products` index naturally |
| `storefront/src/app/singles-builder/[channel]/actions.ts` (lines 343, 384, 424, 464, 509, 524) | Remove `= "singles-builder"` default values from 6 function params. All call sites already pass channel explicitly |

#### 3e. Channel Metadata for POS Handoff

| File | Change |
|------|--------|
| `storefront/src/app/singles-builder/[channel]/actions.ts` — `saveCartForPOS()` | Add `{ key: "singles_builder_channel", value: channel }` to checkout metadata |

#### 3f. Pull List Print

| File | Change |
|------|--------|
| `storefront/src/app/singles-builder/[channel]/components/CartDrawer.tsx` | Add "Print Pull List" button next to existing buttons. Opens a print-optimized view via `window.print()` |
| `storefront/src/app/singles-builder/[channel]/components/PullList.css` | **NEW** — `@media print` styles. Hide everything except cart contents. Clean list: product name, set code, condition, finish, qty, price. Location name + date header. Staff name footer |

**Verify**:
- `/singles-builder` → shows location cards
- `/singles-builder/retail-store` → direct URL works, header shows "Retail Store"
- Search → results show only that warehouse's stock
- Add to cart → switch location → cart is independent
- Print Pull List → clean printable output
- Send to Register → checkout metadata includes channel slug

---

### Phase 4: POS Integration

**Goal**: POS reads channel/warehouse from Singles Builder cart metadata instead of hardcoded env vars.

| File | Change |
|------|--------|
| `saleor-apps/apps/pos/src/modules/transactions/transactions-router.ts` — `getPendingSinglesBuilderCart` | Extract `singles_builder_channel` from checkout metadata, return in response |
| `saleor-apps/apps/pos/src/modules/transactions/transactions-router.ts` — `importFromSinglesBuilder` | When `singles_builder_channel` metadata exists, resolve channel slug → Saleor channel ID via GraphQL query. Look up channel's primary warehouse. Use those instead of input params. Fall back to input params if metadata missing (backward compat) |
| `saleor-apps/apps/pos/src/pages/transaction.tsx` | Pass cart-derived channel/warehouse to import mutation instead of hardcoded `NEXT_PUBLIC_DEFAULT_CHANNEL_ID` / `NEXT_PUBLIC_DEFAULT_WAREHOUSE_ID` |

**Verify**:
- Create cart at non-default location in Singles Builder
- Send to Register
- POS shows pending cart with correct location context
- Import creates transaction with correct channel/warehouse
- Draft order uses correct channel

---

### Phase 5: Spin-Up Documentation

| File | Purpose |
|------|---------|
| `docs/ops/runbooks/add-singles-builder-location.md` | **NEW** — Step-by-step checklist for adding a new location |

**Checklist covers**:
1. Create Saleor channel in Dashboard (slug, name, currency, assign products)
2. Create warehouse in Dashboard (address, assign to channel)
3. Create product channel listings (ProductChannelListing + ProductVariantChannelListing for the new channel)
4. Update `MEILISEARCH_CHANNELS` env var on inventory-ops ECS task def
5. Redeploy inventory-ops
6. Run initial Meilisearch sync: `python scripts/sync-meilisearch.py --channel <slug> --warehouse-id <id>`
7. Verify on `/singles-builder` — new location appears and searches correctly

---

## Execution Order

```
Phase 1 (config layer) ─── can merge independently, no user-facing change
    ↓
Phase 2 (Meilisearch) ─── validate with Python scripts before wiring webhooks
    ↓
Phase 3 (storefront) ──── biggest phase, can split into multiple PRs:
  ├── 3a+3b (landing page + header)
  ├── 3c+3d (cart store + defaults)
  ├── 3e (POS metadata)
  └── 3f (pull list)
    ↓
Phase 4 (POS) ─────────── depends on 3e being deployed
    ↓
Phase 5 (docs) ────────── can be done in parallel with any phase
```

## Risks

| Risk | Mitigation |
|------|------------|
| Full Meilisearch re-index needed per new channel | Pre-run sync before announcing location. 76k docs takes ~30 min on staging |
| Product channel listings missing for new channels | Spin-up runbook explicitly covers bulk listing creation |
| POS backward compatibility (old carts lack channel metadata) | Fall back to env var defaults when metadata missing |
| Webhook volume × N channels | N is small (2-5). Sync buffer already batches. Monitor |
| Adding filterable attributes triggers full re-index | No new filterable attributes needed — stock fields already exist per-document |

## File Summary

**New files (4)**: channel-config.ts, AvailableChannels.graphql, PullList.css, add-singles-builder-location.md

**Modified files (~14)**:
- inventory-ops: sync-product.ts, document-transformer.ts, 3 webhook handlers, 2 Python scripts
- storefront: page.tsx, layout.tsx, [channel]/layout.tsx, actions.ts, singlesCartStore.ts, CartDrawer.tsx
- POS: transactions-router.ts, transaction.tsx
