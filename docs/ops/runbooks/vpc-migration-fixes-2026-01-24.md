# VPC Migration Fixes - 2026-01-24

This document captures fixes required after the VPC migration on 2026-01-22 to restore staging deployment functionality.

> **Update 2026-01-25:** Added missing dashboard and worker services. Added comprehensive ALB change checklist.

## Summary

The VPC migration moved infrastructure from old VPC (`vpc-03bec79de659bddf7`) to new VPC (`vpc-0b0360f5c0c874c59`). Several configuration references were left pointing to old resources, causing deployment failures.

| Issue | Symptom | Root Cause | Fixed |
|-------|---------|------------|-------|
| Django migrations failing | `connection timeout expired` | ECS tasks in old VPC, RDS in new VPC | 2026-01-24 |
| Storefront HTTP 500 | `ENOTFOUND` for old ALB | Task definition had old ALB URL | 2026-01-24 |
| Apps smoke test failing | Logo fetch returned 000 | App task definitions had old ALB URLs | 2026-01-24 |
| Dashboard login failing | JS console errors, can't reach API | Dashboard task definition had old ALB URL | 2026-01-25 |
| Worker task config stale | Potential webhook/email issues | Worker task definition had old ALB URL | 2026-01-25 |

---

## 1. ECS Task Networking (Migrations Failure)

**Problem:** The ECS migration task couldn't connect to RDS because GitHub Actions environment variables pointed to subnets/security groups in the old VPC.

**Error (CloudWatch `/ecs/saleor-platform-staging/migrate`):**
```
psycopg.errors.ConnectionTimeout: connection timeout expired
django.db.utils.OperationalError: connection timeout expired
```

**Diagnosis:**
```bash
# RDS is in new VPC
aws rds describe-db-instances --db-instance-identifier saleor-platform-staging-saleor \
  --query 'DBInstances[0].DBSubnetGroup.VpcId'
# vpc-0b0360f5c0c874c59

# ECS tasks were using old VPC subnets
gh api repos/michael-a-bean/saleor-platform/environments/staging/variables \
  --jq '.variables[] | select(.name | test("ECS"))'
# subnet-0049e63c14fbb3825 → vpc-03bec79de659bddf7 (OLD!)
```

**Fix:** Update GitHub staging environment variables to new VPC resources.

```bash
# New VPC private subnets
gh api --method PATCH \
  repos/michael-a-bean/saleor-platform/environments/staging/variables/STAGING_ECS_TASK_SUBNETS \
  -f value="subnet-0885b491c2d394fb6,subnet-0917a8f4d0d7b7080"

# New VPC backend security group
gh api --method PATCH \
  repos/michael-a-bean/saleor-platform/environments/staging/variables/STAGING_ECS_TASK_SECURITY_GROUPS \
  -f value="sg-0210b4854c817f8ac"
```

**Resource Mapping:**

| Resource | Old (vpc-03bec79de659bddf7) | New (vpc-0b0360f5c0c874c59) |
|----------|------------------------------|------------------------------|
| Private subnet (us-west-1a) | subnet-0049e63c14fbb3825 | subnet-0885b491c2d394fb6 |
| Private subnet (us-west-1b) | subnet-0f12843b826424978 | subnet-0917a8f4d0d7b7080 |
| Backend security group | sg-0c35fbd209ae520f7 | sg-0210b4854c817f8ac |

---

## 2. Storefront ALB URL (HTTP 500)

**Problem:** Storefront returned HTTP 500 because its ECS task definition contained the old ALB hostname.

**Error (CloudWatch `/ecs/saleor-platform-staging/storefront`):**
```
Error: getaddrinfo ENOTFOUND saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com
```

**Diagnosis:**
```bash
aws ecs describe-task-definition \
  --task-definition saleor-platform-staging-storefront:32 \
  --query 'taskDefinition.containerDefinitions[0].environment'
# Shows old ALB URL in NEXT_PUBLIC_SALEOR_API_URL, SALEOR_API_URL, etc.
```

**Fix:** Create new task definition with updated URLs and deploy.

```bash
# Get current task definition
TASK_DEF_JSON=$(aws ecs describe-task-definition \
  --task-definition saleor-platform-staging-storefront:32 \
  --query 'taskDefinition' --output json)

# Replace old ALB with new ALB in environment variables
NEW_TASK_DEF=$(echo "$TASK_DEF_JSON" | sed \
  's/saleor-platform-staging-alb-540548859/saleor-platform-staging-alb-1516106871/g' | \
  jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
          .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)')

# Register and deploy
echo "$NEW_TASK_DEF" > /tmp/storefront-task-def.json
NEW_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/storefront-task-def.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)

aws ecs update-service \
  --cluster saleor-platform-staging \
  --service storefront \
  --task-definition "$NEW_ARN" \
  --force-new-deployment
```

