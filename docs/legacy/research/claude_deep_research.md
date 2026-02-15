# Claude Deep Research Analysis
## Saleor Platform for Hobby Gaming Commerce

**Generated**: 2026-01-09
**Model**: Claude Opus 4.5
**Analysis Depth**: Comprehensive codebase examination

---

## 1. Repository Map

### Core Structure
```
saleor-platform/
├── saleor/                    # Saleor API (Django + GraphQL) - submodule
├── storefront/                # Next.js 16 storefront (React 19)
├── saleor-apps/              # Custom Saleor Apps (Turborepo monorepo)
│   └── apps/
│       ├── inventory-ops/    # Purchase orders, goods receipts, WAC/COGS
│       ├── buylist/          # Card buyback system (FOH/BOH workflow)
│       ├── pos/              # Point of Sale with Square Terminal
│       ├── stripe/           # Payment processing
│       ├── price-sync/       # Market price synchronization
│       └── [10+ other apps]  # CMS, Search, SMTP, etc.
├── scripts/                   # Python sync scripts
│   ├── sync-meilisearch.py   # Product search indexing
│   ├── bulk-sync-scryfall.py # MTG card data import
│   └── sync-scryfall-attributes.py
└── docker-compose.yml        # 15+ services orchestration
```

### Technology Stack
| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Backend | Django 4.x, GraphQL (Strawberry) |
| Apps | Next.js + tRPC, Prisma ORM |
| Database | PostgreSQL (multiple instances) |
| Search | Meilisearch |
| Cache | Valkey (Redis-compatible) |
| Container | Docker Compose |

---

## 2. Domain Model Analysis

### Primary Entities (from Prisma schema - 1930 lines)

#### Inventory & Costing
- **PurchaseOrder**: Supplier orders with approval workflow
- **GoodsReceipt**: Physical receipt of inventory
- **CostLayerEvent**: WAC calculation events (receipts, sales, adjustments)
- **LandedCostAllocation**: Freight, customs, other costs per receipt

#### Buylist System
- **Buylist**: Customer card sell-back transactions
- **BuylistLine**: Individual cards with condition grading (NM/LP/MP/HP/DMG)
- **BuylistPayout**: Cash, store credit, check payments
- **BuylistPricingPolicy**: Rules-based buy price calculation
- **PricingRule**: Condition-based percentage adjustments

#### Point of Sale
- **RegisterSession**: Cash drawer sessions with open/close reconciliation
- **PosTransaction**: Sales, returns, exchanges
- **PosTransactionLine**: Line items with price overrides, discounts
- **PosPayment**: Split tender (cash, card, store credit)
- **CashMovement**: Drawer deposits, payouts, drops

#### Customer Management
- **CustomerCredit**: Store credit balances
- **CreditTransaction**: Credit ledger entries

#### Price Sync
- **PriceSnapshot**: Market price captures from Scryfall
- **SetImportJob**: MTG set import tracking

---

## 3. Primary Workflows

### A. Buylist Flow (Card Acquisition)
```
Customer → FOH Quote → Pay Customer → BOH Verification → Inventory Receipt
              ↓                                              ↓
       createAndPay()                               COGS Event Created
              ↓                                              ↓
       Payout (Cash/Credit)                          WAC Recalculated
```

**Implementation**: `buylists-router.ts` (1300+ lines)
- Rule engine calculates buy prices from market data
- Store credit auto-credits customer accounts
- Cash payouts track against register sessions
- CostLayerEvent created for each line (inventory costing)

### B. POS Sale Flow
```
Scan/Search → Add to Cart → Payment → Complete → Saleor Order
                   ↓                       ↓
            Optional: Import          Stock Decremented
            from Singles Builder           ↓
                                    COGS Event (future)
```

**Implementation**: `transactions-router.ts` (1770+ lines)
- SKU/barcode lookup via Saleor GraphQL
- Price overrides with audit trail
- Split tender payments
- Returns processing with original transaction lookup

### C. Singles Builder → POS Handoff
```
Staff Storefront → Meilisearch Search → Build Cart → Send to POS
                                              ↓
                                    Metadata: code, staff email
                                              ↓
                                    POS polls for pending carts
                                              ↓
                                    One-click import
```

**Implementation**: `actions.ts` (529 lines) + POS `importFromSinglesBuilder`

### D. Inventory Costing (WAC)
```
Receipt Event → O(1) WAC Calculation → Store wacAtEvent, qtyOnHandAtEvent
                      ↓
            Previous event lookup only
                      ↓
            New WAC = (Old Qty × Old WAC + New Qty × New Cost) / Total Qty
```

**Implementation**: `wac-service.ts` (315 lines)
- Optimized O(1) calculation using `totalValueAtEvent`
- Full O(n) replay available for reconciliation

---

## 4. Feature Gap Analysis

### CRITICAL - Core Business Functions

| Gap | Impact | Evidence |
|-----|--------|----------|
| **POS COGS on Sale** | No margin reporting | `recalculateTransactionTotals`: "TODO: Calculate tax" but no COGS event |
| **Tax Calculation** | Tax always $0 | `totalTax: 0` hardcoded in multiple places |
| **Card Payments** | Cash-only POS | Square Terminal exists but not integrated for payments |
| **Inventory Sync** | Saleor ↔ Local drift | No webhook for Saleor stock changes |

