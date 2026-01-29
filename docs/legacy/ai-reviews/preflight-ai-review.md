Calling GPT-5.2 for correctness review...
GPT-5.2 review complete.
Calling Gemini 3 for security review...
/home/michael/.local/lib/python3.10/site-packages/google/api_core/_python_version_support.py:275: FutureWarning: You are using a Python version (3.10.12) which Google will stop supporting in new releases of google.api_core once it reaches its end of life (2026-10-04). Please upgrade to the latest Python version, or at least Python 3.11, to continue receiving updates for google.api_core past that date.
  warnings.warn(message, FutureWarning)
/home/michael/saleor-platform/scripts/deploy/aws/ai-review.py:36: FutureWarning: 

All support for the `google.generativeai` package has ended. It will no longer be receiving 
updates or bug fixes. Please switch to the `google.genai` package as soon as possible.
See README for more details:

https://github.com/google-gemini/deprecated-generative-ai-python/blob/main/README.md

  import google.generativeai as genai
Gemini 3 review complete.
# Pre-Flight Validation AI Review

**Generated**: 2026-01-10T14:39:56
**Input**: preflight-validation-plan.md

---

## GPT-5.2 Review (Correctness/Spec)

## Overall assessment

This is a solid pre-flight plan: it correctly focuses on *internal consistency* before any AWS/GitHub setup, and it already caught several likely “first deploy blockers” (migration override name, missing task defs, missing repo vars). The biggest gap is that the plan assumes certain ECS/Terraform naming conventions and task/service existence without proving them via repo-wide references. I’d tighten the validation to explicitly reconcile **(a)** Terraform-created resources, **(b)** workflow/service matrices, and **(c)** deploy scripts’ expectations.

Below is a review aligned to the requested focus areas.

---

## 1) Confirmation of correctly identified issues

### 1.1 Migration task definition container name mismatch (Correct)
- **File**: `scripts/deploy/aws/run-migrations.sh:78` (as cited)
- Your diagnosis is correct: `containerOverrides[].name` must match a container name in the task definition being run. If you switch `TASK_DEF` to `saleor-platform-${ENV}-inventory-ops-app` but keep override name `"migrate"`, the run-task call will fail with something like *“Override for container named migrate is not a container in the TaskDefinition”*.
- Also: if the inventory-ops task definition has multiple containers (sidecars), you must target the correct one.

### 1.2 Production workflow “missing AWS creds” for smoke test (Likely OK)
- Your assessment is reasonable **if** smoke tests are pure HTTP(S) calls and do not query AWS (e.g., `aws ecs describe-services`, `aws logs`, `aws elbv2`, etc.).
- Recommendation: explicitly assert in the plan that smoke-test does not use AWS CLI, and fail the workflow if AWS CLI is invoked without credentials (optional guard).

### 1.3 Hardcoded image mapping in `deploy-service.sh` (Correct and important)
- **File**: `scripts/deploy/aws/deploy-service.sh:45-55`
- Yes: tag-based upstream images are not immutable. Even if upstream *usually* doesn’t retag, relying on it for production is a supply-chain and reproducibility risk.
- This is especially important given your stated “promotion semantics” goal (staging → prod reuse).

### 1.4 Staging workflow service name mismatch risk (Plausible; needs proof)
- **File**: `.github/workflows/deploy-staging.yml:211-214`
- Your current conclusion (“should be consistent”) is only true if:
  1) Terraform creates ECS services with names matching the matrix entries, **and**
  2) `deploy-service.sh` maps those names to the correct ECS service ARNs.
- Right now, your plan flags it as “needs verification,” which is appropriate.

### 1.5 Missing task definitions for apps (Correct; likely a deploy blocker)
- **File**: `infra/terraform/modules/ecs/main.tf`
- If Terraform truly only defines task defs for `api`, `worker`, `storefront`, `dashboard`, `migrate`, then any CI step that tries to update/run `stripe-app`, `inventory-ops-app`, etc. will fail unless those are created elsewhere (another module, manual, or script-generated).
- This is one of the most likely “first staging deploy fails immediately” items.

### 1.6 Missing GitHub variables (`STAGING_API_URL`, `AWS_ACCOUNT_ID`, etc.) (Correct)
- These are classic first-run blockers. Good catch.

### 1.7 OIDC thumbprint hardcoding (Valid concern; slightly nuanced)
- **File**: `infra/terraform/modules/iam/main.tf:30-33`
- Thumbprints can change; AWS has improved GitHub OIDC setup guidance over time. Your note is directionally correct.
- However, “AWS managed OIDC provider” wording is a bit imprecise: for GitHub Actions you still create an IAM OIDC provider for `token.actions.githubusercontent.com`, but you can reduce operational risk by:
  - using the current recommended thumbprint(s),
  - or automating verification,
  - and scoping trust policy tightly (more important than thumbprints in many cases).