---

## 3. Saleor Apps ALB URLs (Smoke Test Failure)

**Problem:** All Saleor apps (stripe, inventory-ops, buylist, pos) had old ALB URLs in their task definitions.

**Error:**
```
Logo check returned status 000 (expected 200):
http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe/logo.png
```

**Fix:** Update all app task definitions with new ALB URL.

```bash
OLD_ALB="saleor-platform-staging-alb-540548859"
NEW_ALB="saleor-platform-staging-alb-1516106871"

for SERVICE in stripe inventory-ops buylist pos; do
  TASK_DEF=$(aws ecs describe-services \
    --cluster saleor-platform-staging \
    --services "$SERVICE" \
    --query 'services[0].taskDefinition' --output text)

  TASK_DEF_JSON=$(aws ecs describe-task-definition \
    --task-definition "$TASK_DEF" \
    --query 'taskDefinition' --output json)

  NEW_TASK_DEF=$(echo "$TASK_DEF_JSON" | sed "s/$OLD_ALB/$NEW_ALB/g" | \
    jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
            .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)')

  echo "$NEW_TASK_DEF" > "/tmp/${SERVICE}-task-def.json"

  NEW_ARN=$(aws ecs register-task-definition \
    --cli-input-json "file:///tmp/${SERVICE}-task-def.json" \
    --query 'taskDefinition.taskDefinitionArn' --output text)

  aws ecs update-service \
    --cluster saleor-platform-staging \
    --service "$SERVICE" \
    --task-definition "$NEW_ARN" \
    --force-new-deployment
done
```

---

## 4. Dashboard ALB URL (Login Failure)

**Problem:** Dashboard login failed because the `API_URL` in `window.__SALEOR_CONFIG__` pointed to the old ALB.

**Symptom:** Dashboard page loads but login button does nothing. Browser console shows network errors trying to reach the old ALB hostname.

**Diagnosis:**
```bash
# Check what API_URL the dashboard is serving
curl -s "http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/dashboard/" | grep "API_URL"
# Shows: API_URL: "http://saleor-platform-staging-alb-540548859..." (OLD!)

# Verify task definition
aws ecs describe-task-definition \
  --task-definition saleor-platform-staging-dashboard:36 \
  --query 'taskDefinition.containerDefinitions[0].environment' | grep -i url
```

**Fix:** Update dashboard task definition with new ALB URL.

```bash
OLD_ALB="saleor-platform-staging-alb-540548859"
NEW_ALB="saleor-platform-staging-alb-1516106871"

TASK_DEF_JSON=$(aws ecs describe-task-definition \
  --task-definition saleor-platform-staging-dashboard \
  --query 'taskDefinition' --output json)

NEW_TASK_DEF=$(echo "$TASK_DEF_JSON" | sed "s/$OLD_ALB/$NEW_ALB/g" | \
  jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
          .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)')

echo "$NEW_TASK_DEF" > /tmp/dashboard-task-def.json

NEW_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/dashboard-task-def.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)

aws ecs update-service \
  --cluster saleor-platform-staging \
  --service dashboard \
  --task-definition "$NEW_ARN" \
  --force-new-deployment
```

---

## 5. Worker ALB URL (Background Tasks)

**Problem:** Worker service had old ALB URLs in `PUBLIC_URL`, `ALLOWED_HOSTS`, and `ALLOWED_CLIENT_HOSTS`.

**Impact:** Could cause issues with webhook callbacks, email links, and host validation.

**Diagnosis:**
```bash
aws ecs describe-task-definition \
  --task-definition saleor-platform-staging-worker \
  --query 'taskDefinition.containerDefinitions[0].environment' | grep -i "alb\|url\|host"
```

**Fix:** Update worker task definition with new ALB URL.

```bash
OLD_ALB="saleor-platform-staging-alb-540548859"
NEW_ALB="saleor-platform-staging-alb-1516106871"

TASK_DEF_JSON=$(aws ecs describe-task-definition \
  --task-definition saleor-platform-staging-worker \
  --query 'taskDefinition' --output json)

NEW_TASK_DEF=$(echo "$TASK_DEF_JSON" | sed "s/$OLD_ALB/$NEW_ALB/g" | \
  jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
          .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)')

echo "$NEW_TASK_DEF" > /tmp/worker-task-def.json

NEW_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/worker-task-def.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)

aws ecs update-service \
  --cluster saleor-platform-staging \
  --service worker \
  --task-definition "$NEW_ARN" \
  --force-new-deployment
```

---

## 6. GitHub Environment URLs

**Problem:** GitHub staging environment variables still had old ALB URLs, which would cause issues on future deployments.

