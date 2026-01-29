# POS App Completion Plan

**Created**: 2026-01-05
**Last Updated**: 2026-01-28
**Goal**: Complete POS system for in-store hobby gaming transactions

---

## Current State Summary

### Phase 1 (MVP): ~85% Complete

> **Status Update (2026-01-28)**: Verification against codebase shows Phase 1 is ~85% complete, not ~95%.
> UI components for price override, line discount, and transaction discount are missing despite schema support.
> See `.claude/plans/OPEN-PLANS-STATUS.md` for detailed verification.

The POS app has a solid foundation with most core functionality implemented. Key integrations with Singles Builder and the shared credit system are working.

**Implemented:**
- Register session management (open/close/suspend/resume)
- Cash denomination tracking with variance calculation
- Barcode/SKU scanning (keyboard wedge mode)
- Cart management (add/remove lines, quantity +/-)
- Customer search, create, and attachment
- Store credit system (shared with buylist app)
- Cash payment processing with change calculation
- Browser receipt printing (80mm thermal format)
- Singles Builder one-click cart import
- Comprehensive audit logging
- Transaction void with reason capture

**Partially Implemented (schema ready, UI missing):**
- Price overrides per line
- Line-level discounts
- Transaction-level discounts

---

## Architecture Overview

### Tech Stack
- **Framework**: Next.js (App Router for API + Pages Router for UI)
- **API**: tRPC for type-safe procedures
- **Database**: PostgreSQL via Prisma ORM (shared with inventory-ops)
- **UI**: Saleor Macaw UI components
- **Port**: 3004

### Key Architecture Decisions

1. **Shared Prisma Schema**: POS symlinks to `inventory-ops/prisma/schema.prisma`
   - Migrations run from inventory-ops, not POS
   - Enables shared tables: `CustomerCredit`, `CostLayerEvent`, `AppInstallation`

2. **tRPC Router Structure**:
   ```
   trpcRouter
   ├── health.check
   ├── register (session management)
   ├── transactions (cart lifecycle)
   ├── payments (payment + completion)
   ├── receipts (print + audit)
   └── customers (search + credit)
   ```

3. **Multi-Installation Support**: All records scoped by `installationId`
   - Same Saleor API URL can have multiple app installations
   - Cross-app queries via `sharedInstallationIds`

4. **Soft Foreign Keys to Saleor**: Store Saleor IDs as strings, not DB foreign keys
   - `saleorCustomerId`, `saleorVariantId`, `saleorOrderId`
   - GraphQL used for lookups/validation

5. **Singles Builder Integration**:
   - Checkouts with `singles_builder_*` metadata become importable carts
   - 6-character code links storefront cart to POS transaction
   - One-click import with customer attachment

---

## Remaining Work by Phase

### Phase 1 Completion (1-2 days)

#### 1.1 Price Override UI
**Status**: Schema ready (`priceOverride`, `priceOverrideBy`, `priceOverrideReason` fields exist)
**Files to modify**: `pages/transaction.tsx`

- Add "Override Price" option to cart line items
- Modal: new price input + reason field
- Call `transactions.updateLine` with `unitPriceOverride` and `overrideReason`
- Show visual indicator for overridden prices

#### 1.2 Line Discount UI
**Status**: Schema has `discountAmount`, `discountPercent`, `discountReason`
**Files to modify**: `pages/transaction.tsx`

- Add "Apply Discount" option to cart line items
- Modal: amount OR percentage input + reason
- Call `transactions.updateLine` with discount params
- Show discount applied and line total adjustment

#### 1.3 Transaction Discount UI
**Status**: `transactions.applyDiscount` endpoint exists
**Files to modify**: `pages/transaction.tsx`

- Add "Transaction Discount" button near totals
- Modal: amount OR percentage input + reason
- Show discount in totals breakdown
- Implement `transactions.removeDiscount` if needed

---

### Phase 2: Returns & Card Payments (3-5 days)

#### 2.1 Returns Processing
**Schema changes needed** (in inventory-ops):
```prisma
// Add to PosTransaction
returnedFromId    String?   // Links to original SALE transaction
returnReason      String?
```

