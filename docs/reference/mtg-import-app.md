# MTG Import App — Definitive Reference (LEGACY)

> **DEPRECATED**: The standalone mtg-import app was consolidated into `inventory-ops` (Mar 2026).
> Import functionality now lives at `saleor-apps/apps/inventory-ops/src/modules/import/`.
> This document is retained for historical context only.
>
> Originally generated from source code analysis, 2026-02-20.
> Original source: `saleor-apps/apps/mtg-import/` (deleted)

## Overview

**`saleor-app-mtg-import`** (v0.1.0) is a Saleor App that imports Magic: The Gathering card data from Scryfall (primary) and MTGJSON (fallback) into Saleor as products with variants. It runs on **Next.js** (port 3005), uses **Prisma** for job/product tracking, **tRPC** for its API layer, and **Saleor Macaw UI** for the dashboard interface.

- **Saleor permission:** `MANAGE_PRODUCTS`
- **Required Saleor version:** `>=3.21 <4`
- **Stack:** Next.js + tRPC + Prisma + urql (GraphQL) + Saleor App SDK + Macaw UI

---

## Architecture

```
Scryfall API / MTGJSON --> Bulk Data Manager --> Job Processor --> Import Pipeline --> Saleor GraphQL API
                              (streaming)          (batching)       (card -> product)    (productBulkCreate)
                                                      |
                                                  Prisma DB
                                            (jobs, products, audits)
```

---

## Data Sources

### Scryfall (Primary)

- **Bulk Data API**: Downloads `default_cards` (~500MB JSON), cached locally for 24h in `data/bulk/`
- **Search API**: Used for set scanning (`/cards/search?q=set:{code}`) with full pagination
- **Rate Limiter**: Token-bucket at 10 req/sec (100ms minimum interval), FIFO queue
- **Retry**: Exponential backoff for 429/503 errors, max 3 retries
- **User-Agent**: `SaleorMTGImport/1.0 ({SCRYFALL_CONTACT_EMAIL})` per Scryfall TOS
- **Streaming**: Uses `stream-json` library to parse 500MB+ files without loading into memory

### MTGJSON (Fallback)

- Downloads `AllPrintings.json` (~1.5GB) from mtgjson.com, cached 24h in `data/mtgjson/`
- `card-adapter.ts` converts MTGJSON card format to ScryfallCard shape transparently
- Constructs Scryfall CDN image URLs from scryfallId
- Extracts TCGPlayer retail paper prices (normal/foil/etched)
- Cards without a `scryfallId` are filtered out

---

## Import Job System

### Job Types

| Type | Description | Source |
|------|-------------|--------|
| **SET** | Import a specific set by code | Bulk data file, filtered by set code |
| **BULK** | Import ALL cards from bulk data | Full bulk file with pre-filter of already-imported |
| **BACKFILL** | Re-import missing/failed cards for a set | Bulk data, skipping already-successful imports |

### Job Lifecycle

```
PENDING -> RUNNING -> COMPLETED (or FAILED)
             |
         CANCELLED
```

- **Priority levels**: 0 (Prerelease/highest), 1 (Reprint), 2 (Backfill/lowest)
- **Checkpoints**: Saved every 100 cards for resume support
- **Resume**: Retry creates a new job starting from the failed job's last checkpoint
- **Cancellation**: Uses `AbortController` to signal in-progress processors
- **Deduplication**: Prevents creating duplicate jobs for the same type + set code

### Batch Processing

- Cards batched into groups of **50** for `productBulkCreate` GraphQL mutations
- Slug-duplicate errors treated as idempotent success (product already exists)
- Error logs capped at 100 entries per job
- Each card import tracked as an `ImportedProduct` record (upserted for backfill)

---

## Product Creation Pipeline

For each Scryfall card, the pipeline creates:

### Product

| Field | Source |
|-------|--------|
| **Name** | `card.name` (max 250 chars) |
| **Slug** | `{name}-{set}-{collector_number}` (max 255 chars) |
| **Description** | EditorJS format: type_line + oracle_text + italicized flavor_text |
| **Product Type** | `mtg-card` (resolved by slug) |
| **Category** | `mtg-singles` (resolved by slug) |
| **Media** | External image URL from Scryfall CDN (`large` size) |
| **Metadata** | `scryfall_id`, `scryfall_uri`, `set_code` |

### 23 Product Attributes

