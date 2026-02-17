# Phase 3: Analytics App — Pricing Intelligence & Buylist Comparison

> **Location**: `docs/reference/phase-3-analytics-app.md`
> **Purpose**: Complete design specification for the analytics data foundation. Read when implementing Phase 3.
> **Status**: Design complete. Implementation not started.
> **Prerequisites**: Phase 0 (cached fallback) and Phase 1 (MTGJSON integration) must be deployed.
> **Timeline estimate**: 3-6 months after Phase 1 stabilization.

---

## Table of Contents

1. [Purpose & Scope](#purpose--scope)
2. [Architecture Boundary](#architecture-boundary)
3. [External Data Sources](#external-data-sources)
4. [Data Schema](#data-schema)
5. [ETL Pipeline Design](#etl-pipeline-design)
6. [Integration Points](#integration-points)
7. [API & Dashboard Design](#api--dashboard-design)
8. [Implementation Plan](#implementation-plan)
9. [Open Questions](#open-questions)

---

## Purpose & Scope

### What Phase 3 IS

A **read-only analytics layer** that ingests external pricing and buylist data to answer competitive intelligence questions:

- "How does our buy price compare to CardKingdom, StarCityGames, and ChannelFireball?"
- "Are we over/under-paying for specific sets, rarities, or conditions?"
- "What's the 30/60/90-day price trend for a card across all vendors?"
- "Which cards have the highest margin opportunity right now?"
- "How volatile is this card's price? Should we adjust our supply/demand rules?"

### What Phase 3 IS NOT

- **Not a pricing source.** External buylist data does NOT flow into the pricing pipeline. Sell prices come from the waterfall (`scryfall -> mtgjson -> cached`) implemented in Phase 1.
- **Not a buy price calculator.** Buy prices are derived from sell prices via the rule engine (`BuylistPricingPolicy + PricingRule`). Phase 3 provides *comparison* data, not *calculation* data.
- **Not real-time.** Analytics data is batch-updated (daily/6-hourly). The pricing pipeline handles real-time needs.

### The Critical Boundary

```
PRICING PIPELINE (Phases 0-2)          ANALYTICS APP (Phase 3)
================================       ================================
Scryfall API ─┐                        MTGJSON CardKingdom buylist ─┐
MTGJSON bulk ─┼─> PriceSourceRegistry   MTGBan 26+ vendors ────────┼─> ExternalBuylistSnapshot
Cached DB ────┘   → SellPriceSnapshot   JustTCG condition data ────┘   → CompetitorPriceHistory
                         │                                                      │
                         ▼                                                      ▼
                  RuleEngine.calculatePrice()              Dashboard: "Our buy vs market buy"
                         │                                 Dashboard: "Price trend analysis"
                         ▼                                 Dashboard: "Margin opportunity"
                  buyOffer (what we pay)
```

**Buy price formula (unchanged by Phase 3):**
```
buyOffer = sellPrice × policyPercentage × conditionMultiplier × Σ(dynamicRules)
```

Phase 3 adds the ability to *compare* `buyOffer` against what CardKingdom, StarCityGames, etc. are offering. It never replaces the formula.

---

## Architecture Boundary

### Existing Systems (DO NOT MODIFY)

| System | Location | Role |
|--------|----------|------|
| **PriceSourceRegistry** | `apps/inventory-ops/src/modules/price-sources/registry.ts` | Waterfall sell price resolution |
| **SellPriceSnapshot** | `apps/inventory-ops/prisma/schema.prisma` (line ~1010) | Sell price history audit trail |
| **RuleEngine** | `apps/buylist/src/modules/pricing/rule-engine/rule-engine.ts` | Buy price calculation from sell prices |
| **BuylistPricingPolicy** | `apps/inventory-ops/prisma/schema.prisma` (line ~889) | Policy definition (percentage, tiers, min/max) |
| **PricingRule** | `apps/inventory-ops/prisma/schema.prisma` (line ~935) | Dynamic rules (attribute/market/inventory/time conditions) |
| **CostLayerEvent** | `apps/inventory-ops/prisma/schema.prisma` (line ~304) | Immutable cost ledger (WAC tracking) |

### New System (Phase 3)

The analytics app can be:
- **Option A**: A new module within `inventory-ops` (simpler, shares Prisma schema)
- **Option B**: A new standalone app in `apps/analytics` (cleaner separation, own DB)

**Recommendation: Option A** (new module in inventory-ops) for MVP. The analytics data needs to join against `SellPriceSnapshot` and `CostLayerEvent` for margin calculations. A separate app would require cross-database queries or data replication.

---

## External Data Sources

### 1. MTGJSON — Buylist Pricing Data

| Property | Value |
|----------|-------|
| **URL** | `https://mtgjson.com/api/v5/AllPrices.json` |
| **Format** | JSON, ~500MB compressed |
| **Update frequency** | Daily |
| **License** | MIT (free for commercial use) |
| **Rate limits** | None (bulk download) |
| **Cost** | Free |

**Data available for analytics (NOT already consumed by Phase 1):**

```json
{
  "data": {
    "<mtgjson-uuid>": {
      "paper": {
        "cardkingdom": {
          "buylist": {
            "normal": { "2026-02-17": 0.80, "2026-02-16": 0.78 },
            "foil": { "2026-02-17": 3.20 }
          },
          "retail": {
            "normal": { "2026-02-17": 1.99 },
            "foil": { "2026-02-17": 6.99 }
          }
        },
        "cardmarket": {
          "retail": {
            "normal": { "2026-02-17": 1.20 },
            "foil": { "2026-02-17": 4.50 }
          }
        },
        "cardsphere": {
          "retail": {
            "normal": { "2026-02-17": 1.15 }
          }
        }
      }
    }
  }
}
```

**Phase 1 already consumes**: `paper.tcgplayer.retail` (for sell price waterfall)
**Phase 3 consumes**: `paper.cardkingdom.buylist`, `paper.cardkingdom.retail`, `paper.cardmarket.retail`, `paper.cardsphere.retail`

**Integration approach**: Extend the existing `MtgjsonPriceSource` download/cache mechanism. Parse additional provider sections during the daily ETL job.

**Key constraint**: The scryfallId → mtgjsonUuid mapping (already built in Phase 1 at `apps/inventory-ops/src/modules/price-sources/sources/mtgjson-source.ts`) is reusable.

---

### 2. MTGBan — Multi-Vendor Buylist Aggregator

| Property | Value |
|----------|-------|
| **URL** | `https://www.mtgban.com/api/mtgban` (JSON endpoint) |
| **GitHub** | `github.com/mtgban/go-mtgban` (MIT license) |
| **Format** | JSON REST API |
| **Update frequency** | Multiple times daily |
| **License** | MIT |
| **Rate limits** | Undocumented (be respectful, ~1 req/sec) |
| **Cost** | Free (API key may be required for full access) |

**Data available:**

MTGBan aggregates buylist prices from 26+ vendors:
- CardKingdom, StarCityGames, ChannelFireball, CoolStuffInc, ABUGames
- TCGPlayer Direct, Miniature Market, Cape Fear Games
- Card Trader, Cardmarket (EU)
- Many smaller vendors

**Data shape** (per card):
```json
{
  "cardId": "scryfall-uuid",
  "name": "Lightning Bolt",
  "set": "M11",
  "vendors": {
    "Card Kingdom": { "buyPrice": 0.80, "sellPrice": 1.99 },
    "StarCityGames": { "buyPrice": 0.75, "sellPrice": 1.79 },
    "ChannelFireball": { "buyPrice": 0.70, "sellPrice": 1.89 }
  }
}
```

**Integration approach**: Daily cron job fetches vendor prices, normalizes to our schema, stores in `ExternalBuylistSnapshot`. The Go library can also be compiled to WASM or used as a reference for the REST API client.

**Key constraint**: MTGBan uses Scryfall UUIDs as identifiers, which we already have in our SKU format (`{scryfallId}-{condition}-{finish}`). Direct mapping.

---

### 3. JustTCG — Condition-Specific Analytics

| Property | Value |
|----------|-------|
| **URL** | `https://api.justtcg.com/v1/` |
| **Format** | JSON REST API |
| **Update frequency** | Every 6 hours |
| **License** | Commercial (API key required) |
| **Rate limits** | Depends on plan (free tier: 100 req/day) |
| **Cost** | Free tier available; paid plans for volume |
| **SDK** | TypeScript SDK: `npm install @justtcg/sdk` |

**Unique value for analytics:**

JustTCG provides **condition-specific** pricing (NM, LP, MP, HP) directly from TCGPlayer marketplace data, broken down by:
- Lowest listing price per condition
- Market price per condition
- Recent sales data per condition
- Price history with timestamps

**Data shape:**
```json
{
  "cardId": "scryfall-uuid",
  "prices": {
    "NM": { "low": 1.20, "mid": 1.50, "market": 1.45, "lastSale": 1.42 },
    "LP": { "low": 0.99, "mid": 1.20, "market": 1.15, "lastSale": 1.10 },
    "MP": { "low": 0.75, "mid": 0.95, "market": 0.90 },
    "HP": { "low": 0.50, "mid": 0.70, "market": 0.65 }
  },
  "history": [
    { "date": "2026-02-17", "NM": 1.45, "LP": 1.15 }
  ]
}
```

**Integration approach**: Daily batch fetch for high-value cards (>$1 NM price). Use the TypeScript SDK for clean integration. Store in `ConditionPriceHistory` table.

**Key constraint**: Free tier is very limited (100 req/day). For 100k+ products, need paid plan or selective fetching (only cards with active buylist demand).

---

## Data Schema

### New Prisma Models

Add to `apps/inventory-ops/prisma/schema.prisma`:

```prisma
// ============================================================================
// PHASE 3: ANALYTICS & COMPETITIVE INTELLIGENCE
// ============================================================================

// External vendor buylist/retail prices (from MTGJSON, MTGBan, JustTCG)
model ExternalBuylistSnapshot {
  id             String          @id @default(uuid())
  installationId String
  installation   AppInstallation @relation(fields: [installationId], references: [id], onDelete: Cascade)

  // Card identification
  scryfallId       String   // Scryfall UUID (primary key for card matching)
  cardName         String   // Denormalized for display
  setCode          String
  collectorNumber  String

  // Vendor info
  vendor      String   // e.g., "cardkingdom", "starcitygames", "channelfireball"
  vendorType  String   // "buylist" or "retail"

  // Price data
  finish    String   @db.VarChar(3) // NF, F, E
  condition String?  @db.VarChar(3) // NM, LP, MP, HP, DMG (null = NM assumed)
  price     Decimal  @db.Decimal(19, 4)
  currency  String   @default("USD") @db.VarChar(3)

  // Source tracking
  source      String   // "mtgjson", "mtgban", "justtcg"
  snapshotAt  DateTime // When this price was observed

  createdAt DateTime @default(now())

  @@index([installationId])
  @@index([scryfallId, vendor, finish])
  @@index([snapshotAt])
  @@index([vendor, vendorType])
  @@index([setCode])
  // Composite for "latest price per card per vendor"
  @@index([scryfallId, vendor, vendorType, finish, snapshotAt])
}

// Price trend aggregation (daily rollup for fast queries)
model PriceTrendDaily {
  id             String          @id @default(uuid())
  installationId String
  installation   AppInstallation @relation(fields: [installationId], references: [id], onDelete: Cascade)

  // Card identification
  scryfallId String
  finish     String @db.VarChar(3)

  // Aggregation date
  trendDate DateTime @db.Date

  // Our prices (from SellPriceSnapshot)
  ourSellPrice  Decimal? @db.Decimal(19, 4) // Latest sell price that day
  ourBuyOffer   Decimal? @db.Decimal(19, 4) // Calculated buy offer that day

  // Market averages (aggregated from ExternalBuylistSnapshot)
  avgBuylistPrice   Decimal? @db.Decimal(19, 4) // Average across all vendors
  minBuylistPrice   Decimal? @db.Decimal(19, 4)
  maxBuylistPrice   Decimal? @db.Decimal(19, 4)
  vendorCount       Int      @default(0) // How many vendors had this card

  // Market sell prices
  avgRetailPrice    Decimal? @db.Decimal(19, 4)

  // Derived metrics
  marginPercent     Decimal? @db.Decimal(5, 2) // (sell - buy) / sell × 100
  competitiveIndex  Decimal? @db.Decimal(5, 2) // ourBuy / avgBuy × 100 (>100 = we pay more)

  createdAt DateTime @default(now())

  @@unique([installationId, scryfallId, finish, trendDate])
  @@index([installationId, trendDate])
  @@index([scryfallId])
  @@index([competitiveIndex]) // For "most/least competitive" queries
}

// Analytics ETL job tracking
model AnalyticsEtlJob {
  id             String          @id @default(uuid())
  installationId String
  installation   AppInstallation @relation(fields: [installationId], references: [id], onDelete: Cascade)

  source    String   // "mtgjson_buylist", "mtgban", "justtcg"
  status    String   @default("PENDING") // PENDING, RUNNING, COMPLETED, FAILED
  startedAt DateTime?
  completedAt DateTime?

  // Stats
  recordsIngested Int    @default(0)
  recordsSkipped  Int    @default(0)
  errors          Int    @default(0)
  errorLog        String? @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([installationId, status])
  @@index([source, createdAt])
}

// Data retention configuration
model AnalyticsRetentionConfig {
  id             String          @id @default(uuid())
  installationId String          @unique
  installation   AppInstallation @relation(fields: [installationId], references: [id], onDelete: Cascade)

  // How long to keep raw snapshots (default: 90 days)
  rawSnapshotRetentionDays Int @default(90)
  // How long to keep daily aggregates (default: 2 years)
  dailyTrendRetentionDays  Int @default(730)

  updatedAt DateTime @updatedAt
}
```

### Data Volume Estimates

| Table | Records/day | 90-day total | Storage estimate |
|-------|-------------|-------------|------------------|
| ExternalBuylistSnapshot | ~300k (100k cards × 3 vendors) | ~27M | ~5GB |
| PriceTrendDaily | ~100k (100k cards × 1 row) | ~9M | ~1.5GB |
| AnalyticsEtlJob | ~3-5 | ~400 | Negligible |

**Retention strategy**: Raw snapshots older than 90 days are pruned. Daily aggregates kept for 2 years. A nightly cron handles cleanup.

---

## ETL Pipeline Design

### Pipeline Architecture

```
┌─────────────────────────────────────────────────────┐
│                   ETL Scheduler                      │
│           (cron: daily at 06:00 UTC)                 │
└───────┬──────────────┬──────────────┬───────────────┘
        │              │              │
        ▼              ▼              ▼
┌───────────┐  ┌───────────┐  ┌───────────┐
│  MTGJSON  │  │  MTGBan   │  │  JustTCG  │
│  Buylist  │  │   Fetch   │  │  Fetch    │
│  Extract  │  │           │  │ (top 5k)  │
└─────┬─────┘  └─────┬─────┘  └─────┬─────┘
      │              │              │
      ▼              ▼              ▼
┌─────────────────────────────────────────────────────┐
│              Normalize & Load                        │
│      → ExternalBuylistSnapshot (raw)                 │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              Daily Aggregation                        │
│  Join: ExternalBuylistSnapshot                       │
│      + SellPriceSnapshot (our sell)                  │
│      + RuleEngine.calculatePrice() (our buy)         │
│      → PriceTrendDaily                               │
└─────────────────────────────────────────────────────┘
```

### ETL Step 1: MTGJSON Buylist Extract

```typescript
// Reuses existing MtgjsonPriceSource cache from Phase 1
// apps/inventory-ops/src/modules/price-sources/sources/mtgjson-source.ts

// New: extract buylist data from AllPrices.json
// Parse: data[uuid].paper.cardkingdom.buylist.{normal,foil,etched}
// Parse: data[uuid].paper.cardkingdom.retail.{normal,foil,etched}
// Parse: data[uuid].paper.cardmarket.retail.{normal,foil,etched}
// Parse: data[uuid].paper.cardsphere.retail.{normal,foil,etched}
```

### ETL Step 2: MTGBan Fetch

```typescript
// New module: apps/inventory-ops/src/modules/analytics/sources/mtgban-source.ts
// GET https://www.mtgban.com/api/mtgban
// Headers: { "User-Agent": "SaleorAnalytics/1.0", "Authorization": "Bearer {MTGBAN_API_KEY}" }
// Response: JSON with per-card vendor prices
// Rate: ~1 req/sec, batch by set if needed
```

### ETL Step 3: JustTCG Fetch (Selective)

```typescript
// New module: apps/inventory-ops/src/modules/analytics/sources/justtcg-source.ts
// Only fetch cards with:
//   - Active buylist demand (appeared in a buylist in last 30 days)
//   - NM sell price > $1.00 (skip bulk)
//   - Limited to top 5,000 cards per run (API budget)
// SDK: import { JustTCG } from "@justtcg/sdk"
```

### ETL Step 4: Daily Aggregation

```typescript
// New: apps/inventory-ops/src/modules/analytics/aggregation.ts
//
// For each card with ExternalBuylistSnapshot data today:
// 1. Get latest SellPriceSnapshot (our sell price)
// 2. Calculate our buy offer via RuleEngine (needs policy + rules)
// 3. Aggregate vendor prices (avg, min, max, count)
// 4. Compute derived metrics (margin%, competitiveIndex)
// 5. Upsert PriceTrendDaily record
```

### Cron Route

```typescript
// New: apps/inventory-ops/src/app/api/cron/analytics-etl/route.ts
// Schedule: Daily at 06:00 UTC (after MTGJSON daily update)
// Authorization: Bearer {CRON_SECRET}
// Steps:
//   1. Create AnalyticsEtlJob records
//   2. Run ETL steps 1-3 in parallel
//   3. Run aggregation (step 4)
//   4. Run retention cleanup
//   5. Return summary
```

---

## Integration Points

### Reading FROM Existing Systems

| Data needed | Source | How to access |
|-------------|--------|---------------|
| Our sell price for a card | `SellPriceSnapshot` | `prisma.sellPriceSnapshot.findFirst({ where: { scryfallId, finish }, orderBy: { snapshotAt: "desc" } })` |
| Our buy offer for a card | `RuleEngine.calculatePrice()` | Import from `apps/buylist/src/modules/pricing/rule-engine/` — requires `BuylistPricingPolicy`, `PricingRule[]`, and `marketPrice` |
| Card attributes for rule eval | `ProductAttributeCache` | `prisma.productAttributeCache.findFirst({ where: { variantId } })` |
| Historical cost data | `CostLayerEvent` | Via `getCostHistory()` from `apps/inventory-ops/src/modules/cost-layers/` |
| Price source health | `PriceSourceRegistry.getSourceHealth()` | Import from `apps/inventory-ops/src/modules/price-sources/` |

### Writing TO Existing Systems (NONE)

Phase 3 writes only to its own tables (`ExternalBuylistSnapshot`, `PriceTrendDaily`, `AnalyticsEtlJob`). It never writes to the pricing pipeline or buylist system.

### Cross-App Data Access

The RuleEngine lives in the `buylist` app. For the daily aggregation to calculate "our buy offer", there are two approaches:

**Option A (Recommended)**: Extract the `RuleEngine` into a shared package (`packages/rule-engine`) so both `buylist` and `inventory-ops` can use it.

**Option B**: HTTP call from analytics cron to a buylist API endpoint that calculates buy price for a given card + policy.

**Option C**: Duplicate the calculation logic (not recommended — divergence risk).

---

## API & Dashboard Design

### tRPC Endpoints

Add to `apps/inventory-ops/src/modules/analytics/analytics-router.ts`:

```typescript
// Price comparison for a single card
getCardComparison: procedure
  .input(z.object({ scryfallId: z.string(), finish: z.enum(["NF", "F", "E"]) }))
  .query(/* returns: our sell, our buy, vendor buylists, vendor retail, trends */)

// Competitive overview (top-level dashboard)
getCompetitiveOverview: procedure
  .input(z.object({ dateRange: z.enum(["7d", "30d", "90d"]) }))
  .query(/* returns: avg competitiveIndex, most/least competitive cards, trend direction */)

// Margin opportunity finder
getMarginOpportunities: procedure
  .input(z.object({
    minMargin: z.number().optional(),   // Filter: margin > X%
    minPrice: z.number().optional(),     // Filter: sell price > $X
    setCode: z.string().optional(),
    limit: z.number().default(50),
  }))
  .query(/* returns: cards where ourBuy << market, ranked by opportunity size */)

// Buylist comparison by vendor
getVendorComparison: procedure
  .input(z.object({ scryfallId: z.string(), finish: z.enum(["NF", "F", "E"]) }))
  .query(/* returns: per-vendor buy/sell prices, our price, delta */)

// Price trend history
getPriceTrend: procedure
  .input(z.object({
    scryfallId: z.string(),
    finish: z.enum(["NF", "F", "E"]),
    days: z.number().default(90),
  }))
  .query(/* returns: daily trend data for charting */)

// ETL status
getEtlStatus: procedure
  .query(/* returns: latest ETL jobs, health, data freshness */)

// Volatility report
getVolatileCards: procedure
  .input(z.object({ days: z.number().default(30), limit: z.number().default(50) }))
  .query(/* returns: cards with highest price variance, useful for rule tuning */)
```

### Dashboard Views

**1. Competitive Overview** (landing page)
- Aggregate "competitiveIndex" gauge (are we generally above or below market?)
- Top 10 cards where we're most above market buy prices
- Top 10 cards where we're most below market buy prices
- Data freshness indicator

**2. Card Detail** (drill-down)
- Our sell price vs market sell prices (chart)
- Our buy offer vs vendor buylist prices (chart)
- 90-day price trend (line chart with all sources)
- Margin calculation breakdown
- Link to edit PricingRule if adjustment needed

**3. Margin Opportunity** (actionable insights)
- Cards sorted by margin opportunity (largest gap between our buy and market sell)
- Filterable by set, rarity, price range
- "Create rule" quick action to adjust pricing for a set/rarity

**4. Volatility Monitor** (risk management)
- Cards with >20% price change in last 7 days
- Alerts for cards in active buylists with significant price movement
- Suggested rule adjustments (advisory, not automatic)

---

## Implementation Plan

### Step 1: Schema Migration (1-2 days)
- Add the four new Prisma models
- Run `prisma migrate dev`
- Verify indexes

### Step 2: MTGJSON Buylist Extract (2-3 days)
- Extend `MtgjsonPriceSource` to parse buylist/retail data from additional vendors
- Write to `ExternalBuylistSnapshot`
- Test with known card prices

### Step 3: MTGBan Integration (3-5 days)
- Create `MtgbanSource` client
- Handle API authentication
- Normalize vendor names to canonical list
- Write to `ExternalBuylistSnapshot`
- Rate limiting and error handling

### Step 4: Daily Aggregation (3-5 days)
- Join ExternalBuylistSnapshot with SellPriceSnapshot
- Integrate RuleEngine for buy offer calculation (resolve cross-app access)
- Compute derived metrics
- Write PriceTrendDaily
- Implement retention cleanup

### Step 5: Analytics Router (3-5 days)
- Implement tRPC endpoints
- Query optimization (the composite indexes matter here)
- Pagination for large result sets

### Step 6: JustTCG Integration (2-3 days, can defer)
- Install `@justtcg/sdk`
- Implement selective card fetching
- Handle API quota management
- Store condition-specific data

### Step 7: Dashboard UI (5-10 days)
- Competitive overview page
- Card detail drill-down
- Charts (recommend Recharts or nivo, already common in Saleor ecosystem)
- Margin opportunity table
- Volatility monitor

### Step 8: Cron Route & Monitoring (2-3 days)
- ETL cron endpoint
- Health checks
- Alerting for stale data or failed ETL jobs
- Integration with existing logging (`createLogger`)

---

## Open Questions

### To Decide Before Implementation

1. **Shared RuleEngine**: Should the rule engine be extracted to `packages/rule-engine`? This is the cleanest approach but requires refactoring the buylist app imports.

2. **MTGBan API key**: Need to investigate if free access is sufficient or if we need to contact the MTGBan team for commercial use.

3. **JustTCG plan**: The free tier (100 req/day) only covers ~100 cards. Need to evaluate paid plans or decide if MTGJSON + MTGBan provide sufficient analytics without JustTCG.

4. **Cardmarket EUR data**: MTGJSON includes Cardmarket data in EUR. Should we convert to USD for unified analytics, or keep both currencies?

5. **Analytics app vs module**: This doc assumes a module within `inventory-ops`. If the analytics scope grows significantly, revisit whether a standalone app is warranted.

6. **Real-time competitive alerts**: Should high-priority price movements trigger notifications (e.g., "CardKingdom increased Lightning Bolt buylist by 40%")? This would add complexity but high value for the buylist team.

### Data Quality Considerations

- MTGJSON buylist data can be 12-24 hours stale (daily bulk update)
- MTGBan refreshes multiple times daily but exact schedule is undocumented
- Vendor buylist prices may include "credit" vs "cash" distinction (CardKingdom offers more in store credit) — decide whether to track both or normalize
- Some vendors have minimum quantity requirements for buylist prices — these aren't reflected in the data
- Card condition in external data is assumed NM unless specified — our condition multipliers may differ from vendors

---

## Environment Variables

```env
# Phase 3 Analytics
MTGBAN_API_KEY=           # MTGBan API key (if required)
JUSTTCG_API_KEY=          # JustTCG API key
ANALYTICS_ETL_SCHEDULE=   # Cron expression (default: "0 6 * * *")
ANALYTICS_RETENTION_DAYS= # Raw snapshot retention (default: 90)
```

---

## File Structure (Proposed)

```
apps/inventory-ops/src/modules/analytics/
├── analytics-router.ts          # tRPC endpoints
├── analytics-router.test.ts
├── aggregation.ts               # Daily rollup logic
├── aggregation.test.ts
├── retention.ts                 # Data cleanup
├── retention.test.ts
├── sources/
│   ├── mtgjson-buylist.ts       # MTGJSON buylist/retail extraction
│   ├── mtgjson-buylist.test.ts
│   ├── mtgban-source.ts         # MTGBan API client
│   ├── mtgban-source.test.ts
│   ├── justtcg-source.ts        # JustTCG SDK wrapper
│   └── justtcg-source.test.ts
└── index.ts                     # Barrel exports

apps/inventory-ops/src/app/api/cron/analytics-etl/
└── route.ts                     # ETL cron endpoint
```
