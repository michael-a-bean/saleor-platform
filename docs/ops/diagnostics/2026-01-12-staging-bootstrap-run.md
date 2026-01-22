# Staging Bootstrap Run Log

**Date:** 2026-01-12
**Operator:** Gen (Claude AI)
**Starting Commit:** `1b1358d`
**Ending Commit:** `681db2a`

---

## Summary

Successfully completed PHASE 2 of staging URL configuration:
- Updated `staging.tfvars` with ALB DNS URL overrides
- Applied Terraform changes to update ECS task definitions
- Verified all endpoints are responding correctly
- Pushed to `platform/main` to trigger full CI/CD deploy

---

## Pre-Conditions

| Check | Status | Value |
|-------|--------|-------|
| Working tree | Clean | Only untracked diagnostic files |
| Branch | Correct | `platform/main` |
| Starting commit | Verified | `1b1358d1b578f96433f90f9ab9c8589ae09c8087` |
| GitHub vars set | Confirmed | STAGING_API_URL, STAGING_STOREFRONT_URL, STAGING_DASHBOARD_URL |

---

## Changes Made

### File: `infra/terraform/environments/staging.tfvars`

```diff
-# Uncomment after first deploy and set to actual ALB DNS name from terraform output:
-# public_api_base_url = "http://saleor-platform-staging-alb-XXXXXXXXX.us-west-1.elb.amazonaws.com"
-# public_storefront_base_url = "http://saleor-platform-staging-alb-XXXXXXXXX.us-west-1.elb.amazonaws.com"
-# public_dashboard_base_url = "http://saleor-platform-staging-alb-XXXXXXXXX.us-west-1.elb.amazonaws.com/dashboard"
+# PHASE 2 ACTIVATED: ALB DNS URLs configured (2026-01-11)
+public_api_base_url        = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
+public_storefront_base_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
+public_dashboard_base_url  = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard"
```

---

## Terraform Execution

### Validation

```
$ terraform fmt -check environments/staging.tfvars
(no output - passed)

$ terraform validate
Success! The configuration is valid.
```

### Plan Summary

```
Plan: 3 to add, 2 to change, 3 to destroy.

Changes:
- module.ecs.aws_ecs_task_definition.api (replaced)
- module.ecs.aws_ecs_task_definition.dashboard (replaced)
- module.ecs.aws_ecs_task_definition.storefront (replaced)
- module.ecs.aws_ecs_service.api (updated)
- module.alb.aws_lb_target_group.storefront (updated)
```

Key URL changes in task definitions:
- `DASHBOARD_URL`: `https://dashboard.staging.shuffleandcut.com/` → `http://...alb.../dashboard/`
- `API_URI`: `https://api.staging.shuffleandcut.com/graphql/` → `http://...alb.../graphql/`
- `NEXT_PUBLIC_SALEOR_API_URL`: `https://api.staging.shuffleandcut.com/graphql/` → `http://...alb.../graphql/`
- `NEXT_PUBLIC_STOREFRONT_URL`: `https://www.staging.shuffleandcut.com` → `http://...alb...`
- `SALEOR_API_URL`: `https://api.staging.shuffleandcut.com/graphql/` → `http://...alb.../graphql/`

### Apply Result

```
$ terraform apply staging.tfplan

Apply complete! Resources: 3 added, 2 changed, 3 destroyed.

Outputs:
alb_dns_name = "saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
api_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
dashboard_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard"
storefront_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
api_graphql_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/"
```

---

## Post-Deploy Verification

### Endpoint Tests

| Endpoint | Test | Result | Expected | Status |
|----------|------|--------|----------|--------|
| GraphQL | HTTP status | `200` | 200 | PASS |
| GraphQL | Query response | `{"data": {"__typename": "Query"}, ...}` | JSON with data | PASS |
| Storefront | HTTP status | `307` | 200 or 30x | PASS |
| Dashboard | HTTP status | `200` | 200 | PASS |

### GraphQL Query Test

```bash
$ curl -s -X POST -H "Content-Type: application/json" \
    -d '{"query":"{ __typename }"}' \
    "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/"

{"data": {"__typename": "Query"}, "extensions": {"cost": {"requestedQueryCost": 0, "maximumAvailable": 50000}}}
```

---

## Deployment Trigger

### Method: Git Push

```bash
$ git commit -m "chore(staging): set public_*_base_url overrides to ALB DNS"
[platform/main 681db2a] chore(staging): set public_*_base_url overrides to ALB DNS
 1 file changed, 4 insertions(+), 4 deletions(-)

$ git push origin platform/main
To github.com:michael-a-bean/saleor-platform.git
   1b1358d..681db2a  platform/main -> platform/main
```

The `deploy-staging.yml` workflow will trigger automatically on push to `platform/main`.

---

## Go/No-Go Assessment

### GO for Staging

| Criterion | Status | Notes |
|-----------|--------|-------|
| GraphQL responds 200 | PASS | |
| GraphQL returns JSON | PASS | Valid query response |
| Storefront responds 200/30x | PASS | 307 redirect (expected) |
| Dashboard responds 200 | PASS | HTML loads |
| No HIGH findings in review | PASS | Code review clean |
| Terraform apply succeeded | PASS | 3 added, 2 changed, 3 destroyed |
| Git push succeeded | PASS | Triggers CI/CD |

### Known Limitations

| Item | Impact | Workaround |
|------|--------|------------|
| Dashboard `localhost:8000` | Dashboard cannot connect to API | Use GraphQL Playground at `/graphql/` |
| S3 CORS HTTPS-only | Media uploads may fail from HTTP storefront | Use API proxy for uploads |

---

## Next Actions

1. **Monitor CI/CD**: Watch `deploy-staging.yml` workflow execution in GitHub Actions
2. **Verify full redeploy**: After CI completes, re-run verification checks
3. **Dashboard fix** (optional): Build custom dashboard image with correct `API_URI` if needed

---

## Artifacts

| File | Purpose |
|------|---------|
| `infra/terraform/environments/staging.tfvars` | Updated URL overrides |
| `docs/ops/diagnostics/2026-01-11-staging-postfix-validation.md` | Pre-fix validation report |
| `docs/ops/diagnostics/2026-01-12-staging-bootstrap-run.md` | This run log |

---

*Run completed successfully at 2026-01-12*
