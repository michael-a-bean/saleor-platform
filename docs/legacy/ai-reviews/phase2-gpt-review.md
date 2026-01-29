# Phase 2 Specification Review
## GPT-5.2

**Generated**: 2026-01-10T13:43:07.216895
**Model**: gpt-5.2
**Role**: Specification Correctness
**Duration**: 60.65 seconds

---

## Specification Review Summary
The plan is directionally correct for achieving Phase 2 (auto-deploy to staging on merge) and Phase 3 (manual-gated production promotion), but several requirements are ambiguous or unsafe as written—especially around migrations/rollback, image immutability, ALB routing, and stateful components (Meilisearch/EFS). It needs tighter, measurable acceptance criteria and a safer deployment/migration strategy before approval.

## Correctness Analysis

### 1) Service inventory / image strategy
- **Pinning/immutability issue**: `dashboard:latest` is not safe for controlled promotion; it breaks the “same images used in staging are promoted” goal. Use a pinned version/tag (or digest) and promote that exact artifact.
- **Official images vs ECR**: Using GHCR images directly in ECS is possible, but you’ll need:
  - A strategy for **pull credentials** (if private) and **rate limiting** resilience.
  - A clear decision whether to **mirror all runtime images into ECR** for reliability, provenance, and consistent scanning.
- **Worker command**: `celery ... -B` runs beat inside the worker. In ECS with >1 worker in prod, this can cause duplicate scheduled jobs unless you guarantee a single beat instance. This is a correctness risk.

### 2) Network design
- **NAT placement ambiguity**: Diagram shows “Resources: ALB, NAT Gateway” under public subnets, but NAT Gateways are per-AZ and require route tables; ensure private subnets route 0.0.0.0/0 to NAT in same AZ for HA.
- **Security group “dynamic ports”**: For Fargate + ALB, you typically allow **ALB SG → ECS SG on container port(s)** (or ephemeral if using dynamic host ports). The spec should explicitly state whether you’re using **awsvpc with fixed container ports** (recommended) and how target groups are configured.
- **No mention of VPC endpoints**: Not required, but without them you’ll rely on NAT for ECR/CloudWatch/SSM access; cost and availability implications should be acknowledged.

### 3) ECS cluster/service design
- **ALB routing not specified**: You list many services with ports, but do not define:
  - Host/path rules (e.g., `api.{domain}` → api target group; `dashboard.{domain}`; apps on subpaths vs subdomains).
  - Whether internal-only services exist (e.g., Meilisearch should likely not be internet-exposed).
- **Health checks**:
  - `api /health/` and `storefront /api/health` are plausible, but must be verified against actual endpoints and auth requirements.
  - Dashboard health check path not specified.
- **Meilisearch exposure**: If attached to the same ALB, ensure it is **not publicly routable** unless explicitly intended; otherwise keep it internal (no ALB listener rule, SG restricted to ECS SG only).
- **Desired counts**: Reasonable, but no autoscaling policy is described (CPU/memory/ALB request count). Not required for Phase 2, but for Phase 3 “production readiness” it’s a gap.

### 4) Database / cache design
- **Inventory DB question impacts blast radius**: Same instance vs separate instance is a major operational decision. The plan currently assumes a single RDS instance with multiple DBs; that’s fine for cost, but increases coupling and makes noisy-neighbor issues possible.
- **Migration safety**:
  - “Run migrations before service deployment” is not always safe. If migrations are not strictly backward-compatible, deploying old code against new schema can break during the window between migrate and deploy.
  - The plan claims “rollback capability” for migrations, but does not define how (most Django/Prisma migrations are not safely reversible in production).
- **Redis/Valkey compatibility**: “ElastiCache Redis 7.x (Valkey compatible)” is loosely stated. If you truly need Valkey semantics, consider ElastiCache for Valkey specifically; otherwise state Redis is acceptable and validate client compatibility.