### 1.8 tfvars placeholders (Correct)
- Good to call out; these are guaranteed apply-time failures or misdeployments.

---

## 2) Additional issues / risks missed (actionable)

### 2.1 Workflow dependency graph: ensure “migrate” is serialized against deploys
You asked about ordering (build → migrate → deploy → deploy-apps → smoke-test). Two common pitfalls to validate in the YAML:

1) **Concurrency group collisions**: if staging deploy is re-run, you can end up with overlapping migrations and service updates unless concurrency is global per env.
2) **Matrix fan-out**: if `deploy` is a matrix job and `migrate` is a single job, ensure `deploy` has `needs: migrate` (not just “build”), and that *all* deploy matrices depend on migrate.

**Recommendation**: In the plan, add a check that:
- every job that touches ECS services has `needs: migrate` (or `needs: deploy-core` that itself needs migrate),
- and concurrency is `staging`-scoped (e.g., `concurrency.group: deploy-staging`).

### 2.2 Terraform module structure/variable consistency: naming contract needs explicit validation
Right now the plan assumes names like:
- `saleor-platform-${ENV}-inventory-ops-app` (task def family?)
- ECS service names matching matrix entries

**Risk**: Terraform might be using different naming (prefix/suffix, underscores vs hyphens, `family` vs `name`, etc.). This causes “resource not found” failures even if everything exists.

**Add a validation step** (static, repo-only):
- Grep/trace where service names are constructed in Terraform (`aws_ecs_service.name`, `aws_ecs_task_definition.family`) and compare to:
  - workflow matrix values
  - script defaults (`TASK_DEF=...`, cluster naming, service naming)

If you can’t run Terraform, you can still do a deterministic “name contract” review by reading the HCL.

### 2.3 Migration ordering safety (Django vs Prisma): don’t assume independence
Your question asks “Django before Prisma?” The plan doesn’t yet enforce safety constraints:

- If Django and Prisma touch the **same database/schema**, ordering matters and may require:
  - locking/maintenance window,
  - ensuring both migration systems don’t manage overlapping tables,
  - ensuring Prisma migrations are idempotent and safe to run repeatedly.
- If they touch **different databases** (or different schemas/users), ordering is less critical.

**Actionable addition**: In `MIGRATION_EXECUTION_MODEL.md`, require an explicit statement:
- which DB each migration targets (host/dbname/schema/user),
- whether there is any overlap in tables,
- and whether migrations are safe under concurrent app traffic.

### 2.4 ECS task definition update pattern: JSON patching is fragile
Your deploy pattern “describe → modify JSON → register → update service” works, but common failure modes:
- forgetting to remove read-only fields (`revision`, `status`, `taskDefinitionArn`, `requiresAttributes`, `compatibilities`, `registeredAt`, `registeredBy`)
- accidentally dropping fields (proxy config, ephemeral storage, runtime platform, inference accelerators, etc.)
- not updating both `containerDefinitions[].image` and any sidecars consistently

**Recommendation**: Prefer one of:
- `aws ecs register-task-definition --cli-input-json file://...` from a *rendered template* you control (Terraform output or checked-in JSON), or
- use Terraform to manage task definitions and only update `image` via variables (most stable), or
- use `jq` with an allowlist patch and a “strip read-only fields” function.

Add to checklist: verify the script strips immutable/read-only fields before registering.

### 2.5 Image promotion semantics: “staging_sha” is not a promotion model by itself
If production takes `staging_sha` and rebuilds or re-tags, you can still drift. A true promotion model typically promotes **digests** (or ECR image manifests), not Git SHAs.

**Risk**: same SHA can produce different images if build is non-reproducible (timestamps, base image drift, npm install without lock integrity, etc.).

**Recommendation**:
- In staging, capture and persist the **image digest** for each service (e.g., output from `docker buildx imagetools inspect` or ECR `describe-images`).
- In production, deploy by digest (`image@sha256:...`), not tag.
- Store the “release manifest” as an artifact (JSON) and require prod workflow to use it.

### 2.6 ECS service deployment correctness: health checks and deployment circuit breaker
Not mentioned in the plan, but critical for first deploy:
- Do services have correct target group health check paths/ports?
- Is `deployment_circuit_breaker { enable = true, rollback = true }` configured (Terraform) to auto-rollback on failed deployments?
- Are container ports and `awsvpc` networking consistent?

