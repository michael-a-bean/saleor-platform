# Inventory Ops Skill

Manage the Inventory Ops Saleor app - purchase orders, goods receipts, cost tracking, and COGS reporting.

## Quick Commands

```bash
# View app logs
docker compose logs -f inventory-ops-app

# Rebuild and restart
docker compose build inventory-ops-app && docker compose up -d inventory-ops-app

# Access database
docker compose exec inventory-ops-db psql -U inventory -d inventory_ops

# Run migrations
docker compose exec inventory-ops-app pnpm prisma db push

# Generate Prisma client
docker compose exec inventory-ops-app pnpm prisma generate
```

## Database Queries

```sql
-- Check purchase orders
SELECT id, "orderNumber", status, "createdAt" FROM "PurchaseOrder" ORDER BY "createdAt" DESC LIMIT 10;

-- Check goods receipts
SELECT gr.id, gr."receiptNumber", gr.status, po."orderNumber"
FROM "GoodsReceipt" gr
JOIN "PurchaseOrder" po ON gr."purchaseOrderId" = po.id
ORDER BY gr."createdAt" DESC LIMIT 10;

-- Check cost layer events
SELECT id, "eventType", "saleorVariantId", "qtyDelta", "unitCost"::text, "eventTimestamp"
FROM "CostLayerEvent" ORDER BY "eventTimestamp" DESC LIMIT 20;

-- Check sales/COGS
SELECT id, "saleorOrderNumber", "totalRevenue"::text, "totalCogs"::text, "fulfilledAt"
FROM "SaleEvent" ORDER BY "fulfilledAt" DESC LIMIT 10;

-- Calculate current inventory value
SELECT
    "saleorVariantId",
    SUM("qtyDelta") as qty_on_hand,
    SUM("qtyDelta" * ("unitCost" + "landedCostDelta")) as total_value
FROM "CostLayerEvent"
GROUP BY "saleorVariantId"
HAVING SUM("qtyDelta") > 0;
```

## tRPC API

The app exposes a tRPC API at `/api/trpc/*`:

| Router | Endpoints |
|--------|-----------|
| `suppliers` | list, getById, create, update, delete |
| `purchaseOrders` | list, getById, create, update, addLines, submit, approve, cancel |
| `goodsReceipts` | list, getById, create, addLines, post, reverse |
| `landedCosts` | create, allocate |
| `costLayers` | getWac, getHistory |
| `sales` | list, getById, getSummary, profitabilityByProduct |
| `reporting` | inventoryValuation, costHistory, stockMovementSummary, dashboardSummary |

## Webhook

The app subscribes to `ORDER_FULFILLED` events:
- Endpoint: `/api/webhooks/saleor/order-fulfilled`
- Creates SALE cost layer events with WAC at time of sale
- Calculates COGS for profitability reporting

## UI Pages

| Path | Purpose |
|------|---------|
| `/purchase-orders` | List and manage purchase orders |
| `/purchase-orders/new` | Create new purchase order |
| `/purchase-orders/[id]` | View PO details |
| `/suppliers` | Manage suppliers |
| `/goods-receipts` | List and manage goods receipts |
| `/goods-receipts/new` | Create new goods receipt |
| `/reports/inventory-value` | Current inventory valuation |
| `/reports/cost-history` | Cost layer event history |
| `/reports/sales` | Sales and COGS tracking |
| `/reports/profitability` | Product profitability analysis |

## Files

```
saleor-apps/apps/inventory-ops/
├── prisma/schema.prisma          # Database schema
├── src/
│   ├── app/api/                  # API routes
│   ├── lib/                      # Utilities
│   ├── modules/                  # Domain modules
│   ├── pages/                    # UI pages
│   └── ui/                       # Shared components
└── Dockerfile
```
