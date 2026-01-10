# Context Brief for AI Feature-Gap Analysis
## Saleor Platform for Hobby Gaming Commerce

**Purpose**: This brief provides context for AI models to analyze feature gaps and prioritize a roadmap for a hobby gaming (MTG card) commerce platform.

---

## Platform Overview

This is a **Saleor e-commerce platform** customized for the hobby gaming market, specifically Magic: The Gathering (MTG) card sales. It handles:

1. **E-commerce** - Online card sales via storefront
2. **Point of Sale (POS)** - In-store retail transactions
3. **Buylist** - Purchasing cards from customers (reverse commerce)
4. **Inventory Costing** - WAC (Weighted Average Cost) and COGS tracking

### Technology Stack
- **Backend**: Saleor 3.22 (Django + GraphQL)
- **Storefront**: Next.js 16, React 19, TypeScript
- **Custom Apps**: Next.js + tRPC + Prisma
- **Search**: Meilisearch for fast product lookups
- **Database**: PostgreSQL
- **Payments**: Stripe (online), Square Terminal (in-store, partial)

---

## Core Domain Entities

### Inventory & Costing
```
PurchaseOrder → GoodsReceipt → CostLayerEvent → WAC/COGS
```
- **CostLayerEvent**: Records every inventory movement with cost
- **WAC Calculation**: Weighted Average Cost for inventory valuation

### Buylist (Card Acquisition)
```
Customer brings cards → Staff quotes → Pay customer → Verify & receive inventory
```
- **Condition grading**: NM, LP, MP, HP, DMG
- **Payout methods**: Cash, store credit, check
- **Pricing rules**: Market price × condition multiplier

### Point of Sale
```
Scan/search → Cart → Payment → Complete → Saleor order created
```
- **Register sessions**: Cash drawer management
- **Split tender**: Multiple payment types per transaction
- **Returns**: Linked to original transactions

### Singles Builder → POS Integration
```
Staff uses storefront search → Builds cart → Sends to POS via metadata code
POS polls for pending carts → One-click import
```

---

## What's Working Well

1. **Buylist System**: Full workflow from quote to payout to inventory receipt
2. **WAC Costing**: O(1) optimized calculation on every inventory event
3. **Singles Builder**: Fast Meilisearch-powered card lookup, POS handoff
4. **Audit Trail**: Complete logging of price overrides, voids, payouts
5. **Multi-tenant**: All data scoped by installation ID

---

## Known Gaps & Issues

### Critical (Revenue Impact)
| Gap | Status | Impact |
|-----|--------|--------|
| POS COGS on sale | Not implemented | No margin tracking on sales |
| Tax calculation | Hardcoded $0 | Compliance risk |
| Card payments at POS | Square Terminal exists, not wired | Cash-only limits sales |
| Saleor ↔ local inventory sync | No webhook | Stock drift |

### High Priority (Operations)
| Gap | Status | Impact |
|-----|--------|--------|
| Offline POS | Code exists, not connected | Network down = no sales |
| Thermal receipt printing | ESC/POS code exists | Browser print only |
| Multi-register support | Data model ready | UI single-register |
| Price sync scheduling | Manual scripts | Stale market prices |

### Medium Priority (Quality)
| Gap | Status | Impact |
|-----|--------|--------|
| Test coverage | ~5 test files | Regression risk |
| Meilisearch auto-sync | Manual script | Stale search results |
| Returns UI | API only | Staff must use API |

---

## Architecture Notes

### Strengths
- Clean tRPC API with Zod validation
- Domain-driven module structure
- Idempotency keys on critical mutations
- Store credit integrated with customer accounts

### Technical Debt
- Hardcoded channel/warehouse IDs in POS UI
- 4+ TypeScript suppressions in checkout hooks
- Offline sync service built but never wired up
- No rate limiting on tRPC endpoints

---

## Questions for Analysis

1. **Prioritization**: Given limited development resources, what's the optimal order to address gaps?

2. **COGS Strategy**: Should we use FIFO, LIFO, or continue with WAC for card inventory costing?

3. **Offline Architecture**: How much offline capability is worth the complexity for a retail card store?

4. **Payment Integration**: Is Square Terminal the right choice, or should we consider alternatives?

5. **Testing Strategy**: What's the minimum viable test coverage for this domain?

6. **Price Sync**: How should market price updates be scheduled (cron, webhooks, real-time)?

7. **Multi-location**: Current architecture is multi-tenant - what changes for multi-location?

---

## File References

For deeper investigation, key files are:
- `inventory-ops/prisma/schema.prisma` - Full domain model (1930 lines)
- `buylist/src/modules/buylists/buylists-router.ts` - Buylist workflow
- `pos/src/modules/transactions/transactions-router.ts` - POS transactions
- `storefront/src/app/singles-builder/[channel]/actions.ts` - Search & handoff
- `buylist/src/lib/wac-service.ts` - WAC calculation

---

## Expected Output

Please analyze this platform and provide:
1. **Gap validation**: Do you see additional gaps not mentioned?
2. **Priority ranking**: Ordered list of what to build next
3. **Implementation recommendations**: High-level approach for top priorities
4. **Risk assessment**: What could go wrong if gaps aren't addressed?
5. **Alternative approaches**: Different architectures or tools to consider
