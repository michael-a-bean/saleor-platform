# Evidence Index
## Code References Supporting Feature-Gap Analysis

---

## 1. WAC (Weighted Average Cost) Implementation

**File**: `saleor-apps/apps/buylist/src/lib/wac-service.ts`

```typescript
// O(1) optimized WAC calculation
export async function computeWacForNewEventOptimized(params: ComputeWacParams): Promise<OptimizedWacResult> {
  // O(1) lookup: Get only the most recent event
  const lastEvent = await prisma.costLayerEvent.findFirst({
    where: { installationId, saleorVariantId, saleorWarehouseId },
    orderBy: { eventTimestamp: "desc" },
    select: { id: true, qtyOnHandAtEvent: true, wacAtEvent: true, totalValueAtEvent: true },
  });

  // Initialize from last event or zero
  let currentQty = lastEvent?.qtyOnHandAtEvent ?? 0;
  let currentValue = lastEvent?.totalValueAtEvent ? new Decimal(lastEvent.totalValueAtEvent.toString()) : new Decimal(0);

  // Apply new event
  if (newQtyDelta > 0) {
    // Receipt: add at incoming cost
    currentValue = currentValue.plus(totalNewCost.times(newQtyDelta));
    currentQty += newQtyDelta;
  } else {
    // Issue: remove at current WAC
    const currentWac = currentQty > 0 ? currentValue.div(currentQty) : new Decimal(0);
    currentValue = currentValue.plus(currentWac.times(newQtyDelta));
    currentQty += newQtyDelta;
  }

  return { wacAtEvent, qtyOnHandAtEvent: currentQty, totalValueAtEvent: currentValue, previousEventId };
}
```

**Evidence**: WAC is properly implemented and optimized. Used for buylist receipts.

---

## 2. Missing COGS on POS Sale

**File**: `saleor-apps/apps/pos/src/modules/transactions/transactions-router.ts`

```typescript
// Line 1748-1755
async function recalculateTransactionTotals(prisma, transactionId) {
  // ...
  // TODO: Calculate tax based on store location and tax-exempt status
  const totalTax = 0;
  // ...
}
```

**Evidence**: Tax is hardcoded to $0. No COGS event creation when sale completes.

---

## 3. Buylist Creates COGS Events (Working Example)

**File**: `saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts`

```typescript
// Lines 606-653 - createAndPay mutation creates cost layer events
for (const line of newBuylist.lines) {
  const lastEvent = await tx.costLayerEvent.findFirst({
    where: { installationId, saleorVariantId: line.saleorVariantId, saleorWarehouseId },
    orderBy: { eventTimestamp: "desc" },
  });

  const currentQty = lastEvent?.qtyOnHandAtEvent ?? 0;
  const currentValue = lastEvent?.totalValueAtEvent ? new Decimal(lastEvent.totalValueAtEvent.toString()) : new Decimal(0);
  const newValue = currentValue.plus(line.finalPrice.times(line.qty));
  const newQty = currentQty + line.qty;
  const newWac = newQty > 0 ? newValue.div(newQty) : new Decimal(0);

  await tx.costLayerEvent.create({
    data: {
      installationId,
      eventType: "BUYLIST_RECEIPT",
      saleorVariantId: line.saleorVariantId,
      saleorWarehouseId: input.saleorWarehouseId,
      qtyDelta: line.qty,
      unitCost: line.finalPrice,
      wacAtEvent: newWac,
      qtyOnHandAtEvent: newQty,
      totalValueAtEvent: newValue,
      sourceBuylistLineId: line.id,
    },
  });
}
```

**Evidence**: Buylist properly creates cost layer events. POS should mirror this for sales (with negative qtyDelta).

---

## 4. Hardcoded IDs in POS

**File**: `saleor-apps/apps/pos/CLAUDE.md` (documentation)

```markdown
### Hardcoded Values (TODO: Fix)
`src/pages/transaction.tsx` has hardcoded:
const saleorChannelId = "Q2hhbm5lbDox";
const saleorWarehouseId = "V2FyZWhvdXNlOjg1YTg0MmMwLTk4NjQtNDlkZi1iMDg5LTg1ZGU2Y2ZlYzY3Yg==";

Should come from app config or register session.
```

**Evidence**: Known tech debt documented but not fixed.

---

## 5. Offline Sync Service (Built but Unused)

**File**: `saleor-apps/apps/pos/src/lib/offline/sync-service.ts`

```typescript
export class SyncService {
  private transactionQueue: TransactionQueueService;
  private productCache: ProductCacheService;
  private isSyncing: boolean = false;

  async syncTransactions(): Promise<{ synced: number; failed: number; errors: Array<...> }> {
    const pending = await this.transactionQueue.getPendingTransactions();
    for (const transaction of pending) {
      await this.transactionQueue.markSyncing(transaction.localId);
      // ... sync to server
    }
  }

  async syncProducts(): Promise<{ count: number; success: boolean; error?: string }> {
    const products = await this.fetchProductsCallback();
    await this.productCache.saveProducts(products);
    return { count: products.length, success: true };
  }
}
```