### 5) Storage design
- **S3 bucket**: Versioning + lifecycle is good. Missing:
  - Encryption (SSE-S3 or SSE-KMS) requirement.
  - Public access block and bucket policy constraints.
- **EFS for Meilisearch**:
  - Correctness risk: Meilisearch on EFS can work but may have performance/locking implications; also you need a clear backup/restore plan (AWS Backup for EFS).
  - If Meilisearch is critical, consider managed offering or at least define snapshot/restore RTO/RPO.

### 6) Terraform module structure
- Structure is reasonable, but several best-practice items are unspecified:
  - Remote state backend details (S3 + DynamoDB lock table) are only “template”; locking is important.
  - No mention of **separate state per environment** (recommended) and state isolation.
  - Task definitions as JSON templates are workable, but ensure you define how secrets are injected (SSM/Secrets Manager) and how diffs are managed.

### 7) CI/CD workflows
**PR workflow**
- `terraform init -backend=false` + validate is good for syntax, but won’t catch provider auth/data source issues. Consider `tflint` and `terraform validate` with minimal providers pinned.
- `localreview_ci` uses `BASE_REF=origin/platform/main`—on PRs, `origin/platform/main` may not exist unless fetched; you do fetch-depth 0, but you may still need `git fetch origin platform/main`.

**Staging deploy**
- **Ordering**: build → migrate → deploy is simple, but see migration safety concern above.
- **Matrix deploy**: Deploying services in parallel can break dependencies (e.g., api before worker is fine, but storefront might depend on api readiness; apps might depend on api). You rely on smoke tests after all deploys; that’s okay but increases blast radius.
- **No explicit “wait for steady state”**: `deploy-service.sh` must block until ECS service is stable (or workflow should). Otherwise smoke tests can race.
- **Artifact identity**: You pass `${{ github.sha }}` as tag, but you also use official images not tagged by SHA. This undermines “staging SHA” verification unless you pin all images (including upstream) by digest.

**Production deploy**
- `verify_staging` is a placeholder; correctness requires it to actually query ECS task definitions or ECR tags and compare digests/tags.
- `skip_approval` is dangerous without additional controls (break-glass policy, audit trail, restricted to admins).
- Rollback job triggers on workflow failure, but rollback correctness depends on:
  - Whether migrations have already run (schema may be incompatible with previous code).
  - Whether rollback script can revert all services consistently and quickly.
- Promotion script: “re-tag staging images for prod” is fine if tags are immutable and you also record digests. Needs explicit immutability policy in ECR.

### 8) Secrets & configuration
- Good separation of SSM and Secrets Manager, but:
  - Storefront “MEILISEARCH_URL: ElastiCache or Meilisearch endpoint” is incorrect: Meilisearch is not Redis. This is a spec bug; clarify the actual search backend and env var names.
  - “Build-time args (not secrets)” is correct, but ensure no sensitive URLs/tokens are baked into images.
  - Need explicit requirement for **KMS encryption** for SSM SecureString and Secrets Manager.

### 9) IAM design
- **OIDC trust policy too narrow and also incomplete**:
  - Restricting to `ref:refs/heads/platform/main` blocks production workflow_dispatch unless it runs on that ref; also doesn’t restrict by workflow file. Best practice is to restrict by `sub` and `job_workflow_ref`.
- **Least privilege gaps**:
  - `dynamodb:*` for stripe app is overly broad; define table ARNs and minimal actions.
  - `sqs:*` is speculative; if not used, omit. If used, scope to queue ARNs.
  - `ssm:GetParameters` should be scoped to `/saleor/{env}/*` path and region/account.
- **PassRole**: Must be scoped to specific execution/task roles only.

### 10) Phases / success criteria
- Success criteria are directionally aligned but not measurable enough (no explicit pass/fail conditions, timings, or verification steps).
- “Manual steps for initial infrastructure creation” is listed as a deliverable but not defined (what exactly must be manual vs automated).

