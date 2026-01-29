# Phase 2 Security & Ops Review
## Gemini 3

**Generated**: 2026-01-10T13:44:08.361494
**Model**: gemini-3-pro-preview
**Role**: Security & Ops Risk Analysis
**Duration**: 32.73 seconds

---

## Security & Ops Review Summary
The proposed plan establishes a solid, modern foundation using AWS managed services and OIDC-based CI/CD, significantly reducing operational overhead compared to the previous architecture. However, the **tight coupling of database migrations to deployment** and **resource contention risks in the data layer** constitute the primary reliability concerns. Security is generally strong, but internal network segmentation (East-West traffic) and IAM scoping for the deployment role need tightening.

## Security Analysis

### Secrets Management
*   **Strengths**: Use of SSM Parameter Store and Secrets Manager is the correct approach. OIDC eliminates long-lived AWS keys in GitHub.
*   **Risks**:
    *   **Build Args**: Ensure `NEXT_PUBLIC_` variables in the Storefront build process are strictly public information. Any leakage here is permanent in the image history.
    *   **Environment Injection**: The plan renders task definitions with env vars. Ensure `render-taskdef.py` does not print these values to stdout/logs during the CI process.

### Access Control (IAM & Network)
*   **IAM Scoping**: The `github-actions-deploy` role has `iam:PassRole` and `ecs:RunTask`.
    *   *Risk*: If this role is compromised, an attacker can launch *any* task definition with *any* role in the account.
    *   *Fix*: Add a `Resource` constraint to `iam:PassRole` allowing it to pass only specific roles (e.g., `arn:aws:iam::*:role/saleor-*`).
*   **Security Groups**: The plan allows `rds-sg` access from `ecs-sg`.
    *   *Risk*: This implies the Storefront (public-facing) has network access to the Database (backend). If the Storefront container is compromised, the attacker has a direct line to port 5432.
    *   *Fix*: Create separate Security Groups: `ecs-backend-sg` (API, Worker, Apps) and `ecs-frontend-sg` (Storefront, Dashboard). Only `ecs-backend-sg` should reach RDS.

### Supply Chain
*   **Image Provenance**: Using `ghcr.io/saleor/saleor:3.22`.
    *   *Risk*: Tags are mutable. A malicious overwrite of `:3.22` upstream would be pulled into your staging immediately.
    *   *Fix*: Pin images by **Digest** (SHA256) for Production, not just tags.

## Blast Radius Assessment

### Database Coupling
*   **Migration Strategy**: The plan executes `migrate` -> `deploy`.
    *   *Impact*: If a migration is destructive (e.g., renames a column) or backward-incompatible, the *currently running* instances (old code) will start failing immediately before the new code deploys.
    *   *Scenario*: Rolling update fails halfway; you are left with a migrated DB and old containers that can't read it.

### Shared Resources
*   **Redis Contention**: The plan implies one Redis (ElastiCache) for both `CACHE` and `CELERY_BROKER`.
    *   *Impact*: High cache churn (traffic spike) could evict Celery queue items if memory fills up, causing background jobs (emails, order processing) to vanish.
*   **Inventory Ops DB**:
    *   *Impact*: If `inventory-ops-app` performs heavy analytical queries on a shared RDS instance, it will consume IOPS/CPU, starving the Checkout API (Saleor Core).

## Reliability Concerns

### Recovery Points
*   **Rollback Limitation**: The `rollback.sh` script reverts ECS task revisions. It **cannot revert database schema changes**.
    *   *Mitigation*: You must enforce a "Expand and Contract" migration pattern (never delete/rename columns in the same deployment as code changes), or implement automated DB snapshots immediately prior to migration execution.

### Meilisearch on EFS
*   *Performance*: EFS (General Purpose) has IOPS limits based on stored data size. A small Meilisearch index on EFS might hit IOPS limits quickly during re-indexing, causing search outages.
*   *Mitigation*: Use **Provisioned Throughput** on EFS or switch to ECS Fargate Ephemeral Storage (if index < 20GB and can be rebuilt easily) or Meilisearch Cloud.

## Risk Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Bad Migration causing outage** | Critical | Medium | Enforce "Expand-Contract" pattern; DB Snapshot before deploy. |
| **Secrets leak in CI logs** | High | Low | Use `::add-mask::` in GitHub Actions; Audit python render scripts. |
| **Redis Eviction of Queue** | Medium | Medium | Separate Redis Redis groups (or distinct DB indexes) for Cache vs Broker. |
| **IAM Privilege Escalation** | Medium | Low | Scope `iam:PassRole` to specific ARNs in trust policy. |
| **Storefront reaching DB** | Medium | Low | Split ECS Security Groups (Frontend vs Backend). |

## Recommendations

### 1. Hard Infrastructure Isolation (Production)
*   **Database**: Run `inventory_ops` on a **separate RDS instance** for Production. This isolates the critical path (Checkout) from internal operations apps.
*   **Redis**: Use a separate ElastiCache Replication Group for Celery (Broker) vs. App Cache to prevent cache pressure from killing async jobs.

### 2. Deployment Safety
*   **Migration Job**: Update `run-migrations.sh` to take a generic RDS snapshot (using AWS CLI) before applying changes in Production.
*   **Deployment**: Add a `terraform_plan` job to the CI pipeline that runs on PRs to infrastructure code, posting the plan to the PR comments.

### 3. Network Security
*   **Split Security Groups**:
    *   `sg-ecs-public`: Storefront, Dashboard (Ingress: ALB, Egress: Public API).
    *   `sg-ecs-core`: API, Worker (Ingress: ALB + sg-ecs-public, Egress: RDS, Redis, AWS Services).
    *   **Rule**: `rds-sg` accepts traffic *only* from `sg-ecs-core`.

### 4. Answer to User Questions
*   **DB Arch**: **Separate Instance** for Production. Shared is fine for Staging.
*   **Meilisearch**: Start with **ECS + EFS (Provisioned Throughput)**. If latency is poor, move to Cloud. Self-hosting stateful workloads on Fargate is operationally complex.
*   **DynamoDB**: Use **Native AWS DynamoDB**. It is serverless, requires zero maintenance, and fits the "Buy over Build" ops philosophy.
*   **Monitoring**: **CloudWatch Container Insights** is sufficient for Phase 2. Do not maintain a self-hosted Jaeger instance; it's a massive SPOF/maintenance burden.

## Approval Status

**APPROVED WITH CONDITIONS**

Proceed to Phase 2 implementation only after addressing:
1.  **IAM Scoping**: Restrict `iam:PassRole`.
2.  **Network Segregation**: Split Frontend/Backend Security Groups.
3.  **Redis Config**: explicitly define eviction policies (`allkeys-lru` for cache, `noeviction` for broker) or use separate clusters.

---

*Generated by delivery pipeline multi-agent review*