### HIGH - Operational Efficiency

| Gap | Impact | Evidence |
|-----|--------|----------|
| **Offline POS** | No network = no sales | `sync-service.ts` exists but unused |
| **Receipt Printing** | Browser print only | `escpos.ts` exists but not wired to UI |
| **Barcode Generation** | Manual SKU entry | No label printing workflow |
| **Multi-Register** | Single register UI | `registerCode` exists but no selection UI |

### MEDIUM - Data Quality & Automation

| Gap | Impact | Evidence |
|-----|--------|----------|
| **Price Sync Scheduling** | Manual sync required | Scripts exist, no cron/scheduler |
| **Scryfall Rate Limits** | Import failures | No retry logic in bulk-sync |
| **Meilisearch Auto-Sync** | Stale search data | Manual `sync-meilisearch.py` runs |
| **Test Coverage** | Regressions risk | ~19 tests in meilisearch.test.ts only |

### LOW - User Experience

| Gap | Impact | Evidence |
|-----|--------|----------|
| **POS Returns UI** | Returns via API only | `createReturn` endpoint, no UI |
| **Buylist History** | No customer lookup | `searchCards` but no customer history |
| **Dashboard Analytics** | Blind operations | No sales/inventory dashboards |
| **Customer Facing Display** | No second screen | Common in retail POS |

---

## 5. Architecture Observations

### Strengths
1. **Domain-Driven Design**: Clean separation of concerns in `modules/`
2. **Type Safety**: tRPC end-to-end typing, Zod validation
3. **Audit Trail**: `PosAuditEvent`, `BuylistAuditEvent` for compliance
4. **Multi-Tenant**: `installationId` scoping throughout
5. **WAC Optimization**: O(1) costing calculation

### Technical Debt
1. **Hardcoded IDs** in `transaction.tsx`:
   ```typescript
   const saleorChannelId = "Q2hhbm5lbDox";
   const saleorWarehouseId = "V2FyZWhvdXNlOjg1YTg0MmMwLTk4...";
   ```
2. **TypeScript Suppressions**: 4+ `@ts-expect-error` in checkout hooks
3. **Unused Offline Code**: Full sync service built but not connected
4. **Mixed Patterns**: Some apps use Pages Router, some App Router

### Security Considerations
1. Fixed: `sync-meilisearch.py` credentials now via env vars
2. `SECRET_KEY` handling in POS app needs review
3. No rate limiting on tRPC endpoints
4. JWT token in `ctx.token` but no expiry validation visible

---

## 6. Recommended Priorities

### Phase 1: Revenue Protection
1. **Implement POS Tax Calculation** - Integrate with Saleor tax or AvaTax
2. **Wire Square Terminal** - Card payments for POS
3. **COGS on Sale** - Create CostLayerEvent when completing POS sale

### Phase 2: Operational Stability
4. **Meilisearch Auto-Sync** - Webhook on product changes
5. **Offline POS Mode** - Connect existing sync service
6. **ESC/POS Printing** - Use existing escpos.ts for thermal receipts

### Phase 3: Scale & Quality
7. **Test Coverage** - Unit tests for routers, E2E for workflows
8. **Price Sync Scheduling** - Cron job or Temporal workflow
9. **Returns UI** - POS interface for returns processing
10. **Analytics Dashboard** - Sales, inventory, margin reports

---

## 7. File Evidence Index

| Finding | Primary Evidence File |
|---------|----------------------|
| WAC Implementation | `buylist/src/lib/wac-service.ts:30-107` |
| Buylist Full Workflow | `buylist/src/modules/buylists/buylists-router.ts:355-682` |
| POS Transaction Create | `pos/src/modules/transactions/transactions-router.ts:80-155` |
| Singles Builder Handoff | `storefront/src/app/singles-builder/[channel]/actions.ts:504-521` |
| Offline Sync Service | `pos/src/lib/offline/sync-service.ts:1-213` |
| Hardcoded IDs Issue | `pos/src/pages/transaction.tsx` (referenced in CLAUDE.md) |
| Tax TODO | `pos/src/modules/transactions/transactions-router.ts:1753` |
| Prisma Domain Model | `inventory-ops/prisma/schema.prisma` (1930 lines) |

---

## 8. Key Metrics

| Metric | Value |
|--------|-------|
| Total Apps | 13 custom Saleor Apps |
| Prisma Models | 40+ entities |
| tRPC Endpoints | ~80 across buylist + POS |
| Storefront Routes | 20+ pages/components |
| Python Scripts | 6 sync/import utilities |
| Docker Services | 15+ in compose |
| Test Files | ~5 (low coverage) |

---

## 9. Open Questions for External Review

1. **Should COGS use FIFO, LIFO, or WAC?** - Currently WAC, is this optimal for card market?
2. **Square Terminal vs. other payment hardware?** - Is Square the right choice?
3. **Offline-first vs. offline-capable?** - How much offline functionality is needed?
4. **Multi-location architecture?** - Current design supports multi-tenant, but multi-location?
5. **Customer loyalty program?** - Store credit exists, but no points/tiers
