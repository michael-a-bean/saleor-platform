# Staging Deploy Blocker Audit

**Date:** 2026-01-15
**Branch:** `diagnose/staging-deploy-blockers-20260115`
**Auditor:** Gen (Claude Code)

---

## Executive Summary

Analysis of staging deployment identified **4 critical blockers** that would prevent successful deployment:

1. **Storefront missing `/api/health` endpoint** - ECS container health checks will fail
2. **Missing `HOSTNAME=0.0.0.0` in Saleor app Dockerfiles** - Next.js apps won't be reachable from ALB
3. **Stripe app requires AWS credentials as env vars** - App will crash on startup in ECS (uses task role)
4. **GitHub Actions submodule token access** - CI/CD checkout step fails on private submodules

Additionally, **5 high-priority issues** and **4 medium-priority issues** were identified.

---

## Staging Deploy Reference Flow (Observed)

### Primary Path: GitHub Actions CI/CD

**Workflow file:** `.github/workflows/deploy-staging.yml`

**Trigger:** Push to `platform/main` or manual `workflow_dispatch`

**Jobs (in sequence):**

| Job | Description | Dependencies |
|-----|-------------|--------------|
| `build` | Build and push container images to ECR | - |
| `migrate` | Run Django and Prisma migrations | build |
| `deploy` | Deploy core services (api, worker, storefront, dashboard) | build, migrate |
| `deploy-apps` | Deploy Saleor apps (stripe, inventory-ops, buylist, pos) | build, migrate, deploy |
| `validate-urls` | Validate configured URLs are reachable | deploy, deploy-apps |
| `smoke-test` | Post-deploy smoke tests | validate-urls |

### Secondary Path: Manual Terraform Apply

**Process:**
```bash
cd infra/terraform
terraform plan -var-file=environments/staging.tfvars -out=staging.tfplan
terraform apply staging.tfplan
```

Then trigger service updates:
```bash
aws ecs update-service --cluster saleor-platform-staging --service <service> --force-new-deployment
```

### Key Configuration Files

| File | Purpose |
|------|---------|
| `infra/terraform/environments/staging.tfvars` | Staging environment variables |
| `infra/terraform/main.tf` | Root Terraform module |
| `infra/terraform/modules/ecs/main.tf` | ECS task definitions |
| `infra/terraform/modules/alb/main.tf` | ALB and target groups |
| `.github/workflows/deploy-staging.yml` | CI/CD workflow |
| `docs/ops/runbooks/staging-apply-and-verify.md` | Manual verification runbook |

### Current Staging URLs

| Service | URL |
|---------|-----|
| ALB Base | `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com` |
| API GraphQL | `/graphql/` |
| Dashboard | `/dashboard/` |
| Storefront | `/` |
| Stripe App | `/apps/stripe` |
| Inventory Ops | `/apps/inventory` |
| Buylist | `/apps/buylist` |
| POS | `/apps/pos` |

---

## Findings by Agent

### Agent A — Terraform / AWS Infra

**Status:** Terraform configuration is syntactically valid. Plan shows 115 resources to create.

| Finding | Severity | Details |
|---------|----------|---------|
| ECR IMMUTABLE tags conflict | MEDIUM | `staging-latest` tag will fail on re-push with IMMUTABLE setting |
| Dashboard missing container health check | MEDIUM | ECS can't detect unhealthy containers before ALB |
| OIDC provider may exist | LOW | First apply may fail if provider was manually created |

**Key Files:**
- `infra/terraform/modules/ecr/main.tf:27` - `image_tag_mutability = "IMMUTABLE"`
- `infra/terraform/modules/ecs/main.tf:255-292` - Dashboard task definition (no healthCheck)

### Agent B — CI/CD Pipeline

**Status:** Primary blocker is submodule access. Secondary issues with region defaults.

