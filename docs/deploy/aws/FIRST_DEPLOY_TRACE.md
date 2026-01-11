# First Staging Deploy: Expected Execution Trace

**Generated**: 2026-01-10
**Purpose**: Step-by-step expected behavior for the first staging deployment
**Pre-requisites**: All manual steps in MANUAL_STEPS.md completed

---

## Overview

This document describes what should happen when the first staging deployment triggers. Use this to:
1. Verify deployment is progressing correctly
2. Identify failure points if something goes wrong
3. Know where to look for logs and diagnostics

---

## Trigger Conditions

The staging deployment workflow triggers on:
- **Push to `platform/main`**: Automatic trigger
- **Manual dispatch**: Actions tab > "Deploy to Staging" > "Run workflow"

---

## Expected Execution Trace

### Phase 1: Build & Push Images (Job: `build`)

**Duration**: ~10-15 minutes

#### Step 1.1: Checkout
```
✓ Checkout repository with submodules
```

#### Step 1.2: Configure AWS Credentials (OIDC)
```
Assuming role: arn:aws:iam::{ACCOUNT_ID}:role/saleor-platform-staging-github-actions-deploy
```

**Success Criteria**:
- Role assumption succeeds
- No "Access Denied" errors

**Failure Signals**:
- `Error: Could not assume role with OIDC`: OIDC provider not created or trust policy misconfigured
- Check: IAM role trust policy, GitHub OIDC provider exists

#### Step 1.3: ECR Login
```
Login Succeeded
```

**Failure Signals**:
- `no basic auth credentials`: ECR login failed, check IAM permissions

#### Step 1.4: Build Storefront Image
```
Building storefront with build args:
  NEXT_PUBLIC_SALEOR_API_URL=https://api.staging.example.com/graphql/
  NEXT_PUBLIC_STOREFRONT_URL=https://www.staging.example.com
  NEXT_PUBLIC_DEFAULT_CHANNEL=webstore

Pushing to: {ACCOUNT_ID}.dkr.ecr.us-west-2.amazonaws.com/saleor-platform/storefront:{SHA}
```

**Success Criteria**:
- Image builds without Next.js errors
- Push to ECR succeeds

**Failure Signals**:
- `NEXT_PUBLIC_SALEOR_API_URL is undefined`: Missing GitHub variable
- GraphQL codegen errors: API not reachable during build (expected - baked URLs)
- `Error pushing image`: ECR repository doesn't exist or IAM permissions

#### Step 1.5: Build App Images (stripe-app, inventory-ops-app, buylist-app, pos-app)
```
Building and pushing each app image...
```

**Note**: These may fail on first deploy if Dockerfiles are missing or dependencies aren't resolved.

#### Step 1.6: Set Output Variables
```
Outputting image URIs for downstream jobs:
  storefront_image={ACCOUNT_ID}.dkr.ecr.us-west-2.amazonaws.com/saleor-platform/storefront:{SHA}
  ...
```

---

### Phase 2: Pre-Migration Snapshot (Job: `migrate`, Step 1)

**Duration**: ~30 seconds (snapshot creation initiated, not waited)

```
Creating snapshot: saleor-platform-staging-pre-migrate-{TIMESTAMP}
Snapshot creation initiated (not waiting for completion)
```

**Success Criteria**:
- Snapshot creation API call succeeds
- Snapshot appears in RDS console with status "creating"

**Failure Signals**:
- `DBInstanceNotFound`: RDS instance doesn't exist or wrong name
- `AccessDenied`: IAM role missing RDS permissions

---

### Phase 3: Run Django Migrations (Job: `migrate`, Step 2)

**Duration**: ~2-5 minutes

```
[INFO] Running django migrations on staging
[INFO]   Cluster: saleor-platform-staging
[INFO]   Task Definition: saleor-platform-staging-migrate
[INFO] Verifying container 'migrate' exists in task definition...
[OK] Container 'migrate' found in task definition
[INFO] Starting migration task...
[INFO] Migration task started: arn:aws:ecs:us-west-2:{ACCOUNT}:task/saleor-platform-staging/{TASK_ID}
[INFO] Waiting for migration task to complete...
[OK] Migration task completed successfully
```

**Success Criteria**:
- Task definition found
- Container name verified
- Task runs and exits with code 0

**Failure Signals**:
- `Task definition not found`: Terraform didn't create migrate task def
- `Container 'migrate' not found`: Task def has wrong container name
- `Essential container exited with code 1`:
  - Check CloudWatch logs: `/ecs/saleor-platform-staging/migrate`
  - Common causes: DATABASE_URL wrong, DB not reachable, migration conflicts

**Where to Look**:
```bash
# CloudWatch Logs
aws logs tail /ecs/saleor-platform-staging/migrate --follow

# Task status
aws ecs describe-tasks --cluster saleor-platform-staging --tasks {TASK_ARN}
```

---

### Phase 4: Run Prisma Migrations (Job: `migrate`, Step 3)

**Duration**: ~2-5 minutes

```
[INFO] Running prisma migrations on staging
[INFO]   Cluster: saleor-platform-staging
[INFO]   Task Definition: saleor-platform-staging-inventory-ops-app
[INFO] Verifying container 'inventory-ops-app' exists in task definition...
```

**BLOCKER ON FIRST DEPLOY**: The `inventory-ops-app` task definition doesn't exist yet in Terraform.

**Workaround for First Deploy**:
1. Skip Prisma migrations initially (comment out in workflow)
2. OR: Manually create the task definition before first deploy
3. OR: Add inventory-ops-app task definition to Terraform

**After Task Def Exists**:
```
[OK] Container 'inventory-ops-app' found in task definition
[INFO] Migration task started...
[OK] Migration task completed successfully
```

