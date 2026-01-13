# Saleor App Installation - Staging Environment

This document describes how to install Saleor apps in the staging environment after infrastructure deployment.

## Prerequisites

1. SSM parameters must be bootstrapped (see Bootstrap section below)
2. ECS infrastructure must be deployed via Terraform
3. Prisma migrations must be run for inventory apps
4. Apps must be running and healthy (check ALB target group health)
5. Saleor API must be running

## Bootstrap: SSM Parameters

Before the first deployment, bootstrap the required SSM parameters:

```bash
# From the repository root
./scripts/deploy/aws/bootstrap-app-secrets.sh staging
```

Then update the placeholder values with real secrets:
- Stripe API keys from your Stripe dashboard
- Database password matching your RDS configuration

## Bootstrap: Inventory Database

The inventory-ops, buylist, and POS apps share a PostgreSQL database. Create it and run migrations:

```bash
# Connect to RDS and create database
psql -h RDS_ENDPOINT -U saleor -d postgres
CREATE DATABASE inventory_ops;
CREATE USER inventory WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE inventory_ops TO inventory;

# Run Prisma migrations (from CI or manually)
# This happens automatically in the deploy-staging workflow
```

## App URLs (Staging)

| App | Manifest URL |
|-----|-------------|
| Stripe | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe/api/manifest` |
| Inventory Ops | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/inventory/api/manifest` |
| Buylist | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/buylist/api/manifest` |
| POS | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/pos/api/manifest` |

## Installation Methods

### Method 1: Saleor Dashboard (Recommended)

1. Navigate to the Saleor Dashboard:
   ```
   http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard
   ```

2. Go to **Apps** → **Install external app**

3. Enter the manifest URL for the app (see table above)

4. Click **Install**

5. The app will register and receive its auth token

### Method 2: GraphQL API

Use the `appInstall` mutation:

```graphql
mutation InstallApp($input: AppInstallInput!) {
  appInstall(input: $input) {
    appInstallation {
      id
      status
      appName
      manifestUrl
    }
    errors {
      field
      message
      code
    }
  }
}
```

Variables:
```json
{
  "input": {
    "appName": "Stripe",
    "manifestUrl": "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe/api/manifest",
    "permissions": ["MANAGE_PAYMENTS", "HANDLE_PAYMENTS"]
  }
}
```

## Required Permissions by App

### Stripe App
- `MANAGE_PAYMENTS`
- `HANDLE_PAYMENTS`
- `MANAGE_ORDERS`

### Inventory Ops App
- `MANAGE_PRODUCTS`
- `MANAGE_STOCK`
- `MANAGE_ORDERS`

### Buylist App
- `MANAGE_PRODUCTS`
- `MANAGE_ORDERS`
- `MANAGE_CUSTOMERS`

### POS App
- `MANAGE_ORDERS`
- `MANAGE_CHECKOUTS`
- `MANAGE_CUSTOMERS`
- `MANAGE_PRODUCTS`
- `MANAGE_STAFF`

## Post-Installation: Store Secrets

After app installation, Saleor generates authentication tokens. These are stored by the app using the APL (App Persistence Layer).

For AWS deployment, the following secrets must be configured in AWS SSM Parameter Store:

### Common Secrets (All Apps)
```bash
# Secret key for JWT signing (shared across apps)
aws ssm put-parameter \
  --name "/saleor/staging/apps/SECRET_KEY" \
  --type "SecureString" \
  --value "$(openssl rand -hex 32)"
```

### Stripe App Secrets
```bash
# Stripe API keys (get from Stripe Dashboard)
aws ssm put-parameter \
  --name "/saleor/staging/apps/stripe/STRIPE_SECRET_KEY" \
  --type "SecureString" \
  --value "sk_test_..."

aws ssm put-parameter \
  --name "/saleor/staging/apps/stripe/STRIPE_WEBHOOK_SECRET" \
  --type "SecureString" \
  --value "whsec_..."
```

### Inventory Ops / Buylist / POS Database
```bash
# Shared database URL for inventory apps
aws ssm put-parameter \
  --name "/saleor/staging/apps/inventory-ops/DATABASE_URL" \
  --type "SecureString" \
  --value "postgresql://inventory:PASSWORD@rds-endpoint:5432/inventory_ops"
```

## Verification

After installation, verify each app:

1. **Check App Status**:
   ```bash
   curl -s http://ALB-URL/apps/stripe/api/health | jq
   ```
   Expected: `{"status": "healthy"}`

2. **Check Saleor Registration**:
   In Dashboard → Apps, verify the app shows as "Active"

3. **Test Webhooks** (for Stripe):
   Create a test checkout and verify Stripe app receives payment webhook

## Redeploy After Installation

If you need to update app configuration after installation:

1. Update SSM parameters
2. Force new deployment:
   ```bash
   aws ecs update-service \
     --cluster saleor-platform-staging \
     --service stripe \
     --force-new-deployment
   ```

## Troubleshooting

### App Installation Fails

1. Check app is reachable:
   ```bash
   curl -v http://ALB-URL/apps/stripe/api/manifest
   ```

2. Check ALB target group health in AWS Console

3. Check CloudWatch logs for the app

### Webhook Delivery Fails

1. Verify Saleor can reach the app URL
2. Check app logs for webhook processing errors
3. Verify app auth token is valid (re-install if needed)

### Database Connection Fails

1. Verify DATABASE_URL is correctly set in SSM
2. Check security group allows RDS access from ECS tasks
3. Verify database exists and migrations are run
