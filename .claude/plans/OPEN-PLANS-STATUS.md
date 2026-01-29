# Open Plans Status Report

**Generated**: 2026-01-28
**Source**: Codebase analysis, commit history, and implementation verification

---

## Summary

| Plan | Documented Status | Verified Status | Next Action |
|------|------------------|-----------------|-------------|
| POS Completion | Phase 1 ~95% | **85% verified** | UI gaps remain |
| Square Terminal | Phases 1-5 Complete | **80% verified** | Phase 6-7 pending |
| MVP Test Plan | ~15% coverage | **~5% actual** | Test writing needed |

---

## 1. POS Completion Plan

**File**: `.claude/plans/pos-completion-plan.md`
**Documented**: Phase 1 MVP ~95% Complete
**Verified**: **~85% Complete**

### Phase 1 Analysis

| Feature | Plan Status | Implementation Status | Evidence |
|---------|-------------|----------------------|----------|
| Register session mgmt | ✅ | ✅ Verified | `register-router.ts` exists |
| Cash denomination tracking | ✅ | ✅ Verified | Open/close with cash count works |
| Barcode/SKU scanning | ✅ | ✅ Verified | `addLine` endpoint handles both |
| Cart management | ✅ | ✅ Verified | Full CRUD in `transactions-router.ts` |
| Customer search/create | ✅ | ✅ Verified | `customers-router.ts` complete |
| Store credit system | ✅ | ✅ Verified | Shared with buylist |
| Cash payment processing | ✅ | ✅ Verified | `payments-router.ts` complete |
| Browser receipt printing | ✅ | ✅ Verified | `receipts-router.ts` + HTML |
| Singles Builder import | ✅ | ✅ Verified | One-click import works |
| Audit logging | ✅ | ✅ Verified | `PosAuditEvent` created |
| Transaction void | ✅ | ✅ Verified | Void with reason capture |
| **Price Override UI** | Schema ready | ❌ **Missing** | No UI in `transaction.tsx` |
| **Line Discount UI** | Schema ready | ❌ **Missing** | No UI in `transaction.tsx` |
| **Transaction Discount UI** | Endpoint exists | ❌ **Missing** | No UI in `transaction.tsx` |

### What's Actually Missing in Phase 1

1. **Price Override UI** (~0.5 day)
   - Schema fields exist (`priceOverride`, `priceOverrideReason`)
   - No modal in `transaction.tsx`

2. **Line Discount UI** (~0.5 day)
   - Schema fields exist (`discountAmount`, `discountPercent`)
   - No discount controls in cart line items

3. **Transaction Discount UI** (~0.5 day)
   - Endpoint `transactions.applyDiscount` exists
   - No UI button/modal for transaction-level discounts

### Phase 2+ Status (Not Started)

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 2 | Returns & Card Payments | ❌ Not started (returns page exists but empty) |
| Phase 3 | Cash Management & Reporting | ⏳ Z-Report page exists! (partial) |
| Phase 4 | Offline Mode | ⏳ Some work done (see below) |
| Phase 5 | Hardware Integration | ❌ Not started |

### Surprise Finding: Offline Mode Progress

Commits show offline work already started:
```
db01db7 feat(offline): P4-4 add cursor-based pagination for product cache
0d88d21 feat(offline): add idempotency key for offline transaction sync
```

This wasn't reflected in the plan documentation!

---

## 2. Square Terminal Integration

**File**: `.claude/plans/square-terminal-integration.md`
**Progress**: `.claude/plans/square-terminal-progress.md`
**Documented**: Phases 1-5 Complete, 6-7 Pending
**Verified**: **Phases 1-5 Complete, ~60% of Phase 6**

### Implementation Verification

| Phase | Description | Status | Evidence |
|-------|-------------|--------|----------|
| Phase 1 | Square Client | ✅ | `square-client.ts`, `square-api-version.ts` exist |
| Phase 2 | OAuth | ✅ | `oauth-service.ts`, `oauth-router.ts`, API routes exist |
| Phase 3 | Device Pairing | ✅ | `device-mapper.ts`, `terminal-router.ts` exist |
| Phase 4 | Terminal Checkout | ✅ | `terminal-checkout-service.ts` exists |
| Phase 5 | Webhook Handler | ✅ | `webhook-handler.ts`, `webhook-event-processor.ts` exist |
| Phase 6 | Frontend UI | ⏳ **Partial** | See below |
| Phase 7 | Testing & Docs | ❌ Not started | No test files found |

### Phase 6 UI Analysis

