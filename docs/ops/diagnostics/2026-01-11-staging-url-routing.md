# Staging URL Routing Diagnostic Report

**Date:** 2026-01-11
**Investigator:** Gen (Claude AI)
**Issue:** Application generates/routes links to `api.staging.shuffleandcut.com` instead of the reachable ALB endpoint

## Executive Summary

The staging environment has a **fundamental URL configuration mismatch**. The system is configured to use custom domain URLs (`*.staging.shuffleandcut.com`) that do not exist in DNS, while the actual reachable endpoint is the AWS ALB DNS name.

### Root Causes Identified

1. **DNS does not exist** - Neither `api.staging.shuffleandcut.com` nor `staging.shuffleandcut.com` resolve (NXDOMAIN)
2. **Dashboard uses wrong API URL** - Official Saleor dashboard image has `localhost:8000` baked in
3. **Terraform generates unreachable URLs** - ECS task definitions use `https://api.${domain_name}` even without DNS/TLS
4. **Build-time vs Runtime mismatch** - NEXT_PUBLIC_* variables are baked at build time but Terraform configures them for runtime

## Evidence Collected

### DNS Resolution Tests

```
$ nslookup api.staging.shuffleandcut.com
** server can't find api.staging.shuffleandcut.com: NXDOMAIN

$ nslookup staging.shuffleandcut.com
** server can't find staging.shuffleandcut.com: NXDOMAIN
```

### ALB Endpoint Tests

```
ALB DNS: saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com

$ curl -o /dev/null -w "%{http_code}" http://<ALB>/graphql/
HTTP Code: 200

$ curl -o /dev/null -w "%{http_code}" http://<ALB>/health/
HTTP Code: 200

$ curl -X POST -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' http://<ALB>/graphql/
{"data": {"__typename": "Query"}, "extensions": {...}}

$ curl -o /dev/null -w "%{http_code}" http://<ALB>/webstore
HTTP Code: 200
```

**Finding:** ALB HTTP endpoints work correctly with path-based routing.

### Dashboard Configuration Issue

```html
<!-- From http://<ALB>/dashboard/ -->
<script>window.__SALEOR_CONFIG__ = {
    API_URL: "http://localhost:8000/graphql/",  <!-- WRONG! -->
    APP_MOUNT_URI: "/dashboard/",
    ...
};</script>
```

**Expected:** `https://api.staging.shuffleandcut.com/graphql/` (from ECS task def)
**Actual:** `http://localhost:8000/graphql/` (baked into official image)

### Storefront Metadata

```html
<!-- From storefront response -->
<meta property="og:image"
  content="http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/opengraph-image.png"/>
```

**Finding:** Storefront appears to use ALB DNS for some metadata (possibly runtime injection working).

## Configuration Sources Analysis

### 1. Terraform Configuration

**File:** `infra/terraform/environments/staging.tfvars`
```hcl
domain_name = "staging.shuffleandcut.com"
create_acm_certificate = false  # No HTTPS cert
route53_zone_id = ""            # No DNS managed
```

**File:** `infra/terraform/modules/ecs/main.tf`
```hcl
# Storefront task (line 221-224)
{ name = "NEXT_PUBLIC_SALEOR_API_URL", value = "https://api.${var.domain_name}/graphql/" },
{ name = "SALEOR_API_URL", value = "https://api.${var.domain_name}/graphql/" },
{ name = "NEXT_PUBLIC_STOREFRONT_URL", value = "https://www.${var.domain_name}" },

# Dashboard task (line 272)
{ name = "API_URI", value = "https://api.${var.domain_name}/graphql/" }
```

**Problem:** Generates `https://api.staging.shuffleandcut.com/graphql/` but:
- No DNS records exist for this domain
- No TLS certificate exists (`create_acm_certificate = false`)
- ALB only has HTTP listener for staging

### 2. GitHub Actions Configuration

**File:** `.github/workflows/deploy-staging.yml`
```yaml
# Build args for storefront (line 69-72)
build-args: |
  NEXT_PUBLIC_SALEOR_API_URL=${{ vars.STAGING_API_URL }}/graphql/
  NEXT_PUBLIC_STOREFRONT_URL=${{ vars.STAGING_STOREFRONT_URL }}
  NEXT_PUBLIC_DEFAULT_CHANNEL=webstore

# Smoke tests (line 281-283)
env:
  STAGING_API_URL: ${{ vars.STAGING_API_URL }}
  STAGING_STOREFRONT_URL: ${{ vars.STAGING_STOREFRONT_URL }}
  STAGING_DASHBOARD_URL: ${{ vars.STAGING_DASHBOARD_URL }}
```

