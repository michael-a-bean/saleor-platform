# POS App Completion Plan

**Status: ARCHIVED**
**Archived**: 2026-01-28
**Reason**: Plan served its purpose; remaining work tracked as GitHub issues

---

## Archive Summary

### What Shipped (Phase 1 MVP - 85%)

| Feature | Status | Evidence |
|---------|--------|----------|
| Register session management | ✅ Shipped | `register-router.ts` |
| Cash denomination tracking | ✅ Shipped | Open/close with cash count |
| Barcode/SKU scanning | ✅ Shipped | `addLine` endpoint |
| Cart management (CRUD) | ✅ Shipped | `transactions-router.ts` |
| Customer search/create | ✅ Shipped | `customers-router.ts` |
| Store credit system | ✅ Shipped | Shared with buylist |
| Cash payment processing | ✅ Shipped | `payments-router.ts` |
| Browser receipt printing | ✅ Shipped | `receipts-router.ts` |
| Singles Builder import | ✅ Shipped | One-click import works |
| Audit logging | ✅ Shipped | `PosAuditEvent` |
| Transaction void | ✅ Shipped | Void with reason capture |
| Z-Report page | ✅ Shipped | `/register/z-report/[sessionId]` |
| Reconcile page | ✅ Shipped | `/transactions/reconcile` |

### What Remains (Tracked as Issues)

| Feature | Issue | Priority |
|---------|-------|----------|
| Price Override UI | See GitHub issue | P2 |
| Line Discount UI | See GitHub issue | P2 |
| Transaction Discount UI | See GitHub issue | P2 |

### Phases Not Started (Future Work)

| Phase | Description | Notes |
|-------|-------------|-------|
| Phase 2 | Returns & Card Payments | Returns page exists as stub |
| Phase 3 | Cash Management & Reporting | Z-Report partially done |
| Phase 4 | Offline Mode | Some commits exist (db01db7, 0d88d21) |
| Phase 5 | Hardware Integration | Not started |

### Undocumented Work Discovered

Two offline mode commits were found that weren't in the original plan:
- `db01db7` feat(offline): P4-4 add cursor-based pagination for product cache
- `0d88d21` feat(offline): add idempotency key for offline transaction sync

---

## Original Plan (Preserved for Reference)

<details>
<summary>Click to expand original plan content</summary>

**Created**: 2026-01-05
**Goal**: Complete POS system for in-store hobby gaming transactions

### Architecture Overview

#### Tech Stack
- **Framework**: Next.js (App Router for API + Pages Router for UI)
- **API**: tRPC for type-safe procedures
- **Database**: PostgreSQL via Prisma ORM (shared with inventory-ops)
- **UI**: Saleor Macaw UI components
- **Port**: 3004

#### Key Architecture Decisions

1. **Shared Prisma Schema**: POS symlinks to `inventory-ops/prisma/schema.prisma`
2. **tRPC Router Structure**: health, register, transactions, payments, receipts, customers
3. **Multi-Installation Support**: All records scoped by `installationId`
4. **Soft Foreign Keys to Saleor**: Store Saleor IDs as strings
5. **Singles Builder Integration**: 6-character code links storefront cart to POS

### Integration Points

- **Saleor GraphQL**: Product lookup, customer, orders, checkout
- **Inventory Ops (Shared DB)**: CostLayerEvent, CustomerCredit, CreditTransaction
- **Buylist App (Shared DB)**: Buylist payouts create CustomerCredit records
- **Singles Builder (Storefront)**: Staff creates cart, POS imports via code

</details>

---

## Lessons Learned

1. **Plans should be scoped to shippable increments** - Phase 1 was too large
2. **Document organic discoveries** - Offline work happened but wasn't tracked
3. **UI work estimates are optimistic** - "0.5 day" items often expand
4. **Plan completion is not the goal** - Shipping working software is
