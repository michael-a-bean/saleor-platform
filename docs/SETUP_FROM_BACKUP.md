# Saleor Platform Setup from Backup

Instructions for setting up the MTG Card Marketplace on a new machine using a database backup.

## Prerequisites

- Docker and Docker Compose installed
- Git installed
- Database backup file (`saleor_backup_*.sql.gz`) copied to the machine

## Setup Steps

### 1. Clone the Repository

```bash
git clone <repository-url> saleor-platform
cd saleor-platform
git checkout platform/main
```

### 2. Start Core Services

Start the database, cache, and API services:

```bash
docker compose up -d db cache api worker mailpit jaeger
```

Wait for services to be healthy (about 30 seconds):

```bash
docker compose ps
```

### 3. Restore Database Backup

Copy your backup file to the project directory, then restore:

```bash
# If backup is in current directory:
gunzip -c saleor_backup_*.sql.gz | docker compose exec -T db psql -U saleor saleor

# Or if you need to clear existing data first:
docker compose exec db psql -U saleor -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c saleor_backup_*.sql.gz | docker compose exec -T db psql -U saleor saleor
```

### 4. Update Search Indexes

After restoring the database, rebuild the search indexes:

```bash
docker compose exec api python manage.py update_search_indexes
```

### 5. Build and Start Storefront

The storefront needs to be built with access to the running API:

```bash
docker build --network=host \
  --build-arg NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/ \
  --build-arg NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_DEFAULT_CHANNEL=webstore \
  -t saleor-storefront:local ./storefront

docker compose up -d storefront
```

### 6. Start Dashboard (Optional)

```bash
docker compose up -d dashboard
```

### 7. Verify Setup

Check all services are running:

```bash
docker compose ps
```

Test the endpoints:
- Storefront: http://localhost:3000
- GraphQL API: http://localhost:8000/graphql/
- Dashboard: http://localhost:9000
- Mailpit: http://localhost:8025

### Quick Test

```bash
# Check product count
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query": "{ products(first: 1, channel: \"webstore\") { totalCount } }"}' \
  | grep -o '"totalCount":[0-9]*'
```

Should return approximately 106,872 products.

## Troubleshooting

### "Connection refused" during storefront build
Ensure the API is running: `docker compose up -d api` and wait 30 seconds.

### Products not showing on storefront
Run search index update: `docker compose exec api python manage.py update_search_indexes`

### Database restore fails
Check the database is running: `docker compose ps db`
Check logs: `docker compose logs db`

### Pricing errors ("NoneType has no attribute currency")
Run the pricing fix query:
```bash
docker compose exec db psql -U saleor saleor -c "
UPDATE product_productvariantchannellisting
SET discounted_price_amount = price_amount
WHERE discounted_price_amount IS NULL AND price_amount IS NOT NULL;
"
```

## Service URLs

| Service | URL |
|---------|-----|
| Storefront | http://localhost:3000 |
| GraphQL API | http://localhost:8000/graphql/ |
| Dashboard | http://localhost:9000 |
| Mailpit | http://localhost:8025 |
| Jaeger | http://localhost:16686 |

## Files to Copy

When migrating to a new machine, copy:
1. The git repository (clone from remote)
2. Database backup file (`saleor_backup_*.sql.gz`)
3. Any media files if needed (product images are from Scryfall CDN, so not required)