**New endpoints**:
- `transactions.createReturn` - Create RETURN transaction linked to original
- `transactions.lookupOriginal` - Find original transaction by receipt #
- `payments.recordRefund` - Process refund (cash back or store credit)

**UI changes** (`pages/return.tsx` - new page):
- Receipt lookup field
- Display original transaction lines
- Select items/quantities to return
- Choose refund method (cash, original payment, store credit)
- Record restocking or defective flag

**Integration**:
- Create `SALE_RETURN` cost layer event (if WAC tracking needed)
- Update Saleor order status via webhook or mutation

#### 2.2 Stripe Terminal Integration
**Dependencies**: Stripe Terminal SDK, physical card reader

**Config additions** (`.env`):
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_TERMINAL_LOCATION_ID=tml_...
```

**New files**:
- `lib/stripe-terminal.ts` - Terminal SDK wrapper
- `modules/payments/stripe-terminal-router.ts` - Reader management

**New endpoints**:
- `stripeTerminal.discoverReaders` - Find available readers
- `stripeTerminal.connectReader` - Connect to specific reader
- `stripeTerminal.collectPayment` - Initiate card payment
- `stripeTerminal.cancelPayment` - Cancel in-progress payment

**UI changes**:
- Add "Card" payment option in payment modal
- Show reader connection status
- Handle card present flow (insert/tap/swipe)
- Display processing states

#### 2.3 Split Tender Enhancement
**Current state**: Multiple payments can be recorded, but UI is minimal

**UI improvements**:
- Show payment breakdown in payment modal
- Allow removing/voiding individual payments before completion
- Visual progress toward full payment
- Remaining balance prominent display

---

### Phase 3: Cash Management & Reporting (2-3 days)

#### 3.1 Cash Drops
**Current state**: `CashMovement` model supports `CASH_DROP` type

**New endpoint**:
- `register.recordCashDrop` - Record mid-shift cash removal

**UI changes** (`pages/register/index.tsx`):
- "Cash Drop" button
- Amount input with denomination breakdown (optional)
- Reason field
- Confirmation dialog

#### 3.2 Payouts (Non-Buylist)
**Current state**: `PAYOUT` type exists for buylist payouts

**New endpoint**:
- `register.recordPayout` - Record miscellaneous cash out

**UI**: Similar to cash drop with payee/reason fields

#### 3.3 End-of-Day Reports (Z Report)
**New endpoint**:
- `register.generateZReport` - Comprehensive session summary

**Report contents**:
- Opening float
- Sales by payment method
- Returns summary
- Cash drops and payouts
- Buylist payouts (if any)
- Expected vs actual cash
- Variance explanation
- Transaction count by type
- Average transaction value

**UI**: New page `/register/z-report/[sessionId]`
- Printable format
- PDF export option

#### 3.4 Tax Exemption
**Schema additions**:
```prisma
// Add to PosTransaction
taxExempt         Boolean   @default(false)
taxExemptReason   String?
taxExemptCertId   String?   // Tax certificate reference
```

**UI changes**:
- "Tax Exempt" toggle on transaction
- Capture certificate ID
- Zero tax calculation when exempt

---

### Phase 4: Offline Mode (5-7 days)

> **Note (2026-01-28)**: Some offline mode work already exists in commits:
> - `db01db7` feat(offline): P4-4 add cursor-based pagination for product cache
> - `0d88d21` feat(offline): add idempotency key for offline transaction sync
>
> This work was not previously documented in this plan.

#### 4.1 Local Product Cache
**New storage**: IndexedDB via idb-keyval or Dexie

**Sync strategy**:
- Initial full sync of products in configured channel
- Periodic delta sync (every 15 min when online)
- Manual "Refresh Products" button

**Cached data**:
- Product variants (SKU, name, barcode, price)
- Stock levels (per warehouse)
- Last sync timestamp

#### 4.2 Offline Transaction Queue
**Schema** (local IndexedDB):
```typescript
interface QueuedTransaction {
  localId: string;
  createdAt: Date;
  transaction: PosTransactionData;
  lines: PosTransactionLineData[];
  payments: PosPaymentData[];
  syncStatus: 'pending' | 'syncing' | 'failed' | 'synced';
  errorMessage?: string;
  retryCount: number;
}
```

**Behavior**:
- Detect offline state (navigator.onLine + server ping)
- Store completed transactions locally
- Generate local transaction numbers (prefix: `OFF-`)
- Queue for sync when back online
- Reconciliation UI for failed syncs

#### 4.3 Reconciliation UI
**New page**: `/transactions/reconcile`

**Features**:
- List pending offline transactions
- Show sync errors with retry option
- Manual merge for conflicts
- Mark as "manually reconciled" option

---

### Phase 5: Hardware Integration (3-5 days)

#### 5.1 ESC/POS Thermal Printer
**Dependencies**: Node.js `escpos` library or browser USB API

**Config**:
```bash
THERMAL_PRINTER_TYPE=usb|network|serial
THERMAL_PRINTER_ADDRESS=...
```

**New files**:
- `lib/escpos-printer.ts` - Printer command generation
- `modules/receipts/thermal-router.ts` - Print endpoints

**Features**:
- Direct print to thermal printer
- Cash drawer kick command
- Receipt formatting for various paper widths (58mm, 80mm)
- Logo/header image support

#### 5.2 Cash Drawer Integration
**Usually bundled with ESC/POS**: Send drawer kick pulse after payment

**Standalone option**: USB relay or serial trigger

---

## File Structure Reference

```
pos/
├── src/
│   ├── app/api/
│   │   ├── manifest/route.ts        # App manifest
│   │   ├── register/route.ts        # Token registration
│   │   └── trpc/[trpc]/route.ts     # tRPC endpoint
│   │
│   ├── lib/
│   │   ├── env.ts                   # Environment validation
│   │   ├── errors.ts                # Error classes
│   │   ├── graphql-client.ts        # urql Saleor client
│   │   ├── logger.ts                # Structured logging
│   │   ├── prisma.ts                # Prisma singleton
│   │   └── saleor-app.ts            # App SDK setup
│   │
│   ├── modules/
│   │   ├── trpc/                    # tRPC setup
│   │   │   ├── trpc-server.ts
│   │   │   ├── trpc-client.ts
│   │   │   ├── trpc-router.ts
│   │   │   └── protected-client-procedure.ts
│   │   │
│   │   ├── register/                # Session management
│   │   │   └── register-router.ts
│   │   │
│   │   ├── transactions/            # Cart lifecycle
│   │   │   └── transactions-router.ts
│   │   │
│   │   ├── payments/                # Payment processing
│   │   │   └── payments-router.ts
│   │   │
│   │   ├── receipts/                # Receipt generation
│   │   │   └── receipts-router.ts
│   │   │
│   │   └── customers/               # Customer + credit
│   │       └── customers-router.ts
│   │
│   ├── pages/                       # Next.js pages (UI)
│   │   ├── index.tsx
│   │   ├── _app.tsx
│   │   ├── transaction.tsx          # Main POS screen
│   │   ├── register/
│   │   │   ├── index.tsx
│   │   │   ├── open.tsx
│   │   │   └── close.tsx
│   │   └── transactions/
│   │       ├── index.tsx
│   │       └── [id].tsx
│   │
│   └── ui/components/
│       ├── app-layout.tsx
│       └── CustomerSearch.tsx
│
└── prisma/
    └── schema.prisma               # Symlink to inventory-ops
