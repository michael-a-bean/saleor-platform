# Staging Deployment Verification Checklist

**Date:** 2026-01-15
**Related:** `docs/ops/staging_deploy_blocker_audit.md`

---

## Pre-Deploy Checks

### Infrastructure

- [ ] `terraform plan -var-file=environments/staging.tfvars` shows no errors
- [ ] All SSM parameters exist:
  ```bash
  aws ssm get-parameters-by-path --path "/saleor/staging" --recursive --query 'Parameters[].Name' --output table --region us-west-1
  ```
  Expected parameters:
  - `/saleor/staging/api/SECRET_KEY`
  - `/saleor/staging/api/DATABASE_URL`
  - `/saleor/staging/api/CELERY_BROKER_URL`
  - `/saleor/staging/api/RSA_PRIVATE_KEY`
  - `/saleor/staging/apps/SECRET_KEY`
  - `/saleor/staging/apps/stripe/STRIPE_SECRET_KEY`
  - `/saleor/staging/apps/stripe/STRIPE_WEBHOOK_SECRET`
  - `/saleor/staging/apps/inventory-ops/DATABASE_URL`

### GitHub Actions

- [ ] `SUBMODULES_TOKEN` secret exists and has access to:
  - `michael-a-bean/saleor-platform`
  - `michael-a-bean/saleor-apps`
  - `michael-a-bean/saleor-app-inventory-ops`
  - `michael-a-bean/saleor-app-buylist`
  - `michael-a-bean/saleor-app-pos`
  - `michael-a-bean/saleor-app-price-sync`
- [ ] Repository variables set:
  - `AWS_ACCOUNT_ID`
  - `STAGING_API_URL`
  - `STAGING_STOREFRONT_URL`
  - `STAGING_DASHBOARD_URL`
  - `STAGING_ECS_TASK_SUBNETS`
  - `STAGING_ECS_TASK_SECURITY_GROUPS`

---

## Post-Deploy Checks

### ECS Services

```bash
# Check all services are running
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services api worker storefront dashboard stripe inventory-ops buylist pos \
  --query 'services[].{name:serviceName,status:status,running:runningCount,desired:desiredCount}' \
  --output table \
  --region us-west-1
```

- [ ] API service: `runningCount == desiredCount`
- [ ] Worker service: `runningCount == desiredCount`
- [ ] Storefront service: `runningCount == desiredCount`
- [ ] Dashboard service: `runningCount == desiredCount`
- [ ] Stripe app: `runningCount == desiredCount`
- [ ] Inventory-ops app: `runningCount == desiredCount`
- [ ] Buylist app: `runningCount == desiredCount`
- [ ] POS app: `runningCount == desiredCount`

### Health Checks

Base URL: `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com`

```bash
BASE_URL="http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

# Test each endpoint
curl -s "$BASE_URL/health/" | jq .
curl -s "$BASE_URL/api/health" | jq .
curl -s "$BASE_URL/apps/stripe/api/health" | jq .
curl -s "$BASE_URL/apps/inventory/api/health" | jq .
curl -s "$BASE_URL/apps/buylist/api/health" | jq .
curl -s "$BASE_URL/apps/pos/api/health" | jq .
```

- [ ] API health: `/health/` returns 200
- [ ] Storefront health: `/api/health` returns 200
- [ ] Stripe app: `/apps/stripe/api/health` returns 200
- [ ] Inventory-ops: `/apps/inventory/api/health` returns 200
- [ ] Buylist: `/apps/buylist/api/health` returns 200
- [ ] POS: `/apps/pos/api/health` returns 200

### GraphQL API

```bash
# Test GraphQL introspection
curl -s "$BASE_URL/graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { queryType { name } } }"}' | jq .
```

- [ ] GraphQL introspection works
- [ ] No authentication errors for public queries

### Dashboard

- [ ] Dashboard loads at `/dashboard/`
- [ ] No JavaScript errors in console
- [ ] No localhost references in Network tab
- [ ] Can navigate to Apps section

### Storefront

- [ ] Storefront loads at `/`
- [ ] No "Something went wrong" errors
- [ ] Product pages load correctly
- [ ] No currency/pricing crashes

### App Iframe Rendering

In Dashboard > Apps, click each installed app:

- [ ] Stripe app loads (not blank)
- [ ] Inventory-ops app loads (not blank)
- [ ] Buylist app loads (not blank)
- [ ] POS app loads (not blank)

**If blank pages appear, check:**
1. Browser DevTools > Console for errors
2. Browser DevTools > Network for failed requests
3. `X-Frame-Options` or `Content-Security-Policy` headers
4. App manifest `appUrl` matches actual deployment URL

### CloudWatch Logs

```bash
# Verify logs are flowing
aws logs tail /ecs/saleor-platform-staging/api --since 5m --region us-west-1
aws logs tail /ecs/saleor-platform-staging/storefront --since 5m --region us-west-1
aws logs tail /ecs/saleor-platform-staging/stripe-app --since 5m --region us-west-1
```

- [ ] API logs visible in CloudWatch
- [ ] Storefront logs visible in CloudWatch
- [ ] App logs visible in CloudWatch
- [ ] No ERROR or FATAL level logs

---

## Rollback Procedure

If deployment fails:

```bash
# 1. Identify the last working task definition revision
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services <failing-service> \
  --query 'services[].deployments[?status==`ACTIVE`].taskDefinition' \
  --region us-west-1

# 2. Rollback to previous revision
aws ecs update-service \
  --cluster saleor-platform-staging \
  --service <failing-service> \
  --task-definition <previous-task-definition-arn> \
  --region us-west-1
```

---

## Known Issues

| Issue | Workaround | Tracking |
|-------|------------|----------|
| FileAPL ephemeral storage | Re-install app after deploy | H1 in audit |
| crypto.randomUUID in HTTP | Use HTTPS or add polyfill | H2 in audit |

---

## Contact

For deployment issues, check:
- `docs/ops/staging_deploy_blocker_audit.md` - Full issue list
- `docs/ops/runbooks/staging-apply-and-verify.md` - Manual deployment steps
- `docs/ops/runbooks/apps-iframe-rendering.md` - Blank iframe troubleshooting