**Add checks**:
- Task definition container port mappings match ALB target group port.
- Health check path matches app (e.g., `/health/` vs `/graphql/`).
- `minimumHealthyPercent` / `maximumPercent` are sane for single-instance services.

### 2.7 “Run migrations” task networking/logging prerequisites
Even if the task definition exists, migrations often fail due to:
- task launched in wrong subnets (no DB route)
- security group missing DB access
- no CloudWatch log group permissions
- execution role missing SSM/Secrets permissions if secrets are injected

Add checklist items:
- migration task uses same subnets/SG as app tasks (or explicitly correct ones)
- execution role includes `logs:CreateLogStream/PutLogEvents` and secrets access

---

## 3) Assessment of proposed fixes

### Fix 1 (run-migrations.sh container name) — Good, but tighten it
Your fix is directionally correct. Two improvements:

1) **Don’t default silently** to `migrate` if `CONTAINER_NAME` is unset for prisma; fail fast:
   - If `MIGRATION_TYPE=prisma` and container name isn’t found, exit with a clear error.
2) **Discover container name dynamically** from the task definition:
   - `aws ecs describe-task-definition ... | jq -r '.taskDefinition.containerDefinitions[].name'`
   - then select the one you want (or require exact match).

This prevents future drift if Terraform renames containers.

### Fix 2 (add missing app task definitions to Terraform) — Strongly recommended
Yes: Terraform should be the source of truth for task definitions and services. Letting CI “create on first deploy” leads to:
- unmanaged drift
- missing IAM permissions in CI
- hard-to-reproduce infra state

If you truly want CI-managed task defs, document it explicitly and ensure Terraform does **not** also try to manage them (or you’ll fight drift constantly).

### Fix 3 (document required GitHub variables) — Good, expand scope
Include:
- repo **Variables** vs **Secrets**
- environment-scoped secrets (staging vs production)
- required AWS region(s), cluster names, role ARNs
- any SSM parameter path conventions

Also add a “validation step” in workflows that fails early if required vars are missing (simple bash checks).

---

## 4) Specific recommendations to improve the plan (by focus area)

### 4.1 GitHub Actions workflow dependencies & ordering
Add explicit validations:
- Confirm `needs:` chain enforces: **migrate completes before any ECS service update**.
- Confirm production workflow requires staging artifact/manifest (digest list), not just `staging_sha`.
- Confirm concurrency is per-environment and prevents overlapping runs that could interleave migrations.

### 4.2 Terraform module structure & variable consistency
Add a “name contract table” to the plan:
- `ENV` → cluster name
- service logical name → `aws_ecs_service.name`
- task family → `aws_ecs_task_definition.family`
- container name(s) per task def

Then verify scripts/workflows use those exact values.

### 4.3 Migration ordering & safety (Django vs Prisma)
Add explicit rules:
- If both target same DB: run in a single “migration window” with app scaled down or read-only mode (if required).
- Require idempotency: re-running migrations should be safe.
- Require snapshot/wait behavior consistent across envs (staging can be “don’t wait” only if you accept the risk; otherwise wait everywhere).

### 4.4 ECS task definition/service configuration accuracy
Add checks for:
- health check endpoints
- port mappings
- execution role permissions for logs + secrets
- deployment circuit breaker enabled
- desired count and autoscaling min/max sane for first deploy

### 4.5 Image promotion semantics (staging → production)
Define promotion as:
- staging build produces **immutable digests**
- production deploy consumes the **same digests**
- store a release manifest artifact and require it for prod approval

---

## Suggested additions to your Deliverables list

Add:
1) **RELEASE_MANIFEST.json** format (service → image digest → task family → git sha)
2) **NAME_CONTRACT.md** (Terraform ↔ scripts ↔ workflows naming reconciliation)
3) **PREDEPLOY_ASSERTIONS.md** (what must exist before first apply/deploy: OIDC provider, role ARNs, SSM paths, hosted zone, ACM certs, etc.)

---

## Bottom line: top blockers to resolve before first staging deploy

1) **Terraform must define all ECS services/task defs you intend to deploy** (or CI must, but pick one).
2) **Migration run-task must target the correct container name** (prefer dynamic discovery).
3) **Stop hardcoding upstream tags for production**; implement digest-based promotion.
4) **Reconcile naming across Terraform/workflows/scripts** to avoid “resource not found” failures.

If you paste the relevant snippets from:
- `.github/workflows/deploy-staging.yml` (jobs + needs + concurrency + matrices)
- `.github/workflows/deploy-production.yml`
- `infra/terraform/modules/ecs/main.tf` (ecs_service + task_definition blocks)
- `scripts/deploy/aws/deploy-service.sh` (how it finds cluster/service/task def)