| Finding | Severity | Details |
|---------|----------|---------|
| Submodule token access | CRITICAL | `SUBMODULES_TOKEN` secret missing or lacks access to nested repos |
| Region mismatch in scripts | MEDIUM | Scripts default to `us-west-2`, staging uses `us-west-1` |
| Service name mismatch | MEDIUM | `IMAGE_MAP` uses `-app` suffix, ECS services don't |

**Key Files:**
- `.github/workflows/deploy-staging.yml:42-45` - Submodule checkout
- `scripts/deploy/aws/lib/common.sh:38` - `${AWS_REGION:-us-west-2}` (should be us-west-1)
- `scripts/deploy/aws/deploy-service.sh:50-54` - IMAGE_MAP keys mismatch ECS service names

### Agent C — Containerization & Runtime Boot

**Status:** Two critical issues will prevent container health checks from passing.

| Finding | Severity | Details |
|---------|----------|---------|
| Missing storefront health endpoint | CRITICAL | `/api/health` doesn't exist but ECS expects it |
| Missing HOSTNAME=0.0.0.0 in app Dockerfiles | CRITICAL | Next.js binds to localhost, unreachable from ALB |
| Buylist missing prisma generate | MEDIUM | May cause startup failures |
| Node version inconsistency | LOW | Stripe uses node:20, others use node:22 |

**Key Files:**
- `storefront/src/app/api/` - No `health/` directory
- `saleor-apps/apps/stripe/Dockerfile:91-92` - Missing HOSTNAME env
- `saleor-apps/apps/inventory-ops/Dockerfile:77-78` - Missing HOSTNAME env
- `saleor-apps/apps/buylist/Dockerfile:76-77` - Missing HOSTNAME env
- `saleor-apps/apps/pos/Dockerfile:78-79` - Missing HOSTNAME env

### Agent D — Saleor App Integration

**Status:** Manifest configuration is correct. APL storage is the main concern.

| Finding | Severity | Details |
|---------|----------|---------|
| FileAPL ephemeral storage | HIGH | inventory-ops, buylist, pos use FileAPL which is lost on container restart |
| Missing crypto.randomUUID polyfill | HIGH | inventory-ops, buylist, pos need `_document.tsx` with inline polyfill |
| Missing health endpoint | MEDIUM | Stripe app has no `/api/health` endpoint |

**Key Files:**
- `saleor-apps/apps/inventory-ops/src/lib/saleor-app.ts` - Uses `NormalizedFileAPL`
- `saleor-apps/apps/stripe/src/pages/_document.tsx` - HAS polyfill (template for others)
- `saleor-apps/apps/inventory-ops/src/pages/_document.tsx` - MISSING (needs creation)

### Agent E — Environment/Secrets Contract

**Status:** Critical mismatch in Stripe app AWS credential requirements.

| Finding | Severity | Details |
|---------|----------|---------|
| Stripe AWS credentials required | CRITICAL | `env.ts` requires AWS_ACCESS_KEY_ID/SECRET as strings (no default) |
| API SSM parameters not bootstrapped | HIGH | `bootstrap-app-secrets.sh` doesn't create `/saleor/staging/api/*` |
| Missing buylist .env.example | MEDIUM | No documentation for required env vars |

**Key Files:**
- `saleor-apps/apps/stripe/src/lib/env.ts:35-36` - `z.string()` (required, no default)
- `scripts/deploy/aws/bootstrap-app-secrets.sh` - Only creates app secrets, not API secrets

### Agent F — Observability

**Status:** Log infrastructure is well-configured. Missing health endpoint is main issue.

| Finding | Severity | Details |
|---------|----------|---------|
| Missing storefront health endpoint | CRITICAL | Same as Agent C |
| Orphaned meilisearch log group | LOW | Log group created but no ECS service |
| Health endpoints don't log | LOW | Makes ALB debugging difficult |

**Key Files:**
- `infra/terraform/modules/ecs/main.tf:41-55` - Log group definitions
- `infra/terraform/modules/ecs/main.tf:238-244` - Storefront health check expects `/api/health`

---

## Blocker Summary

