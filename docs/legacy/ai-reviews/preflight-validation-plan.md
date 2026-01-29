# Pre-Flight Validation Plan: AWS ECS/Fargate Deployment

**Generated**: 2026-01-10T14:35:00-08:00
**Author**: Gen (Claude Code Assistant)
**Status**: Draft - Pending AI Review

---

## 1. Context

Phase 2-3 AWS ECS/Fargate implementation is complete in-repo, but NO manual steps have been taken yet:
- No AWS resources created
- No GitHub OIDC set up
- No secrets populated
- No Terraform applied

This plan validates the repo artifacts for internal consistency and identifies blockers before the first staging deploy.

---

## 2. Identified Issues and Observations

### 2.1 Critical Issues

#### Issue 1: Migration Task Definition Container Name Mismatch

**Location**: `scripts/deploy/aws/run-migrations.sh:78`

The script uses `containerOverrides` with `"name":"migrate"`, but for Prisma migrations it changes the task definition to `inventory-ops-app` without updating the container name. The inventory-ops-app container is likely not named "migrate".

```bash
# Line 69-71
if [[ "$MIGRATION_TYPE" == "django" ]]; then
    COMMAND='["python", "manage.py", "migrate", "--noinput"]'
else
    # Prisma migrations run from inventory-ops-app
    TASK_DEF="saleor-platform-${ENV}-inventory-ops-app"
    COMMAND='["npx", "prisma", "migrate", "deploy"]'
fi
```

**Risk**: Prisma migrations will fail because containerOverrides specifies container name "migrate" but the task uses a different container name.

**Fix Required**: Update container name in override to match the actual container in inventory-ops-app task definition.

#### Issue 2: Production Workflow Missing AWS Credentials for Several Steps

**Location**: `.github/workflows/deploy-production.yml`

The `approval` job runs on `ubuntu-latest` but doesn't need AWS credentials. However, the `smoke-test` job is missing explicit AWS credentials configuration (it needs them if accessing AWS resources).

**Assessment**: Smoke test only uses curl, so no AWS credentials needed. This is OK.

#### Issue 3: deploy-service.sh Hardcoded Image Mapping

**Location**: `scripts/deploy/aws/deploy-service.sh:45-55`

The IMAGE_MAP hardcodes upstream Saleor images with tags (`:3.22`), but production should use digest-pinned images for immutability.

```bash
declare -A IMAGE_MAP=(
    ["api"]="ghcr.io/saleor/saleor:3.22"
    ["worker"]="ghcr.io/saleor/saleor:3.22"
    ...
)
```

**Risk**: Production deployments may get different images if the tag is overwritten upstream.

**Recommendation**: The deploy script should read the image from the ECS task definition or Terraform outputs, not hardcode it.

### 2.2 Medium Issues

#### Issue 4: ECS Service Name Mismatch in Staging Workflow

**Location**: `.github/workflows/deploy-staging.yml:211-214`

The workflow uses `--services ${{ matrix.service }}` but the matrix includes services like `stripe-app` while ECS services may be named differently (needs verification).

**Assessment**: The deploy-service.sh uses the same names, so this should be consistent.

#### Issue 5: Missing Task Definition for Apps

**Location**: `infra/terraform/modules/ecs/main.tf`

The ECS module only defines task definitions for `api`, `worker`, `storefront`, `dashboard`, and `migrate`. It does NOT define task definitions for:
- stripe-app
- inventory-ops-app
- buylist-app
- pos-app
- meilisearch

**Risk**: First staging deploy will fail because these task definitions don't exist.

**Fix Required**: Either add task definitions for apps in Terraform, or document that these must be created manually/by CI.

#### Issue 6: Staging Workflow References Non-Existent Variables

**Location**: `.github/workflows/deploy-staging.yml:70-72`

```yaml
build-args: |
  NEXT_PUBLIC_SALEOR_API_URL=${{ vars.STAGING_API_URL }}/graphql/
```

These variables (`STAGING_API_URL`, `STAGING_STOREFRONT_URL`) must be created in GitHub repository settings before the first deploy.

#### Issue 7: Production Workflow Uses vars.AWS_ACCOUNT_ID

**Location**: `.github/workflows/deploy-production.yml:49`

Same issue - `AWS_ACCOUNT_ID` must be set as a repository variable.

### 2.3 Low Issues / Observations

#### Issue 8: OIDC Thumbprint May Be Outdated

**Location**: `infra/terraform/modules/iam/main.tf:30-33`

GitHub OIDC thumbprints can change. The hardcoded values should be verified.

```hcl
thumbprint_list = [
  "6938fd4d98bab03faadb97b34396831e3780aea1",
  "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
]
```

**Note**: AWS now recommends not hardcoding thumbprints and instead using their managed OIDC provider.

#### Issue 9: tfvars Placeholder Values

