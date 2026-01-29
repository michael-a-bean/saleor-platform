# Issue #002: POS - Discount UI (Price Override, Line Discount, Transaction Discount)

**Priority**: P2
**Created**: 2026-01-28
**Status**: Open
**Labels**: enhancement, pos

---

## Summary

POS Phase 1 is functional for basic checkout, but staff cannot apply discounts. Schema and endpoints exist; UI is missing.

## What Exists
- ✅ Schema fields: `priceOverride`, `priceOverrideBy`, `priceOverrideReason`
- ✅ Schema fields: `discountAmount`, `discountPercent`, `discountReason`
- ✅ Endpoint: `transactions.updateLine` accepts override/discount params
- ✅ Endpoint: `transactions.applyDiscount` for transaction-level discounts

## What's Missing
- ❌ **Price Override UI** - Modal to override line item price with reason
- ❌ **Line Discount UI** - Controls to apply % or $ discount to line items
- ❌ **Transaction Discount UI** - Button/modal for transaction-level discount

## Acceptance Criteria

### Price Override
- [ ] "Override Price" option available on cart line items
- [ ] Modal captures: new price, reason (required)
- [ ] Overridden prices show visual indicator
- [ ] Original price visible for reference

### Line Discount
- [ ] "Apply Discount" option on cart line items
- [ ] Modal captures: amount OR percentage, reason
- [ ] Discount reflected in line total
- [ ] Multiple discounts per line supported (or explicitly blocked)

### Transaction Discount
- [ ] "Transaction Discount" button near totals section
- [ ] Modal captures: amount OR percentage, reason
- [ ] Discount appears in totals breakdown
- [ ] Can remove transaction discount before completion

## Files to Modify
- `saleor-apps/apps/pos/src/pages/transaction.tsx`

## Context
Archived from: `.claude/plans/archived/pos-completion-plan.md`
Estimated effort: 1.5 days (per original plan)
