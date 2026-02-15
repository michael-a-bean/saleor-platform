# Implementation Guide: Critical Feature Gaps
## Saleor Hobby Gaming Commerce Platform

**Created**: 2026-01-09
**Purpose**: Self-contained guide for implementing critical features identified in the AI-crowdsourced analysis
**Prerequisites**: Familiarity with tRPC, Prisma, TypeScript, Next.js

---

## Quick Start for New Session

```bash
# 1. Ensure you're on the right branch
cd /home/michael/saleor-platform
git checkout platform/main
git pull origin platform/main

# 2. Create feature branch for implementation
git checkout -b feature/pos-cogs-and-tax

# 3. Start required services
docker compose up -d api db valkey

# 4. Navigate to the app you're modifying
cd saleor-apps/apps/pos  # or buylist/inventory-ops
pnpm install
pnpm dev
```

---

## Priority 1: POS COGS on Sale

### Context
When a POS sale completes, we need to create a `CostLayerEvent` to track the cost of goods sold. This mirrors what the buylist system already does for inventory receipts.

### Current State
- **Working**: Buylist creates `CostLayerEvent` with type `BUYLIST_RECEIPT` (positive qty)
- **Missing**: POS sale does NOT create `CostLayerEvent` with type `POS_SALE` (negative qty)
- **Result**: No COGS tracking, no margin visibility

### Files to Modify

#### Primary: `saleor-apps/apps/pos/src/modules/payments/payments-router.ts`

Find the `complete` mutation (around line 200+). After the Saleor order is created and marked as paid, add COGS events.

#### Reference Implementation: `saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts`

Lines 606-653 show the pattern for creating cost layer events:

```typescript
// REFERENCE - This is from buylist, adapt for POS
for (const line of newBuylist.lines) {
  const lastEvent = await tx.costLayerEvent.findFirst({
    where: {
      installationId: ctx.installationId,
      saleorVariantId: line.saleorVariantId,
      saleorWarehouseId: input.saleorWarehouseId,
    },
    orderBy: { eventTimestamp: "desc" },
    select: {
      id: true,
      qtyOnHandAtEvent: true,
      wacAtEvent: true,
      totalValueAtEvent: true,
    },
  });

  const currentQty = lastEvent?.qtyOnHandAtEvent ?? 0;
  const currentValue = lastEvent?.totalValueAtEvent
    ? new Decimal(lastEvent.totalValueAtEvent.toString())
    : new Decimal(0);

  // For SALE: subtract qty and value at WAC
  const currentWac = currentQty > 0
    ? currentValue.div(currentQty)
    : new Decimal(0);

  const newQty = currentQty - line.quantity;  // NEGATIVE delta for sales
  const newValue = currentValue.minus(currentWac.times(line.quantity));
  const newWac = newQty > 0 ? newValue.div(newQty) : new Decimal(0);

  await tx.costLayerEvent.create({
    data: {
      installationId: ctx.installationId,
      eventType: "POS_SALE",  // New event type
      saleorVariantId: line.saleorVariantId,
      saleorWarehouseId: transaction.saleorWarehouseId,
      qtyDelta: -line.quantity,  // NEGATIVE for sales
      unitCost: currentWac,      // Cost at WAC
      currency: transaction.currency,
      wacAtEvent: newWac,
      qtyOnHandAtEvent: newQty,
      totalValueAtEvent: newValue,
      eventTimestamp: new Date(),
      sourcePosTransactionLineId: line.id,  // Need to add this field
    },
  });
}
```

### Schema Changes Required

File: `saleor-apps/apps/inventory-ops/prisma/schema.prisma`

1. Add new event type to enum:
```prisma
enum CostLayerEventType {
  GOODS_RECEIPT
  GOODS_RETURN
  ADJUSTMENT_IN
  ADJUSTMENT_OUT
  BUYLIST_RECEIPT
  TRANSFER_IN
  TRANSFER_OUT
  POS_SALE        // ADD THIS
  POS_RETURN      // ADD THIS (for future)
}
```

2. Add relation to POS transaction line:
```prisma
model CostLayerEvent {
  // ... existing fields ...

  // Add this optional relation
  sourcePosTransactionLineId String?   @map("source_pos_transaction_line_id")
  // Note: Can't add foreign key constraint since POS uses different DB
  // Just store the ID for reference
}
```

3. Run migration:
```bash
cd saleor-apps/apps/inventory-ops
pnpm prisma migrate dev --name add-pos-sale-event-type
cd ../pos
pnpm prisma generate  # Regenerate POS client (symlinked schema)
```

### Implementation Steps

1. **Update Prisma schema** with new event type
2. **Run migration** in inventory-ops
3. **Regenerate Prisma client** in POS app
4. **Add COGS creation** in `payments-router.ts` complete mutation
5. **Test** with a manual POS sale
6. **Verify** cost layer events created correctly

