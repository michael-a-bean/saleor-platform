# Environment Parity Analysis: Local / Staging / Production

**Created:** 2026-02-13
**Status:** ACTIVE
**Source:** Infrastructure deep-dive and CI/CD pipeline analysis

---

## Overview

This document catalogs every structural difference between local, staging, and production environments, identifies the root causes of local-works-staging-breaks failures, and provides a prioritized action plan for closing the gaps.

---

## Environment Comparison Matrix

| Aspect | Local | Staging | Production |
|--------|-------|---------|-----------|
| **Region** | Local machine | AWS us-west-1 | AWS us-west-2 |
| **Compute** | Docker Compose | ECS Fargate (1 task/svc) | ECS Fargate (2-3 tasks/svc) |
| **Database** | PostgreSQL 15 (local container) | RDS db.t3.small, single-AZ | RDS db.r6g.large, multi-AZ |
| **Inventory DB** | Separate container (port 5433) | Shared RDS instance | Separate RDS instance |
| **Cache** | Valkey 8.1 (local container) | ElastiCache t3.micro | ElastiCache r6g.large, multi-AZ |
| **Celery Cache** | Shared with app cache | Shared with app cache | Separate ElastiCache |
| **Networking** | Docker bridge (`saleor-backend-tier`) | VPC 10.0.0.0/16 + ALB | VPC 10.1.0.0/16 + ALB |
| **Routing** | Port-per-service (3000-3005) | ALB path-based (`/apps/*`) | ALB host-based (`api.domain`) |
| **TLS/HTTPS** | None (HTTP) | None (HTTP) | ACM cert (HTTPS) |
| **Service Discovery** | Docker DNS | AWS Cloud Map + ALB | AWS Cloud Map + ALB |
| **Secrets** | `.env` plaintext | AWS Secrets Manager | AWS Secrets Manager |
| **Search** | Meilisearch (no auth) | Meilisearch (master key, EFS) | Meilisearch (master key, EFS) |
| **Media** | Docker volume | S3 + CloudFront | S3 + CloudFront |
| **Monitoring** | Jaeger + Mailpit | CloudWatch (disabled) | CloudWatch (enabled) |
| **Backups** | None (Docker volumes) | RDS 7-day retention | RDS 35-day + pre-deploy snapshots |
| **ECR Tags** | N/A (local images) | Mutable (`staging-latest`) | Immutable (pin by digest) |
| **Cost** | Free | ~$800-1,200/month | ~$4,000-5,000/month |

---

## Root Causes: Why Local Works But Staging Breaks

### 1. Build-Time URL Baking (PRIMARY CAUSE)

`NEXT_PUBLIC_*` variables are inlined by webpack's DefinePlugin at build time. They cannot be changed at runtime. Each environment requires a separate build with different values:

- Local build: `NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/`
- Staging build: `NEXT_PUBLIC_SALEOR_API_URL=http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/graphql/`

**Impact:** A locally-built image pushed to staging will make API calls to `localhost:8000`, which doesn't exist in the ECS environment. Same applies to all 5 saleor-apps via `BASE_PATH`.

**Mitigation in place:** `scripts/validate-environment.sh` catches localhost URLs pre-deploy. CI/CD builds with correct URLs.

### 2. HTTP vs HTTPS Gap

Staging runs HTTP-only (no ACM certificate configured). Production will run HTTPS. This means:

- Saleor CSP headers behave differently (`enable_https = false` in staging)
- Cookie `Secure` flag behavior differs
- Webhook callback URLs use different schemes
- Stripe test vs live mode webhook validation differs
- Browser mixed-content policies don't trigger on staging

**Impact:** Bugs related to HTTPS-only behavior (secure cookies, CSP, mixed content) will only appear in production.

### 3. Routing Topology Mismatch

| Service | Local Access | Staging Access |
|---------|-------------|----------------|
| API | `http://localhost:8000/graphql/` | `http://ALB-DNS/graphql/` (path rule) |
| Storefront | `http://localhost:3000` | `http://ALB-DNS/` (default) |
| Dashboard | `http://localhost:9000` | `http://ALB-DNS/dashboard/` (path rule) |
| Stripe App | `http://localhost:3001` | `http://ALB-DNS/apps/stripe/` (path rule) |
| Inventory Ops | `http://localhost:3002` | `http://ALB-DNS/apps/inventory/` (path rule) |
| Buylist | `http://localhost:3003` | `http://ALB-DNS/apps/buylist/` (path rule) |
| POS | `http://localhost:3004` | `http://ALB-DNS/apps/pos/` (path rule) |
| MTG Import | `http://localhost:3005` | `http://ALB-DNS/apps/mtg-import/` (path rule) |

