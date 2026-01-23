# ISSUE-012 Investigation: POS App TODOs

**Investigation Date:** 2026-01-23
**Total TODOs Found:** 14
**Total Effort Estimate:** 21 hours

## Summary by Category

| Category | Count | Impact |
|----------|-------|--------|
| Hardcoded Values | 4 | HIGH |
| Missing Features | 5 | CRITICAL |
| Data Population | 3 | MEDIUM |
| React/Architecture | 1 | LOW |
| Configuration | 1 | LOW |

## Critical TODOs (Blocking Features)

### 1. Product Search Not Implemented - CRITICAL
- **File:** `src/modules/products/products-router.ts:101, 158`
- **Impact:** POS cannot find items by SKU/barcode
- **Estimate:** 4-5 hours

### 2. Hardcoded Channel/Warehouse IDs - HIGH
- **File:** `src/pages/_app.tsx:38-40`
- **Impact:** Cannot support multi-location operations
- **Estimate:** 2-3 hours

### 3. Warehouse Selector Not Implemented - HIGH
- **File:** `src/pages/register/open.tsx:40`
- **Impact:** Register always opens with hardcoded warehouse
- **Estimate:** 3-4 hours

### 4. Tax Calculation Not Implemented - MEDIUM
- **File:** `src/modules/transactions/transactions-router.ts:1577`
- **Impact:** Returns show $0 tax, refund calculations incorrect
- **Estimate:** 3-4 hours

## Quick Wins (< 1 hour each)

1. **Get User Context** - Replace "Cashier" with auth user (30 min)
   - `src/pages/transaction.tsx:863`
   - `src/pages/returns/index.tsx:141`

2. **Get Channel from Session** - Use session's `saleorChannelId` (20 min)
   - `src/modules/transactions/transactions-router.ts:1824`

3. **Receipt Configuration** - Move store info to app settings (45 min)
   - `src/modules/receipts/receipts-router.ts:142`

4. **Customer on Receipt** - Populate from transaction (30 min)
   - `src/modules/receipts/receipts-router.ts:169`

## By File

| File | TODOs | Effort |
|------|-------|--------|
| `src/pages/_app.tsx` | 3 | 5h |
| `src/pages/transaction.tsx` | 2 | 2h |
| `src/pages/register/open.tsx` | 1 | 3h |
| `src/modules/products/products-router.ts` | 2 | 5h |
| `src/modules/transactions/transactions-router.ts` | 2 | 4h |
| `src/modules/receipts/receipts-router.ts` | 2 | 1.5h |

## Recommended Sprint Plan

### Week 1 (15 hours)
1. Implement product search via GraphQL (5h) - CRITICAL
2. Move channel/warehouse IDs to app config (3h)
3. Implement warehouse selector UI (2h)
4. Add tax calculation integration (4h)
5. Integrate user context for cashier name (1h)

### Week 2 (6 hours)
6. Receipt configuration (1h)
7. Customer attachment on receipt (0.5h)
8. Code review & testing (4h)
