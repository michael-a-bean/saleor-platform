# Security Checklist for Production

This document outlines security measures that MUST be addressed before deploying to production.

## Critical: Credentials and Secrets

### Database Passwords

The default `docker-compose.yml` uses development credentials that MUST be changed:

| Service | Default User | Default Password | Location |
|---------|-------------|------------------|----------|
| `db` (Saleor) | saleor | saleor | `docker-compose.yml` |
| `inventory-ops-db` | inventory | inventory | `docker-compose.yml` |

**Action Required:**
1. Generate strong passwords (minimum 32 characters, alphanumeric + special)
2. Update `docker-compose.yml` or use environment variable overrides
3. Update corresponding `DATABASE_URL` values in all services

### Saleor Admin Credentials

Scripts like `sync-meilisearch.py` require admin credentials via environment variables:

```bash
export SALEOR_ADMIN_EMAIL='your-admin@email.com'
export SALEOR_ADMIN_PASSWORD='strong-password-here'
```

**Never commit credentials to version control.**

### Stripe App

The Stripe app requires a `SECRET_KEY` for encrypting API keys:

```bash
# Generate a 64-character hex string
openssl rand -hex 32
```

Set via environment variable, not in docker-compose.yml for production.

### Meilisearch

In development, Meilisearch runs without authentication. For production:

```yaml
environment:
  - MEILI_MASTER_KEY=your-secure-master-key-here
```

## Environment Variables Summary

| Variable | Service | Required For |
|----------|---------|--------------|
| `SALEOR_ADMIN_EMAIL` | Scripts | Meilisearch sync, data operations |
| `SALEOR_ADMIN_PASSWORD` | Scripts | Meilisearch sync, data operations |
| `SECRET_KEY` | Saleor API | Session security |
| `SECRET_KEY` | Stripe App | API key encryption |
| `SECRET_KEY` | Inventory Ops | Session security |
| `MEILI_MASTER_KEY` | Meilisearch | API authentication |

## Network Security

### Internal Network

All backend services communicate on `saleor-backend-tier`. Ensure this network is not exposed externally.

### External Ports

Review which ports are exposed in production:

| Port | Service | Recommendation |
|------|---------|----------------|
| 8000 | Saleor API | Proxy through nginx/cloudflare |
| 3000 | Storefront | Proxy through nginx/cloudflare |
| 9000 | Dashboard | Restrict to admin IPs |
| 5432 | PostgreSQL | **Do not expose** |
| 6379 | Valkey/Redis | **Do not expose** |
| 7700 | Meilisearch | Restrict or proxy |

### ALLOWED_HOSTS

Update `ALLOWED_HOSTS` in backend.env to include only production domains:

```bash
ALLOWED_HOSTS=your-domain.com,api.your-domain.com
```

## HTTPS / TLS

All production traffic MUST use HTTPS:

1. Set `NEXT_PUBLIC_STOREFRONT_URL` to `https://...`
2. Configure SSL certificates (Let's Encrypt, Cloudflare, etc.)
3. Enable HSTS headers

## Audit Trail

Enable logging for security-sensitive operations:

- Saleor: Configure OpenTelemetry export to persistent storage
- Database: Enable audit logging for privileged operations
- App logs: Forward to centralized logging (e.g., CloudWatch, Datadog)

## Checklist Before Go-Live

- [ ] All default passwords changed
- [ ] Environment secrets not in version control
- [ ] Database ports not exposed externally
- [ ] HTTPS configured for all public endpoints
- [ ] ALLOWED_HOSTS configured correctly
- [ ] Meilisearch authentication enabled
- [ ] Admin dashboard access restricted
- [ ] Backup strategy implemented
- [ ] Log aggregation configured
