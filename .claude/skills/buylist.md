# Buylist Skill

Manage the Buylist Saleor app - customer card buybacks, pricing, BOH (Buy-On-Hand) tracking, and TCG singles receiving.

## Quick Commands

```bash
# View app logs
docker compose logs -f buylist-app

# Rebuild and restart
docker compose build buylist-app && docker compose up -d buylist-app

# Access database (shared with inventory-ops)
docker compose exec inventory-ops-db psql -U inventory -d inventory_ops

# Run migrations (if schema changes)
docker compose exec buylist-app pnpm prisma db push
```

## Database Queries

```sql
-- Check buylists
SELECT id, "buylistNumber", status, "customerEmail", "createdAt"
FROM "Buylist" ORDER BY "createdAt" DESC LIMIT 10;

-- Check buylist lines
SELECT bl.id, b."buylistNumber", bl."saleorVariantSku", bl.quantity, bl."unitCost"::text
FROM "BuylistLine" bl
JOIN "Buylist" b ON bl."buylistId" = b.id
ORDER BY bl."createdAt" DESC LIMIT 20;

-- Check cost layer events from buylist
SELECT id, "eventType", "saleorVariantId", "qtyDelta", "unitCost"::text
FROM "CostLayerEvent"
WHERE "eventType" IN ('BUYLIST_RECEIPT', 'BUYLIST_RECEIPT_REVERSAL')
ORDER BY "eventTimestamp" DESC LIMIT 10;

-- BOH pricing data
SELECT id, "saleorVariantId", "buyPrice"::text, "lastUpdated"
FROM "BohPricing" ORDER BY "lastUpdated" DESC LIMIT 10;
```

## tRPC API

The app exposes a tRPC API at `/api/trpc/*`:

| Router | Endpoints |
|--------|-----------|
| `buylists` | list, getById, create, addLines, updateLines, submit, approve, receive, cancel |
| `boh` | getPricing, updatePricing, bulkUpdatePricing, getVariantWac |

## Integration with Inventory Ops

Buylist integrates with Inventory Ops for cost tracking:

### How It Works

1. Customer submits cards via buylist
2. Staff approves and receives the buylist
3. Receiving creates `BUYLIST_RECEIPT` cost layer events
4. Stock is posted to Saleor warehouse
5. Inventory Ops sees these events when calculating WAC

### Cost Layer Events

| Event Type | Created When |
|------------|--------------|
| `BUYLIST_RECEIPT` | Buylist is received, stock added |
| `BUYLIST_RECEIPT_REVERSAL` | Buylist receipt is reversed |

### WAC Calculation

Both apps share WAC calculation:

```typescript
// In buylist/src/lib/wac-service.ts
import { calculateWac } from "@/lib/wac-service";

// Uses same algorithm as inventory-ops
const wac = await calculateWac({
  prisma,
  installationId: allInstallationIds, // Includes inventory-ops events
  variantId,
  warehouseId,
});
```

## UI Pages

| Path | Purpose |
|------|---------|
| `/boh` | BOH (Buy-On-Hand) management dashboard |
| `/boh/buylists` | List and manage buylists |
| `/boh/buylists/new` | Create new buylist |
| `/boh/buylists/[id]` | View buylist details |
| `/boh/buylists/[id]/receive` | Receive a buylist |
| `/boh/pricing` | BOH pricing configuration |

## Files

```
saleor-apps/apps/buylist/
├── prisma/schema.prisma          # Database schema (shared with inventory-ops)
├── src/
│   ├── app/api/                  # API routes
│   ├── lib/
│   │   ├── prisma.ts             # Database client
│   │   └── wac-service.ts        # WAC calculation (cross-app aware)
│   ├── modules/
│   │   ├── boh/                  # BOH business logic
│   │   └── trpc/                 # Router setup
│   ├── pages/                    # UI pages
│   └── ui/                       # Shared components
└── Dockerfile
```

## Required Permissions

| Permission | Purpose |
|------------|---------|
| `MANAGE_PRODUCTS` | Read product variants, update stock |

## Service URLs

| Service | Port | Purpose |
|---------|------|---------|
| buylist-app | 3003 | Next.js app |
| inventory-ops-db | 5433 | Shared PostgreSQL database |