…I can do a much more concrete, line-referenced dependency and naming-contract review.

---

## Gemini 3 Review (Security/Ops)

Here is the Cloud Security Architect review of the Pre-Flight Validation Plan.

# Security & Operational Review: Pre-Flight Validation Plan

**Reviewer Role**: Cloud Security Architect
**Date**: 2026-01-10
**Target**: AWS ECS/Fargate Infrastructure & GitHub Actions Workflows

---

## 1. Executive Summary

The pre-flight plan correctly identifies several blocking operational issues (missing task definitions, variable gaps). However, from a security architecture perspective, there are significant risks regarding **immutable deployments** and **OIDC scope** that need to be addressed before the first `terraform apply`.

The most critical security finding is the reliance on mutable image tags in production and the lack of clarity on how secrets are injected into the Terraform state.

---

## 2. Security Architecture Analysis

### 2.1 IAM & OIDC Trust Scope
**Severity: HIGH**

**Observation**: The plan notes the OIDC trust policy includes `repo:{org}/{repo}:ref:refs/heads/platform/main:*`.

**Risk**:
1.  **Wildcard Expansion**: The trailing wildcard `*` implies matching any ref starting with that string. If you have a branch naming convention like `platform/main-feature`, a developer could push code to that unprotected branch and assume the identity of the deployment role.
2.  **Environment Gaps**: While you use `environment:{environment}`, GitHub Actions workflows often trigger on `push` (ref-based) *or* `deployment` (environment-based). If the IAM role allows *either* condition in an `OR` statement, branch protection bypasses are possible.

**Mitigation**:
*   Strictly lock the Subject (`sub`) condition to exact matches: `repo:org/repo:ref:refs/heads/platform/main` (no wildcard).
*   Prioritize `environment` conditions (`repo:org/repo:environment:production`) for the production role to enforce GitHub Environment protection rules (Manual Approvals).

### 2.2 Container Immutability & Supply Chain
**Severity: CRITICAL**

**Observation**: Issue 3 identifies hardcoded tags (`:3.22`).

**Risk**:
*   **Mutable Tags**: Using `:3.22` is a security violation for Production. Upstream maintainers (Saleor) can overwrite this tag with a vulnerable image or a breaking change without changing the version number.
*   **Race Conditions**: During a scaling event, ECS might pull a newer version of `:3.22` than what is currently running, causing version drift within a single cluster.

**Mitigation**:
*   **Digest Pinning**: The `deploy-service.sh` script must resolve the tag to a SHA256 digest (`saleor:3.22@sha256:abc...`) at build/push time.
*   **ECR Mirroring**: Ideally, pull upstream images, scan them, and push them to your private ECR. Deploy *only* from your private ECR. This guarantees availability even if Docker Hub/GHCR goes down or removes the package.

### 2.3 Secret Management & Terraform State
**Severity: HIGH**

**Observation**: The plan states "No secrets populated".

**Risk**:
*   **State File Leaks**: If you plan to populate `TF_VAR_db_password` or similar via GitHub Secrets to be used in Terraform, these values will be stored in **plaintext** in the `terraform.tfstate` file (even if remote).
*   **Environment Variable Leakage**: Passing secrets as environment variables to the container (even via `secrets` logic) is standard, but you must ensure the Terraform execution plan doesn't output these values to the GitHub Action logs.

**Mitigation**:
*   **External Secret Creation**: Create Secrets (SSM/Secrets Manager) *outside* of Terraform (e.g., manually or via a specialized script) or use a `lifecycle { ignore_changes = [value] }` block on the SSM resource in Terraform with a dummy initial value.
*   **Reference ARNs**: Terraform should only handle the *mapping* of SSM ARNs to ECS Task Definitions, not the *values* of the secrets.

### 2.4 Network Boundaries (Fargate)
**Severity: MEDIUM**

**Observation**: The plan mentions "Private subnets for ECS tasks".

**Verification Required**:
*   **Public IP Assignment**: Ensure `assign_public_ip = false` is set in the ECS Service definition. Fargate tasks in private subnets cannot utilize Public IPs; they must use NAT Gateways for outbound access.
*   **Security Group Chaining**: Validate that the ECS Task Security Group allows Inbound Traffic *only* from the ALB Security Group on the application port. There should be `0.0.0.0/0` inbound rules on the Compute layer.

---

## 3. Operational & Logic Review (Addressing Identified Issues)

### 3.1 Review of Author's Findings

