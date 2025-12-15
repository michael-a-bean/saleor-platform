---
name: docker-ops
description: Manage Docker Compose services for the Saleor platform. Use for starting, stopping, rebuilding, and debugging containers.
---

# Docker Operations Skill

## When to Use

Use this skill when you need to:
- Start/stop/restart services
- View container logs
- Rebuild images
- Debug container issues
- Manage volumes

## Service Overview

| Service | Port | Purpose |
|---------|------|---------|
| api | 8000 | GraphQL API |
| storefront | 3000 | Customer webstore |
| dashboard | 9000 | Admin UI |
| db | 5432 | PostgreSQL |
| cache | 6379 | Valkey (Redis-compatible) |
| worker | - | Celery async tasks |
| jaeger | 16686 | Tracing UI |
| mailpit | 8025 | Email testing UI |

## Common Operations

### Start All Services
```bash
docker compose up -d
```

### Start Specific Services
```bash
docker compose up -d api db cache  # Core services
docker compose up -d storefront    # After API is ready
```

### Stop All Services
```bash
docker compose down
```

### View Logs
```bash
docker compose logs -f api
docker compose logs -f storefront
docker compose logs --tail=50 api worker  # Multiple services
```

### Restart Service
```bash
docker compose restart api
docker compose restart storefront
```

### Rebuild and Restart
```bash
docker compose build storefront
docker compose up -d --force-recreate storefront
```

### Execute Commands in Container
```bash
docker compose exec api python manage.py <command>
docker compose exec db psql -U saleor -d saleor
docker compose exec storefront sh
```

### Non-interactive Commands
```bash
docker compose exec -T api python manage.py update_search_indexes
docker compose exec -T db psql -U saleor -d saleor -c "SELECT 1"
```

## Django Management Commands

```bash
# Update search index (after product imports)
docker compose exec api python manage.py update_search_indexes

# Run migrations
docker compose exec api python manage.py migrate

# Create superuser
docker compose exec api python manage.py createsuperuser

# Django shell
docker compose exec api python manage.py shell

# Collect static files
docker compose exec api python manage.py collectstatic --noinput
```

## Troubleshooting

### Check Service Status
```bash
docker compose ps
```

### Check Container Health
```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

### View Resource Usage
```bash
docker stats --no-stream
```

### Remove All Data (Full Reset)
```bash
docker compose down -v  # Removes volumes too!
docker compose up -d
```

### Rebuild Without Cache
```bash
docker compose build --no-cache storefront
```

### Prune Unused Resources
```bash
docker system prune -f
docker builder prune -f
```

## Volume Management

```bash
# List volumes
docker volume ls | grep saleor

# Backup database
docker compose exec -T db pg_dump -U saleor saleor > backup.sql

# Restore database
docker compose exec -T db psql -U saleor -d saleor < backup.sql
```
