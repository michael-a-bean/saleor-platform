# Staging Post-Fix Validation Report

**Date:** 2026-01-11
**Validator:** Gen (Claude AI)
**Context:** Validation of URL routing fixes committed in ff07df9, 5d362da, 1b1358d

---

## A) CURRENT STAGING CONTRACT (AS CODED)

### URL Configuration Sources

| Variable | Default Value | Override | Source | Type |
|----------|--------------|----------|--------|------|
| `PUBLIC_API_BASE_URL` | `http://api.staging.shuffleandcut.com` | `public_api_base_url` in tfvars | Terraform → ECS env | Runtime |
| `PUBLIC_STOREFRONT_BASE_URL` | `http://www.staging.shuffleandcut.com` | `public_storefront_base_url` in tfvars | Terraform → ECS env | Runtime |
| `PUBLIC_DASHBOARD_BASE_URL` | `http://dashboard.staging.shuffleandcut.com` | `public_dashboard_base_url` in tfvars | Terraform → ECS env | Runtime |

### URL Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TERRAFORM                                    │
│  staging.tfvars                                                     │
│  ├── use_https_urls = false                                         │
│  ├── public_api_base_url = "" (NEEDS TO BE SET)                     │
│  ├── public_storefront_base_url = "" (NEEDS TO BE SET)              │
│  └── public_dashboard_base_url = "" (NEEDS TO BE SET)               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         main.tf (locals)                            │
│  local.public_api_base_url = override != "" ? override : generated  │
│  local.public_storefront_base_url = ...                             │
│  local.public_dashboard_base_url = ...                              │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ECS Task Definitions                             │
│  API:        DASHBOARD_URL = ${public_dashboard_base_url}/          │
│  Storefront: NEXT_PUBLIC_SALEOR_API_URL = ${public_api_base_url}/graphql/
│  Storefront: SALEOR_API_URL = ${public_api_base_url}/graphql/       │
│  Storefront: NEXT_PUBLIC_STOREFRONT_URL = ${public_storefront_base_url}
│  Dashboard:  API_URI = ${public_api_base_url}/graphql/              │
└─────────────────────────────────────────────────────────────────────┘
```

### Build-Time vs Runtime

| Component | Build-Time URL | Runtime URL | Notes |
|-----------|----------------|-------------|-------|
| Storefront (client-side) | `${{ vars.STAGING_API_URL }}` | N/A (baked) | GitHub vars → Docker build args |
| Storefront (SSR) | N/A | ECS env | Can use different internal URL |
| Dashboard | `localhost:8000` (hardcoded) | Ignored | Official image limitation |
| API | N/A | N/A | Receives requests, doesn't call out |
| Worker | N/A | N/A | Internal only |

---

## B) VALIDATION CHECKLIST

### Infrastructure Components

| Item | Status | Evidence |
|------|--------|----------|
| ALB routing (path-based) | ✅ READY | `modules/alb/main.tf` - HTTP listener with `/graphql/*`, `/dashboard/*` rules |
| ECS task env wiring | ✅ READY | `modules/ecs/main.tf:107,221-224,272` - All services use `var.public_*_base_url` |
| URL validation gate | ✅ READY | `validate-urls.sh` called in `deploy-staging.yml:278-282` |
| Migration ordering | ✅ READY | `deploy-staging.yml:141-192` - migrate job depends on build, deploy depends on migrate |
| Terraform outputs | ✅ READY | `outputs.tf:145-163` - `api_url`, `storefront_url`, `dashboard_url` outputs exist |
| Smoke tests | ✅ READY | `smoke-test.sh` validates endpoints post-deploy |

### URL Configuration

| Item | Status | Evidence |
|------|--------|----------|
| `use_https_urls` flag | ✅ READY | `staging.tfvars:34` - set to `false` |
| Override variables defined | ✅ READY | `variables.tf:98-120` - all three override vars exist |
| Override logic in main.tf | ✅ READY | `main.tf:16-29` - ternary uses override when not empty |
| tfvars overrides set | ⚠️ BLOCKED | `staging.tfvars:37-39` - still commented out |
| GitHub vars set | ⚠️ BLOCKED | Not verifiable from codebase, requires manual action |

### Application Reachability

| Item | Status | Evidence |
|------|--------|----------|
| Storefront GraphQL (build-time) | ⚠️ BLOCKED | Depends on `STAGING_API_URL` GitHub var |
| Storefront GraphQL (runtime/SSR) | ⚠️ BLOCKED | Depends on tfvars override |
| App iframe/webhook URLs | ⚠️ NOT CONFIGURED | Apps not in current ECS module |
| Dashboard API connection | ❌ KNOWN EXCEPTION | Official image ignores `API_URI` env var |

---

## C) DRIFT / REGRESSION CHECK

### Broken URL References

| Pattern | Files Found | Status |
|---------|-------------|--------|
| `api.staging.shuffleandcut.com` | 2 docs files | ✅ SAFE - diagnostic docs only |
| `https://api.${var.domain_name}` | 1 (S3 CORS) | ⚠️ MINOR - see below |
| `localhost:8000` | 45 files | ✅ SAFE - dev/test files, not deployed |

### S3 CORS Configuration Issue

**Location:** `infra/terraform/main.tf:66-70`

```hcl
cors_allowed_origins = [
  "https://www.${var.domain_name}",
  "https://api.${var.domain_name}",
  "https://dashboard.${var.domain_name}"
]
```

**Impact:** MINOR
- S3 CORS only allows HTTPS origins
- Staging uses HTTP
- **Effect:** Media uploads from staging storefront may fail with CORS error
- **Workaround:** Use API proxy for uploads, or add HTTP origins for staging

### Forced HTTPS Check

| Location | Pattern | Staging Safe? |
|----------|---------|---------------|
| `main.tf:11` | `url_scheme = var.use_https_urls ? "https" : "http"` | ✅ YES |
| `staging.tfvars:34` | `use_https_urls = false` | ✅ YES |
| S3 CORS | Hardcoded `https://` | ⚠️ NO - needs fix |

### localhost Leakage Check

| Service | localhost Reference? | Status |
|---------|---------------------|--------|
| API | No | ✅ SAFE |
| Worker | No | ✅ SAFE |
| Storefront | No | ✅ SAFE |
| Dashboard | Yes (hardcoded in image) | ❌ KNOWN |

---

## D) RISK REGISTER (STAGING)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Dashboard image uses localhost:8000** | HIGH - Dashboard non-functional | CERTAIN | Build custom dashboard image OR wait for DNS+TLS |
| **GitHub vars not set** | HIGH - Build uses broken URLs | CERTAIN until set | Follow manual steps checklist |
| **tfvars overrides commented out** | HIGH - Terraform uses broken default | CERTAIN until set | Uncomment and set after first deploy |
| **Two-phase deployment operator error** | MEDIUM - Confusing failed state | POSSIBLE | Clear documentation provided in tfvars |
| **S3 CORS blocks HTTP origins** | LOW - Media uploads fail | LIKELY | Add HTTP origins for staging or use API proxy |
| **AWS region mismatch** | LOW - Workflow uses wrong region | UNLIKELY | Verified: staging.tfvars uses us-west-1 |

### Risk Impact Details

**Dashboard Image Limitation:**
- Official `ghcr.io/saleor/saleor-dashboard:3.21` has `API_URL` hardcoded
- Container starts but cannot connect to API
- Users see login page but cannot authenticate
- **Workaround:** Access API via GraphQL Playground at `/graphql/`

---

## E) MANUAL STEPS VERIFICATION GUIDE

### Pre-Deployment Checklist (First-Time Setup)

These steps are **ONE-TIME** and may already be complete:

- [x] Terraform state backend created (S3 + DynamoDB)
- [x] GitHub OIDC provider imported
- [x] SSM parameters created
- [x] Initial `terraform apply` completed
- [x] ALB DNS name captured

### Required Manual Steps (NOT YET DONE)

#### Step 1: Set GitHub Actions Variables

Navigate to: `GitHub → Repository → Settings → Secrets and variables → Actions → Variables`

Add these repository variables:

| Variable | Value |
|----------|-------|
| `STAGING_API_URL` | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com` |
| `STAGING_STOREFRONT_URL` | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com` |
| `STAGING_DASHBOARD_URL` | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard` |

#### Step 2: Update Terraform tfvars

Edit `infra/terraform/environments/staging.tfvars`:

```hcl
# Uncomment and set these lines:
public_api_base_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
public_storefront_base_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
public_dashboard_base_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard"
```

#### Step 3: Apply Terraform Changes

```bash
cd infra/terraform
terraform plan -var-file=environments/staging.tfvars -out=staging.tfplan
terraform apply staging.tfplan
```

#### Step 4: Trigger Staging Redeploy

```bash
# Option A: Push to platform/main
git commit --allow-empty -m "trigger: staging redeploy with URL fixes"
git push

# Option B: Manual workflow dispatch
gh workflow run deploy-staging.yml
```

### Post-Deployment Verification

Run these commands to confirm success:

```bash
ALB_URL="http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

# 1. API Health Check
curl -s -o /dev/null -w "%{http_code}" "$ALB_URL/health/"
# Expected: 200

# 2. GraphQL Endpoint
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' \
  "$ALB_URL/graphql/" | grep -q '"Query"' && echo "GraphQL OK"
# Expected: GraphQL OK

# 3. Storefront
curl -s -o /dev/null -w "%{http_code}" "$ALB_URL/"
# Expected: 200 or 307

# 4. Dashboard (will load but won't connect to API)
curl -s -o /dev/null -w "%{http_code}" "$ALB_URL/dashboard/"
# Expected: 200
```

---

## F) "READY FOR PRODUCTION?" ASSESSMENT

### Is Staging Structurally Production-Equivalent?

**YES**, with the following exceptions:

| Aspect | Staging | Production | Notes |
|--------|---------|------------|-------|
| URL override mechanism | ✅ Same | ✅ Same | Both use `public_*_base_url` vars |
| TLS/HTTPS | ❌ Disabled | ✅ Required | `use_https_urls = true` for prod |
| DNS | ❌ Not configured | ✅ Required | Route53 or external DNS needed |
| Dashboard | ❌ Broken | ✅ Will work | DNS+TLS makes official image work |
| Multi-AZ | ❌ Disabled | ✅ Recommended | Cost optimization for staging |
| Backup retention | 7 days | 30+ days | Different retention policies |

### What MUST Change Before Production?

1. **DNS Configuration**
   - Create Route53 hosted zone OR configure external DNS
   - Create A/CNAME records pointing to ALB

2. **TLS Certificate**
   - Set `create_acm_certificate = true`
   - Set `route53_zone_id` for DNS validation
   - Or import existing certificate

3. **tfvars Settings**
   ```hcl
   # production.tfvars
   create_acm_certificate = true
   route53_zone_id = "Z1234567890ABC"
   use_https_urls = true
   # Remove public_*_base_url overrides (use domain_name)
   ```

4. **GitHub Variables**
   ```
   PRODUCTION_API_URL=https://api.shuffleandcut.com
   PRODUCTION_STOREFRONT_URL=https://www.shuffleandcut.com
   PRODUCTION_DASHBOARD_URL=https://dashboard.shuffleandcut.com
   ```

5. **Security Hardening**
   - Enable deletion protection
   - Increase backup retention
   - Enable Multi-AZ for RDS and Redis
   - Review IAM permissions

### What Can Remain Staging-Only?

1. `use_https_urls = false` - HTTP is acceptable for staging
2. Single-AZ deployment - cost optimization
3. Smaller instance sizes - cost optimization
4. Shorter log retention - 14 days vs 30+
5. Dashboard workaround - API accessible via GraphQL Playground

---

## Summary

| Category | Status |
|----------|--------|
| **Code/Config Fixes** | ✅ COMPLETE |
| **Manual Steps** | ⚠️ BLOCKED (not yet executed) |
| **Dashboard** | ❌ KNOWN EXCEPTION |
| **Production Readiness** | ⚠️ STRUCTURAL - needs DNS/TLS |

### Blocking Items for Functional Staging

1. Set GitHub Actions variables
2. Uncomment/set tfvars URL overrides
3. Redeploy

### Accepted Limitations

1. Dashboard requires custom image or DNS+TLS
2. S3 CORS may block HTTP media uploads

---

*Report generated by Gen (Claude AI) on 2026-01-11*
