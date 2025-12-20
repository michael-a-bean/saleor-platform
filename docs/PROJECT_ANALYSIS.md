# Saleor Platform MTG Marketplace - Project Analysis

> **Analysis Date**: December 19, 2025
> **Analyst**: Claude Code
> **Purpose**: Compare documented/planned functionality against actual implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Component Status Overview](#component-status-overview)
3. [MTG Catalog](#1-mtg-catalog)
4. [Storefront](#2-storefront)
5. [Inventory Ops App](#3-inventory-ops-app)
6. [Buylist App](#4-buylist-app)
7. [Stripe Payment App](#5-stripe-payment-app)
8. [Infrastructure](#6-infrastructure)
9. [Documentation Gaps](#7-documentation-gaps)
10. [Recommendations](#8-recommendations)

---

## Executive Summary

The Saleor Platform MTG Marketplace is **substantially implemented** and production-ready for core e-commerce operations. The platform successfully operates as an MTG card marketplace with 106,882 products, full inventory management, and customer buyback functionality.

### Overall Completion: ~90%

| Component | Completion | Production Ready |
|-----------|------------|------------------|
| MTG Catalog | 100% | Yes |
| Storefront | 95% | Yes |
| Inventory Ops | 85% | Yes |
| Buylist App | 100% | Yes |
| Stripe App | 80% | Needs configuration |
| Infrastructure | 100% | Yes |

---

## Component Status Overview

| Component | Documented | Implemented | Gap |
|-----------|------------|-------------|-----|
| **Storefront** | Next.js 15 + MTG filtering | Complete with 9 filter types | Trending products placeholder |
| **Inventory Ops** | Phases 1-10 planned | Phases 1-8 + extras | Settings UI & tests missing |
| **Buylist App** | Customer buyback | Complete with stock sync | None |
| **Stripe App** | Payment integration | Configured | DynamoDB setup required |
| **MTG Catalog** | 106,872 cards | 106,882 cards | Complete (+10 extra) |
| **Services** | 14 containers | 14 running | All operational |

---

## 1. MTG Catalog

### Documentation Reference
- `CLAUDE.md` - States 106,872 cards
- `.claude/rules/mtg-catalog.md` - Defines 23 attributes

### Actual Implementation

**Product Count**: 106,882 products (slightly exceeds documented 106,872)

**Attributes Defined**: 24 (exceeds documented 23)

| Category | Attributes |
|----------|------------|
| Card Mechanics | `mana_cost`, `mana_value`, `color_identity`, `type_line`, `power`, `toughness`, `loyalty` |
| Set Information | `rarity`, `set_name`, `set_code`, `collector_number`, `artist` |
| External IDs | `scryfall_id`, `oracle_id`, `tcgplayer_id`, `tcgplayer_etched_id`, `cardmarket_id`, `mtgo_id`, `arena_id` |
| Flags | `reserved`, `is_promo`, `is_full_art`, `is_reprint`, `is_digital` |

**Import Scripts** (located in `scripts/mtg_scryfall_import/`):
- `import_command.py` - Django management command
- `run_import.sh` - Orchestration script
- `add_color_identity.py` - Color identity attribute addition

### Status: COMPLETE

The MTG catalog exceeds documented specifications with additional products and one extra attribute beyond the documented 23.

---

## 2. Storefront

### Documentation Reference
- `.claude/rules/storefront.md` - Development patterns
- `docs/SALEOR_CONTEXT.md` - Architecture overview
- `CLAUDE.md` - References advanced filtering plan

### Actual Implementation

#### Core Features

| Feature | Status | Details |
|---------|--------|---------|
| Product Catalog | Complete | 106k+ cards with cursor-based pagination |
| Product Detail Pages | Complete | Full MTG attribute display with organized groups |
| Search Functionality | Complete | Full-text search with URL-based sharing |
| Cart & Checkout | Complete | Saleor checkout SDK integration |
| User Authentication | Complete | Login, order history, protected routes |
| Homepage | Complete | Latest sets (Scryfall API) + trending section |
| Responsive Design | Complete | Mobile-first with TailwindCSS |
| SEO/Metadata | Complete | Schema.org markup, Open Graph |

#### Filtering System (9 Filter Types)

| Filter | Type | Implementation |
|--------|------|----------------|
| Rarity | Multi-select | Common, Uncommon, Rare, Mythic, Special, Bonus |
| Color Identity | Multi-select | WUBRG + Colorless |
| Card Type | Single-select | Creature, Instant, Sorcery, Artifact, Enchantment, Planeswalker, Land, Battle |
| Set | Dynamic dropdown | Loads from Saleor based on search query |
| Price Range | Min/max numeric | Dollar values |
| Mana Value (CMC) | Min/max numeric | Converted mana cost |
| Reserved List | Boolean toggle | True/False |
| Promo | Boolean toggle | True/False |
| Full Art | Boolean toggle | True/False |

**Filter Architecture** (`storefront/src/lib/filters/`):
- `types.ts` - MTGFilterState interface
- `mtgConstants.ts` - Filter options and attribute mappings
- `buildGraphQLFilter.ts` - Client state to ProductFilterInput conversion
- `urlFilters.ts` - URL serialization/deserialization
- `getAvailableSets.ts` - Server action for set options
- `getLatestSets.ts` - Scryfall API integration for homepage

#### UI Implementation

- Desktop sidebar (hidden on mobile, 16rem width)
- Mobile filter modal (slide-in drawer with @headlessui)
- Active filter display with individual removal
- "Clear All" functionality
- Pagination reset on filter change

### Gaps

1. **Trending Products**: Currently uses alphabetical sort as placeholder
   - Code contains comments indicating it awaits sales tracking integration
   - When inventory-ops sales data is available, can be updated to use actual sales counts

2. **Referenced Plan Missing**: `CLAUDE.md` references `.claude/plans/silly-spinning-hamming.md` for advanced filtering plan, but this file does not exist in the repository.

### Status: 95% COMPLETE

---

## 3. Inventory Ops App

### Documentation Reference
- `docs/INVENTORY_OPS_SETUP.md` - Setup guide and feature list
- `saleor-apps/apps/inventory-ops/IMPLEMENTATION_PLAN.md` - Detailed phase plan
- `.claude/skills/inventory-ops.md` - Skill reference

### Planned vs Implemented Phases

| Phase | Description | Planned | Implemented |
|-------|-------------|---------|-------------|
| 1 | App Scaffolding | Yes | Yes |
| 2 | Supplier Management | Yes | Yes |
| 3 | Purchase Order Lifecycle | Yes | Yes |
| 4 | Goods Receipt + Stock Posting | Yes | Yes |
| 5 | Cost Layer Ledger + WAC | Yes | Yes |
| 6 | Landed Cost Allocation | Yes | Yes |
| 7 | GR Reversal | Yes | Yes |
| 8 | Sales Integration (COGS) | Yes | Yes |
| 9 | Settings + UI Polish | Yes | **NO** |
| 10 | Testing + Documentation | Yes | **NO** |

### Database Schema

**Documented Models** (11):
- AppInstallation, Supplier, PurchaseOrder, PurchaseOrderLine
- GoodsReceipt, GoodsReceiptLine, LandedCost, LandedCostAllocation
- CostLayerEvent, SaleEvent, SaleorPostingRecord, AuditEvent

**Additional Models Implemented** (6):
- StockDiscrepancy - Detects unauthorized stock changes
- StockAdjustment, StockAdjustmentLine - Manual corrections
- Buylist, BuylistLine - Customer buyback (shared with buylist app)
- BuylistPayout, BuylistAuditEvent, BuylistPricingPolicy, SellPriceSnapshot

**Total**: 17+ models (exceeds planned 11)

### tRPC Routers

| Router | Procedures | Status |
|--------|------------|--------|
| suppliers | list, getById, create, update, deactivate, reactivate | Complete |
| purchaseOrders | list, getById, create, update, addLine, updateLine, removeLine, submit, approve, reject, cancel, duplicate | Complete |
| goodsReceipts | list, getById, create, addLine, updateLine, removeLine, post, reverse | Complete |
| costLayers | getWac, getWacBatch, getHistory, getInventoryValuation | Complete |
| landedCosts | listByGR, create, update, delete, allocate, previewAllocation | Complete |
| reporting | inventoryValuation, costHistory, stockMovementSummary, dashboardSummary | Complete |
| sales | list, getById, getSummary, profitabilityByProduct | Complete |
| stockAdjustments | (Beyond plan) Full CRUD + posting | Complete |
| stockDiscrepancies | (Beyond plan) Detection + resolution | Complete |

### Webhook Implementations

| Webhook | Purpose | Status |
|---------|---------|--------|
| ORDER_FULFILLED | COGS tracking, SALE cost events | Complete |
| PRODUCT_VARIANT_STOCK_UPDATED | Discrepancy detection | Complete (beyond plan) |

### UI Pages

**Planned Pages** (12):
- Suppliers: index, new, [id]
- Purchase Orders: index, new, [id], [id]/edit
- Goods Receipts: index, new, [id]
- Reports: inventory-value, cost-history, sales, profitability

**Additional Pages** (4):
- Stock Adjustments: index, new, [id]
- Stock Discrepancies: index, [id]

### Missing Implementation

1. **Phase 9 - Settings UI**:
   - `allowNegativeStock` - Not exposed
   - `requireCostOnReceipt` - Not exposed
   - `defaultAllocationMethod` - Not exposed
   - `landedCostEnabled` - Not exposed
   - No `/pages/settings` directory exists

2. **Phase 10 - Testing**:
   - No unit tests for WAC calculation
   - No integration tests for PO→GR→COGS flow
   - No E2E tests with Playwright
   - Vitest configured in monorepo but no app-specific tests

### Status: 85% COMPLETE

Core functionality is production-ready. Settings UI and tests are quality-of-life improvements rather than functional blockers.

---

## 4. Buylist App

### Documentation Reference
- `saleor-apps/apps/buylist/TESTING.md` - Testing guide
- `saleor-apps/apps/buylist/prisma/README.md` - Database setup

### Actual Implementation

#### Core Features

| Feature | Status | Details |
|---------|--------|---------|
| Buylist Creation (FOH) | Complete | DRAFT → QUOTED → SUBMITTED workflow |
| Card Search | Complete | Autocomplete from Saleor products |
| Pricing Calculation | Complete | Condition multipliers (NM 100%, LP 90%, MP 75%, HP 50%, DMG 25%) |
| Pricing Policies | Complete | 4 types: Percentage, Fixed Discount, Tiered, Custom |
| BOH Review Queue | Complete | 3 tabs: Pending, Approved, Payout |
| Stock Receipt | **Partial** | Creates cost events, does NOT sync to Saleor |
| Payout Tracking | Complete | Cash, Store Credit, Check, Bank Transfer, PayPal, Other |
| Audit Logging | Complete | Append-only event trail |

#### tRPC Routers

| Router | Key Procedures |
|--------|----------------|
| buylists | list, getById, create, update, addLine, updateLine, removeLine, generateQuote, submit, cancel, stats, searchCards |
| pricing | list, getById, getDefault, create, update, delete, setDefault, calculatePrice, calculatePrices |
| boh | queue, readyToReceive, readyForPayout, review, approve, reject, receive, recordPayout, stats |

#### UI Pages

| Route | Purpose | Status |
|-------|---------|--------|
| `/` | Landing with FOH/BOH sections | Complete |
| `/buylists` | List with filtering | Complete |
| `/buylists/new` | Create with card search | Complete |
| `/buylists/[id]` | Detail view | Complete |
| `/boh/queue` | Review queue (3 tabs) | Complete |
| `/boh/buylists/[id]/review` | Line item review | Complete |
| `/boh/buylists/[id]/receive` | Confirm receipt | Complete |
| `/pricing/policies` | Policy management | Complete |

### Stock Sync: IMPLEMENTED (Dec 2025)

The `receive` operation now:
- Calls `productVariantStocksUpdate` mutation for each accepted line
- Updates Saleor warehouse stock with the received quantities
- Creates CostLayerEvent records (BUYLIST_RECEIPT type)
- Handles partial failures gracefully (logs warnings, continues with other items)
- Records full audit trail of stock updates in BuylistAuditEvent

**Implementation Details**:
- Added `getStock`, `updateStock`, `adjustStock`, `bulkAdjustStock` methods to `saleor-client.ts`
- Modified `boh-router.ts` `receive` mutation to call stock updates before status change
- If ALL stock updates fail, the receive is aborted (buylist stays APPROVED for retry)
- If SOME updates fail, the operation continues with a warning in the audit log

### Status: 100% COMPLETE

---

## 5. Stripe Payment App

### Documentation Reference
- `docs/SALEOR_CONTEXT.md` - Architecture and troubleshooting

### Actual Implementation

**Source**: Official Saleor Stripe app from `saleor/apps` monorepo with custom Dockerfile

**Configuration** (from `docker-compose.yml`):
```yaml
stripe-app:
  environment:
    - SECRET_KEY=677a28c7...  # 64-char hex for encryption
    - APP_IFRAME_BASE_URL=http://localhost:3001
    - APP_API_BASE_URL=http://host.docker.internal:3001
    - APL=dynamodb
    - AWS_ENDPOINT_URL=http://dynamodb-local:8000
    - DYNAMODB_MAIN_TABLE_NAME=stripe-main-table
```

**Dependencies**:
- DynamoDB Local container (running on port 8001)
- Requires table creation before first use

### Setup Requirements

1. Create DynamoDB table:
```bash
docker run --rm --network saleor-platform_saleor-backend-tier \
  -e AWS_ACCESS_KEY_ID=local -e AWS_SECRET_ACCESS_KEY=local \
  amazon/aws-cli dynamodb create-table \
    --endpoint-url http://dynamodb-local:8000 \
    --table-name stripe-main-table \
    --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST --region localhost
```

2. Configure Stripe API keys via Dashboard

### Status: 80% COMPLETE (Requires Configuration)

---

## 6. Infrastructure

### Documentation Reference
- `docs/SALEOR_CONTEXT.md` - Service architecture
- `docker-compose.yml` - Service definitions

### Service Status (All Running)

| Service | Port | Container | Status |
|---------|------|-----------|--------|
| Storefront | 3000 | saleor-platform-storefront-1 | Up 4 days |
| API | 8000 | saleor-platform-api-1 | Running |
| Dashboard | 9000 | saleor-platform-dashboard-1 | Running |
| PostgreSQL | 5432 | saleor-platform-db-1 | Up 5 days |
| Valkey (cache) | 6379 | saleor-platform-cache-1 | Up 5 days |
| Worker (Celery) | - | saleor-platform-worker-1 | Running |
| Jaeger | 16686 | saleor-platform-jaeger-1 | Up 5 days |
| Mailpit | 8025 | saleor-platform-mailpit-1 | Up 5 days (healthy) |
| Stripe App | 3001 | saleor-platform-stripe-app-1 | Up 4 days |
| DynamoDB Local | 8001 | saleor-platform-dynamodb-local-1 | Up 4 days |
| Inventory Ops | 3002 | saleor-platform-inventory-ops-app-1 | Running |
| Inventory Ops DB | 5433 | saleor-platform-inventory-ops-db-1 | Up 4 days |
| Saleor MCP | 6000 | saleor-platform-saleor-mcp-1 | Running |
| Buylist App | 3003 | saleor-platform-buylist-app-1 | Running |

### Status: 100% COMPLETE

All 14 documented services are operational.

---

## 7. Documentation Gaps

| Document | Issue | Recommendation |
|----------|-------|----------------|
| `CLAUDE.md` | References `.claude/plans/silly-spinning-hamming.md` which doesn't exist | Remove reference or create the plan file |
| `INVENTORY_OPS_SETUP.md` | Lists Phase 10 "Stock Control" as complete | Clarify this is Phase 10 in the setup doc but matches Phase 8+ in IMPLEMENTATION_PLAN |
| `IMPLEMENTATION_PLAN.md` | Claims "Phase 8 Complete" in header | Update to reflect actual state (Phases 1-8 complete, 9-10 not implemented) |

---

## 8. Recommendations

### High Priority

1. **Stripe Configuration**
   - Create DynamoDB table using provided command
   - Configure Stripe API keys via Dashboard
   - Test payment flow end-to-end

### Medium Priority

2. **Trending Products Enhancement**
   - Connect storefront trending to inventory-ops sales data
   - Query `SaleEvent` table for order counts per product
   - Update `getTrendingProducts.ts` server action

3. **Documentation Cleanup**
   - Remove or create `.claude/plans/silly-spinning-hamming.md`
   - Align phase numbering between INVENTORY_OPS_SETUP.md and IMPLEMENTATION_PLAN.md

### Low Priority

4. **Inventory Ops Settings UI** (Phase 9)
   - Create `/pages/settings` with configuration options
   - Expose `allowNegativeStock`, `requireCostOnReceipt`, etc.

5. **Testing** (Phase 10)
   - Add unit tests for WAC calculation (`cost-layers/wac-service.ts`)
   - Add integration tests for PO→GR→COGS workflow
   - Consider E2E tests for critical paths

---

## Appendix: File Locations

### Key Configuration Files
- `/docker-compose.yml` - Service definitions
- `/CLAUDE.md` - Project instructions
- `/docs/SALEOR_CONTEXT.md` - Architecture reference
- `/docs/INVENTORY_OPS_SETUP.md` - Inventory ops setup

### Storefront
- `/storefront/src/app/[channel]/` - Next.js routes
- `/storefront/src/lib/filters/` - Filter system
- `/storefront/src/graphql/` - GraphQL queries

### Inventory Ops
- `/saleor-apps/apps/inventory-ops/prisma/schema.prisma` - Database schema
- `/saleor-apps/apps/inventory-ops/src/modules/` - Business logic
- `/saleor-apps/apps/inventory-ops/src/pages/` - UI pages
- `/saleor-apps/apps/inventory-ops/IMPLEMENTATION_PLAN.md` - Phase plan

### Buylist
- `/saleor-apps/apps/buylist/src/modules/` - tRPC routers
- `/saleor-apps/apps/buylist/src/pages/` - UI pages
- `/saleor-apps/apps/buylist/TESTING.md` - Testing guide

### MTG Catalog
- `/scripts/mtg_scryfall_import/` - Import scripts
- `/.claude/rules/mtg-catalog.md` - Catalog rules

---

*Last updated: December 19, 2025*
