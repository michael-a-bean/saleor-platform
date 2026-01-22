# Staging Apply + Verify Documentation Session

**Date:** 2026-01-12
**Session Type:** Documentation creation
**Branch:** platform/main

---

## Objective

Create an operator-ready staging apply + verification runbook and ensure deployment documentation accurately reflects the current dashboard and staging configuration.

---

## Context Discovery

### Staging ALB Base URL

**Source:** `infra/terraform/environments/staging.tfvars:37-39`

```hcl
public_api_base_url        = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
public_storefront_base_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
public_dashboard_base_url  = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard"
```

### Dashboard API Environment Variable

**Source:** `infra/terraform/modules/ecs/main.tf:272`

```hcl
environment = [
  { name = "API_URL", value = "${var.public_api_base_url}/graphql/" }
]
```

**Confirmed:** Dashboard uses `API_URL` (not `API_URI`). This was fixed in commit 6189664.

### GitHub Actions Workflow

**File:** `.github/workflows/deploy-staging.yml`
**Workflow Name:** "Deploy to Staging"

Jobs in order: build → migrate → deploy → deploy-apps → validate-urls → smoke-test

---

## What Changed

### Created

| File | Description |
|------|-------------|
| `docs/ops/runbooks/staging-apply-and-verify.md` | Operator runbook for staging deployment |

### Verified (No Changes Needed)

| File | Status |
|------|--------|
| `docs/deploy/aws/ENV_VARS.md` | Already correctly documents `API_URL` for dashboard |
| `infra/terraform/modules/ecs/main.tf` | Dashboard correctly configured with `API_URL` |
| `infra/terraform/environments/staging.tfvars` | ALB URLs correctly configured |

---

## Why Changes Were Made

### Runbook Creation

1. **Gap identified:** No existing operator runbook for staging apply + verification
2. **User request:** Explicit requirement for runbook covering:
   - Terraform apply steps
   - GitHub Actions verification
   - CLI post-deploy verification (including GraphQL POST check)
   - Browser DevTools verification (dashboard localhost check)

### No Changes to ENV_VARS.md

The documentation already correctly states (lines 59-66):

> **Note:** The official Saleor Dashboard Docker image (3.22+) expects `API_URL` (not `API_URI`).

This aligns with the Terraform configuration. No correction needed.

---

## Verification

### Documentation Accuracy

| Item | Terraform | Documentation | Match |
|------|-----------|---------------|-------|
| Dashboard env var | `API_URL` | `API_URL` | Yes |
| ALB URL format | `http://...elb.amazonaws.com` | Same | Yes |
| Workflow name | "Deploy to Staging" | Same | Yes |

### Runbook Content

- Terraform apply steps: Included
- GitHub Actions workflow: Documented
- CLI GraphQL POST check: Included
- Browser DevTools steps: Included with localhost verification

---

## References

- Previous diagnostic: `2026-01-12-dashboard-fix-followthrough.md` (API_URI → API_URL fix)
- Previous diagnostic: `2026-01-12-dashboard-322-alignment.md` (dashboard version alignment)
- Commit 6189664: "docs: correct dashboard env var to API_URL"
