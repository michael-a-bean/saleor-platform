# ADR-001: Inventory-Ops as Costing Layer for Saleor

**Status:** APPROVED
**Date:** 2026-01-19
**Decision Makers:** Architecture Council (Architect, Engineer, Researcher, Security)
**Implementation Owner:** TBD

---

## Executive Summary

The inventory-ops Saleor App is validated as the correct architectural approach for inventory costing. The separation from Saleor core is architecturally sound, does not duplicate functionality, and should be retained. Implementation improvements are required for operational reliability.

**Key Decision:** Ship current architecture with pure WAC costing. Defer hybrid costing complexity to Phase 2.

---

## Context and Problem Statement

The saleor-platform includes a custom Saleor App called `inventory-ops` that manages:
- Purchase Orders (POs) and Goods Receipts (GRs)
- Supplier management
- Weighted Average Cost (WAC) calculation via append-only ledger
- Cost of Goods Sold (COGS) tracking via ORDER_FULFILLED webhooks
- Landed cost allocation

**Questions Evaluated:**
1. Is inventory-ops duplicating functionality that exists in Saleor core?
2. Is the separate database architecture sound?
3. Is WAC the correct costing method for this domain (MTG card secondary market)?
4. Are we introducing unnecessary complexity?

---

## Decision Drivers

### Business Requirements
- **Accurate COGS tracking** for margin analysis across online and POS channels
- **WAC calculation** for inventory valuation on balance sheet
- **Audit trail** for financial compliance
- **Multi-channel consistency** (webstore + POS must reconcile)

### Technical Constraints
- Saleor has **no native cost tracking, WAC, purchase order workflow, or supplier management**
- Financial data requires **append-only immutable ledger** for audit compliance
- Integration must survive **Saleor version upgrades** without modification

### Domain Context
- MTG card secondary market with ~100k+ product variants
- Card values range from $0.10 (bulk commons) to $10,000+ (vintage staples)
- Condition grading (NM, LP, MP, HP, DMG) affects pricing
- High-volume commodity inventory mixed with high-value singles

---

## Options Considered

### Option A: Keep inventory-ops as Separate Saleor App (SELECTED)
- Separate Next.js app with own PostgreSQL database
- Integration via Saleor webhooks and GraphQL mutations
- Append-only CostLayerEvent ledger for WAC calculation

**Pros:**
- Respects bounded context boundaries
- Saleor upgrades remain safe (decoupled)
- Audit trail isolated and tamper-evident
- Independent scaling for cost calculations vs commerce operations

**Cons:**
- Two databases to maintain
- Webhook reliability concerns
- URL normalization workarounds for Docker networking

### Option B: Extend Saleor with Custom Django App
- Add cost tracking directly to Saleor's Django codebase
- Share database with Saleor core

**Pros:**
- Single database, no sync issues
- Simpler deployment

**Cons:**
- Creates Saleor fork (maintenance nightmare)
- Blocks Saleor upgrades
- Violates Saleor's extensibility model
- Tight coupling between commerce and accounting domains

### Option C: Use Saleor Metadata for Cost Data
- Store cost information in Saleor's metadata fields
- Query costs via GraphQL

**Pros:**
- No additional infrastructure

**Cons:**
- Metadata cannot support append-only ledgers
- No complex query support for WAC aggregation
- Not designed for financial audit requirements

### Option D: External ERP Integration
- Use QuickBooks, NetSuite, or similar for costing
- Sync inventory events bidirectionally

**Pros:**
- Battle-tested financial software
- Full accounting feature set

**Cons:**
- Expensive licensing
- Complex bidirectional sync
- Overkill for single-location retail
- Latency in cost calculations

---

## Decision Outcome

### Selected Option: A - Keep inventory-ops as Separate Saleor App

**Rationale:**
1. **No duplication** — Saleor has no native cost tracking features
2. **Architectural soundness** — Database-per-service pattern aligns with MACH principles
3. **Audit compliance** — Append-only ledger is regulatory requirement
4. **Upgrade safety** — Decoupling protects against Saleor version changes

### Costing Method Decision: Pure WAC for Phase 1

The council debated WAC vs. hybrid (WAC + specific identification for high-value items):

| Perspective | Position |
|-------------|----------|
| **Architect** | Pure WAC sufficient at current scale |
| **Engineer** | Hybrid doubles complexity for marginal gain |
| **Researcher** | Hybrid justified for secondary markets, but make opt-in |
| **Security** | Hybrid expands audit surface; defer to Phase 2 |

**Decision:** Ship with pure WAC. Evaluate specific identification for Phase 2 only when operational data demonstrates need.