| Group | Attributes |
|-------|-----------|
| **External IDs** (7) | scryfall-id, oracle-id, tcgplayer-id, tcgplayer-etched-id, cardmarket-id, mtgo-id, arena-id |
| **Card Properties** (11) | rarity (DROPDOWN), type-line, mana-cost, mana-value (NUMERIC), set-code, set-name, artist, collector-number, power, toughness, loyalty |
| **Boolean Flags** (5) | reserved, is-reprint, is-promo, is-full-art, is-digital |

All attribute slugs prefixed with `mtg-`. Must be pre-created on the `mtg-card` product type in Saleor Dashboard.

### Attribute Slug Reference

| Scryfall Field | Saleor Slug | Input Type |
|----------------|-------------|------------|
| `id` | `mtg-scryfall-id` | PLAIN_TEXT |
| `oracle_id` | `mtg-oracle-id` | PLAIN_TEXT |
| `tcgplayer_id` | `mtg-tcgplayer-id` | PLAIN_TEXT |
| `tcgplayer_etched_id` | `mtg-tcgplayer-etched-id` | PLAIN_TEXT |
| `cardmarket_id` | `mtg-cardmarket-id` | PLAIN_TEXT |
| `mtgo_id` | `mtg-mtgo-id` | PLAIN_TEXT |
| `arena_id` | `mtg-arena-id` | PLAIN_TEXT |
| `rarity` | `mtg-rarity` | DROPDOWN |
| `type_line` | `mtg-type-line` | PLAIN_TEXT |
| `mana_cost` | `mtg-mana-cost` | PLAIN_TEXT |
| `cmc` | `mtg-mana-value` | NUMERIC |
| `set` | `mtg-set-code` | PLAIN_TEXT |
| `set_name` | `mtg-set-name` | PLAIN_TEXT |
| `artist` | `mtg-artist` | PLAIN_TEXT |
| `collector_number` | `mtg-collector-number` | PLAIN_TEXT |
| `power` | `mtg-power` | PLAIN_TEXT |
| `toughness` | `mtg-toughness` | PLAIN_TEXT |
| `loyalty` | `mtg-loyalty` | PLAIN_TEXT |
| `reserved` | `mtg-reserved` | BOOLEAN |
| `reprint` | `mtg-is-reprint` | BOOLEAN |
| `promo` | `mtg-is-promo` | BOOLEAN |
| `full_art` | `mtg-is-full-art` | BOOLEAN |
| `digital` | `mtg-is-digital` | BOOLEAN |

### Variants (5 conditions x N finishes)

Each card generates **up to 15 variants** (5 conditions x 3 finishes):

| Conditions | Finishes |
|-----------|----------|
| NM (Near Mint), LP (Lightly Played), MP (Moderately Played), HP (Heavily Played), DMG (Damaged) | NF (Non-Foil), F (Foil), E (Etched) |

Only finishes listed on the card's `finishes` array are created.

**Variant properties:**
- **SKU**: `{scryfall_id_first_8_chars}-{condition}-{finish}` (e.g., `a1b2c3d4-NM-NF`)
- **Name**: e.g., "Near Mint - Non-Foil"
- **Track Inventory**: `false`
- **Stock**: Initialized at quantity 0 in the first warehouse

### Pricing

- Base price from Scryfall: `usd` (nonfoil), `usd_foil` (foil), `usd_etched` (etched)
- Default price when Scryfall has no data: **$0.25**
- Condition multipliers: NM=1.0, LP=0.9, MP=0.75, HP=0.5, DMG=0.25
- Cost price set to 50% of sale price
- **Both `price` and `costPrice` set** (prevents `discounted_price_amount` NULL crash)

### Channel Listings

- Published, visible in listings, available for purchase
- Default channels: `webstore`, `singles-builder`

---

## Card Filtering

Before import, cards pass through filters:

| Filter | Excludes |
|--------|----------|
| `paperCardFilter` | Digital-only, oversized, non-paper games, tokens/emblems/planar layouts |
| `retailSetFilter` | Sets not in: core, expansion, masters, draft_innovation, commander, starter, treasure_chest, funny, masterpiece |
| `retailPaperFilter` | Combined (both filters above) |

Sets also filtered in the UI: excludes digital-only sets, shows only core/expansion/masters/draft_innovation/commander/starter/funny types.

---

## tRPC API Endpoints

### `health.check` (query)
Returns installation ID and API URL for connectivity verification.