## Definition of Done Gaps
Missing or ambiguous acceptance criteria that should be made explicit:
1. **Deployment correctness**
   - “Auto-deploy on merge” should specify: within X minutes, ECS services reach steady state, and smoke tests pass.
   - Define what “basic functionality” means (e.g., GraphQL query returns 200, storefront homepage loads, dashboard login page reachable, webhook endpoints respond).
2. **Migration safety**
   - Define a policy: *all migrations must be backward-compatible* (expand/contract), or define a maintenance window strategy.
   - Define what happens if migrations fail: stop deploy, alert, no partial deploy.
3. **Rollback**
   - Define RTO/RPO targets and what “rollback tested” means (tabletop vs actual staging rollback drill).
   - Explicitly state whether DB schema rollback is in-scope (usually not); if not, require forward-fix procedure.
4. **Artifact immutability**
   - Require pinned image digests/tags for *all* services (including dashboard and upstream Saleor images) to ensure staging→prod parity.
5. **Routing and exposure**
   - Define ALB listener rules, domains, and which services are public vs internal-only.
6. **Observability**
   - Define minimum logs/metrics/alarms: ECS service unhealthy, ALB 5xx, RDS CPU/storage, Redis memory, task restarts.
7. **Terraform**
   - Define state backend (S3 + DynamoDB lock), environment isolation, and required tagging standards.

## CI/CD Best Practices
- **Good alignment**
  - OIDC for AWS auth (preferred over static keys).
  - Separate staging auto-deploy and production manual gate.
  - Terraform fmt/validate in PR.
  - Concurrency groups to avoid overlapping deploys.
- **Needs improvement**
  - Use **immutable artifacts** (digests) and provenance (SBOM/signing optional but recommended).
  - Add **“wait for service stability”** and **deployment health gates** (ALB target healthy, ECS steady state) before smoke tests.
  - Prefer **blue/green or rolling with circuit breaker** (ECS deployment circuit breaker + automatic rollback) rather than custom rollback scripts alone.
  - Add **environment protection**: restrict `skip_approval` to a separate break-glass workflow/environment with stricter reviewers.
  - Add **IaC security checks** (tfsec/checkov) and container scanning on pushed images.

## Recommendations
1. **Fix image pinning**
   - Replace `saleor-dashboard:latest` with a pinned version and/or digest.
   - Decide: mirror upstream images into ECR (recommended) or pin GHCR digests and document pull strategy.
2. **Define safe migration strategy**
   - Adopt expand/contract migrations and deploy order: *deploy code that can handle both schemas → migrate → deploy code that requires new schema* (or enforce backward-compatible migrations only).
   - Remove/clarify “migration rollback capability”; replace with “forward-only migrations + restore-from-backup procedure”.
3. **Clarify ALB routing and service exposure**
   - Provide explicit host/path mapping and ensure Meilisearch is private-only unless required.
4. **Correct the Meilisearch/Redis config confusion**
   - Replace the incorrect “MEILISEARCH_URL: ElastiCache” statement with the actual endpoint and variables.
5. **Harden GitHub OIDC trust policy**
   - Restrict by repo, branch/tag, and workflow file (`job_workflow_ref`), and ensure production workflow_dispatch is permitted only from intended refs.
6. **Add deployment stability gates**
   - In `deploy-service.sh`, wait for ECS service stable and ALB targets healthy; fail fast if not.
7. **Tighten IAM**
   - Scope DynamoDB/S3/SSM/Secrets permissions to specific ARNs and paths; scope `iam:PassRole` to exact roles.
8. **Terraform state and environment isolation**
   - Require S3 backend + DynamoDB lock table; separate state per env; enforce tagging and encryption defaults (KMS).
9. **Define measurable DoD**
   - Add explicit pass/fail checks, time bounds, and rollback drill requirements for Phase 3.

## Approval Status
NEEDS REVISION

---

*Generated by delivery pipeline multi-agent review*
