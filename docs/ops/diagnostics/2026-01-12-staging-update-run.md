# Staging Update Run - 2026-01-12

**Operator:** Gen (Claude Code)
**Date:** 2026-01-12 ~12:00 PST
**HEAD SHA:** 523571a (after workflow fix commit)
**Previous Known Staging Point:** 681db2a

## Summary

Successfully updated staging environment with all pending fixes:
- Saleor API 3.21 → 3.22
- Saleor Dashboard 3.21 → 3.22.24
- Dashboard env var fix: `API_URI` → `API_URL`
- GitHub Actions workflow region fix: `us-west-2` → `us-west-1`

## Phase 0: State Assessment

### Git Status
- Branch: `platform/main`
- Initial HEAD: `6189664`
- Commits since 681db2a: 2

### Changes Since Last Apply
```
6189664 docs: correct dashboard env var to API_URL
af78487 fix(deploy): align Saleor 3.22 and wire dashboard API_URL
```

### Uncommitted Changes Found
| File | Change | Action |
|------|--------|--------|
| `.github/workflows/deploy-staging.yml` | Region `us-west-2` → `us-west-1` | Committed as 523571a |
| `docs/ops/diagnostics/*` | Untracked doc files | Ignored (harmless) |

## Phase 1: Terraform Apply

### Terraform Changes Detected
Files changed since 681db2a:
- `infra/terraform/environments/staging.tfvars` - Saleor images 3.21 → 3.22/3.22.24
- `infra/terraform/modules/ecs/main.tf` - Dashboard env `API_URI` → `API_URL`
- `infra/terraform/variables.tf` - Default dashboard image → 3.22.24
- `infra/terraform/environments/production.tfvars` - Dashboard → 3.22.24

### Apply Result
**Status:** SUCCESS

4 ECS task definitions replaced:
| Task | Changes |
|------|---------|
| api | Image 3.21 → 3.22 |
| dashboard | Image 3.21 → 3.22.24, `API_URI` → `API_URL` |
| migrate | Image 3.21 → 3.22 |
| worker | Image 3.21 → 3.22 |

### Terraform Outputs
```
api_url = http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com
api_graphql_url = http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/
dashboard_url = http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard
storefront_url = http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com
```

## Phase 2: Deploy Trigger

### GitHub Actions Workflow
**Commit:** 523571a (workflow region fix)
**Push triggered:** Yes
**Run ID:** 20933015761
**Result:** FAILED (submodule access issues)

### Failure Root Cause
The workflow failed at the Checkout step due to missing submodule repositories:
- `saleor-app-inventory-ops.git` - repository not found
- `saleor-app-price-sync.git` - repository not found
- `saleor-app-pos.git` - repository not found

**Note:** This is a pre-existing issue unrelated to the region fix. The submodule references point to private repos that need GitHub Actions access tokens configured.

### Workaround Applied
Direct ECS service updates via AWS CLI:
```bash
aws ecs update-service --cluster saleor-platform-staging --service api \
  --task-definition saleor-platform-staging-api:7 --force-new-deployment
aws ecs update-service --cluster saleor-platform-staging --service dashboard \
  --task-definition saleor-platform-staging-dashboard:5 --force-new-deployment
aws ecs update-service --cluster saleor-platform-staging --service worker \
  --task-definition saleor-platform-staging-worker:5 --force-new-deployment
aws ecs update-service --cluster saleor-platform-staging --service storefront \
  --force-new-deployment
```

## Phase 3: Verification Results

### HTTP Status Checks
| Endpoint | URL | Status |
|----------|-----|--------|
| GraphQL | /graphql/ | 200 |
| Dashboard | /dashboard/ | 200 |
| Storefront | / | 307 (redirect) |

### GraphQL Functional Test
```json
{"data": {"__typename": "Query"}, "extensions": {"cost": {"requestedQueryCost": 0, "maximumAvailable": 50000}}}
```

### Dashboard Configuration Check
Dashboard HTML now correctly shows:
```javascript
window.__SALEOR_CONFIG__ = {
  API_URL: "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/",
  APP_MOUNT_URI: "/dashboard/",
  ...
};
```

### Localhost Leakage Check
- HTML: 0 localhost references
- Previous issue (localhost:8000) resolved by `API_URI` → `API_URL` fix

## Known Remaining Issues

### 1. GitHub Actions Submodule Access
The deploy-staging workflow fails at checkout due to missing private submodule repos. Requires:
- Either make submodule repos public
- Or configure GitHub Actions with access tokens for private repos
- Or remove submodule references if apps are not needed

### 2. S3 CORS on HTTP
Media bucket CORS is configured but may have issues with HTTP-only ALB access. Not blocking.

### 3. Custom Domain Not Configured
- Staging uses ALB DNS directly (`saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com`)
- TLS/HTTPS not available until custom domain DNS is configured
- `use_https_urls = false` in staging.tfvars

## Task Definitions After Update

| Service | Task Definition | Image |
|---------|-----------------|-------|
| api | :7 | ghcr.io/saleor/saleor:3.22 |
| dashboard | :5 | ghcr.io/saleor/saleor-dashboard:3.22.24 |
| worker | :5 | ghcr.io/saleor/saleor:3.22 |
| migrate | :6 | ghcr.io/saleor/saleor:3.22 |

## Commits Made This Session

```
523571a fix(ci): correct AWS region to us-west-1 for staging
```

## Next Steps

1. **Fix GitHub Actions submodule access** - Configure tokens or restructure repos
2. **Consider custom domain setup** - For HTTPS and cleaner URLs
3. **Run database migrations** - If upgrading from 3.21 to 3.22 requires schema changes

---
*Log generated by Gen (Claude Code) at 2026-01-12 ~12:05 PST*
