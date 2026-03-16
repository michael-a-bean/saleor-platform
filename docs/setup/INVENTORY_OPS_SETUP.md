# Inventory Ops App Setup Guide

This guide covers setting up the Inventory Ops Saleor App on a new machine.

## Prerequisites

- Docker and Docker Compose installed
- Git with SSH key configured for GitHub
- Saleor Platform repository cloned

## Quick Setup (Ask Claude Code)

After pulling the repo, you can ask Claude Code to do the setup for you:

> "Set up the inventory-ops app for me"

Claude Code will:
1. Build the Docker image
2. Start the services
3. Run database migrations
4. Provide the manifest URL for installation

## Manual Setup Steps

### 1. Start Core Services

```bash
cd /path/to/saleor-platform

# Start Saleor API and dependencies
docker compose up -d api db cache

# Start Inventory Ops database
docker compose up -d inventory-ops-db
```

### 2. Build and Start the App

```bash
# Build the inventory-ops app image
docker compose build inventory-ops-app

# Start the app
docker compose up -d inventory-ops-app
```

### 3. Run Database Migration

```bash
docker compose exec inventory-ops-app pnpm prisma db push
```

### 4. Install in Saleor Dashboard

The app needs to be installed via the Saleor Dashboard using the container's IP address (Docker networking limitation).

**Get the container IP:**
```bash
docker inspect saleor-platform-inventory-ops-app-1 -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
```

**Install the app:**
1. Go to Dashboard: http://localhost:9000
2. Navigate to **Apps** → **Install external app**
3. Enter manifest URL: `http://<container-ip>:3002/api/manifest`
4. Complete the installation

## Troubleshooting

### "Failed to connect to app" during installation

The Saleor API container needs to reach the app container. Use the container IP address, not `localhost`.

### "Registration failed: could not save auth data"

Permission issue with the data directory. Fix with:
```bash
docker compose exec -u root inventory-ops-app chown -R nextjs:nodejs /app/apps/inventory-ops/data
```

### "Missing auth data" error after navigation

The app lost its authentication. This happens if:
- Container was recreated without the persistent volume
- App needs to be reinstalled in Dashboard

The auth data is stored in a Docker volume (`inventory-ops-apl`) and should persist across restarts.

### App shows error after browser back button

Refresh the page. The app bridge context can be lost on certain navigation patterns.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Saleor Dashboard                          │
│                    (localhost:9000)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ iframe
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Inventory Ops App                           │
│                  (localhost:3002)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Pages     │  │  tRPC API   │  │   Saleor GraphQL    │  │
│  │  (Next.js)  │──│  (Router)   │──│     Client          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                          │                    │              │
│                          ▼                    ▼              │
│                   ┌─────────────┐      ┌─────────────┐      │
│                   │   Prisma    │      │  Saleor API │      │
│                   │   Client    │      │ (port 8000) │      │
│                   └─────────────┘      └─────────────┘      │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │  PostgreSQL DB      │
              │  (port 5433)        │
              │  inventory_ops      │
              └─────────────────────┘
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| inventory-ops-app | 3002 | Next.js app |
| inventory-ops-db | 5433 | PostgreSQL database |

## Environment Variables

The app uses these environment variables (configured in docker-compose.yml):

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | App secret for signing |
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_API_BASE_URL` | URL Saleor uses to reach the app |
| `APP_IFRAME_BASE_URL` | URL for Dashboard iframe |
| `DEFAULT_CURRENCY` | Default currency (USD) |

## Development Status

- [x] Phase 1: App Scaffolding
- [x] Phase 2: Supplier Management (CRUD)
- [x] Phase 3: Purchase Orders lifecycle
- [x] Phase 4: Goods Receipt + Stock Posting
- [x] Phase 5: Cost Layer Ledger + WAC
- [x] Phase 6: Landed Cost Allocation
- [x] Phase 7: GR Reversal
- [x] Phase 8: Sales/COGS Tracking (ORDER_FULFILLED webhook)
- [x] Phase 9: Reports UI (Inventory Value, Cost History, Sales, Profitability)
- [x] Phase 10: Stock Control (Stock Adjustments + Discrepancy Detection)
- [ ] Phase 11: Unit Tests (optional)
- [ ] Phase 12: E2E Tests (optional)

## Consolidated App Architecture

> **As of March 2026**, buylist and MTG import functionality have been consolidated into inventory-ops. All cost layer events, buylist workflows, and import pipelines run within a single app.

### Cost Layer Event Types

| Event Types | Description |
|-------------|-------------|
| `GOODS_RECEIPT`, `GOODS_RECEIPT_REVERSAL`, `LANDED_COST_ADJUSTMENT` | Purchase order receiving |
| `BUYLIST_RECEIPT`, `BUYLIST_RECEIPT_REVERSAL` | Customer card buybacks |
| `SALE`, `SALE_RETURN` | Order fulfillment COGS |
| `STOCK_ADJUSTMENT`, `STOCK_ADJUSTMENT_REVERSAL` | Manual corrections |

### WAC Calculation

When calculating Weighted Average Cost (WAC), the system aggregates all cost layer events:

```sql
-- All event types are within the same app (inventory-ops)
SELECT * FROM "CostLayerEvent"
WHERE "saleorVariantId" = 'variant-id'
  AND "saleorWarehouseId" = 'warehouse-id'