### `jobs.*` — Job Management

| Endpoint | Type | Description |
|----------|------|-------------|
| `jobs.list` | query | List jobs with optional status filter, cursor pagination (default 20, max 100) |
| `jobs.get` | query | Get single job by UUID with last 50 imported products |
| `jobs.create` | mutation | Create SET/BULK/BACKFILL job with priority and optional set code |
| `jobs.cancel` | mutation | Cancel a PENDING or RUNNING job |
| `jobs.retry` | mutation | Retry a FAILED/CANCELLED job (new job from last checkpoint) |
| `jobs.createBatch` | mutation | Create up to 50 BACKFILL jobs at once for multiple set codes |

### `sets.*` — Set Browsing & Verification

| Endpoint | Type | Description |
|----------|------|-------------|
| `sets.list` | query | List importable sets from Scryfall (filtered, sorted by release date) |
| `sets.importStatus` | query | Get SetAudit records showing import history |
| `sets.verify` | query | Check completeness: imported vs Scryfall total for a set |
| `sets.scan` | query | Compare set against Scryfall search API to find missing/failed cards |
| `sets.scanAll` | query | Completeness summary for all imported sets |
| `sets.auditAttributes` | query | Check products for missing/stale attributes and images |
| `sets.repairAttributes` | mutation | Create BACKFILL job to fix missing attributes |

### `system.*` — System Health

| Endpoint | Type | Description |
|----------|------|-------------|
| `system.readiness` | query | Pre-flight check: channels, product type (mtg-card), 23 attributes, category (mtg-singles), warehouse |

### `catalog.*` — Catalog Overview

| Endpoint | Type | Description |
|----------|------|-------------|
| `catalog.summary` | query | Aggregate stats: total sets/cards/products/jobs, completeness %, recent 5 jobs |

---

## GraphQL Operations (Saleor API)

**Queries:**
- `Channels` — List all channels (id, name, slug, currencyCode)
- `ProductTypes` — Search product types with attributes
- `Categories` — Search categories
- `Warehouses` — List warehouses
- `ProductBySlug` — Check product existence
- `ProductsByMetadata` — Fetch products by set_code metadata with full attributes/media

**Mutations:**
- `ProductBulkCreate` — Batch create products with `REJECT_FAILED_ROWS` error policy
- `ProductBulkUpdate` — Batch update products

---

## UI Pages

| Page | Route | Function |
|------|-------|----------|
| **Dashboard** | `/` | System readiness checks, catalog health stats (sets/cards/completeness), progress bar, recent jobs table, quick action buttons |
| **Sets Browser** | `/sets` | Searchable/filterable table of all Scryfall sets with import status, progress bars, and per-set actions: Import, Scan, Verify, Audit, Backfill All Incomplete |
| **Job List** | `/import` | All import jobs table with status badges, progress bars, Cancel/Retry actions, auto-refresh every 5 seconds |
| **New Import** | `/import/new` | Form to create SET/BULK/BACKFILL job with set picker (autocomplete), priority selector, bulk estimate, confirmation dialogs for large imports |
| **Job Detail** | `/import/[id]` | Full job detail: stats, progress bar with ETA calculation, timestamps, error log, imported products table, auto-refresh every 3 seconds |

---

## Database (Prisma/PostgreSQL)

### Models

| Model | Purpose |
|-------|---------|
| `AppInstallation` | Tracks Saleor app installations (saleorApiUrl + appId) |
| `ImportJob` | Job records: type, status, priority, setCode, progress counters, checkpoints, error log, timestamps |
| `ImportedProduct` | Per-card import results: scryfallId, setCode, cardName, collectorNumber, rarity, saleorProductId, variantCount, success/error |
| `SetAudit` | Per-set import summary: setCode, setName, totalCards, importedCards, releasedAt, setType, iconSvgUri, lastImportedAt |

### Unique Constraints

- `ImportedProduct(scryfallId, setCode)`
- `SetAudit(installationId, setCode)`
- `AppInstallation(saleorApiUrl, appId)`