**Evidence**: Full offline sync infrastructure exists with IndexedDB backing. Never connected to UI.

---

## 6. ESC/POS Thermal Printing (Exists but Not Wired)

**File**: `saleor-apps/apps/pos/src/lib/hardware/escpos.ts`

```typescript
// File exists with ESC/POS command implementation
// Receipt formatting functions exist
// Not imported or used in transaction completion flow
```

**Evidence**: Hardware printing capability built, waiting to be connected.

---

## 7. Singles Builder POS Handoff

**File**: `storefront/src/app/singles-builder/[channel]/actions.ts`

```typescript
// Lines 504-521
export async function saveCartForPOS(
  customerName: string,
  notes: string,
  shortCode: string,
  staffEmail: string,
  channel: string = "singles-builder",
): Promise<CartActionResult> {
  return updateCartMetadata([
    { key: "singles_builder_customer", value: customerName },
    { key: "singles_builder_notes", value: notes },
    { key: "singles_builder_code", value: shortCode },
    { key: "singles_builder_staff_email", value: staffEmail },
    { key: "singles_builder_created", value: new Date().toISOString() },
  ], channel);
}
```

**Evidence**: Clean handoff mechanism using Saleor checkout metadata.

---

## 8. POS Import from Singles Builder

**File**: `saleor-apps/apps/pos/src/modules/transactions/transactions-router.ts`

```typescript
// Lines 1074-1313 - importFromSinglesBuilder mutation
importFromSinglesBuilder: protectedClientProcedure
  .input(z.object({
    code: z.string().length(6).regex(/^[A-Z0-9]{6}$/, "Invalid code format"),
    saleorChannelId: z.string().min(1),
    saleorWarehouseId: z.string().min(1),
  }))
  .mutation(async ({ ctx, input }) => {
    // Query Saleor for checkout with matching metadata code
    // Create POS transaction with all lines
    // Clear metadata so cart doesn't show again
  })
```

**Evidence**: Full integration implemented and working.

---

## 9. Store Credit Integration

**File**: `saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts`

```typescript
// Lines 551-604 - Store credit payout
if (input.payoutMethod === "STORE_CREDIT" && input.saleorUserId) {
  let credit = await tx.customerCredit.findUnique({
    where: { installationId_saleorCustomerId: { installationId, saleorCustomerId: input.saleorUserId } },
  });

  const newBalance = previousBalance + creditAmount;

  if (!credit) {
    credit = await tx.customerCredit.create({ data: { installationId, saleorCustomerId, balance: newBalance, currency } });
  } else {
    credit = await tx.customerCredit.update({ where: { id: credit.id }, data: { balance: newBalance } });
  }

  await tx.creditTransaction.create({
    data: { creditAccountId: credit.id, transactionType: "BUYLIST_PAYOUT", amount: creditAmount, balanceAfter: newBalance, sourceBuylistId: newBuylist.id },
  });
}
```

**Evidence**: Store credit properly tracked with ledger entries.

---

## 10. Prisma Schema Entity Count

**File**: `saleor-apps/apps/inventory-ops/prisma/schema.prisma`

| Category | Models |
|----------|--------|
| Core | AppInstallation, AppConfiguration |
| Purchase Orders | PurchaseOrder, PurchaseOrderLine, Supplier, SupplierContact |
| Goods Receipt | GoodsReceipt, GoodsReceiptLine, LandedCostAllocation |
| Costing | CostLayerEvent |
| Buylist | Buylist, BuylistLine, BuylistPayout, BuylistPricingPolicy, PricingRule, BuylistAuditEvent |
| POS | RegisterSession, PosTransaction, PosTransactionLine, PosPayment, CashMovement, PosAuditEvent |
| Customer | CustomerCredit, CreditTransaction |
| Price Sync | PriceSnapshot, SetImportJob, CollectionImportJob |
| Returns | ReturnReason, PosReturn, PosReturnLine |

**Total**: 40+ models across the domain.

---

## 11. Test Coverage Assessment

```
Existing test files:
- storefront/src/lib/meilisearch.test.ts (19 tests)
- buylist/src/modules/buylists/buylists-router.test.ts
- buylist/src/modules/buylists/createAndPay.test.ts
- buylist/src/modules/pricing/rule-engine/*.test.ts
- pos/src/modules/register/register-router.test.ts

Missing coverage:
- POS transaction complete flow
- COGS creation
- Offline sync
- Returns processing
- Multi-register scenarios
```

**Evidence**: Test coverage is sparse, primarily in buylist pricing engine.

---

## 12. Square Terminal Integration Status

**Files present**:
- `pos/src/modules/square/terminal/terminal-router.ts`
- `pos/src/modules/square/terminal/terminal-checkout-service.ts`
- `pos/src/modules/square/oauth/oauth-service.ts`
- `pos/src/modules/square/webhook/webhook-handler.ts`

**Status**: OAuth flow exists, terminal device management exists, but not wired to payment flow in `payments-router.ts`.