---

### Phase 5: Deploy Core Services (Job: `deploy`)

**Duration**: ~5-10 minutes per service (parallel matrix)

Matrix services: `api`, `worker`, `storefront`, `dashboard`

For each service:
```
[INFO] Deploying api to staging
[INFO]   Cluster: saleor-platform-staging
[INFO]   SHA: {SHA}
[INFO]   Current task def: arn:aws:ecs:...:task-definition/saleor-platform-staging-api:5
[INFO]   Image: ghcr.io/saleor/saleor:3.22
[INFO] Registering new task definition...
[OK] New task definition: arn:aws:ecs:...:task-definition/saleor-platform-staging-api:6
[INFO] Updating ECS service...
[OK] Service update initiated for api
```

**Success Criteria**:
- New task definition registered
- Service update initiated
- Service stability reached (checked by `aws ecs wait services-stable`)

**Failure Signals**:
- `Service not found`: ECS service doesn't exist
- `Unable to register task definition`: IAM permissions or invalid task def JSON
- `Service is not stable`:
  - Tasks failing health checks
  - Container not starting
  - Secret injection failing

**Where to Look**:
```bash
# Service events
aws ecs describe-services --cluster saleor-platform-staging --services api

# Task failures
aws ecs describe-tasks --cluster saleor-platform-staging --tasks {TASK_ARN}

# Container logs
aws logs tail /ecs/saleor-platform-staging/api --follow
```

---

### Phase 6: Deploy Apps (Job: `deploy-apps`)

**Duration**: ~5-10 minutes per service

Matrix services: `stripe-app`, `inventory-ops-app`, `buylist-app`, `pos-app`

**BLOCKER ON FIRST DEPLOY**: These task definitions and services don't exist in Terraform yet.

**Expected Behavior**:
- Job will fail with "Service not found" for each app
- This is acceptable for MVP staging deployment (core services are P0)

**To Enable Apps**:
1. Add task definitions and services to Terraform ECS module
2. Add target groups to ALB module
3. Re-apply Terraform
4. Re-run deployment

---

### Phase 7: Smoke Tests (Job: `smoke-test`)

**Duration**: ~1-2 minutes

```
[INFO] Running smoke tests for staging
======================================
[INFO] Testing API Health...
[OK] API Health: HTTP 200
[INFO] Testing API GraphQL...
[OK] API GraphQL: GraphQL response OK
[INFO] Testing API Channels...
[OK] API Channels: GraphQL response OK
[INFO] Testing Storefront Homepage...
[OK] Storefront Homepage: HTTP 200
[INFO] Testing Storefront Health...
[OK] Storefront Health: HTTP 200
[INFO] Testing Dashboard...
[OK] Dashboard: HTTP 200
======================================
[OK] All smoke tests passed!
```

**Success Criteria**:
- All endpoints return expected HTTP status codes
- GraphQL queries return data (not errors)

**Failure Signals**:
- `HTTP 000`: Service not reachable (DNS not propagated, ALB misconfigured)
- `HTTP 502/503`: Target group unhealthy, tasks not running
- `HTTP 500`: Application error (check container logs)
- `GraphQL error`: API misconfiguration, DATABASE_URL wrong

---

## Post-Deployment Verification

After successful deployment, verify manually:

### 1. API Health
```bash
curl https://api.staging.example.com/health/
# Expected: {"status":"ok"}
```

### 2. GraphQL Endpoint
```bash
curl -X POST https://api.staging.example.com/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query": "{ channels { slug } }"}'
# Expected: {"data":{"channels":[{"slug":"webstore"}]}}
```

### 3. Storefront
```bash
curl -I https://www.staging.example.com/
# Expected: HTTP/2 200
```

### 4. Dashboard
```bash
curl -I https://dashboard.staging.example.com/
# Expected: HTTP/2 200
```

---

## Failure Recovery

### If Build Fails
1. Check build logs in GitHub Actions
2. Fix code/Dockerfile issues
3. Re-run workflow

### If Migrations Fail
1. Check CloudWatch logs for migration task
2. If reversible: Fix migration, re-run
3. If irreversible damage: Restore from pre-migration snapshot

### If Deployment Fails
1. ECS circuit breaker will auto-rollback
2. Check service events and task logs
3. Fix configuration issues
4. Re-run workflow

### If Smoke Tests Fail
1. Services are deployed but unhealthy
2. Check individual endpoint logs
3. May need to rollback: `./scripts/deploy/aws/rollback.sh staging`

---

## Timeline Summary

| Phase | Expected Duration | Blocking? |
|-------|------------------|-----------|
| Build Images | 10-15 min | Yes |
| RDS Snapshot | 30 sec | No (async) |
| Django Migrations | 2-5 min | Yes |
| Prisma Migrations | 2-5 min | Yes (blocked on first deploy) |
| Deploy Core Services | 5-10 min | Yes |
| Deploy Apps | 5-10 min | Blocked on first deploy |
| Smoke Tests | 1-2 min | Yes |
| **Total** | **~25-45 min** | |

---

## Known First Deploy Blockers

1. **Prisma Migrations**: `inventory-ops-app` task definition doesn't exist
   - Workaround: Comment out Prisma migration step for first deploy

2. **App Services**: Task definitions and ECS services for apps don't exist
   - Workaround: Let these fail gracefully; core services will still deploy

3. **Missing Variables**: GitHub variables must be set before trigger
   - Required: `AWS_ACCOUNT_ID`, `STAGING_API_URL`, `STAGING_STOREFRONT_URL`, `STAGING_DASHBOARD_URL`

4. **DNS Not Propagated**: First deploy may fail smoke tests if DNS isn't ready
   - Workaround: Wait for DNS propagation, re-run smoke tests manually
