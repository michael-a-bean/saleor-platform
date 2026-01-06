# POS Operations Skill

## Purpose

Guide for working with the POS (Point of Sale) Saleor App for in-store transactions.

## App Location

`/home/michael/saleor-platform/saleor-apps/apps/pos`

## Quick Start

### Start Development

```bash
cd /home/michael/saleor-platform/saleor-apps/apps/pos

# Ensure dependencies installed
pnpm install

# Generate Prisma client (shared schema)
pnpm prisma generate

# Start dev server
pnpm dev  # Runs on http://localhost:3004
```

### Verify Services

```bash
# Check app is running
curl -s http://localhost:3004/api/manifest | jq .name

# Check database connection (shared with inventory-ops)
docker compose exec inventory-db psql -U inventory -d inventory_ops -c "SELECT COUNT(*) FROM \"RegisterSession\""
```

## Database Operations

### Shared Schema Location

The POS app uses a symlinked Prisma schema:
```
pos/prisma/schema.prisma → inventory-ops/prisma/schema.prisma
```

### Running Migrations

**Always run from inventory-ops:**
```bash
cd /home/michael/saleor-platform/saleor-apps/apps/inventory-ops

# Create migration
pnpm prisma migrate dev --name add_pos_feature

# Apply existing migrations
pnpm prisma migrate deploy

# Then regenerate client in POS
cd ../pos
pnpm prisma generate
```

### Direct Database Queries

```bash
# Connect to shared database
docker compose exec inventory-db psql -U inventory -d inventory_ops

# Common queries:
SELECT * FROM "RegisterSession" ORDER BY "createdAt" DESC LIMIT 5;
SELECT * FROM "PosTransaction" ORDER BY "createdAt" DESC LIMIT 10;
SELECT * FROM "PosTransactionLine" WHERE "transactionId" = 'xxx';
SELECT * FROM "PosPayment" WHERE "transactionId" = 'xxx';
SELECT * FROM "CashMovement" ORDER BY "createdAt" DESC LIMIT 20;
SELECT * FROM "CustomerCredit" WHERE "saleorCustomerId" = 'xxx';
```

## tRPC Router Reference

### Register Router (`register-router.ts`)

```typescript
// Get current open session
register.current.useQuery()

// Open new session with cash count
register.open.useMutation({
  registerCode: string,
  saleorWarehouseId: string,
  currencyCode: string,
  openingFloat: {
    hundreds: number, fifties: number, twenties: number,
    tens: number, fives: number, ones: number,
    quarters: number, dimes: number, nickels: number, pennies: number
  },
  openedByName: string,
  notes?: string
})

// Close session with reconciliation
register.close.useMutation({
  sessionId: string,
  closingCount: { /* same denomination breakdown */ },
  closedByName: string,
  notes?: string
})

// Real-time cash summary
register.cashSummary.useQuery({ sessionId: string })
```

### Transactions Router (`transactions-router.ts`)

```typescript
// Create new transaction
transactions.create.useMutation({
  saleorChannelId: string,
  saleorWarehouseId: string,
  type: 'SALE' | 'RETURN' | 'EXCHANGE' | 'NO_SALE'
})

// Get current draft
transactions.getCurrent.useQuery()

// Add line item
transactions.addLine.useMutation({
  transactionId: string,
  sku: string,              // or variantId or barcode
  quantity: number,
  unitPriceOverride?: number,
  overrideReason?: string
})

// Update line
transactions.updateLine.useMutation({
  lineId: string,
  quantity?: number,
  unitPriceOverride?: number,
  discountAmount?: number,
  discountPercent?: number,
  discountReason?: string
})

// Remove line
transactions.removeLine.useMutation({ lineId: string })

// Void transaction
transactions.void.useMutation({
  transactionId: string,
  voidReason: string
})

// Singles Builder import
transactions.getPendingSinglesBuilderCart.useQuery()
transactions.importFromSinglesBuilder.useMutation({
  code: string,
  saleorChannelId: string,
  saleorWarehouseId: string
})
```

### Payments Router (`payments-router.ts`)

```typescript
// Record payment
payments.recordPayment.useMutation({
  transactionId: string,
  methodType: 'CASH' | 'CARD_PRESENT' | 'CARD_MANUAL' | 'GIFT_CARD' | 'STORE_CREDIT' | 'CHECK' | 'OTHER',
  amount: number,
  amountTendered?: number,  // For cash, to calculate change
  reference?: string
})

// Complete transaction (creates Saleor order)
payments.complete.useMutation({
  transactionId: string,
  completedByName: string
})

// Get payment summary
payments.getSummary.useQuery({ transactionId: string })
```

