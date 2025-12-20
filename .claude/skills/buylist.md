# Buylist Skill

Manage the Buylist Saleor app - customer card buybacks with a simplified 2-step face-to-face workflow.

## Workflow Overview

The buylist app uses a streamlined workflow for in-store transactions:

1. **FOH (Front of House)** - Customer brings cards to counter
   - Staff adds cards, sets conditions, adjusts prices if needed
   - Staff selects payout method (Cash, Store Credit, Check, etc.)
   - Click "Complete & Pay Customer" → Buylist created in `PENDING_VERIFICATION` status
   - Customer is paid immediately

2. **BOH (Back of House)** - Verification queue
   - Staff verifies cards are present and condition is accurate
   - Can update condition (doesn't change price - customer already paid)
   - Can reduce quantity if cards are missing
   - Click "Verify & Add to Inventory" → Stock updated, status becomes `COMPLETED`

### Buylist Statuses

| Status | Description |
|--------|-------------|
| `PENDING_VERIFICATION` | Customer paid, cards awaiting BOH verification |
| `COMPLETED` | Cards verified and added to inventory |
| `CANCELLED` | Transaction cancelled/voided |

## Quick Commands

```bash
# View app logs
docker compose logs -f buylist-app

# Rebuild and restart
docker compose build buylist-app && docker compose up -d buylist-app

# Access database (shared with inventory-ops)
docker compose exec inventory-ops-db psql -U inventory -d inventory_ops

# Run migrations (if schema changes)
docker compose exec inventory-ops-app sh -c "cd /app/apps/inventory-ops && npx prisma db push"
```

## Database Queries

```sql
-- Check buylists
SELECT id, "buylistNumber", status, "customerName", "payoutMethod", "paidAt"
FROM "Buylist" ORDER BY "createdAt" DESC LIMIT 10;

-- Check pending verification queue
SELECT id, "buylistNumber", "customerName", "totalQuotedAmount"::text, "paidAt"
FROM "Buylist"
WHERE status = 'PENDING_VERIFICATION'
ORDER BY "paidAt" ASC;

-- Check buylist lines
SELECT bl.id, b."buylistNumber", bl."saleorVariantName", bl.qty, bl."finalPrice"::text, bl.condition
FROM "BuylistLine" bl
JOIN "Buylist" b ON bl."buylistId" = b.id
ORDER BY bl."createdAt" DESC LIMIT 20;

-- Check cost layer events from buylist
SELECT id, "eventType", "saleorVariantId", "qtyDelta", "unitCost"::text
FROM "CostLayerEvent"
WHERE "eventType" IN ('BUYLIST_RECEIPT', 'BUYLIST_RECEIPT_REVERSAL')
ORDER BY "eventTimestamp" DESC LIMIT 10;

-- Today's verified buylists
SELECT COUNT(*), SUM("totalFinalAmount")::text as total_value
FROM "Buylist"
WHERE "verifiedAt" >= CURRENT_DATE AND status = 'COMPLETED';
```

## tRPC API

The app exposes a tRPC API at `/api/trpc/*`:

| Router | Key Endpoints |
|--------|---------------|
| `buylists` | `list`, `getById`, `createAndPay`, `cancel`, `searchCards`, `listWarehouses` |
| `boh` | `queue`, `verifyAndReceive`, `stats` |
| `pricing` | `getDefault`, `list`, `create`, `update` |

### Key Mutations

**`buylists.createAndPay`** - Create buylist and pay customer in one step
```typescript
{
  saleorWarehouseId: string,
  customerName?: string,
  payoutMethod: "CASH" | "STORE_CREDIT" | "CHECK" | "BANK_TRANSFER" | "PAYPAL" | "OTHER",
  payoutReference?: string,
  lines: [{
    saleorVariantId: string,
    qty: number,
    condition: "NM" | "LP" | "MP" | "HP" | "DMG",
    marketPrice: number,
    buyPrice: number,
  }]
}
```

**`boh.verifyAndReceive`** - Verify cards and add to inventory
```typescript
{
  buylistId: string,
  lines?: [{
    lineId: string,
    condition?: string,      // Update if different
    qtyAccepted?: number,    // Reduce if cards missing
    conditionNote?: string,
  }],
  internalNotes?: string,
}
```

## Integration with Inventory Ops

Buylist integrates with Inventory Ops for cost tracking:

### How It Works

1. Customer cards are added at FOH counter
2. Staff pays customer (payout recorded)
3. Cards queue for BOH verification
4. BOH verifies and triggers `verifyAndReceive`
5. Creates `BUYLIST_RECEIPT` cost layer events
6. Stock is posted to Saleor warehouse
7. Inventory Ops sees these events when calculating WAC

### Cost Layer Events

| Event Type | Created When |
|------------|--------------|
| `BUYLIST_RECEIPT` | Buylist verified, stock added |
| `BUYLIST_RECEIPT_REVERSAL` | Buylist receipt is reversed |

## UI Pages

| Path | Purpose |
|------|---------|
| `/buylists` | List all buylists |
| `/buylists/new` | FOH: Create buylist and pay customer |
| `/buylists/[id]` | View buylist details |
| `/boh/queue` | BOH: Verification queue |
| `/boh/buylists/[id]/verify` | BOH: Verify cards and receive |
| `/pricing` | Pricing policy configuration |

## Files

```
saleor-apps/apps/buylist/
├── prisma/                       # Symlink to inventory-ops schema
├── src/
│   ├── lib/
│   │   ├── prisma.ts             # Database client
│   │   ├── saleor-client.ts      # Saleor API client
│   │   └── wac-service.ts        # WAC calculation
│   ├── modules/
│   │   ├── boh/
│   │   │   └── boh-router.ts     # BOH queue & verify endpoints
│   │   ├── buylists/
│   │   │   └── buylists-router.ts # Buylist CRUD & createAndPay
│   │   ├── pricing/
│   │   │   └── pricing-router.ts # Pricing policies
│   │   └── trpc/                 # Router setup
│   └── pages/
│       ├── buylists/
│       │   ├── new.tsx           # FOH create & pay page
│       │   └── [id]/index.tsx    # Buylist detail
│       └── boh/
│           ├── queue.tsx         # Verification queue
│           └── buylists/[id]/
│               └── verify.tsx    # Card verification page
└── Dockerfile
```

## Pricing Policies

Buy prices are calculated based on pricing policies:

| Policy Type | Description |
|-------------|-------------|
| `PERCENTAGE` | X% of market price |
| `FIXED_DISCOUNT` | Market price minus $X |
| `TIERED` | Different % based on card value ranges |

Condition multipliers adjust the base price:
- NM: 100%
- LP: 90%
- MP: 75%
- HP: 50%
- DMG: 25%

## Service URLs

| Service | Port | Purpose |
|---------|------|---------|
| buylist-app | 3003 | Next.js app (via Dashboard) |
| inventory-ops-db | 5433 | Shared PostgreSQL database |