| Issue ID | Rating | Reviewer Comments |
| :--- | :--- | :--- |
| **Issue 1 (Migration Name)** | **HIGH** | Correct. The override *must* match the container name defined in the Task Def. If Terraform defines it as `inventory-ops-app`, the script must use that. |
| **Issue 2 (Auth Missing)** | **LOW** | Correct. `curl` smoke tests don't need IAM. |
| **Issue 3 (Image Tags)** | **CRITICAL** | See Section 2.2. This is a blocker for a secure production release. |
| **Issue 5 (Missing Task Defs)** | **CRITICAL** | **Correction**: Terraform *must* create the initial "skeleton" Task Definitions (even with dummy images). If they don't exist, the IAM Policies limiting `ecs:UpdateService` to specific ARNs will fail (or require wildcards), and the deployment script will fail to find the service to update. |

### 3.2 Review of "Questions for AI Reviewers"

**Response to Gemini 3 Question 1 (OIDC Scope):**
> *Is this appropriately scoped? Does the wildcard introduce risk?*
**Verdict:** **Yes, the wildcard introduces risk.** Remove `refs/heads/platform/main:*`. It should be an exact match. Ensure Production relies on `environment:production` to enforce the GitHub "Required Reviewers" protection.

**Response to Gemini 3 Question 2 (Secret Handling):**
> *Is fetching from SSM at startup recommended?*
**Verdict:** **Yes.** Using `secrets` in the ECS Task Definition (which injects SSM values as Env Vars at runtime) is the standard best practice.
*Correction:* Ensure the ECS Task Execution Role has `ssm:GetParameters` and `kms:Decrypt` (if using SecureString) for those specific ARNs.

**Response to Gemini 3 Question 4 (RDS Snapshots):**
> *Production waits. Is this appropriate?*
**Verdict:** **Yes.** For Staging, speed is preferred. For Production, data integrity is paramount. However, ensure the script has a timeout/failure logic. If the snapshot hangs for 30 minutes, does the deployment fail safely?

**Response to Gemini 3 Question 5 (Rollback Limitations):**
> *Should we document database rollback procedures?*
**Verdict:** **Yes, specifically the "Expand and Contract" pattern.** You cannot effectively rollback a database schema in an automated pipeline without risking data loss. The documentation must state that **Code Rollbacks are only safe if the Database Schema is backward compatible.**

---

## 4. Specific Recommendations & Mitigations

### Mitigation 1: Terraform "Skeleton" Strategy (Fixing Issue 5)
Update `infra/terraform/modules/ecs/main.tf` to include resource blocks for all apps (`stripe-app`, `inventory-ops-app`, etc.).
*   Use a lightweight placeholder image (e.g., `alpine:latest` or a "paused" container) for the initial Terraform apply.
*   This ensures ARNs exist for IAM policies and Service discovery before the CI/CD pipeline runs.

### Mitigation 2: Immutable Image Workflow (Fixing Issue 3)
Modify `deploy-service.sh`:
1.  **Pull** the upstream tag (`saleor:3.22`).
2.  **Retag** it to your private ECR with a unique ID (e.g., `ecr/saleor:build-${GITHUB_SHA}`).
3.  **Push** to ECR.
4.  **Deploy** using the specific ECR image digest or the unique build tag.
*Never deploy `ghcr.io/saleor/saleor:3.22` directly to production.*

### Mitigation 3: OIDC Thumbprint (Fixing Issue 8)
Remove the hardcoded thumbprint list in `infra/terraform/modules/iam/main.tf`.
Use the `aws_iam_openid_connect_provider` resource without pinning thumbprints (AWS now manages the CA thumbprints for GitHub automatically), or use a trusted Terraform module that handles the thumbprint verification dynamically. Hardcoding specific SHA1 hashes often leads to CI outages when GitHub rotates certificates.

### Mitigation 4: Database Migration Safety
In `run-migrations.sh`, specifically for Production:
1.  Add a "Dry Run" check if possible (Django `sqlmigrate`).
2.  Ensure the script captures the standard output/error log and streams it to the GitHub Action logs for debugging.
3.  **Critical**: Ensure the migration task runs in a Security Group that allows outbound access to the RDS instance, but *blocks* all inbound traffic.

## 5. Final Determination

**Status**: **conditional_fail**

The plan identifies the right operational blockers, but the **Security Architecture** requires adjustment regarding OIDC Wildcards and Image Immutability before this can be approved for Production use. Staging deployment may proceed once Issue 5 (Missing Task Defs) is resolved.

---

## Summary

Review completed. Please address any HIGH or CRITICAL findings before proceeding with deployment.