ORDER BY "eventTimestamp";
```

## Required Permissions

The app requires these Saleor permissions:

| Permission | Purpose |
|------------|---------|
| `MANAGE_PRODUCTS` | Read/write product variants, update stock |
| `MANAGE_ORDERS` | Required for ORDER_FULFILLED webhook |

**Important**: Without `MANAGE_ORDERS`, the ORDER_FULFILLED webhook will silently fail to trigger.

## Current State (Dec 2025)

**Working Features:**
- Full PO → GR → Stock posting workflow
- WAC calculation across all cost event types (PO receipts, buylist receipts, sales)
- ORDER_FULFILLED webhook creating SALE events with COGS
- Buylist workflow for TCG singles receiving (consolidated into inventory-ops, Mar 2026)
- MTG card import pipeline (consolidated into inventory-ops, Mar 2026)
- All reports showing unified cost data

**Database:**
- Single schema for all inventory-ops functionality (including buylist and MTG import)
- Cost layer events track source via event type

## Files Reference

```
saleor-apps/apps/inventory-ops/
├── prisma/schema.prisma          # Database schema (15 tables)
├── src/
│   ├── app/api/                  # API routes
│   │   ├── manifest/             # App manifest
│   │   ├── register/             # App registration
│   │   ├── trpc/                 # tRPC endpoint
│   │   └── webhooks/saleor/      # Saleor webhooks
│   │       ├── order-fulfilled/  # COGS tracking webhook
│   │       └── stock-updated/    # Discrepancy detection webhook
│   ├── lib/                      # Utilities
│   │   ├── prisma.ts             # Database client
│   │   ├── saleor-client.ts      # GraphQL client for Saleor
│   │   └── logger.ts             # Structured logging
│   ├── modules/                  # Domain modules
│   │   ├── suppliers/            # Supplier CRUD
│   │   ├── purchase-orders/      # PO lifecycle
│   │   ├── goods-receipts/       # GR + stock posting
│   │   ├── cost-layers/          # WAC calculation
│   │   ├── landed-costs/         # Cost allocation
│   │   ├── sales/                # COGS/profitability
│   │   ├── reporting/            # Reports API
│   │   ├── stock-adjustments/    # Manual stock corrections
│   │   ├── stock-discrepancies/  # Unauthorized change tracking
│   │   └── trpc/                 # Router setup
│   ├── pages/                    # UI pages
│   │   ├── purchase-orders/      # PO management
│   │   ├── suppliers/            # Supplier management
│   │   ├── goods-receipts/       # GR management
│   │   ├── stock-adjustments/    # Stock adjustment management
│   │   ├── stock-discrepancies/  # Discrepancy review
│   │   └── reports/              # Reports UI
│   └── ui/components/            # Shared components
├── Dockerfile                    # Multi-stage Docker build
└── package.json                  # Dependencies
```

## Features

| Feature | Description |
|---------|-------------|
| **Purchase Orders** | Create, edit, submit, approve, track POs with line items |
| **Suppliers** | Vendor master data management |
| **Goods Receipts** | Receive against POs, partial receiving, post to Saleor stock |
| **WAC Calculation** | Weighted Average Cost with append-only cost ledger |
| **Landed Costs** | Allocate freight/duty/other costs by value or quantity |
| **GR Reversals** | Reverse posted receipts with automatic cost layer adjustments |
| **COGS Tracking** | Automatic ORDER_FULFILLED webhook captures sales at WAC |
| **Stock Adjustments** | Manual stock corrections (damage, shrinkage, count correction, expiry, found stock) with cost layer tracking |
| **Discrepancy Detection** | PRODUCT_VARIANT_STOCK_UPDATED webhook detects unauthorized stock changes |
| **Reports** | Inventory valuation, cost history, sales/COGS, profitability |

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/manifest` | GET | App manifest for installation |
| `/api/register` | POST | App registration callback |
| `/api/trpc/*` | GET/POST | tRPC API for all operations |
| `/api/webhooks/saleor/order-fulfilled` | POST | COGS tracking webhook |
| `/api/webhooks/saleor/stock-updated` | POST | Discrepancy detection webhook |