**Fix:**
```bash
gh api --method PATCH \
  repos/michael-a-bean/saleor-platform/environments/staging/variables/STAGING_API_URL \
  -f value="http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com"

gh api --method PATCH \
  repos/michael-a-bean/saleor-platform/environments/staging/variables/STAGING_STOREFRONT_URL \
  -f value="http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com"

gh api --method PATCH \
  repos/michael-a-bean/saleor-platform/environments/staging/variables/STAGING_DASHBOARD_URL \
  -f value="http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/dashboard"
```

---

## ALB Reference

| ALB | VPC | Status |
|-----|-----|--------|
| saleor-platform-staging-alb-540548859 | vpc-03bec79de659bddf7 | OLD - Decommissioned |
| saleor-platform-staging-alb-1516106871 | vpc-0b0360f5c0c874c59 | CURRENT |

---

## Verification

After applying fixes, verify all services:

```bash
# Core services
curl -s -o /dev/null -w "%{http_code}" http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/graphql/
curl -sL -o /dev/null -w "%{http_code}" http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/
curl -s -o /dev/null -w "%{http_code}" http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/dashboard/

# Apps
for app in stripe inventory buylist pos; do
  curl -s -o /dev/null -w "$app: %{http_code}\n" \
    "http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/apps/$app/api/health"
done
```

All should return HTTP 200.

---

## Lessons Learned

1. **VPC migrations require checklist:** When migrating VPCs, all references must be updated:
   - GitHub environment variables (subnets, security groups, URLs)
   - ECS task definition environment variables
   - Terraform state and tfvars

2. **Deploy script preserves environment variables:** The `deploy-service.sh` script only updates the Docker image, not environment variables. After infrastructure changes, task definitions must be manually updated or Terraform must be re-applied.

3. **Two sources of truth:** URLs exist in both:
   - Terraform (`staging.tfvars`) → creates initial task definitions
   - GitHub variables → used by CI/CD for smoke tests

   Both must be kept in sync.

---

## Related Files

- `infra/terraform/environments/staging.tfvars` - Terraform URL configuration
- `.github/workflows/deploy-staging.yml` - CI/CD workflow
- `scripts/deploy/aws/deploy-service.sh` - Deployment script
- `scripts/deploy/aws/smoke-test.sh` - Smoke test script

---

## ALB Change Checklist

**Use this checklist whenever the ALB hostname changes** (VPC migration, infrastructure rebuild, etc.)

### Complete Service List

All 8 services require ALB URL updates in their task definitions:

| Service | Environment Variables with ALB | Priority |
|---------|-------------------------------|----------|
| **api** | `PUBLIC_URL`, `ALLOWED_HOSTS`, `ALLOWED_CLIENT_HOSTS`, `CSRF_TRUSTED_ORIGINS` | Critical |
| **storefront** | `NEXT_PUBLIC_SALEOR_API_URL`, `SALEOR_API_URL`, `NEXT_PUBLIC_STOREFRONT_URL` | Critical |
| **dashboard** | `API_URL`, `EXTENSIONS_API_URL` | Critical |
| **worker** | `PUBLIC_URL`, `ALLOWED_HOSTS`, `ALLOWED_CLIENT_HOSTS` | High |
| **stripe** | `APP_API_BASE_URL`, `APP_IFRAME_BASE_URL`, `SALEOR_API_URL` | High |
| **inventory-ops** | `APP_API_BASE_URL`, `APP_IFRAME_BASE_URL`, `SALEOR_API_URL` | High |
| **buylist** | `APP_API_BASE_URL`, `APP_IFRAME_BASE_URL`, `SALEOR_API_URL` | High |
| **pos** | `APP_API_BASE_URL`, `APP_IFRAME_BASE_URL`, `SALEOR_API_URL` | High |

### Audit Script

Run this to check all services for old ALB URLs:

```bash
#!/bin/bash
# audit-alb-urls.sh - Check all ECS services for ALB URL configuration

CLUSTER="saleor-platform-staging"
OLD_ALB="${1:-saleor-platform-staging-alb-540548859}"  # Pass old ALB as argument
NEW_ALB="${2:-saleor-platform-staging-alb-1516106871}" # Pass new ALB as argument

echo "=== ALB URL Audit ==="
echo "Checking for OLD: $OLD_ALB"
echo "Expected NEW: $NEW_ALB"
echo ""

SERVICES="api storefront dashboard worker stripe inventory-ops buylist pos"
PROBLEMS=0

for SERVICE in $SERVICES; do
  TASK_DEF=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services "$SERVICE" \
    --query 'services[0].taskDefinition' --output text 2>/dev/null)

  if [ -z "$TASK_DEF" ] || [ "$TASK_DEF" == "None" ]; then
    echo "$SERVICE: ❌ Service not found"
    continue
  fi

  ENV_VARS=$(aws ecs describe-task-definition \
    --task-definition "$TASK_DEF" \
    --query 'taskDefinition.containerDefinitions[0].environment[*]' --output json 2>/dev/null)

  OLD_COUNT=$(echo "$ENV_VARS" | grep -c "$OLD_ALB" || true)

  if [ "$OLD_COUNT" -gt 0 ]; then
    echo "$SERVICE: ⚠️  HAS OLD ALB ($OLD_COUNT occurrences) - $(basename $TASK_DEF)"
    PROBLEMS=$((PROBLEMS + 1))
  else
    echo "$SERVICE: ✅ OK - $(basename $TASK_DEF)"
  fi
done

echo ""
if [ "$PROBLEMS" -gt 0 ]; then
  echo "Found $PROBLEMS service(s) with old ALB URL. Run fix script."
  exit 1
else
  echo "All services have correct ALB URL."
  exit 0
fi
```