### Test Verification
```sql
-- Run in inventory-ops database
SELECT
  event_type,
  saleor_variant_id,
  qty_delta,
  unit_cost,
  wac_at_event,
  qty_on_hand_at_event
FROM cost_layer_event
WHERE event_type = 'POS_SALE'
ORDER BY event_timestamp DESC
LIMIT 10;
```

---

## Priority 2: Tax Calculation

### Context
Tax is currently hardcoded to $0 in POS transactions. This is a compliance risk.

### Current State
File: `saleor-apps/apps/pos/src/modules/transactions/transactions-router.ts`
Line ~1753:
```typescript
// TODO: Calculate tax based on store location and tax-exempt status
const totalTax = 0;
```

### Options

#### Option A: Simple Percentage (Fastest)
Add configurable tax rate per register/location.

```typescript
// In register session or app config
const TAX_RATE = 0.0825; // 8.25% example

// In recalculateTransactionTotals
const taxableAmount = subtotal - totalDiscount;
const totalTax = transaction.isTaxExempt
  ? 0
  : Math.round(taxableAmount * TAX_RATE * 100) / 100;
```

#### Option B: Saleor Tax Settings
Query Saleor for tax configuration when creating the draft order.

```graphql
query GetTaxConfiguration($channel: String!) {
  channel(slug: $channel) {
    taxConfiguration {
      pricesEnteredWithTax
      taxCalculationStrategy
    }
  }
}
```

#### Option C: AvaTax Integration
Use the existing AvaTax app in saleor-apps. Requires:
- AvaTax account setup
- Address validation for tax nexus
- API call per transaction

### Recommended Approach
Start with **Option A** for immediate compliance, then upgrade to Option B or C.

### Implementation Steps

1. **Add tax rate to RegisterSession** or AppConfiguration
2. **Update recalculateTransactionTotals** to use the rate
3. **Handle tax-exempt flag** (already exists in schema)
4. **Display tax on receipt** and in transaction summary
5. **Test** with various amounts

---

## Priority 3: Square Terminal Card Payments

### Context
Square Terminal hardware integration exists but isn't wired to the payment flow.

### Current State
- OAuth: `pos/src/modules/square/oauth/` - Working
- Device management: `pos/src/modules/square/terminal/` - Exists
- Webhooks: `pos/src/modules/square/webhook/` - Exists
- Payment flow: `pos/src/modules/payments/payments-router.ts` - Cash only

### Files to Modify

#### 1. Terminal Checkout Service
`pos/src/modules/square/terminal/terminal-checkout-service.ts`

This file should have methods to:
- Create terminal checkout
- Poll for completion
- Handle cancellation

#### 2. Payments Router
`pos/src/modules/payments/payments-router.ts`

Add `recordCardPayment` mutation:

```typescript
recordCardPayment: protectedClientProcedure
  .input(z.object({
    transactionId: z.string().uuid(),
    amount: z.number().positive(),
    deviceId: z.string(), // Square Terminal device ID
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. Get transaction
    const transaction = await ctx.prisma.posTransaction.findFirst({...});

    // 2. Get Square credentials for this installation
    const squareCredentials = await ctx.prisma.squareOAuthToken.findFirst({...});

    // 3. Create terminal checkout via Square API
    const terminalCheckout = await squareTerminalService.createCheckout({
      deviceId: input.deviceId,
      amount: input.amount,
      currency: transaction.currency,
      referenceId: transaction.transactionNumber,
    });

    // 4. Create pending payment record
    const payment = await ctx.prisma.posPayment.create({
      data: {
        transactionId: transaction.id,
        paymentMethod: "CARD",
        amount: input.amount,
        currency: transaction.currency,
        status: "PENDING",
        externalReference: terminalCheckout.id,
      },
    });

    // 5. Return checkout ID for polling
    return { paymentId: payment.id, checkoutId: terminalCheckout.id };
  }),
```

#### 3. Webhook Handler
`pos/src/modules/square/webhook/webhook-handler.ts`

Handle `terminal.checkout.updated` events to update payment status.

### Implementation Steps

1. **Verify Square OAuth** is working for the installation
2. **List available terminals** via Square API
3. **Add terminal selection** to POS UI
4. **Implement recordCardPayment** mutation
5. **Add polling/webhook** for checkout completion
6. **Update payment complete** to handle card payments
7. **Test with Square sandbox** and physical terminal

---

## Priority 4: Offline POS Mode

### Context
Full offline infrastructure exists but isn't connected to the UI.

### Current State
- `pos/src/lib/offline/sync-service.ts` - Full implementation
- `pos/src/lib/offline/transaction-queue.ts` - IndexedDB queue
- `pos/src/lib/offline/product-cache.ts` - Product cache
- `pos/src/lib/offline/db.ts` - Dexie database setup
- UI: Not connected

### Files to Modify

#### 1. Create Offline Context
`pos/src/lib/offline/OfflineContext.tsx` (new file)

