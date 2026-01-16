# Staging Deployment Fixes - 2026-01-15

This document captures all fixes required to achieve a successful staging deployment.

## Summary

The staging deployment pipeline had multiple blockers across infrastructure, CI/CD, and application layers. This runbook documents each issue and its resolution.

---

## 1. ECR Image Tag Mutability

**Problem:** ECR repositories were configured with `IMMUTABLE` tags, preventing CI/CD from overwriting `staging-latest` tags on each deploy.

**Error:**
```
ERROR: failed to push .../saleor-platform/storefront:staging-latest:
The image tag 'staging-latest' already exists and cannot be overwritten because the tag is immutable.
```

**Fix:** Changed ECR repositories to use `MUTABLE` tags for staging.

**Files Changed:**
- `infra/terraform/modules/ecr/variables.tf` - Added `image_tag_mutability` variable
- `infra/terraform/modules/ecr/main.tf` - Use variable instead of hardcoded `IMMUTABLE`
- `infra/terraform/variables.tf` - Added `ecr_image_tag_mutability` root variable
- `infra/terraform/main.tf` - Pass variable to ECR module
- `infra/terraform/environments/staging.tfvars` - Set `MUTABLE`
- `infra/terraform/environments/production.tfvars` - Set `IMMUTABLE`

**Manual Step Required:**
```bash
# Applied via AWS CLI (Terraform state was out of sync)
for repo in storefront stripe-app inventory-ops-app buylist-app pos-app price-sync-worker; do
  aws ecr put-image-tag-mutability \
    --repository-name "saleor-platform/$repo" \
    --image-tag-mutability MUTABLE \
    --region us-west-1
done
```

---

## 2. Deploy Script JSON Parsing Error

**Problem:** The deploy script used `file:///dev/stdin` to pass JSON to AWS CLI, which failed in GitHub Actions with "Invalid JSON received".

**Error:**
```
Error parsing parameter 'cli-input-json': Invalid JSON received.
```

**Fix:** Write task definition JSON to a temp file instead of piping via stdin.

**File Changed:** `scripts/deploy/aws/deploy-service.sh`

```bash
# Before (unreliable)
NEW_TASK_DEF_ARN=$(echo "$NEW_TASK_DEF" | aws ecs register-task-definition \
    --cli-input-json file:///dev/stdin ...)

# After (reliable)
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT
echo "$NEW_TASK_DEF" > "$TEMP_FILE"
NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
    --cli-input-json "file://${TEMP_FILE}" ...)
```

---

## 3. Submodule Commits Not Pushed

**Problem:** The parent repository referenced submodule commits that hadn't been pushed to their remotes.

**Error:**
```
Fetched in submodule path 'saleor-apps', but it did not contain 87d8e99...
remote error: upload-pack: not our ref 87d8e99...
```

**Fix:** Push all submodule changes to their respective remotes before pushing parent.

```bash
# Push nested submodules first
cd saleor-apps/apps/inventory-ops && git push origin main
cd saleor-apps/apps/buylist && git push origin main
cd saleor-apps/apps/pos && git push origin main

# Then parent submodule
cd saleor-apps && git push origin main

# Then platform repo
cd saleor-platform && git push origin platform/main
```

---

## 4. Hardcoded Outdated Image Versions

**Problem:** The deploy script had hardcoded image versions for upstream services that didn't exist.

**Error:**
```
CannotPullContainerError: ghcr.io/saleor/saleor-dashboard:3.22.0: not found
```

**Fix:** Changed deploy script to preserve existing images for upstream services (api, worker, dashboard, meilisearch) and only update ECR-based images.

**File Changed:** `scripts/deploy/aws/deploy-service.sh`

```bash
# Use "KEEP" marker for upstream images - preserves image from current task definition
declare -A IMAGE_MAP=(
    ["api"]="KEEP"
    ["worker"]="KEEP"
    ["dashboard"]="KEEP"
    ["storefront"]="${ECR_REGISTRY}/saleor-platform/storefront:${SHA}"
    ["stripe"]="${ECR_REGISTRY}/saleor-platform/stripe-app:${SHA}"
    ["inventory-ops"]="${ECR_REGISTRY}/saleor-platform/inventory-ops-app:${SHA}"
    ["buylist"]="${ECR_REGISTRY}/saleor-platform/buylist-app:${SHA}"
    ["pos"]="${ECR_REGISTRY}/saleor-platform/pos-app:${SHA}"
    ["meilisearch"]="KEEP"
)
```

---

## 5. Missing GitHub Repository Variables

**Problem:** The workflow referenced repository variables that weren't set, causing URL validation to fail.

**Error:**
```
[ERROR] API URL not configured (set STAGING_API_URL)
[ERROR] Storefront URL not configured (set STAGING_STOREFRONT_URL)
```

**Fix:** Added repository variables via GitHub CLI.

```bash
gh variable set STAGING_API_URL --repo michael-a-bean/saleor-platform \
  --body "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

gh variable set STAGING_STOREFRONT_URL --repo michael-a-bean/saleor-platform \
  --body "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

gh variable set STAGING_DASHBOARD_URL --repo michael-a-bean/saleor-platform \
  --body "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard"
```

**Current Variables:**
```
AWS_ACCOUNT_ID          546464732019
STAGING_API_URL         http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com
STAGING_STOREFRONT_URL  http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com
STAGING_DASHBOARD_URL   http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard
```

---

## 6. Smoke Test Redirect Handling

**Problem:** Storefront homepage returns HTTP 307 redirect (Next.js redirecting to channel/locale), but smoke test expected 200.

**Error:**
```
[ERROR] Storefront Homepage: Expected HTTP 200, got HTTP 307
```

**Fix:** Updated smoke test to follow redirects for storefront homepage.

**File Changed:** `scripts/deploy/aws/smoke-test.sh`

```bash
# Added follow_redirects parameter to test_endpoint function
test_endpoint "Storefront Homepage" "${STOREFRONT_URL}/" 200 true
```

---

## Commits Summary

| Commit | Description |
|--------|-------------|
| `e6d2fca` | fix(ecr): make image tag mutability configurable per environment |
| `e4acb1e` | fix(deploy): use temp file for ECS task definition JSON |
| `2eee5a5` | fix(deploy): preserve upstream images, only update ECR images |
| `5d72e58` | fix(smoke-test): follow redirects for storefront homepage |

---

## App Manifest URLs

After successful deployment, apps can be installed using these manifest URLs:

| App | Manifest URL |
|-----|--------------|
| Stripe | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe/api/manifest` |
| Inventory-ops | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/inventory/api/manifest` |
| Buylist | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/buylist/api/manifest` |
| POS | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/pos/api/manifest` |

---

## Remaining Items (Non-Blocking)

These were identified but not required for deployment success:

1. **Terraform State Sync** - State doesn't track existing AWS resources. Need to import or recreate state.
2. **FileAPL Ephemeral Storage** - Apps using `APL=file` lose registrations on container restart. Consider migrating to DynamoDB APL.
3. **crypto.randomUUID Polyfill** - Some apps may need polyfill for HTTP (non-HTTPS) environments.
4. **Dockerfile Secrets Warnings** - Docker warns about secrets in ARG/ENV. Consider using build secrets instead.

---

## Verification

Successful deployment verified:
- All 12 jobs passed in workflow run `21055445838`
- API health: `GET /health/` returns 200
- GraphQL introspection works
- Storefront loads (follows redirect)
- Dashboard accessible at `/dashboard/`
- All 4 apps deployed and running