### Bulk Fix Script

Run this to update all services at once:

```bash
#!/bin/bash
# fix-alb-urls.sh - Update all ECS services with new ALB URL

CLUSTER="saleor-platform-staging"
OLD_ALB="${1:?Usage: $0 <old-alb> <new-alb>}"
NEW_ALB="${2:?Usage: $0 <old-alb> <new-alb>}"

SERVICES="api storefront dashboard worker stripe inventory-ops buylist pos"

echo "=== Updating ALB URLs ==="
echo "Old: $OLD_ALB"
echo "New: $NEW_ALB"
echo ""

for SERVICE in $SERVICES; do
  echo "--- $SERVICE ---"

  TASK_DEF=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services "$SERVICE" \
    --query 'services[0].taskDefinition' --output text 2>/dev/null)

  if [ -z "$TASK_DEF" ] || [ "$TASK_DEF" == "None" ]; then
    echo "  Skipped: Service not found"
    continue
  fi

  # Check if update needed
  ENV_VARS=$(aws ecs describe-task-definition \
    --task-definition "$TASK_DEF" \
    --query 'taskDefinition.containerDefinitions[0].environment[*]' --output json)

  if ! echo "$ENV_VARS" | grep -q "$OLD_ALB"; then
    echo "  Skipped: No old ALB found"
    continue
  fi

  # Get and update task definition
  TASK_DEF_JSON=$(aws ecs describe-task-definition \
    --task-definition "$TASK_DEF" \
    --query 'taskDefinition' --output json)

  NEW_TASK_DEF=$(echo "$TASK_DEF_JSON" | sed "s/$OLD_ALB/$NEW_ALB/g" | \
    jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
            .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)')

  echo "$NEW_TASK_DEF" > "/tmp/${SERVICE}-task-def.json"

  NEW_ARN=$(aws ecs register-task-definition \
    --cli-input-json "file:///tmp/${SERVICE}-task-def.json" \
    --query 'taskDefinition.taskDefinitionArn' --output text)

  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --task-definition "$NEW_ARN" \
    --force-new-deployment > /dev/null

  echo "  Updated: $(basename $NEW_ARN)"
done

echo ""
echo "=== Deployments triggered. Wait 2-3 minutes, then verify. ==="
```

### GitHub Environment Variables

Also update these GitHub staging environment variables:

```bash
# Required variables to update
gh api --method PATCH repos/michael-a-bean/saleor-platform/environments/staging/variables/STAGING_API_URL \
  -f value="http://<NEW_ALB>.us-west-1.elb.amazonaws.com"

gh api --method PATCH repos/michael-a-bean/saleor-platform/environments/staging/variables/STAGING_STOREFRONT_URL \
  -f value="http://<NEW_ALB>.us-west-1.elb.amazonaws.com"

gh api --method PATCH repos/michael-a-bean/saleor-platform/environments/staging/variables/STAGING_DASHBOARD_URL \
  -f value="http://<NEW_ALB>.us-west-1.elb.amazonaws.com/dashboard"
```

### Verification

After all updates, verify every endpoint:

```bash
BASE_URL="http://<NEW_ALB>.us-west-1.elb.amazonaws.com"

echo "Core services:"
curl -s -o /dev/null -w "  API: %{http_code}\n" "$BASE_URL/graphql/"
curl -s -o /dev/null -w "  Dashboard: %{http_code}\n" "$BASE_URL/dashboard/"
curl -sL -o /dev/null -w "  Storefront: %{http_code}\n" "$BASE_URL/"

echo "Apps:"
for app in stripe inventory-ops buylist pos; do
  curl -s -o /dev/null -w "  $app: %{http_code}\n" "$BASE_URL/apps/$app/api/health"
done

echo "Dashboard API config:"
curl -s "$BASE_URL/dashboard/" | grep -o 'API_URL: "[^"]*"'
```

All should return HTTP 200, and the dashboard API_URL should show the new ALB.