**Impact:** Path-handling bugs in apps (asset paths, API routes, redirects) only manifest behind the ALB. The `BASE_PATH` build arg handles most cases, but edge cases slip through.

### 4. Service Discovery Differences

| Communication | Local | Staging |
|--------------|-------|---------|
| App → Saleor API | `http://api:8000` (Docker DNS) | Via ALB public URL |
| App → Meilisearch | `http://meilisearch:7700` | `meilisearch.saleor-platform-staging.local:7700` (Cloud Map) |
| App → Inventory DB | `postgresql://inventory-ops-db:5432/` | RDS endpoint from Secrets Manager |
| Worker → Cache | `redis://cache:6379` | ElastiCache endpoint |

**Impact:** DNS resolution, connection pooling, and timeout behavior differ. Network latency between services is ~0ms locally but 1-5ms on AWS.

### 5. Database Topology Inconsistency

- **Local:** Separate PostgreSQL container for inventory-ops (port 5433)
- **Staging:** Shared RDS instance (`create_separate_inventory_db = false`)
- **Production:** Separate RDS instance (`create_separate_inventory_db = true`)

**Impact:** Staging doesn't match either local OR production. Connection string format, performance characteristics, and failure modes differ across all three environments.

### 6. Secrets Injection Mechanism

- **Local:** `.env` file loaded by Docker Compose `env_file:` directive
- **Staging/Production:** AWS Secrets Manager, injected into ECS task definitions as environment variables via `secrets` block

**Impact:** A missing secret in Secrets Manager causes container startup failure (no equivalent failure mode locally). Secret format differences (e.g., URL-encoded characters in database passwords) only surface on AWS.

---

## Deploy Pipeline Analysis

### Current Pipeline (deploy-staging.yml)

```
Build (6 images, 1 runner)  ──→  Migrate (Django + 2 Prisma)  ──→  Deploy Core (4 svc, matrix)  ──→  Deploy Apps (5 svc, matrix)  ──→  Validate + Smoke
       ~15-20 min                       ~5-8 min                       ~10-15 min                        ~15-20 min                        ~2-3 min
```

**Total: ~47-66 minutes** (sequential stages)

### Time Breakdown

| Stage | What Happens | Time | Bottleneck |
|-------|-------------|------|-----------|
| Build | 6 Docker images built sequentially on 1 runner | 15-20 min | CPU-bound Next.js compilation, sequential execution |
| Migrate | Django + 2 Prisma migrations via ECS RunTask | 5-8 min | ECS task spin-up time (~2 min overhead per task) |
| Deploy Core | 4 services updated, each waits for stability | 10-15 min | `services-stable` wait: image pull + health check ~3-5 min/svc |
| Deploy Apps | 5 services, depends on core completion | 15-20 min | Blocked until all core services stable |
| Validate | URL checks + smoke tests | 2-3 min | Network round-trips |

### Optimization Opportunities

#### Quick Wins (~20-25 min savings)

**A. Selective Builds (save 10-15 min)**

Only rebuild images whose source files changed:

```yaml
- uses: dorny/paths-filter@v3
  id: changes
  with:
    filters: |
      storefront:
        - 'storefront/**'
      stripe:
        - 'saleor-apps/apps/stripe/**'
        - 'saleor-apps/packages/**'
      inventory:
        - 'saleor-apps/apps/inventory-ops/**'
        - 'saleor-apps/packages/**'
      buylist:
        - 'saleor-apps/apps/buylist/**'
        - 'saleor-apps/packages/**'
      pos:
        - 'saleor-apps/apps/pos/**'
        - 'saleor-apps/packages/**'
      mtg-import:
        - 'saleor-apps/apps/mtg-import/**'
        - 'saleor-apps/packages/**'
```

Most commits only touch 1-2 services. Skip the rest.

**B. Parallel App Deploys (save 10-15 min)**

Apps don't depend on storefront or dashboard. Change dependency:

```yaml
deploy-apps:
  needs: [build, migrate]  # Remove 'deploy' — apps only need API running
```

Add an API health check step at the start of deploy-apps instead.

**C. Matrix Build Strategy (save 12 min)**

Split builds across 6 parallel runners instead of 1 sequential runner:

```yaml
build:
  strategy:
    matrix:
      include:
        - service: storefront
          context: ./storefront
          dockerfile: ./storefront/Dockerfile
        - service: stripe-app
          context: ./saleor-apps
          dockerfile: ./saleor-apps/apps/stripe/Dockerfile
        # ... etc
```

Build stage drops from ~20 min to ~5-7 min (limited by slowest build).

#### Medium-Term Optimizations

**D. Single-Service Deploy Script**

For day-to-day iteration, deploy only the service you changed:

```bash
#!/usr/bin/env bash
# scripts/deploy/aws/deploy-single.sh
# Usage: ./deploy-single.sh staging inventory-ops
# Builds one image, pushes to ECR, deploys one ECS service
# Total time: ~5 minutes
```

**E. Skip Stability Waits for Inactive Services**

Dashboard is `desired_count=0`, MTG import is on-demand. Don't wait for them.

**F. ECS Rolling Deployment Tuning**

Configure `minimumHealthyPercent: 100` and `maximumPercent: 200` to allow old+new tasks to run simultaneously, reducing deployment time.

### Optimized Pipeline (Target)

```
Build (changed only, parallel)  ──→  Migrate  ──→  Deploy Core + Apps (parallel)  ──→  Validate
       ~5-7 min                      ~5 min           ~5-8 min                       ~2 min
```

**Target total: ~17-22 minutes (full deploy), ~5 minutes (single-service)**

---

## HTTPS + Domain Strategy

### Recommendation: Add Custom Domain to Staging NOW

**Cost:** ~$0.50/month (Route53 hosted zone). ACM certificates are free.

### Domain Structure

| Environment | Domain | Services |
|-------------|--------|----------|
| Production | `yourdomain.com` | `api.yourdomain.com`, `www.yourdomain.com`, `dashboard.yourdomain.com`, `apps.yourdomain.com` |
| Staging | `staging.yourdomain.com` | `api.staging.yourdomain.com`, `staging.yourdomain.com`, `dashboard.staging.yourdomain.com`, `apps.staging.yourdomain.com` |

### Implementation

1. **Purchase domain** (or transfer existing) to Route53
2. **Create hosted zone** for `yourdomain.com`
3. **Update `staging.tfvars`:**

```hcl
domain_name = "staging.yourdomain.com"
create_acm_certificate = true
route53_zone_id = "ZXXXXXXXXXX"
use_https_urls = true
enable_https = true

# REMOVE these overrides — domain routing replaces them:
# public_api_base_url = "http://saleor-platform-staging-alb-..."
# public_storefront_base_url = "http://saleor-platform-staging-alb-..."
# public_dashboard_base_url = "http://saleor-platform-staging-alb-..."
```

4. **`terraform apply`** creates:
   - ACM wildcard cert (`*.staging.yourdomain.com`) with DNS validation
   - Route53 CNAME records for cert validation (auto-validates)
   - HTTPS ALB listener (port 443) with TLS 1.3
   - HTTP → HTTPS redirect on port 80
   - Route53 A records: `api.staging.*`, `staging.*`, `dashboard.staging.*`, `apps.staging.*`
   - Host-based ALB routing rules (already implemented, gated on `certificate_arn != ""`)

5. **Update GitHub Actions variables:**
   - `STAGING_API_URL` = `https://api.staging.yourdomain.com`
   - `STAGING_STOREFRONT_URL` = `https://staging.yourdomain.com`
   - `STAGING_DASHBOARD_URL` = `https://dashboard.staging.yourdomain.com`

6. **Redeploy** to bake new URLs into images

### What's Already Built

The ALB Terraform module (`infra/terraform/modules/alb/main.tf`) has full HTTPS support behind a conditional:

- `certificate_arn != ""` → HTTPS listener + host-based routing + HTTP redirect
- `certificate_arn == ""` → HTTP listener + path-based routing (current staging behavior)

No new Terraform code is needed. Just provide the certificate.

---

## Staging → Production Transition Path

### What's Already Configured

`production.tfvars` is nearly complete:
- Separate VPC in us-west-2
- Multi-AZ RDS (db.r6g.large) and Redis (cache.r6g.large)
- Separate inventory DB and Celery cache
- Higher ECS task counts (3 API, 2 worker, 3 storefront)
- Container Insights enabled
- 90-day log retention
- Immutable ECR tags

`deploy-production.yml` exists with:
- Manual trigger with `staging_sha` input
- GitHub Environment approval gate
- Blocking RDS snapshot verification
- Auto-rollback on failure

### Steps to Production Readiness

