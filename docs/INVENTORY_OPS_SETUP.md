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
- [ ] Phase 2: Supplier Management (CRUD)
- [ ] Phase 3: Purchase Orders lifecycle
- [ ] Phase 4: Goods Receipt + Stock Posting
- [ ] Phase 5: Cost Layer Ledger + WAC
- [ ] Phase 6: Landed Cost Allocation
- [ ] Phase 7: GR Reversal
- [ ] Phase 8: UI Polish + Testing

## Files Reference

```
saleor-apps/apps/inventory-ops/
├── prisma/schema.prisma          # Database schema
├── src/
│   ├── app/api/                  # API routes (manifest, register, trpc)
│   ├── lib/                      # Utilities (env, prisma, logger)
│   ├── modules/trpc/             # tRPC router and procedures
│   └── pages/                    # UI pages
├── Dockerfile                    # Multi-stage Docker build
└── package.json                  # Dependencies
```
