# AWS Deployment Scripts

Scripts for deploying Saleor Platform to AWS ECS/Fargate.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Access to ECR, ECS, and RDS
- jq installed for JSON processing

## Scripts

| Script | Purpose |
|--------|---------|
| `deploy-service.sh` | Deploy a single ECS service with new image |
| `run-migrations.sh` | Run database migrations as ECS one-off task |
| `smoke-test.sh` | Run health checks against deployed services |
| `rollback.sh` | Rollback ECS service to previous task definition |

## Usage

### Deploy a Service

```bash
# Deploy storefront to staging
./deploy-service.sh staging storefront abc1234

# Deploy API to production
./deploy-service.sh production api abc1234
```

### Run Migrations

```bash
# Run Django migrations on staging
./run-migrations.sh staging django

# Run Prisma migrations on production
./run-migrations.sh production prisma
```

### Smoke Tests

```bash
# Test staging environment
STAGING_API_URL=https://api.staging.example.com ./smoke-test.sh staging

# Test production environment
PRODUCTION_API_URL=https://api.example.com ./smoke-test.sh production
```

### Rollback

```bash
# Rollback all services on production
./rollback.sh production

# Rollback specific service
./rollback.sh production api
```

## Environment Variables

The scripts use GitHub Actions variables. For local testing, export:

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-west-2
export STAGING_API_URL=https://api.staging.example.com
export STAGING_STOREFRONT_URL=https://www.staging.example.com
```