```

---

## Integration Points

### Saleor GraphQL
- **Product lookup**: `productVariants`, `productVariant(sku:)`
- **Customer**: `customers`, `user`, `customerCreate`
- **Orders**: `draftOrderCreate`, `draftOrderComplete`, `orderMarkAsPaid`
- **Checkout (Singles Builder)**: `checkouts` with metadata filtering

### Inventory Ops (Shared DB)
- `CostLayerEvent` - COGS at fulfillment time
- `CustomerCredit` - Store credit balances
- `CreditTransaction` - Credit ledger
- `AppInstallation` - Multi-tenant installation tracking

### Buylist App (Shared DB)
- Buylist payouts create `CustomerCredit` records
- POS can use store credit as payment method
- Same customer ID across apps

### Singles Builder (Storefront)
- Staff creates cart at `/singles-builder/[channel]`
- Cart saved as checkout with metadata
- POS imports via 6-character code
- Customer attachment preserved

---

## Session Pickup Instructions

When resuming work on the POS app:

### 1. Verify Environment
```bash
cd /home/michael/saleor-platform
git branch --show-current  # Should be platform/main or feature/*

# Check services
docker compose ps

# Verify POS app is running
curl http://localhost:3004/api/manifest
```

### 2. Start Development
```bash
# If not running via Docker, start locally:
cd saleor-apps/apps/pos
pnpm dev
```

### 3. Database Migrations
```bash
# Run from inventory-ops (shared schema)
cd saleor-apps/apps/inventory-ops
pnpm db:migrate
```

### 4. Key Files to Review
- `src/pages/transaction.tsx` - Main POS interface
- `src/modules/transactions/transactions-router.ts` - Cart operations
- `src/modules/payments/payments-router.ts` - Payment processing
- `src/modules/register/register-router.ts` - Session management

### 5. Testing the POS
1. Install app in Saleor Dashboard (localhost:8000 → Apps → Install)
2. Open register at `/register/open`
3. Navigate to `/transaction`
4. Scan barcodes or enter SKUs
5. Process payment

---

## Priority Matrix

| Task | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Price Override UI | P1 | 0.5 day | None | ❌ Not started |
| Line Discount UI | P1 | 0.5 day | None | ❌ Not started |
| Transaction Discount UI | P1 | 0.5 day | None | ❌ Not started |
| Returns Processing | P1 | 2 days | None |
| Stripe Terminal | P2 | 2 days | Hardware + Stripe account |
| Split Tender UI | P2 | 0.5 day | None |
| Cash Drops | P2 | 0.5 day | None |
| Z Reports | P2 | 1 day | None |
| Tax Exemption | P3 | 0.5 day | None |
| Offline Mode | P3 | 5 days | IndexedDB setup |
| ESC/POS Printer | P3 | 2 days | Hardware |

---

## Testing Checklist

### Register Operations
- [ ] Open register with cash count
- [ ] Close register with variance calculation
- [ ] Suspend and resume session
- [ ] Cash summary accuracy

### Transactions
- [ ] Add item by SKU
- [ ] Add item by barcode scan
- [ ] Quantity +/- buttons
- [ ] Remove line item
- [ ] Void transaction
- [ ] Singles Builder import

### Payments
- [ ] Cash payment with change
- [ ] Quick cash buttons
- [ ] Store credit payment
- [ ] Split tender (cash + credit)
- [ ] Complete transaction → Saleor order created

### Customers
- [ ] Search by email/name/phone
- [ ] Create new customer
- [ ] Attach to transaction
- [ ] View credit balance
- [ ] Use store credit

### Receipts
- [ ] Browser print works
- [ ] Receipt data complete
- [ ] Reprint from history

---

## Known Issues & Gotchas

1. **Channel/Warehouse hardcoded**: `transaction.tsx` has hardcoded IDs
   - TODO: Load from app configuration or register session

2. **Cashier name hardcoded**: Uses "Cashier" string
   - TODO: Get from Saleor user context

3. **Tax always $0**: No tax calculation implemented
   - TODO: Integrate with Saleor tax or AvaTax app

4. **Offline Singles Builder**: Import won't work offline
   - Need to cache pending carts locally

5. **Receipt barcode font**: Requires `Libre Barcode 39` Google Font
   - May not render without internet

---

## Recent Changes (Since Last Plan)

1. **Singles Builder Integration** (commit 02080c5)
   - `getPendingSinglesBuilderCart` endpoint
   - `importFromSinglesBuilder` endpoint
   - UI component for one-click import

2. **Customer Credit System** (inventory-ops shared)
   - `useCredit` endpoint in customers router
   - Credit balance display in payment modal
   - Atomic credit deduction with transaction record

3. **Cash Denomination Tracking**
   - Full breakdown on open/close (bills + coins)
   - Cash movement tracking per payment
   - Variance calculation with expected vs actual

4. **Audit Logging**
   - Every mutation creates `PosAuditEvent`
   - Before/after state captured
   - User and reason tracking