---

## Consequences

### Positive
- Clean separation of concerns (commerce vs. accounting)
- Immutable audit trail for financial compliance
- Safe Saleor upgrade path
- Independent scaling of cost calculation workloads

### Negative
- Two databases require reconciliation
- Webhook reliability is critical path
- URL normalization workarounds add technical debt

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Webhook drops cause COGS drift | Medium | High | Circuit breakers + reconciliation endpoint |
| Stock sync divergence | Medium | High | Event-driven + scheduled reconciliation |
| URL_ALIASES workaround breaks | Low | Medium | Clean up Docker networking configuration |
| WAC insufficient for high-value cards | Low | Medium | Design for specific ID extension in Phase 2 |

---

## Implementation Requirements

### Phase 1: Operational Reliability (Required Before Production)

#### 1.1 Reconciliation Endpoint
**Priority:** Critical
**Effort:** Medium

Add `/api/reconcile` endpoint to inventory-ops that:
- Compares CostLayerEvent-derived inventory against Saleor `quantity_allocated`
- Returns discrepancies with variant IDs and delta amounts
- Supports both on-demand and scheduled execution

```typescript
// Example response
{
  "status": "DIVERGENCE_DETECTED",
  "timestamp": "2026-01-19T14:00:00Z",
  "discrepancies": [
    {
      "variantId": "UHJvZHVjdFZhcmlhbnQ6MTIz",
      "sku": "LEA-lightning-bolt-NM-F",
      "warehouseId": "V2FyZWhvdXNlOjE=",
      "inventoryOpsQty": 10,
      "saleorQty": 8,
      "delta": 2
    }
  ],
  "summary": {
    "totalVariantsChecked": 15420,
    "discrepancyCount": 1,
    "lastReconciliation": "2026-01-18T14:00:00Z"
  }
}
```

#### 1.2 Circuit Breaker for Webhooks
**Priority:** Critical
**Effort:** Medium

Implement circuit breaker pattern for ORDER_FULFILLED webhook processing:
- Track consecutive failures per webhook type
- Open circuit after 3 consecutive failures
- Alert immediately when circuit opens
- Require manual intervention to close circuit
- Log all state transitions for audit

```typescript
// Circuit breaker states
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// Configuration
const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 300000; // 5 minutes
```

#### 1.3 Event-Driven Reconciliation
**Priority:** High
**Effort:** Medium

Trigger reconciliation checks on:
- Every goods receipt posting
- Every ORDER_FULFILLED webhook
- Daily scheduled job (backup)

Store reconciliation results in new table:
```prisma
model ReconciliationRun {
  id              String   @id @default(uuid())
  installationId  String
  triggeredBy     String   // "GOODS_RECEIPT" | "ORDER_FULFILLED" | "SCHEDULED" | "MANUAL"
  startedAt       DateTime
  completedAt     DateTime?
  status          String   // "RUNNING" | "PASSED" | "DIVERGENCE" | "FAILED"
  discrepancyCount Int     @default(0)
  details         Json?

  @@index([installationId, startedAt])
}
```

#### 1.4 Remove URL_ALIASES Workaround
**Priority:** Medium
**Effort:** Low

The `NormalizedFileAPL` with URL_ALIASES is a code smell. Options:
1. Fix Docker networking to use consistent hostnames
2. Use environment-specific APL configuration
3. Document the workaround if it must remain

### Phase 2: Future Enhancements (Post-Production)

#### 2.1 Specific Identification Costing (Optional)
**Trigger:** Operational data showing WAC inadequacy for high-value singles
**Effort:** High

If implemented:
- Make opt-in at channel or category level
- Configurable value threshold (suggested: $200+ for graded/sealed)
- Separate audit trail for lot-level tracking
- Rate limiting on CQRS queries to prevent enumeration

#### 2.2 Advanced Reporting
- Margin trends by product category
- Inventory turn rate analysis
- Landed cost impact reports

---