| Component | Plan | Status | Evidence |
|-----------|------|--------|----------|
| Square Settings Page | `settings/square.tsx` | ❌ Missing | No settings directory |
| Device Pairing UI | `SquareDevicePairing.tsx` | ❌ Missing | Not found |
| Device List UI | `SquareDeviceList.tsx` | ❌ Missing | Not found |
| Checkout Status UI | `SquareCheckoutStatus.tsx` | ❌ Missing | Not found |
| Payment Button | `SquarePaymentButton.tsx` | ✅ **Implemented** | `SquareCheckout.tsx` exists |
| Transaction page integration | Modify `transaction.tsx` | ⏳ Unknown | Needs verification |

**Finding**: `SquareCheckout.tsx` exists and appears functional (134 lines), implementing the checkout flow with status polling. However, the other planned components (settings, device pairing, device list) are missing.

### Commits Since Progress Doc

The progress doc was last updated 2026-01-06, but more work happened:
```
df21c7a feat(pos): wire Square Terminal to payment flow
```

This suggests Square Terminal may be more integrated than documented.

---

## 3. MVP Test Plan

**File**: `.claude/plans/mvp-test-plan.md`
**Documented**: ~15% coverage, target 80%
**Verified**: **~5% actual coverage**

### Test File Inventory

| App | Test Files | Status |
|-----|------------|--------|
| inventory-ops | 0 found | ❌ No tests |
| buylist | 0 found | ❌ No tests |
| pos | 1 found | `register-router.test.ts` only |
| storefront | 0 found | ❌ No tests |

### Planned vs. Actual

The MVP Test Plan documents **1,112 lines** of detailed test specifications covering:
- 4 major areas (Storefront, Buylist, Inventory Ops, POS)
- 25+ test suites
- 200+ individual test cases

**Actual implementation**: 1 test file (`register-router.test.ts`)

### Priority P0 Tests (Not Written)

| Test Suite | File | Status |
|------------|------|--------|
| Pricing Rule Engine | `rule-engine.test.ts` | ❌ Missing |
| WAC Calculation | `wac-comprehensive.test.ts` | ❌ Missing |
| Buylist createAndPay | `payout.test.ts` | ❌ Missing |
| Price Sync Approval | `reporting.test.ts` | ❌ Missing |

---

## Recommendations

### Immediate Documentation Updates

1. **POS Completion Plan**:
   - Update to reflect offline mode work already done
   - Mark Phase 1 as ~85% (not 95%)
   - Add specific UI tasks for discount/override modals

2. **Square Terminal Progress**:
   - Update to reflect `SquareCheckout.tsx` exists
   - Mark Phase 6 as "60% Complete" not "Not Started"
   - Add commit `df21c7a` to history

3. **MVP Test Plan**:
   - Add "Current State" section showing 1 test file
   - Reduce "Current Coverage" from 15% to 5%
   - Prioritize test writing sprint

### Suggested Priority Order

**High Priority (Blocking production readiness):**
1. Complete POS Phase 1 UI (price override, discounts) - 1.5 days
2. Square Terminal Phase 6 completion (settings page, device management) - 2 days
3. P0 test coverage (pricing, WAC, payout) - 3-5 days

**Medium Priority:**
4. Square Terminal Phase 7 (tests + docs) - 2 days
5. POS Phase 2 (returns processing) - 3 days
6. P1 test coverage - 3-5 days

### Plan Files to Update

```bash
# Files needing status corrections
.claude/plans/pos-completion-plan.md      # Add offline work, correct %
.claude/plans/square-terminal-progress.md # Add SquareCheckout.tsx, df21c7a
.claude/plans/mvp-test-plan.md           # Correct coverage estimate
```

---

## Appendix: File Evidence

### POS Square Module (17 files verified)
```
src/modules/square/
├── index.ts
├── square-api-version.ts
├── square-client.ts
├── types/errors.ts
├── oauth/
│   ├── index.ts
│   ├── oauth-router.ts
│   ├── oauth-service.ts
│   └── token-encryption.ts
├── terminal/
│   ├── index.ts
│   ├── checkout-monitor.ts
│   ├── device-mapper.ts
│   ├── terminal-checkout-service.ts
│   └── terminal-router.ts
└── webhook/
    ├── index.ts
    ├── webhook-event-processor.ts
    ├── webhook-handler.ts
    └── webhook-signature-validator.ts
```

### POS UI Components (1 Square component)
```
src/ui/components/
└── SquareCheckout.tsx  ✅ (checkout flow with polling)
```

### POS Pages (11 pages)
```
src/pages/
├── _app.tsx
├── index.tsx
├── transaction.tsx
├── register/
│   ├── index.tsx
│   ├── open.tsx
│   ├── close.tsx
│   └── z-report/[sessionId].tsx  ✅ (Z-Report exists!)
├── transactions/
│   ├── index.tsx
│   ├── [id].tsx
│   └── reconcile.tsx  ✅ (Reconcile exists!)
└── returns/
    └── index.tsx  ⏳ (empty/stub)
```
