# Staging Storefront Loading Diagnosis

**Date**: 2026-01-17 ~23:00 PST
**Environment**: staging
**Issue**: Webstore not fully loading - assets timing out

---

## Diagnostic Summary

| Check | Status | Notes |
|-------|--------|-------|
| ECS Services Running | ✅ | API: COMPLETED, Storefront: FAILED (cosmetic) |
| ALB Targets Healthy | ✅ | Both storefront and API show `healthy` |
| /api/health | ✅ | HTTP 200 |
| /health/ (API) | ✅ | HTTP 200 |
| GraphQL Introspection | ✅ | Working |
| Products Query | ⚠️ | Returns 0 products (empty DB) |
| Storefront Logs | ✅ | No errors |
| API Logs | ✅ | No errors |
| Env Vars | ✅ | API URLs configured correctly |
| **Static Assets** | ❌ | **ERR_CONNECTION_TIMED_OUT** |

---

## Root Causes Identified

### Issue 1: HTTPS Upgrade on HTTP-Only ALB (PRIMARY)

**Symptom**: Browser shows `ERR_CONNECTION_TIMED_OUT` for fonts, images, JS files.

**Cause**:
- CSP header includes `upgrade-insecure-requests` when `NODE_ENV=production`
- Staging ALB only has HTTP listener (port 80), no HTTPS (port 443)
- Browser obeys CSP, upgrades HTTP→HTTPS, HTTPS times out

**Evidence**:
```
# CSP header from staging
upgrade-insecure-requests

# ALB listeners
+-------+------------+
| Port  | Protocol   |
+-------+------------+
|  80   |  HTTP      |
+-------+------------+

# Assets load fine over HTTP
curl http://...alb.../favicon.ico  → HTTP 200, 3582 bytes
curl http://...alb.../brand/logo-rolland-full-color.png  → HTTP 200, 295234 bytes

# But browser requests HTTPS (due to CSP) → timeout
https://...alb.../favicon.ico  → ERR_CONNECTION_TIMED_OUT
```

### Issue 2: Empty Product Catalog (SECONDARY)

The staging database has no products:
- Products: 0
- Categories: 1 (Default Category only)
- Collections: 0

---

## Fix Applied

### Storefront Middleware Update

Modified `storefront/src/middleware.ts` to respect `ENABLE_HTTPS` env var:

```typescript
// Before
process.env.NODE_ENV === 'production' ? "upgrade-insecure-requests" : ""

// After
process.env.NODE_ENV === 'production' && process.env.ENABLE_HTTPS !== 'false'
  ? "upgrade-insecure-requests" : ""
```

### Terraform Updates

1. Added `enable_https` variable to:
   - `infra/terraform/variables.tf`
   - `infra/terraform/modules/ecs/variables.tf`

2. Added env var to ECS task definition:
   - `infra/terraform/modules/ecs/main.tf` (storefront container)

3. Set `enable_https = false` in:
   - `infra/terraform/environments/staging.tfvars`

---

## Deployment Steps

To apply the fix:

```bash
# 1. Rebuild and push storefront image
cd storefront
docker build -t storefront:staging-fix .
docker tag storefront:staging-fix <ECR_URL>:staging-latest
docker push <ECR_URL>:staging-latest

# 2. Apply terraform to update task definition
cd infra/terraform
terraform plan -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars

# 3. Force new deployment
aws ecs update-service \
  --cluster saleor-platform-staging \
  --service storefront \
  --force-new-deployment \
  --region us-west-1
```

---

## Alternative: Add HTTPS to Staging

For a production-like staging environment, add HTTPS listener:

1. Create ACM certificate for staging domain
2. Add Route53 records pointing to ALB
3. Update terraform:
   ```hcl
   create_acm_certificate = true
   route53_zone_id = "Z..."
   use_https_urls = true
   enable_https = true  # keep default
   ```

---

## Files Modified

| File | Change |
|------|--------|
| `storefront/src/middleware.ts` | Check `ENABLE_HTTPS` env var |
| `infra/terraform/variables.tf` | Add `enable_https` variable |
| `infra/terraform/modules/ecs/variables.tf` | Add `enable_https` variable |
| `infra/terraform/modules/ecs/main.tf` | Pass `ENABLE_HTTPS` to container |
| `infra/terraform/environments/staging.tfvars` | Set `enable_https = false` |