## Technical Specifications

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         saleor-platform                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐         ┌─────────────────────────────────┐   │
│  │     Saleor      │         │        inventory-ops            │   │
│  │    (Django)     │         │         (Next.js)               │   │
│  │                 │         │                                 │   │
│  │  - Products     │ webhook │  - PurchaseOrder                │   │
│  │  - Orders       │────────>│  - GoodsReceipt                 │   │
│  │  - Stock        │         │  - CostLayerEvent (append-only) │   │
│  │  - Channels     │<────────│  - Supplier                     │   │
│  │                 │ mutation│  - LandedCost                   │   │
│  └────────┬────────┘         └────────────┬────────────────────┘   │
│           │                               │                         │
│           v                               v                         │
│  ┌─────────────────┐         ┌─────────────────────────────────┐   │
│  │   PostgreSQL    │         │         PostgreSQL              │   │
│  │  (Saleor DB)    │         │      (inventory-ops DB)         │   │
│  │                 │         │                                 │   │
│  │  - Products     │         │  - CostLayerEvent               │   │
│  │  - Variants     │         │  - PurchaseOrder/Line           │   │
│  │  - Stock        │         │  - GoodsReceipt/Line            │   │
│  │  - Orders       │         │  - SaleorPostingRecord          │   │
│  └─────────────────┘         └─────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Goods Receipt

```
1. User creates GoodsReceipt in inventory-ops UI
2. User posts GoodsReceipt
3. inventory-ops:
   a. Creates CostLayerEvent (GOODS_RECEIPT) with cost data
   b. Calculates new WAC
   c. Calls Saleor productVariantStocksUpdate mutation
   d. Creates SaleorPostingRecord for idempotency
4. Saleor updates stock quantity
```

### Data Flow: Order Fulfillment (COGS)

```
1. Order fulfilled in Saleor
2. Saleor sends ORDER_FULFILLED webhook to inventory-ops
3. inventory-ops:
   a. Looks up current WAC for each fulfilled variant
   b. Creates CostLayerEvent (SALE) with COGS = qty × WAC
   c. Stores revenue for margin calculation
   d. Creates SaleEvent for reference
```

### Key Tables

| Table | Purpose | Mutability |
|-------|---------|------------|
| `CostLayerEvent` | Append-only cost ledger | INSERT only |
| `PurchaseOrder` | PO header | Mutable (state machine) |
| `PurchaseOrderLine` | PO line items | Mutable |
| `GoodsReceipt` | Receipt header | Mutable until posted |
| `GoodsReceiptLine` | Receipt line items | Mutable until posted |
| `SaleorPostingRecord` | Idempotency tracking | INSERT only |
| `SaleEvent` | Fulfilled order reference | INSERT only |
| `Supplier` | Vendor master data | Soft delete |

### WAC Calculation Formula

```
New WAC = (Existing Qty × Existing WAC + New Qty × New Unit Cost) / (Existing Qty + New Qty)
```

Implemented in `src/modules/cost-layers/wac-service.ts` with O(1) optimization using running totals.

---

## Validation Checklist

Before declaring Phase 1 complete:

- [ ] `/api/reconcile` endpoint implemented and tested
- [ ] Circuit breaker for webhooks with alerting
- [ ] Event-driven reconciliation on GR posting
- [ ] Scheduled daily reconciliation job
- [ ] ReconciliationRun table and audit logging
- [ ] URL_ALIASES workaround documented or removed
- [ ] Monitoring dashboard for webhook health
- [ ] Runbook for reconciliation failures

---

## Council Debate Record

### Participants
- **Architect (Serena Blackwood)** — System design perspective
- **Engineer (Marcus Webb)** — Implementation and maintenance perspective
- **Researcher (Ava Chen)** — Industry best practices perspective
- **Security (Rook Blackburn)** — Data integrity and compliance perspective

### Consensus Points (4/4 Agreed)
1. Database separation is architecturally correct
2. Append-only CostLayerEvent ledger is non-negotiable
3. SaleorPostingRecord is the right integration pattern
4. Reconciliation capability is required
5. No functionality duplication with Saleor core

### Contested Points

| Topic | Engineer/Architect/Security | Researcher |
|-------|----------------------------|------------|
| Hybrid costing | Defer to Phase 2 | Justified, make opt-in |
| Webhook failure handling | Halt workflow | Alert + queue |

**Resolution:** Defer hybrid costing. Implement circuit breakers that halt after N failures.

### Key Quotes

> "The friction is a feature, not a bug—explicit correlation identifiers prevent accidental tight coupling." — Architect

> "Complexity kills startups. Ship working WAC, then iterate." — Engineer

> "$500 Magic cards require lot-level tracking that WAC obscures." — Researcher

> "Append-only ledger is exactly what auditors want—tamper-evident by design." — Security

---

## References

- `saleor-apps/apps/inventory-ops/IMPLEMENTATION_PLAN.md` — Full implementation history
- `saleor-apps/apps/inventory-ops/README.md` — App documentation
- `docs/reference/sync-contracts.md` — Data sync contracts
- `docs/research/context_brief.md` — Platform overview and gaps

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-19 | Council | Initial decision documented |

