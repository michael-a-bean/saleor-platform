# Saleor Hobby Gaming Platform - Setup Guide

Complete setup instructions for running the platform on a new machine.

## Prerequisites

- **Docker** (with Docker Compose v2)
- **Git** (with SSH key configured for GitHub)
- **~20GB** disk space for images and data
- (Optional) **AWS CLI** for Stripe DynamoDB setup

## Quick Start

```bash
# Clone the repository with submodules
git clone --recursive git@github.com:michael-a-bean/saleor-platform.git
cd saleor-platform

# Run the setup script
./scripts/setup.sh
```

The script will:
1. Initialize all git submodules
2. Set up environment files
3. Build Docker images
4. Run database migrations
5. Optionally populate sample data
6. Start all services

## Manual Setup

If you prefer manual setup or the script fails:

### 1. Clone and Initialize Submodules

```bash
git clone git@github.com:michael-a-bean/saleor-platform.git
cd saleor-platform

# Initialize all submodules (including nested ones in saleor-apps)
git submodule update --init --recursive
```

### 2. Configure Environment Files

```bash
# Storefront configuration
cp storefront/.env.example storefront/.env
```

The default `.env.example` is configured for local Docker development. For production, update the URLs accordingly.

### 3. Build Docker Images

```bash
docker compose build
```

This builds all custom images including:
- `storefront` - Next.js webstore
- `stripe-app` - Payment processing
- `inventory-ops-app` - Inventory management
- `buylist-app` - Card buyback system
- `pos-app` - Point of sale
- `saleor-mcp` - AI assistant integration

### 4. Start Core Services

```bash
# Start database and cache first
docker compose up -d db cache

# Wait a few seconds for PostgreSQL to initialize
sleep 5

# Run migrations
docker compose run --rm api python3 manage.py migrate

# (Optional) Populate sample data with superuser
docker compose run --rm api python3 manage.py populatedb --createsuperuser
# Default credentials: admin@example.com / admin
```

### 5. Start All Services

```bash
# Start core Saleor services
docker compose up -d api worker dashboard jaeger mailpit meilisearch

# Start Saleor apps
docker compose up -d stripe-app inventory-ops-app buylist-app pos-app

# Build and start storefront
docker compose up -d storefront
```

### 6. (Optional) Set Up Stripe DynamoDB

If using the Stripe payment app:

```bash
# Start DynamoDB local
docker compose up -d dynamodb-local

# Create the required table
./scripts/setup-stripe-dynamodb.sh
```

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Storefront | http://localhost:3000 | Customer webstore |
| Dashboard | http://localhost:9000 | Admin panel |
| GraphQL API | http://localhost:8000/graphql/ | Saleor API |
| Mailpit | http://localhost:8025 | Email testing UI |
| Jaeger | http://localhost:16686 | Distributed tracing |
| Meilisearch | http://localhost:7700 | Search engine UI |
| Stripe App | http://localhost:3001 | Payment processor |
| Inventory Ops | http://localhost:3002 | Inventory management |
| Buylist App | http://localhost:3003 | Card buybacks |
| POS App | http://localhost:3004 | Point of sale |

## Common Commands

```bash
# View all running containers
docker compose ps

# View logs for a specific service
docker compose logs -f api

# Stop all services
docker compose down

# Stop and remove all data (clean slate)
docker compose down -v

# Rebuild a specific service
docker compose build storefront
docker compose up -d storefront

# Run one-off commands in the API container
docker compose run --rm api python3 manage.py shell

# Access the database
docker compose exec db psql -U saleor saleor
```

## Data Import (MTG Cards)

After initial setup, import MTG card data:

```bash
# Sync products from Scryfall (run from project root)
python3 scripts/bulk-sync-scryfall.py

# Sync products to Meilisearch for search
python3 scripts/sync-meilisearch.py
```

## Architecture Overview

```
                    ┌─────────────┐
                    │  Dashboard  │ :9000
                    └──────┬──────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
┌───┴───┐            ┌─────┴─────┐          ┌─────┴─────┐
│Storefront│          │  Saleor   │          │   Apps    │
│  :3000   │──────────│   API     │──────────│:3001-3004 │
└─────────┘          │  :8000    │          └───────────┘
                     └─────┬─────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────┴────┐      ┌─────┴─────┐     ┌─────┴─────┐
    │PostgreSQL│      │  Valkey   │     │Meilisearch│
    │  :5432   │      │   :6379   │     │   :7700   │
    └──────────┘      └───────────┘     └───────────┘
```

## Troubleshooting

### Storefront won't build

The API must be running during storefront build (GraphQL introspection):
```bash
docker compose up -d api
docker compose build storefront
```

### "Something went wrong" on product pages

Usually caused by missing `discounted_price_amount`. Fix:
```sql
-- Run in database
UPDATE product_productvariantchannellisting
SET discounted_price_amount = price_amount
WHERE discounted_price_amount IS NULL AND price_amount IS NOT NULL;
```

### Submodules not cloning

```bash
git submodule update --init --recursive
```

### Permission denied for setup.sh

```bash
chmod +x scripts/setup.sh
```

### Port conflicts

If services fail to start, check for port conflicts:
```bash
# Check what's using a port
lsof -i :8000  # or any port
```

Update docker-compose.yml port mappings if needed.

## Git Workflow Reminder

- **Never commit to `main`** - it mirrors upstream Saleor
- Work on `platform/main` or `feature/*` branches
- Verify your branch before making changes: `git branch --show-current`

## Additional Documentation

- `CLAUDE.md` - Project overview and AI assistant instructions
- `docs/reference/architecture.md` - Full system architecture
- `docs/reference/git-philosophy.md` - Git workflow details
- `.claude/skills/` - Operational procedures for various tasks