### Customers Router (`customers-router.ts`)

```typescript
// Search customers
customers.search.useQuery({ query: string })  // min 2 chars

// Get full details
customers.getById.useQuery({ customerId: string })

// Create customer
customers.create.useMutation({
  email: string,
  firstName?: string,
  lastName?: string
})

// Attach to transaction
customers.attachToTransaction.useMutation({
  transactionId: string,
  customerId: string
})

// Use store credit as payment
customers.useCredit.useMutation({
  transactionId: string,
  amount: number
})

// Get credit balance
customers.getCreditBalance.useQuery({ customerId: string })
```

### Receipts Router (`receipts-router.ts`)

```typescript
// Get printable HTML receipt
receipts.getReceiptHtml.useQuery({ transactionId: string })

// Get structured receipt data
receipts.getReceiptData.useQuery({ transactionId: string })

// Record print event (audit)
receipts.recordPrint.useMutation({
  transactionId: string,
  printType: 'FIRST_PRINT' | 'REPRINT'
})
```

## UI Development

### Main Transaction Page

`src/pages/transaction.tsx` - The primary POS interface

Key sections:
- Barcode input (top left)
- Singles Builder import banner (when cart pending)
- Cart grid (left side)
- Customer search (right side)
- Totals panel (right side)
- Payment modal (overlay)

### Adding New UI

1. Create page in `src/pages/`
2. Use tRPC client for data:
```typescript
import { trpcClient } from "@/modules/trpc/trpc-client";

const MyPage: NextPage = () => {
  const { data } = trpcClient.register.current.useQuery();
  const mutation = trpcClient.transactions.create.useMutation();

  // ...
};
```

3. Use Macaw UI components:
```typescript
import { Box, Button, Input, Text } from "@saleor/macaw-ui";
```

## Common Operations

### Reset Test Data

```sql
-- Clear all POS data (careful!)
DELETE FROM "PosAuditEvent";
DELETE FROM "CashMovement";
DELETE FROM "PosPayment";
DELETE FROM "PosTransactionLine";
DELETE FROM "PosTransaction";
DELETE FROM "RegisterSession";
```

### Check Credit Balance

```sql
SELECT
  cc."saleorCustomerId",
  cc.balance,
  cc."updatedAt"
FROM "CustomerCredit" cc
WHERE cc."saleorCustomerId" = 'VXNlcjox';
```

### View Transaction with Lines

```sql
SELECT
  t.id,
  t."transactionNumber",
  t.status,
  t."grandTotal",
  l."saleorVariantName",
  l.quantity,
  l."lineTotal"
FROM "PosTransaction" t
LEFT JOIN "PosTransactionLine" l ON l."transactionId" = t.id
WHERE t.id = 'xxx'
ORDER BY l."createdAt";
```

## Troubleshooting

### "No register is currently open"

Open a register first:
1. Navigate to `/register/open`
2. Enter opening cash count
3. Click "Open Register"

### Product not found by SKU

Check the SKU exists in Saleor:
```graphql
query {
  productVariant(sku: "THE-SKU") {
    id
    name
    sku
  }
}
```

### Singles Builder import not showing

1. Verify checkout exists with metadata:
```graphql
query {
  checkouts(first: 10, filter: { search: "singles_builder" }) {
    edges {
      node {
        id
        metadata {
          key
          value
        }
      }
    }
  }
}
```

2. Check the staff user matches

### Payment fails to complete

Check remaining balance:
```typescript
const summary = await payments.getSummary.fetch({ transactionId });
console.log('Remaining:', summary.remainingBalance);
```

## Testing Checklist

- [ ] Open register with cash count
- [ ] Add item by SKU
- [ ] Adjust quantity +/-
- [ ] Attach customer
- [ ] Pay with cash
- [ ] Verify receipt prints
- [ ] Close register with variance check
- [ ] Import Singles Builder cart
- [ ] Use store credit payment

## Files to Know

| File | Purpose |
|------|---------|
| `src/pages/transaction.tsx` | Main POS screen |
| `src/pages/register/open.tsx` | Open register form |
| `src/pages/register/close.tsx` | Close register form |
| `src/modules/transactions/transactions-router.ts` | Cart API |
| `src/modules/payments/payments-router.ts` | Payment API |
| `src/modules/customers/customers-router.ts` | Customer + credit API |
| `src/lib/graphql-client.ts` | Saleor GraphQL client |
| `src/ui/components/CustomerSearch.tsx` | Customer lookup component |
