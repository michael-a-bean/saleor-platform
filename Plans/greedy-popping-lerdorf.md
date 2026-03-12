# Buylist Void/Cancellation Implementation Plan

## Context

The buylist app has a `cancel` endpoint that only works BEFORE payment. After `createAndPay`, the cancel endpoint explicitly blocks with:
> "Cannot cancel buylist after payout. Use 'void' operation to reverse."

But **the void operation doesn't exist**. This means there's currently NO way to undo a buylist after the customer has been paid — whether the cards are still pending BOH verification or have already been received into stock.

Michael needs the ability to cancel buylists at any stage (mistake, customer changes mind) while preserving all accounting best practices (append-only ledger, WAC integrity, full audit trail).

## Two Scenarios

| Scenario | Status | Payout | Stock | Cost Events | What to Reverse |
|----------|--------|--------|-------|-------------|-----------------|
| **A: Pre-BOH** | PENDING_VERIFICATION | Yes (COMPLETED) | Not touched | None | Payout, credit, cash movement |
| **B: Post-BOH** | COMPLETED | Yes (COMPLETED) | Increased | BUYLIST_RECEIPT per line | All of A + stock + cost events |

## Approach: Single `void` Endpoint on Buylists Router

Add a `void` mutation to `buylists-router.ts` that handles both scenarios. The status determines which reversals are needed.

### Files to Modify

1. **`saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts`** — Add `void` mutation
2. **`saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts`** — Update the `cancel` endpoint error message to reference `void` properly (it already does, but the endpoint needs to exist)

### Implementation Details

#### Input Schema
```typescript
const voidSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1, "Void reason is required").max(500),
});
```

#### Logic Flow (inside a single serializable transaction)

**1. Validation**
- Fetch buylist with lines, payouts, cost events
- Reject if already CANCELLED
- Accept PENDING_VERIFICATION or COMPLETED

**2. Financial Reversal (both scenarios)**
- For each COMPLETED payout:
  - Set `BuylistPayout.status = "CANCELLED"` (never delete)
  - If payout was CASH with register session:
    - Create positive `CashMovement` (VOID_REVERSAL type — already in enum!)
    - Decrement `RegisterSession.totalCashOut`
  - If payout was STORE_CREDIT:
    - Check current credit balance
    - If balance >= original amount: debit full amount
    - If balance < original amount: debit available balance, log shortfall in audit metadata
    - Create `CreditTransaction` with type ADJUSTMENT, negative amount
    - Update `CustomerCredit.balance`

**3. Stock + Cost Reversal (COMPLETED only)**
- For each buylist line where `qtyAccepted > 0`:
  - Resolve condition-specific variant (same logic as verifyAndReceive)
  - Reverse Saleor stock via `saleorClient.bulkAdjustStock` with negative delta
  - Create `CostLayerEvent` with:
    - `eventType: "BUYLIST_RECEIPT_REVERSAL"`
    - `qtyDelta: -qtyAccepted`
    - `unitCost: line.finalPrice`
    - `sourceBuylistLineId: line.id`
    - WAC computed via `computeWacForNewEventOptimized`

**4. Status Update**
- Set `Buylist.status = "CANCELLED"`

**5. Audit**
- Create `BuylistAuditEvent` with action "VOIDED", including:
  - reason
  - previous status
  - financial reversal summary
  - cost events created (if any)
  - stock adjustments (if any)
  - credit shortfall flag (if any)

### Existing Code to Reuse

| What | Where | Why |
|------|-------|-----|
| `computeWacForNewEventOptimized` | `buylist/src/lib/wac-service.ts` | O(1) WAC calculation for reversal events |
| `createSaleorClient` + `bulkAdjustStock` | `buylist/src/lib/saleor-client.ts` | Stock adjustment API (used in BOH verifyAndReceive) |
| `extractUserFromToken` / `getUserId` | `buylist/src/modules/buylists/buylists-router.ts:19` | User attribution |
| `CashMovementType.VOID_REVERSAL` | Prisma enum | Already in schema for exactly this purpose |
| GR reversal pattern | `inventory-ops/src/modules/goods-receipts/goods-receipts-router.ts:900-1182` | Template for Saleor API + DB transaction separation |

### Accounting Invariants Preserved

1. **Append-only ledger**: New BUYLIST_RECEIPT_REVERSAL events created, never modify/delete existing
2. **WAC integrity**: Reversal events recalculate WAC via the standard formula with negative qtyDelta
3. **Audit trail**: BuylistAuditEvent records every void with full context
4. **Financial records**: Payouts status-transitioned, never deleted. Cash/credit entries are reversing entries.
5. **Credit safety**: Balance check prevents negative credit; shortfall flagged for manual resolution

### Edge Cases

- **Closed register**: If the original register session is CLOSED, still create the VOID_REVERSAL cash movement (it's a bookkeeping entry). Log a warning.
- **Partial BOH acceptance**: If BOH accepted fewer cards than quoted (qtyAccepted < qty), reverse only qtyAccepted.
- **Credit already spent**: Debit what's available, flag shortfall. Don't block the void — the store still needs to reverse the inventory. The credit shortfall becomes a receivable (tracked via audit metadata).
- **Stock goes negative**: Log warning (like GR reversal does) but proceed. Saleor handles negative stock. The reconciliation system will flag it.

## Verification

1. **Unit test**: Test the void mutation for both PENDING_VERIFICATION and COMPLETED buylists
2. **Confirm existing cancel test still passes**: The `cancel` endpoint remains for pre-payment cancellation
3. **Check cost layer integrity**: After void, `replayAllEvents` for affected variants should produce consistent WAC
4. **Confirm no `.delete()` calls** on CostLayerEvent, BuylistPayout, CashMovement, or CreditTransaction in the new code
