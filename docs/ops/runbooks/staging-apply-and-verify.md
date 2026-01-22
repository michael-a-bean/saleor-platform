# Staging Apply and Verify Runbook

Operator runbook for deploying and verifying the staging environment.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform installed (version 1.0+)
- `jq` installed for JSON parsing
- Access to the `platform/main` branch

## Current Configuration

| Item | Value |
|------|-------|
| **ALB Base URL** | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com` |
| **AWS Region** | `us-west-1` |
| **ECS Cluster** | `saleor-platform-staging` |
| **Dashboard API Env Var** | `API_URL` (not `API_URI`) |
| **Saleor API Version** | 3.22 |
| **Dashboard Version** | 3.22.24 |

---

## 1. Terraform Apply (Manual)

Use this section when applying Terraform changes directly (outside of CI/CD).

### 1.1 Plan Changes

```bash
cd /home/michael/saleor-platform/infra/terraform

# Generate plan
terraform plan -var-file=environments/staging.tfvars -out=staging.tfplan
```

Review the plan output carefully before proceeding.

### 1.2 Apply Changes

```bash
terraform apply staging.tfplan
```

### 1.3 Capture Outputs

After apply, capture key outputs for reference:

```bash
# Get ALB DNS name
terraform output alb_dns_name

# Get all public URLs
terraform output api_url
terraform output storefront_url
terraform output dashboard_url
terraform output api_graphql_url

# Get ECS task networking (needed for GitHub Actions)
terraform output ecs_task_subnets
terraform output ecs_task_security_group
```

---

## 2. GitHub Actions Deployment

The primary deployment method is via GitHub Actions.

### 2.1 Trigger Deployment

**Automatic:** Push to `platform/main` triggers the workflow.

**Manual:** Go to Actions → "Deploy to Staging" → "Run workflow"

### 2.2 Monitor Workflow

1. Navigate to: https://github.com/michael-a-bean/saleor-platform/actions
2. Select the "Deploy to Staging" workflow run
3. Monitor jobs in order:
   - `build` - Builds and pushes container images
   - `migrate` - Runs Django and Prisma migrations
   - `deploy` - Deploys API, worker, storefront, dashboard
   - `deploy-apps` - Deploys Saleor apps (stripe, inventory-ops, buylist, pos)
   - `validate-urls` - Validates configured URLs are reachable
   - `smoke-test` - Runs post-deploy smoke tests

### 2.3 Verify Workflow Success

All jobs should show green checkmarks. Check the summary for deployment details.

---

## 3. CLI Post-Deploy Verification

Run these commands to verify the deployment is healthy.

### 3.1 ECS Service Health

```bash
# Check all service statuses
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services api worker storefront dashboard \
  --query 'services[].{Service:serviceName,Status:status,Running:runningCount,Desired:desiredCount}' \
  --output table \
  --region us-west-1
```

Expected: All services show `ACTIVE` status with `Running == Desired`.

### 3.2 API Health Check

```bash
curl -s http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/health/
```

Expected: `{"status": "ok"}` or similar healthy response.

### 3.3 GraphQL Endpoint Test

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' \
  http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/
```

Expected: `{"data":{"__typename":"Query"}}`

### 3.4 Channel Query Test

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ channels { slug name isActive } }"}' \
  http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/ | jq
```

Expected: JSON response listing available channels.

### 3.5 Storefront Health

```bash
curl -s -o /dev/null -w "%{http_code}" \
  http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/
```

Expected: `200`

### 3.6 Dashboard Accessibility

```bash
curl -s -o /dev/null -w "%{http_code}" \
  http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard/
```

Expected: `200`

---

## 4. Browser DevTools Verification

This section confirms the dashboard is correctly configured and NOT calling localhost.

### 4.1 Open Dashboard

1. Navigate to: `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard/`
2. Open browser DevTools (F12 or Cmd+Option+I)

### 4.2 Check Network Tab

1. Go to the **Network** tab
2. Filter by "graphql" or "XHR"
3. Refresh the page

**Verify:**
- All GraphQL requests go to: `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/`
- **NO requests to `localhost:8000`** or `127.0.0.1`

### 4.3 Check Console Tab

1. Go to the **Console** tab
2. Look for any errors related to:
   - CORS issues
   - Connection refused
   - Network errors

**Expected:** No connection errors. Some warnings are acceptable.

### 4.4 Verify API_URL in Dashboard Config

In the Network tab, look for the initial HTML or config request:

1. Find the dashboard HTML response
2. Search for `API_URL` or the GraphQL endpoint
3. Confirm it shows the ALB URL, not localhost

Alternatively, in Console:

```javascript
// Type in console to check config (if exposed)
window.__SALEOR_CONFIG__ || console.log("Config not exposed in window")
```

---

## 5. Troubleshooting

### Dashboard Shows localhost:8000

**Cause:** `API_URL` environment variable not set correctly in ECS task definition.

**Fix:**
1. Verify Terraform has correct `public_api_base_url` in staging.tfvars
2. Re-run `terraform apply`
3. Force new deployment of dashboard service:
   ```bash
   aws ecs update-service \
     --cluster saleor-platform-staging \
     --service dashboard \
     --force-new-deployment \
     --region us-west-1
   ```

### GraphQL Returns 502/503

**Cause:** API service not healthy or target group misconfigured.

**Debug:**
```bash
# Check API service events
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services api \
  --query 'services[0].events[:5]' \
  --region us-west-1

# Check API task logs
aws logs tail /ecs/saleor-platform-staging/api --since 10m --region us-west-1
```

### ECS Service Stuck in PROVISIONING

**Cause:** Security group, subnet, or IAM issues.

**Debug:**
```bash
# Check service events for error messages
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services api \
  --query 'services[0].events[:10].[createdAt,message]' \
  --output text \
  --region us-west-1
```

---

## 6. Quick Validation Script

Run this to perform all CLI checks at once:

```bash
#!/usr/bin/env bash
ALB="http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

echo "=== Staging Verification ==="

echo -n "API Health: "
curl -s "${ALB}/health/" | head -c 50
echo ""

echo -n "GraphQL: "
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' "${ALB}/graphql/" | head -c 50
echo ""

echo -n "Storefront: HTTP "
curl -s -o /dev/null -w "%{http_code}" "${ALB}/"
echo ""

echo -n "Dashboard: HTTP "
curl -s -o /dev/null -w "%{http_code}" "${ALB}/dashboard/"
echo ""

echo "=== Done ==="
```

---

## References

- **Terraform config:** `infra/terraform/environments/staging.tfvars`
- **ECS module:** `infra/terraform/modules/ecs/main.tf`
- **Deploy workflow:** `.github/workflows/deploy-staging.yml`
- **Environment variables:** `docs/deploy/aws/ENV_VARS.md`
- **Smoke test script:** `scripts/deploy/aws/smoke-test.sh`
- **URL validation script:** `scripts/deploy/aws/validate-urls.sh`