```typescript
import { createContext, useContext, useEffect, useState } from 'react';
import { createSyncService, SyncService } from './sync-service';
import { useNetworkStatus } from './use-network-status';

interface OfflineContextValue {
  isOnline: boolean;
  syncService: SyncService | null;
  pendingCount: number;
  lastSyncAt: Date | null;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children, channelId, warehouseId }) {
  const isOnline = useNetworkStatus();
  const [syncService, setSyncService] = useState<SyncService | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const service = createSyncService(channelId, warehouseId);
    setSyncService(service);

    // Set up sync callbacks
    service.setSyncTransactionCallback(async (transaction) => {
      // Call tRPC to create real transaction
      // ...
    });

    return () => {
      // Cleanup
    };
  }, [channelId, warehouseId]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && syncService) {
      syncService.syncTransactions();
    }
  }, [isOnline, syncService]);

  return (
    <OfflineContext.Provider value={{ isOnline, syncService, pendingCount, lastSyncAt }}>
      {children}
    </OfflineContext.Provider>
  );
}

export const useOffline = () => useContext(OfflineContext);
```

#### 2. Update Transaction Page
`pos/src/pages/transaction.tsx`

```typescript
import { useOffline } from '@/lib/offline/OfflineContext';

function TransactionPage() {
  const { isOnline, syncService, pendingCount } = useOffline();

  // Show offline indicator
  // Use syncService for offline operations
  // ...
}
```

### Implementation Steps

1. **Create OfflineContext** provider
2. **Wrap app** in OfflineProvider
3. **Add offline indicator** to UI header
4. **Modify transaction creation** to use queue when offline
5. **Add manual sync button** for testing
6. **Test** by disabling network

---

## Database Connection Info

### Inventory-Ops / Buylist / POS Database
```
Host: localhost
Port: 5433
Database: inventory_ops
User: inventory
Password: inventory
```

Connection string:
```
postgresql://inventory:inventory@localhost:5433/inventory_ops
```

### Saleor Database
```
Host: localhost
Port: 5432
Database: saleor
User: saleor
Password: saleor
```

---

## Common Commands

```bash
# Start all services
docker compose up -d

# Watch POS app logs
docker compose logs -f pos

# Run Prisma migrations
cd saleor-apps/apps/inventory-ops
pnpm prisma migrate dev --name <description>

# Regenerate Prisma client
pnpm prisma generate

# Type check
pnpm check-types

# Run tests
pnpm test

# Build for production
pnpm build
```

---

## Key File Locations

| Purpose | Path |
|---------|------|
| Prisma Schema | `saleor-apps/apps/inventory-ops/prisma/schema.prisma` |
| POS Transactions | `saleor-apps/apps/pos/src/modules/transactions/transactions-router.ts` |
| POS Payments | `saleor-apps/apps/pos/src/modules/payments/payments-router.ts` |
| Buylist (reference) | `saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts` |
| WAC Service | `saleor-apps/apps/buylist/src/lib/wac-service.ts` |
| Square Terminal | `saleor-apps/apps/pos/src/modules/square/terminal/` |
| Offline Sync | `saleor-apps/apps/pos/src/lib/offline/` |
| POS UI | `saleor-apps/apps/pos/src/pages/transaction.tsx` |

---

## Gotchas

1. **Symlinked Prisma Schema**: POS and Buylist share the inventory-ops schema via symlink. Run migrations from inventory-ops, regenerate in each app.

2. **Hardcoded IDs**: `transaction.tsx` has hardcoded channel/warehouse IDs. These should come from app config.

3. **Multi-Tenant**: All queries must include `installationId` filter.

4. **Decimal.js**: Use `Decimal` from decimal.js for money calculations, not native JS numbers.

5. **tRPC Context**: `ctx.prisma` is the database client, `ctx.apiClient` is for Saleor GraphQL.

---

## Research Artifacts

All research outputs are in `docs/research/`:
- `claude_deep_research.md` - Technical analysis
- `gemini_deep_research.md` - Gemini analysis
- `gpt_deep_research.md` - GPT analysis
- `synthesis_roadmap.md` - Merged recommendations
- `evidence_index.md` - Code references
- `run_manifest.json` - API call metadata

---

## Success Criteria

### Priority 1: COGS
- [ ] CostLayerEvent created for each line on POS sale complete
- [ ] Event has negative qtyDelta
- [ ] WAC calculated correctly
- [ ] Query shows events with type POS_SALE

### Priority 2: Tax
- [ ] Tax rate configurable per register
- [ ] Tax calculated on transaction total
- [ ] Tax-exempt transactions have $0 tax
- [ ] Tax displayed on receipt

### Priority 3: Card Payments
- [ ] Can select Square Terminal device
- [ ] Card payment initiates terminal checkout
- [ ] Payment completes when terminal confirms
- [ ] Transaction shows card payment in history

### Priority 4: Offline
- [ ] Offline indicator shows in UI
- [ ] Transactions queue when offline
- [ ] Auto-sync when back online
- [ ] Pending count displayed