**Problem:** GitHub repository variables (`vars.STAGING_*`) are likely set to the broken custom domain URLs.

### 3. ALB Routing Configuration

**File:** `infra/terraform/modules/alb/main.tf`

When `certificate_arn == ""` (staging), uses HTTP with path-based routing:
- `/graphql/*`, `/health/*`, `/media/*` → API target group
- `/dashboard/*` → Dashboard target group
- Default → Storefront target group

**Finding:** ALB is correctly configured for staging (HTTP, path-based routing).

### 4. ALLOWED_HOSTS Configuration

**File:** `infra/terraform/main.tf` (line 165)
```hcl
allowed_hosts = "api.${var.domain_name},localhost,${module.alb.alb_dns_name}"
```

**Finding:** Correctly includes both custom domain AND ALB DNS.

## URL Flow Analysis

### Build-Time Variables (Storefront)

```
GitHub Actions vars → Docker build args → Baked into Next.js bundle
```

- `NEXT_PUBLIC_SALEOR_API_URL` is set at build time
- Cannot be overridden at runtime
- If set to broken domain, storefront client-side code cannot reach API

### Runtime Variables (ECS)

```
Terraform → ECS Task Definition → Container environment
```

- `SALEOR_API_URL` (server-side) can be set at runtime
- Dashboard `API_URI` is set but official image ignores it
- Custom apps read `APP_API_BASE_URL` at runtime

### The Mismatch

| Component | Build-Time URL | Runtime URL | Actual Reachable |
|-----------|----------------|-------------|------------------|
| Storefront (client) | `${{ vars.STAGING_API_URL }}` | N/A (baked) | ALB DNS |
| Storefront (SSR) | N/A | `https://api.staging...` | ALB DNS |
| Dashboard | `localhost:8000` (official) | `https://api.staging...` | ALB DNS |
| API | N/A | N/A | ALB DNS (via path) |

## Recommended Fix

### Immediate Fix (ALB DNS Mode)

1. **Update GitHub Actions Variables:**
   ```
   STAGING_API_URL=http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com
   STAGING_STOREFRONT_URL=http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com
   STAGING_DASHBOARD_URL=http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard/
   ```

2. **Build Custom Dashboard Image:**
   - Create Dockerfile that builds dashboard with correct `API_URI`
   - Or use runtime env injection via custom entrypoint

3. **Update Terraform for Staging:**
   - Add variable for `use_alb_dns_for_staging`
   - Generate URLs using ALB DNS when custom domain not available

### Long-Term Fix (Custom Domain Mode)

1. **Configure DNS:**
   - Create Route53 hosted zone for `staging.shuffleandcut.com`
   - Create A records pointing to ALB

2. **Enable TLS:**
   - Set `create_acm_certificate = true`
   - Set `route53_zone_id` for DNS validation

3. **Switch to Host-Based Routing:**
   - Once DNS/TLS is ready, ALB will use host-based rules

## Validation Requirements

Add to deployment pipeline:

```bash
# Validate API URL is reachable
curl -sf "${STAGING_API_URL}/health/" || exit 1

# Validate GraphQL endpoint
curl -sf -X POST -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' \
  "${STAGING_API_URL}/graphql/" | grep -q '"Query"' || exit 1

# Validate storefront
curl -sf "${STAGING_STOREFRONT_URL}/" || exit 1
```

## Files to Modify

1. `infra/terraform/modules/ecs/main.tf` - Add conditional URL generation
2. `infra/terraform/variables.tf` - Add `public_url_base` variable
3. `infra/terraform/outputs.tf` - Fix to output correct URLs
4. `.github/workflows/deploy-staging.yml` - Add URL validation step
5. `scripts/deploy/aws/validate-urls.sh` - New validation script
6. `docs/deploy/aws/ENV_VARS.md` - Update documentation

## Test Evidence Summary

| Test | Result | Notes |
|------|--------|-------|
| DNS `api.staging.shuffleandcut.com` | NXDOMAIN | Domain does not exist |
| DNS `staging.shuffleandcut.com` | NXDOMAIN | Domain does not exist |
| ALB HTTP `/graphql/` | 200 OK | Path-based routing works |
| ALB HTTP `/health/` | 200 OK | API is healthy |
| ALB HTTP `/webstore` | 200 OK | Storefront loads |
| ALB HTTP `/dashboard/` | 200 OK | Dashboard loads |
| Dashboard API_URL | Wrong | Shows `localhost:8000` |
| GraphQL query | Success | API responds correctly |
