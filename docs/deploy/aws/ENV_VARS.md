# AWS Environment Variables Guide

This document enumerates all environment variables required for the Saleor Platform AWS deployment.

## SSM Parameter Store Naming Convention

All secrets are stored in AWS Systems Manager Parameter Store with the following path pattern:

```
/saleor/<environment>/<service>/<variable_name>
```

Examples:
- `/saleor/staging/api/SECRET_KEY`
- `/saleor/production/api/DATABASE_URL`
- `/saleor/staging/stripe-app/SECRET_KEY`

## Variables by Service

### API Service (`api`)

| Variable | Source | Type | Description |
|----------|--------|------|-------------|
| `SECRET_KEY` | SSM | SecureString | Django secret key (generate: `openssl rand -hex 32`) |
| `DATABASE_URL` | SSM | SecureString | PostgreSQL connection string |
| `CELERY_BROKER_URL` | SSM | SecureString | Redis URL for Celery (e.g., `redis://host:6379/1`) |
| `DEBUG` | Plain | String | `false` for staging/production |
| `ALLOWED_HOSTS` | Plain | String | Comma-separated list (e.g., `api.example.com,localhost`) |
| `DEFAULT_CHANNEL_SLUG` | Plain | String | `webstore` |
| `AWS_STORAGE_BUCKET_NAME` | Plain | String | S3 media bucket name |
| `AWS_S3_REGION_NAME` | Plain | String | S3 bucket region |
| `DASHBOARD_URL` | Plain | String | Dashboard URL (e.g., `https://dashboard.example.com/`) |
| `ENABLE_ACCOUNT_CONFIRMATION_BY_EMAIL` | Plain | String | `true` or `false` |

**SSM Paths:**
```
/saleor/{env}/api/SECRET_KEY
/saleor/{env}/api/DATABASE_URL
/saleor/{env}/api/CELERY_BROKER_URL
```

### Worker Service (`worker`)

Uses the same variables as API (shares configuration).

### Storefront (`storefront`)

| Variable | Source | Type | Description |
|----------|--------|------|-------------|
| `NEXT_PUBLIC_SALEOR_API_URL` | Build-time | String | Public GraphQL endpoint |
| `NEXT_PUBLIC_STOREFRONT_URL` | Build-time | String | Storefront URL |
| `NEXT_PUBLIC_DEFAULT_CHANNEL` | Build-time | String | Default channel slug |
| `SALEOR_API_URL` | Runtime | String | Internal API URL (for SSR) |
| `MEILISEARCH_URL` | Runtime | String | Meilisearch endpoint |

**Note:** `NEXT_PUBLIC_*` variables are baked into the image at build time.

### Dashboard (`dashboard`)

| Variable | Source | Type | Description |
|----------|--------|------|-------------|
| `API_URI` | Plain | String | GraphQL endpoint URL |

### Stripe App (`stripe-app`)

| Variable | Source | Type | Description |
|----------|--------|------|-------------|
| `SECRET_KEY` | SSM | SecureString | App secret key |
| `ALLOWED_DOMAIN_PATTERN` | Plain | String | Domain regex for CORS |
| `APP_IFRAME_BASE_URL` | Plain | String | App iframe URL |
| `APP_API_BASE_URL` | Plain | String | App API URL |
| `APP_LOG_LEVEL` | Plain | String | `info` or `debug` |
| `APL` | Plain | String | `dynamodb` |
| `AWS_REGION` | Plain | String | DynamoDB region |
| `DYNAMODB_MAIN_TABLE_NAME` | Plain | String | DynamoDB table name |

**SSM Paths:**
```
/saleor/{env}/stripe-app/SECRET_KEY
```

### Inventory Ops App (`inventory-ops-app`)

| Variable | Source | Type | Description |
|----------|--------|------|-------------|
| `SECRET_KEY` | SSM | SecureString | App secret key |
| `DATABASE_URL` | SSM | SecureString | PostgreSQL connection string |
| `ALLOWED_DOMAIN_PATTERN` | Plain | String | Domain regex |
| `APP_IFRAME_BASE_URL` | Plain | String | App iframe URL |
| `APP_API_BASE_URL` | Plain | String | App API URL |
| `APP_LOG_LEVEL` | Plain | String | Log level |
| `DEFAULT_CURRENCY` | Plain | String | `USD` |

**SSM Paths:**
```
/saleor/{env}/inventory-ops-app/SECRET_KEY
/saleor/{env}/inventory-ops-app/DATABASE_URL
```

### Buylist App (`buylist-app`)

Same as Inventory Ops App, plus:

| Variable | Source | Type | Description |
|----------|--------|------|-------------|
| `DEFAULT_CHANNEL_SLUG` | Plain | String | `webstore` |
| `SCRYFALL_API_BASE_URL` | Plain | String | `https://api.scryfall.com` |
| `SCRYFALL_RATE_LIMIT_MS` | Plain | String | `100` |

**SSM Paths:**
```
/saleor/{env}/buylist-app/SECRET_KEY
/saleor/{env}/buylist-app/DATABASE_URL
```

### POS App (`pos-app`)

Same as Inventory Ops App.

**SSM Paths:**
```
/saleor/{env}/pos-app/SECRET_KEY
/saleor/{env}/pos-app/DATABASE_URL
```

## Secrets Manager (Rotation-Capable)

Use AWS Secrets Manager for credentials that benefit from automatic rotation:

| Secret | Path | Description |
|--------|------|-------------|
| RDS Master Password | `saleor/{env}/rds-master-password` | Database admin password |

## Creating SSM Parameters

### Via AWS CLI

```bash
# Create SecureString parameter
aws ssm put-parameter \
    --name "/saleor/staging/api/SECRET_KEY" \
    --type "SecureString" \
    --value "your-secret-value-here" \
    --description "Django secret key for Saleor API"

# Create String parameter
aws ssm put-parameter \
    --name "/saleor/staging/api/DEBUG" \
    --type "String" \
    --value "false"
```

### Required Parameters Checklist

For a new environment, create these SSM parameters:

```bash
# API/Worker (shared)
/saleor/{env}/api/SECRET_KEY          # SecureString
/saleor/{env}/api/DATABASE_URL        # SecureString
/saleor/{env}/api/CELERY_BROKER_URL   # SecureString

# Stripe App
/saleor/{env}/stripe-app/SECRET_KEY   # SecureString

# Inventory Ops App
/saleor/{env}/inventory-ops-app/SECRET_KEY    # SecureString
/saleor/{env}/inventory-ops-app/DATABASE_URL  # SecureString

# Buylist App
/saleor/{env}/buylist-app/SECRET_KEY    # SecureString
/saleor/{env}/buylist-app/DATABASE_URL  # SecureString

# POS App
/saleor/{env}/pos-app/SECRET_KEY    # SecureString
/saleor/{env}/pos-app/DATABASE_URL  # SecureString
```

## Database URL Formats

**Saleor (main database):**
```
postgresql://saleor:<password>@<rds-endpoint>:5432/saleor
```

**Inventory Ops (shared by inventory-ops, buylist, pos):**
```
postgresql://inventory:<password>@<rds-endpoint>:5432/inventory_ops
```

## Redis/Celery URL Format

**Application Cache:**
```
redis://<elasticache-endpoint>:6379/0
```

**Celery Broker:**
```
redis://<elasticache-endpoint>:6379/1
```

If using separate ElastiCache clusters (production):
```
# Cache
redis://<cache-endpoint>:6379/0

# Broker
redis://<broker-endpoint>:6379/0
```