---

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | 32-byte hex encryption key |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APL` | `file` | Auth persistence layer (file/redis/saleor-cloud) |
| `REDIS_URL` | — | Redis connection for APL=redis |
| `APP_LOG_LEVEL` | `info` | Log level |
| `MANIFEST_APP_ID` | `saleor.app.mtg-import` | App manifest ID |
| `APP_NAME` | `MTG Import` | Display name |
| `SCRYFALL_CONTACT_EMAIL` | — | Contact email for Scryfall API TOS compliance |
| `APP_IFRAME_BASE_URL` | auto | Override iframe URL |
| `APP_API_BASE_URL` | auto | Override API URL |
| `SALEOR_URL_ALIASES` | `localhost:8000=api:8000,...` | Docker networking URL aliases |
| `OTEL_ENABLED` | `false` | OpenTelemetry tracing |
| `PORT` | `3005` | Server port |

---

## Saleor Prerequisites

The readiness check verifies all of these before allowing imports:

1. **At least one channel** exists
2. **Product type** with slug `mtg-card` exists with all 23 `mtg-*` attributes
3. **Category** with slug `mtg-singles` exists
4. **At least one warehouse** exists
5. Default channel slugs: `webstore`, `singles-builder`

---

## File Structure

```
src/
  app/api/
    manifest/route.ts          # App manifest (Saleor registration)
    register/route.ts          # OAuth token exchange
    trpc/[trpc]/route.ts       # tRPC handler (App Router)
    trpc/route.ts              # Legacy Pages Router fallback
  pages/
    _app.tsx                   # App initialization
    api/health.ts              # Health check endpoint
    index.tsx                  # Dashboard page
    sets.tsx                   # Set browser page
    import/
      index.tsx                # Job list page
      [id].tsx                 # Job detail page
      new.tsx                  # New import form
  modules/
    trpc/
      trpc-server.ts           # tRPC server setup
      trpc-router.ts           # Main router composition
      import-router.ts         # Jobs, sets, system, catalog routers (891 lines)
      protected-client-procedure.ts  # Auth middleware chain
      trpc-client.ts           # Frontend client
      context-app-router.ts    # Context builders
    import/
      job-processor.ts         # Main processor with streaming + checkpoints
      pipeline.ts              # Card -> Product conversion
      attribute-map.ts         # 23 MTG attribute definitions
      index.ts                 # Exports
    scryfall/
      client.ts                # HTTP client with rate limiting + retry
      types.ts                 # TypeScript types for Scryfall API
      bulk-data.ts             # Streaming bulk JSON parser + cache
      rate-limiter.ts          # Token-bucket rate limiter
      index.ts                 # Exports
    mtgjson/
      bulk-data.ts             # MTGJSON streaming + cache
      card-adapter.ts          # MTGJSON -> ScryfallCard adapter
      index.ts                 # Exports
    saleor/
      saleor-import-client.ts  # GraphQL wrapper for imports
      graphql-operations.ts    # GraphQL queries + mutations
      index.ts                 # Exports
  lib/
    env.ts                     # Environment validation (Zod + t3-env)
    errors.ts                  # Custom error classes
    graphql-client.ts          # urql client factory
    logger.ts                  # Structured logging
    prisma.ts                  # Prisma singleton
    saleor-app.ts              # Saleor SDK initialization
  types/
    import-types.ts            # Local Prisma type definitions
  __tests__/
    scryfall-types.test.ts     # SKU generation, image URI handling
    scryfall-client.test.ts    # Client retry/rate-limit behavior
    rate-limiter.test.ts       # Token bucket rate limiter
    attribute-map.test.ts      # Attribute mapping
    bulk-data.test.ts          # Bulk data streaming/caching
    filters.test.ts            # Card filtering logic
    pipeline.test.ts           # Card-to-product conversion
    saleor-import-client.test.ts  # Saleor GraphQL client
    job-processor.test.ts      # Job processing lifecycle
    import-router.test.ts      # tRPC endpoint smoke tests
    card-adapter.test.ts       # MTGJSON-to-Scryfall adaptation
```

---

## Test Suite

Run with: `pnpm test` (vitest)

---

## Critical Gotchas

1. **Price Null Crash**: Both `price_amount` AND `discounted_price_amount` must be set. See `docs/reference/database.md` rule.

2. **Product Type Must Exist**: Must create `mtg-card` product type with all 23 attributes, `mtg-singles` category, and at least 1 warehouse before importing.

3. **Scryfall Rate Limiting**: Strictly enforced at 10 req/sec via token bucket. Concurrent requests queued FIFO.

4. **Bulk Data Cache**: ~500MB disk space required in `data/bulk/`. 24-hour TTL.

5. **Multi-tenant Isolation**: All records scoped by `installationId`. No data leakage between Saleor instances.
