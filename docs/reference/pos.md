# POS (Point of Sale) App

The POS app provides in-store transaction capabilities for the hobby gaming platform, integrating with Saleor for order management and the shared inventory/costing database for COGS tracking.

## Overview

- **Port**: 3004 (http://localhost:3004)
- **Database**: Shared with inventory-ops (PostgreSQL on port 5433)
- **Purpose**: In-store transactions with barcode scanning, cash management, and full COGS integration

## Features

### Phase 1 (Current)
- Register session management (open/close with denomination counting)
- Transaction flow (barcode scanning, cart management)
- Cash payment processing with change calculation
- Browser-based receipt printing
- Transaction history and lookup
- Audit trail for all operations

### Phase 2 (Planned)
- Stripe Terminal integration for card-present payments
- Returns and exchanges
- Split-tender payments
- Customer attachment and lookup
- Store credit integration with buylist

### Phase 3 (Planned)
- Tax calculation and exemptions
- Cash drops and payouts
- End-of-day Z reports
- Offline mode with sync

## Data Model

### RegisterSession
Tracks register open/close cycles:
- Opening float with denomination breakdown
- Expected vs actual cash variance
- Session status (OPEN, SUSPENDED, CLOSED)

### PosTransaction
Sales and returns:
- Transaction type (SALE, RETURN, EXCHANGE, NO_SALE)
- Status (DRAFT, SUSPENDED, COMPLETED, VOIDED)
- Links to Saleor order after completion

### PosTransactionLine
Individual line items:
- Saleor variant reference
- Quantity and pricing
- Discounts and overrides
- Cost basis (WAC at time of sale)

### PosPayment
Payment records:
- Multiple payment methods (CASH, CARD_PRESENT, STORE_CREDIT, etc.)
- Amount tendered and change given
- Status tracking

### CashMovement
All cash in/out events:
- Opening float
- Sales and returns
- Drops and payouts
- Closing count

### PosAuditEvent
Append-only audit log:
- Register open/close
- Price overrides
- Discounts applied
- Voids and refunds

## API (tRPC)

### Register Operations
```typescript
// Get current open session
trpc.register.current.query()

// Open a new register
trpc.register.open.mutate({
  registerName: "Main Register",
  openedByName: "John",
  openingFloat: { twenties: 10, ones: 20, ... }
})

// Close register with count
trpc.register.close.mutate({
  sessionId: "...",
  closedByName: "John",
  closingCount: { twenties: 15, ones: 45, ... }
})
```

### Transaction Operations
```typescript
// Create new transaction
trpc.transactions.create.mutate({ type: "SALE" })

// Add item by barcode/SKU
trpc.transactions.addLine.mutate({
  transactionId: "...",
  sku: "NMC-123",
  quantity: 1
})

// Apply discount
trpc.transactions.applyDiscount.mutate({
  transactionId: "...",
  discountPercent: 10,
  discountReason: "Loyalty member"
})
```

### Payment Operations
```typescript
// Record cash payment
trpc.payments.recordPayment.mutate({
  transactionId: "...",
  paymentMethod: "CASH",
  amount: 50.00,
  amountTendered: 60.00
})

// Complete transaction
trpc.payments.complete.mutate({
  transactionId: "...",
  completedByName: "John"
})
```

### Receipt Operations
```typescript
// Get receipt HTML for printing
trpc.receipts.getReceiptHtml.query({ transactionId: "..." })

// Get structured receipt data
trpc.receipts.getReceiptData.query({ transactionId: "..." })
```

## Workflow

### Opening the Register

1. Navigate to Register page
2. Click "Open Register"
3. Enter your name
4. Count starting cash by denomination
5. Click "Open Register"

### Processing a Sale

1. Ensure register is open
2. Navigate to Transaction page
3. Scan or type barcode/SKU
4. Adjust quantities if needed
5. Click "Pay"
6. Enter cash amount
7. Complete sale - receipt prints automatically

### Closing the Register

1. Navigate to Register page
2. Click "Close Register"
3. Count all cash by denomination
4. Review variance (expected vs counted)
5. Add notes if needed
6. Click "Close Register"

## Costing Integration

When a transaction is completed:

1. POS creates a Saleor order via draft order flow
2. ORDER_FULFILLED webhook fires
3. Cost layer events (POS_SALE) are created
4. Each line gets WAC stamp from `computeWacForNewEventOptimized()`
5. Inventory quantities are decremented

This ensures accurate COGS tracking for all in-store sales.

## Environment Variables

```env
# Required
SECRET_KEY=your-secret-key
DATABASE_URL=postgresql://...
ALLOWED_DOMAIN_PATTERN=/.*/

# App URLs
APP_IFRAME_BASE_URL=http://localhost:3004
APP_API_BASE_URL=http://pos-app:3004
APP_LOG_LEVEL=debug

# Business defaults
DEFAULT_CURRENCY=USD

# Stripe Terminal (Phase 2)
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_TERMINAL_LOCATION_ID=tml_...
```

## Docker

```bash
# Build and run
docker compose up -d pos-app

# View logs
docker compose logs -f pos-app

# Run database migrations
docker compose exec pos-app npx prisma migrate deploy
```

## Local Development

```bash
cd saleor-apps/apps/pos

# Install dependencies
pnpm install

# Generate Prisma client
pnpm prisma generate

# Run migrations
pnpm prisma migrate dev

# Start dev server
pnpm dev
```

## Troubleshooting

### "No register is currently open"
Open a register before processing transactions.

### "Transaction is not fully paid"
Ensure the total payment amount equals the transaction total before completing.

### Saleor order not created
Check API logs for GraphQL errors. The transaction still completes locally and can be synced later.

### Receipt not printing
Ensure pop-up blockers are disabled. The receipt opens in a new window for browser printing.

## Future Enhancements

- ESC/POS thermal printer support via WebUSB
- Barcode/QR code on receipts for easy returns
- Customer display integration
- Split drawer for multiple cashiers
- Integrated payment terminal
- Offline mode with local-first architecture
