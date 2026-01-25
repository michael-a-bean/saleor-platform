# VPC Migration Fixes - 2026-01-24

This document captures fixes required after the VPC migration on 2026-01-22 to restore staging deployment functionality.

## Summary

The VPC migration moved infrastructure from old VPC (`vpc-03bec79de659bddf7`) to new VPC (`vpc-0b0360f5c0c874c59`). Several configuration references were left pointing to old resources, causing deployment failures.

| Issue | Symptom | Root Cause |
|-------|---------|------------|
| Django migrations failing | `connection timeout expired` | ECS tasks in old VPC, RDS in new VPC |
| Storefront HTTP 500 | `ENOTFOUND` for old ALB | Task definition had old ALB URL |
| Apps smoke test failing | Logo fetch returned 000 | App task definitions had old ALB URLs |

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

## 4. GitHub Environment URLs

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
