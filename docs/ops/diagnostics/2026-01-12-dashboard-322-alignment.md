# Dashboard 3.22 Alignment Diagnostic Report

**Date:** 2026-01-12
**Environment:** Staging
**Status:** Analysis Complete - Fix Identified

## Executive Summary

The staging Saleor Dashboard is misconfigured with two root causes:
1. **Version mismatch:** Using Dashboard 3.21 with API 3.21 (should be 3.22.x)
2. **Wrong environment variable:** Using `API_URI` instead of `API_URL`

## Phase 1: Ground Truth - Current Configuration

### Terraform Default Values (`infra/terraform/variables.tf`)

| Variable | Default Value | Issue |
|----------|---------------|-------|
| `saleor_api_image` | `ghcr.io/saleor/saleor:3.22` | OK |
| `saleor_dashboard_image` | `ghcr.io/saleor/saleor-dashboard:3.22.0` | **Tag 3.22.0 does not exist** |

### Staging Configuration (`infra/terraform/environments/staging.tfvars`)

| Variable | Value | Issue |
|----------|-------|-------|
| `saleor_api_image` | `ghcr.io/saleor/saleor:3.21` | **Should be 3.22.x** |
| `saleor_dashboard_image` | `ghcr.io/saleor/saleor-dashboard:3.21` | **Should be 3.22.24** |
| `public_api_base_url` | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com` | OK |

### ECS Task Definition (`infra/terraform/modules/ecs/main.tf:251-289`)

```hcl
environment = [
  { name = "API_URI", value = "${var.public_api_base_url}/graphql/" }
]
```

**Issue:** Uses `API_URI` - the correct variable is `API_URL`

### Confirmed Valid Dashboard Image Tags (GHCR)

| Tag | Status |
|-----|--------|
| `3.22` | **Exists** |
| `3.22.24` | **Exists** (latest patch) |
| `3.22.23` | Exists |
| `3.22.0` | **Does NOT exist** |

## Phase 2: Dashboard API Configuration Behavior

### Current Deployed Behavior

```bash
$ curl -s "http://ALB/dashboard/" | grep -oE 'http://localhost[^"]*'
http://localhost:8000/graphql/
```

**Result:** Dashboard is pointing to `localhost:8000` despite env vars being set.

### Root Cause Analysis

The Saleor Dashboard official Docker image supports runtime configuration via:
- Environment variable: **`API_URL`** (not `API_URI`)
- Entrypoint script: `/docker-entrypoint.d/50-replace-env-vars.sh`

Per [official documentation](https://github.com/saleor/saleor-dashboard/blob/main/docs/docker.md):
> `docker run --publish 8080:80 --env "API_URL=<YOUR_API_URL>" saleor-dashboard`

**We were using `API_URI` which is ignored by the entrypoint script.**

### Why Previous Investigation Failed

The prior belief that "no image exists for 3.22" was incorrect because:
1. Investigation may have looked for `3.22.0` which doesn't exist
2. The correct tags are `3.22` (floating) and `3.22.24` (pinned patch)
3. No registry auth issues - GHCR is public for these images

## Phase 3: Recommended Fix

### 1. Update Dashboard Image Version

**staging.tfvars:**
```hcl
saleor_api_image       = "ghcr.io/saleor/saleor:3.22"
saleor_dashboard_image = "ghcr.io/saleor/saleor-dashboard:3.22.24"
```

### 2. Fix Environment Variable Name

**modules/ecs/main.tf (Dashboard Task Definition):**
```hcl
environment = [
  { name = "API_URL", value = "${var.public_api_base_url}/graphql/" }
]
```

### 3. Update Default in variables.tf

```hcl
variable "saleor_dashboard_image" {
  description = "Saleor Dashboard image with digest"
  type        = string
  default     = "ghcr.io/saleor/saleor-dashboard:3.22.24"
}
```

### 4. Fix Production tfvars

```hcl
saleor_dashboard_image = "ghcr.io/saleor/saleor-dashboard:3.22.24"
```

## Expected Outcome

After applying fixes:
1. Dashboard loads at `/dashboard/`
2. API calls go to `http://ALB/graphql/` not `localhost:8000`
3. Dashboard version aligned with API (both 3.22.x)
4. No localhost references in dashboard HTML

## Verification Commands

```bash
ALB="http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

# Dashboard loads
curl -s -o /dev/null -w "dashboard_status=%{http_code}\n" "$ALB/dashboard/"

# GraphQL reachable
curl -s -o /dev/null -w "graphql_status=%{http_code}\n" "$ALB/graphql/"

# No localhost references
curl -s "$ALB/dashboard/" | grep -oE 'localhost|8000' || echo "OK: No localhost references"

# API URL correctly configured
curl -s "$ALB/dashboard/" | grep -oE '"API_URL":"[^"]*"' || echo "Check apiUrl in JS bundle"
```

## References

- [Saleor Dashboard Docker Configuration](https://github.com/saleor/saleor-dashboard/blob/main/docs/docker.md)
- [Saleor Dashboard Configuration](https://github.com/saleor/saleor-dashboard/blob/main/docs/configuration.md)
- [DEV Community: Build saleor dashboard docker image with env vars](https://dev.to/a_atalla/build-saleor-dashboard-docker-image-that-accept-environment-variables-584i)
