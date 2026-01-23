# Production Secrets Manifest

**Created:** 2026-01-23
**Source:** ISSUE-005 remediation
**Purpose:** Define all secrets required for production deployment

---

## Overview

This document catalogs all secrets required for production deployment of the Saleor Hobby Gaming Platform. All secrets must be provisioned in AWS Secrets Manager before production deployment.

**Development Note:** Local development uses `.env` file with development-only secrets. These must NEVER be used in production.

---

## Required Secrets (AWS Secrets Manager)

### Application Secrets

| Secret Path | Description | Rotation Policy | Generation |
|-------------|-------------|-----------------|------------|
| `saleor/prod/SECRET_KEY` | Django cryptographic signing key | 90 days | `openssl rand -hex 32` |
| `saleor/prod/STRIPE_APP_SECRET_KEY` | Saleor-Stripe app webhook signing | On compromise | `openssl rand -hex 32` |
| `saleor/prod/INVENTORY_OPS_SECRET_KEY` | Inventory operations app signing | 90 days | `openssl rand -hex 32` |
| `saleor/prod/BUYLIST_SECRET_KEY` | Buylist app webhook signing | 90 days | `openssl rand -hex 32` |
| `saleor/prod/POS_SECRET_KEY` | POS app webhook signing | 90 days | `openssl rand -hex 32` |

### Database Credentials

| Secret Path | Description | Rotation Policy | Notes |
|-------------|-------------|-----------------|-------|
| `saleor/prod/db/credentials` | Main Saleor RDS credentials | 30 days | Use RDS Secrets Manager rotation |
| `saleor/prod/inventory-db/credentials` | Inventory ops RDS credentials | 30 days | Use RDS Secrets Manager rotation |

### External Service Keys

| Secret Path | Description | Rotation Policy | Notes |
|-------------|-------------|-----------------|-------|
| `saleor/prod/stripe/secret_key` | Stripe API secret key | As needed | From Stripe Dashboard |
| `saleor/prod/stripe/webhook_secret` | Stripe webhook signing secret | As needed | From Stripe Dashboard |
| `saleor/prod/meilisearch/master_key` | Meilisearch master key | 90 days | `openssl rand -hex 32` |

---

## Generation Commands

### Generate Hex Secrets (256-bit)

```bash
# Single secret
openssl rand -hex 32

# Generate all required app secrets at once
for key in SECRET_KEY STRIPE_APP_SECRET_KEY INVENTORY_OPS_SECRET_KEY BUYLIST_SECRET_KEY POS_SECRET_KEY MEILISEARCH_MASTER_KEY; do
  echo "$key=$(openssl rand -hex 32)"
done
```

### Create in AWS Secrets Manager

```bash
# Single secret
aws secretsmanager create-secret \
  --name saleor/prod/SECRET_KEY \
  --secret-string "$(openssl rand -hex 32)" \
  --tags Key=Environment,Value=production Key=Application,Value=saleor

# With rotation enabled (for database credentials)
aws secretsmanager create-secret \
  --name saleor/prod/db/credentials \
  --secret-string '{"username":"saleor","password":"GENERATED_PASSWORD"}' \
  --tags Key=Environment,Value=production
```

---

## ECS Task Definition Integration

Secrets are injected into ECS tasks via `secrets` block:

```json
{
  "containerDefinitions": [
    {
      "name": "saleor-api",
      "secrets": [
        {
          "name": "SECRET_KEY",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:saleor/prod/SECRET_KEY"
        },
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:saleor/prod/db/credentials"
        }
      ]
    }
  ]
}
```

---

## Terraform Integration

Reference in Terraform:

```hcl
data "aws_secretsmanager_secret_version" "secret_key" {
  secret_id = "saleor/prod/SECRET_KEY"
}

resource "aws_ecs_task_definition" "api" {
  # ...
  container_definitions = jsonencode([
    {
      secrets = [
        {
          name      = "SECRET_KEY"
          valueFrom = data.aws_secretsmanager_secret_version.secret_key.arn
        }
      ]
    }
  ])
}
```

---

## Pre-Deployment Checklist

Before first production deployment:

- [ ] All secrets created in AWS Secrets Manager
- [ ] IAM roles have `secretsmanager:GetSecretValue` permission
- [ ] VPC endpoints configured for Secrets Manager access
- [ ] Rotation lambdas deployed for database credentials
- [ ] Local development `.env` secrets are NOT used in production
- [ ] Stripe webhook endpoint configured with production URL
- [ ] Meilisearch master key set in production environment

---

## Security Notes

1. **Never log secrets** - Ensure no application logs include secret values
2. **Least privilege** - Each service only accesses secrets it needs
3. **Audit trail** - All secret access is logged in CloudTrail
4. **Rotation** - Automated rotation prevents credential staleness
5. **Encryption** - All secrets encrypted at rest with KMS

---

## Related Documentation

- `ENV_VARS.md` - Full environment variable reference
- `MANUAL_STEPS.md` - Manual deployment steps
- `../../../.env.example` - Development environment template
- ISSUE-005 - Production readiness security issue