| Step | Action | When | Effort |
|------|--------|------|--------|
| 1 | Buy domain, create Route53 hosted zone | Now | 30 min |
| 2 | Configure staging subdomain + HTTPS (as above) | Now | 1 hour |
| 3 | Create `production` Terraform workspace | Now | 5 min |
| 4 | Set `github_org`, `github_repo` in production.tfvars | Now | 5 min |
| 5 | Set up GitHub Environment `production` with approval gates | Now | 15 min |
| 6 | Replace `example.com` in production.tfvars with real domain | Now | 5 min |
| 7 | Replace image tags with digest pins in production.tfvars | Before go-live | 15 min |
| 8 | `terraform apply -var-file=environments/production.tfvars` | Go-live | 30 min |
| 9 | Run deploy-production.yml with latest staging SHA | Go-live | 20 min |
| 10 | Point domain DNS to production ALB | Go-live | 5 min |

### Production Deployment Flow

```
staging SHA (tested) ──→ Manual trigger ──→ Approval gate ──→ RDS snapshot (blocking) ──→ Migrate ──→ Deploy ──→ Validate
                                                                                                              ──→ Rollback on failure
```

---

## Local Parity Improvements

### Priority Improvements

**1. Local Path-Routing Proxy**

Add an nginx or Caddy service to docker-compose that mimics ALB routing:

```yaml
# docker-compose.yml addition
proxy:
  image: caddy:2-alpine
  ports:
    - "8080:80"
  volumes:
    - ./Caddyfile.local:/etc/caddy/Caddyfile
  networks:
    - saleor-backend-tier
```

```
# Caddyfile.local
:80 {
  handle /graphql/* {
    reverse_proxy api:8000
  }
  handle /dashboard/* {
    reverse_proxy dashboard:9000
  }
  handle /apps/stripe/* {
    reverse_proxy stripe-app:3000
  }
  handle /apps/inventory/* {
    reverse_proxy inventory-ops-app:3000
  }
  handle /apps/buylist/* {
    reverse_proxy buylist-app:3000
  }
  handle /apps/pos/* {
    reverse_proxy pos-app:3000
  }
  handle /apps/mtg-import/* {
    reverse_proxy mtg-import-app:3000
  }
  handle {
    reverse_proxy storefront:3000
  }
}
```

**2. Local Smoke Tests**

Run the same smoke tests locally that run post-deploy on staging:

```bash
# Makefile addition
smoke-test-local:
	STAGING_API_URL=http://localhost:8000 \
	STAGING_STOREFRONT_URL=http://localhost:3000 \
	./scripts/deploy/aws/smoke-test.sh local
```

**3. Local HTTPS (Optional)**

Use `mkcert` for trusted local TLS certificates:

```bash
mkcert -install
mkcert localhost 127.0.0.1 ::1
# Configure Caddy or nginx to serve HTTPS locally
```

---

## Action Plan (Prioritized)

| # | Action | Impact | Effort | Deploy Time Saved |
|---|--------|--------|--------|-------------------|
| 1 | Selective builds in CI | Skip unchanged services | 2 hours | -15 min |
| 2 | Buy domain + staging HTTPS | Eliminate HTTP/HTTPS gap | 2 hours | N/A (parity) |
| 3 | Parallel app deploys in CI | Remove core→apps dependency | 1 hour | -10 min |
| 4 | Single-service deploy script | 5-min iteration cycle | 3 hours | -45 min (single svc) |
| 5 | Local path-routing proxy | Catch routing bugs locally | 2 hours | N/A (parity) |
| 6 | Matrix build strategy | Parallel image builds | 1 hour | -12 min |
| 7 | Local smoke tests | Catch issues pre-push | 1 hour | N/A (parity) |

**Net result:** Full deploy drops from ~50 min to ~20 min. Single-service iteration drops to ~5 min. Staging becomes HTTPS and matches production routing topology.

---

## Related Documentation

- `docs/reference/local-staging-workflow.md` — Safe workflow procedures
- `docs/reference/architecture.md` — Full platform architecture
- `.claude/rules/storefront.md` — Build-time URL requirements
- `.claude/rules/infrastructure.md` — Terraform safety rules
- `infra/terraform/environments/staging.tfvars` — Staging configuration
- `infra/terraform/environments/production.tfvars` — Production configuration
- `.github/workflows/deploy-staging.yml` — Staging CI/CD pipeline
- `.github/workflows/deploy-production.yml` — Production CI/CD pipeline