| ID | Severity | Category | Description | Status |
|----|----------|----------|-------------|--------|
| B1 | CRITICAL | Container | Storefront missing `/api/health` endpoint | Fix Applied |
| B2 | CRITICAL | Container | Missing `HOSTNAME=0.0.0.0` in app Dockerfiles | Fix Applied |
| B3 | CRITICAL | Env/Secrets | Stripe app requires AWS credentials as required env vars | Fix Applied |
| B4 | CRITICAL | CI/CD | Submodule token access failure | Manual - See Remediation |
| H1 | HIGH | App Integration | FileAPL ephemeral storage for 3 apps | Manual - See Remediation |
| H2 | HIGH | App Integration | Missing crypto.randomUUID polyfill | Manual - See Remediation |
| H3 | HIGH | Env/Secrets | API SSM parameters not bootstrapped | Manual - See Remediation |
| M1 | MEDIUM | CI/CD | Region mismatch in deploy scripts | Manual - See Remediation |
| M2 | MEDIUM | Terraform | ECR IMMUTABLE tags conflict | Manual - See Remediation |
| M3 | MEDIUM | CI/CD | Service name mismatch in IMAGE_MAP | Manual - See Remediation |
| M4 | MEDIUM | Terraform | Dashboard missing container health check | Manual - See Remediation |

---

## Fixes Applied

| Commit | Description | Files Changed |
|--------|-------------|---------------|
| (pending) | Create storefront health endpoint | `storefront/src/app/api/health/route.ts` |
| (pending) | Add HOSTNAME=0.0.0.0 to app Dockerfiles | 4 Dockerfiles |
| (pending) | Make Stripe AWS credentials optional | `saleor-apps/apps/stripe/src/lib/env.ts` |

---

## Remediation Plan

### Immediate (Before First Deploy)

1. **B4 - Configure Submodule Token**
   - Create fine-grained PAT with access to all nested repositories
   - Add as repository secret named `SUBMODULES_TOKEN`
   - See: `docs/ops/runbooks/github-actions-submodules.md`

2. **H3 - Bootstrap API SSM Parameters**
   ```bash
   aws ssm put-parameter --name "/saleor/staging/api/SECRET_KEY" --value "$(openssl rand -hex 32)" --type SecureString
   aws ssm put-parameter --name "/saleor/staging/api/DATABASE_URL" --value "postgresql://..." --type SecureString
   aws ssm put-parameter --name "/saleor/staging/api/CELERY_BROKER_URL" --value "redis://..." --type SecureString
   aws ssm put-parameter --name "/saleor/staging/api/RSA_PRIVATE_KEY" --value "$(openssl genrsa 2048)" --type SecureString
   ```

### Post-Deploy

3. **H1 - FileAPL to DynamoDB Migration**
   - Option A: Create DynamoDB tables for inventory-ops, buylist, pos (like stripe)
   - Option B: Mount EFS volume for persistent `/data` directory
   - Option C: Create custom PostgreSQL-backed APL

4. **H2 - Add crypto.randomUUID Polyfill**
   - Copy `saleor-apps/apps/stripe/src/pages/_document.tsx` to:
     - `saleor-apps/apps/inventory-ops/src/pages/_document.tsx`
     - `saleor-apps/apps/buylist/src/pages/_document.tsx`
     - `saleor-apps/apps/pos/src/pages/_document.tsx`

5. **M1 - Fix Region Defaults**
   - Update `scripts/deploy/aws/lib/common.sh:38` to use `us-west-1`
   - Update all deploy scripts to use consistent region

6. **M2 - ECR Tag Strategy**
   - Either remove `staging-latest` tag from workflow
   - Or change ECR to MUTABLE for staging repos

7. **M3 - Fix Service Name Mapping**
   - Update `scripts/deploy/aws/deploy-service.sh` IMAGE_MAP keys to match ECS service names

---

## Verification Checklist

See: `docs/ops/staging_verification_checklist.md`

---

## Crowdsourced Notes

None required - all issues identified through codebase analysis.

---