**Location**: `infra/terraform/environments/staging.tfvars:8,48`

```hcl
domain_name = "staging.example.com"
github_org  = "YOUR_GITHUB_ORG"
```

These must be replaced before Terraform apply.

---

## 3. Validation Checklist

### 3.1 Static Validation (Without AWS Access)

| Check | Tool | Status | Notes |
|-------|------|--------|-------|
| Terraform fmt | `terraform fmt -check` | Pending | Terraform not installed locally |
| Terraform validate | `terraform validate` | Pending | Needs `terraform init` first |
| YAML lint | actionlint/yamllint | Pending | Not installed |
| Bash strict mode | shellcheck | Pending | Not installed |
| Secret detection | gitleaks | Pending | Not installed |

### 3.2 Script Safety Checks

| Script | `set -euo pipefail` | No secret echo | Fail-fast |
|--------|---------------------|----------------|-----------|
| lib/common.sh | YES | YES (mask_value) | YES |
| deploy-service.sh | YES | YES | YES |
| run-migrations.sh | YES | YES | YES |
| smoke-test.sh | YES | YES | YES |
| rollback.sh | YES | YES | YES |

### 3.3 Workflow Checks

| Workflow | OIDC Auth | Environment Protection | Concurrency |
|----------|-----------|----------------------|-------------|
| deploy-staging.yml | YES | NO (auto-deploy) | YES |
| deploy-production.yml | YES | YES (production env) | YES |

---

## 4. Questions for AI Reviewers

### For GPT-5.2 (Correctness/Spec Review)

1. **Workflow Dependencies**: Is the job dependency graph in deploy-staging.yml correct? (build -> migrate -> deploy -> deploy-apps -> smoke-test)

2. **Promotion Semantics**: Does deploy-production.yml correctly reuse staging images without rebuild? The workflow takes `staging_sha` as input and uses it directly.

3. **Migration Ordering**: Is running Django migrations before Prisma migrations correct? Are there any cross-dependencies?

4. **ECS Task Definition Update Pattern**: The deploy-service.sh pattern of "describe -> modify JSON -> register new -> update service" - is this the recommended approach?

5. **Missing App Task Definitions**: Should Terraform create all task definitions, or is it acceptable for CI to create them on first deploy?

### For Gemini 3 (Security/Ops Review)

1. **OIDC Trust Policy Scope**: The IAM role trust policy allows:
   - `repo:{org}/{repo}:ref:refs/heads/platform/main`
   - `repo:{org}/{repo}:environment:{environment}`
   - `repo:{org}/{repo}:ref:refs/heads/platform/main:*`

   Is this appropriately scoped? Does the wildcard introduce risk?

2. **Secret Handling**: Secrets are fetched from SSM at container startup via ECS secrets configuration. Is this the recommended pattern vs. fetching at deploy time?

3. **Network Boundaries**: Private subnets for ECS tasks, security groups restricting access. Any gaps?

4. **RDS Snapshot Strategy**: Pre-migration snapshots are created but not waited for (staging). Production waits. Is this appropriate?

5. **Rollback Limitations**: The rollback script only rolls back ECS services, not database migrations. Should we document database rollback procedures separately?

---

## 5. Proposed Fixes

### Fix 1: Update run-migrations.sh for Prisma

```bash
# In run-migrations.sh, change Prisma section:
if [[ "$MIGRATION_TYPE" == "prisma" ]]; then
    TASK_DEF="saleor-platform-${ENV}-inventory-ops-app"
    CONTAINER_NAME="inventory-ops-app"  # Match actual container name
    COMMAND='["npx", "prisma", "migrate", "deploy"]'
fi

# Update the containerOverrides to use the correct name:
--overrides "{\"containerOverrides\":[{\"name\":\"${CONTAINER_NAME:-migrate}\",\"command\":${COMMAND}}]}"
```

### Fix 2: Add Missing App Task Definitions to Terraform

Add task definitions for stripe-app, inventory-ops-app, buylist-app, pos-app, and meilisearch in the ECS module.

### Fix 3: Document Required GitHub Variables

Create a clear checklist of all GitHub repository variables/secrets needed.

---

## 6. Deliverables to Create

1. **FIRST_DEPLOY_TRACE.md** - Expected execution trace for first staging deploy
2. **MANUAL_STEPS.md** - Revised runbook with ordered, executable steps
3. **PROMOTION_MODEL.md** - Image promotion semantics verification
4. **MIGRATION_EXECUTION_MODEL.md** - Django + Prisma migration procedures
5. **MANUAL_INPUTS_TABLE.md** - All manual inputs needed with creation instructions

---

## 7. Review Request

Please review this plan and provide feedback on:

1. Accuracy of identified issues
2. Completeness of validation checklist
3. Appropriateness of proposed fixes
4. Any additional risks or blockers not identified

