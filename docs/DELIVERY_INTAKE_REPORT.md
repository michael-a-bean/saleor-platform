# Delivery Intake Report

**Repository**: saleor-platform
**Date**: 2026-01-10
**Author**: AI Delivery Analysis
**Status**: Intake / Assessment Phase

---

## 1. Repository Overview

### Purpose

This repository solves the problem of running a complete e-commerce stack for the **Hobby Gaming market** (MTG cards and similar secondary markets). It extends the Saleor e-commerce platform with:

- Custom inventory management with WAC (Weighted Average Cost) / COGS tracking
- Buylist system for customer card buybacks
- Point of Sale (POS) for in-store transactions
- Market-driven pricing via Scryfall API integration
- Single-card builder for storefront

### Application Types

| Type | Components |
|------|------------|
| **Backend API** | Saleor Django/GraphQL API (port 8000) |
| **Background Workers** | Celery workers for async tasks |
| **Web Applications** | Storefront (Next.js), Dashboard (React), Custom apps |
| **CLI Tools** | Price-sync, Meilisearch sync, data import scripts |
| **Infrastructure** | PostgreSQL, Valkey (Redis), Meilisearch, DynamoDB Local |

### Repository Structure

**Type**: Monorepo with nested submodule

```
saleor-platform/                    # Root orchestration layer
├── docker-compose.yml              # All services defined here
├── storefront/                     # Custom Next.js storefront (not submodule)
├── saleor-apps/                    # Git submodule → github.com/michael-a-bean/saleor-apps
│   ├── apps/
│   │   ├── inventory-ops/          # Custom: Inventory management
│   │   ├── buylist/                # Custom: Card buyback system
│   │   ├── pos/                    # Custom: Point of Sale
│   │   ├── stripe/                 # Modified: Stripe payments
│   │   └── [upstream apps]/        # AvaTax, CMS, Search, etc.
│   └── packages/                   # Shared libraries
├── saleor-mcp/                     # Standalone: MCP server for AI integration
└── scripts/                        # Python/JS utilities for data ops
```

### Primary Languages and Frameworks

| Component | Language | Framework | Runtime |
|-----------|----------|-----------|---------|
| Saleor API | Python 3.x | Django | Gunicorn |
| Storefront | TypeScript | Next.js 16 | Node.js 22 |
| Dashboard | TypeScript | React | Nginx (static) |
| Custom Apps | TypeScript | Next.js 15 | Node.js 22 |
| saleor-mcp | Python 3.12 | FastAPI/MCP | Uvicorn |
| Scripts | Python / JavaScript | Various | Python 3 / Node.js |

### Runtime Model

| Service | Model | Scaling Notes |
|---------|-------|---------------|
| API | Long-running (HTTP) | Stateless, horizontally scalable |
| Worker | Long-running (Celery) | Requires broker connection |
| Storefront | Long-running (Node) | Stateless with ISR caching |
| Dashboard | Static files | CDN-ready |
| Custom Apps | Long-running (Node) | Stateless except POS (session state) |
| price-sync-worker | Daemon (poll loop) | Single instance per deployment |

---

## 2. Current Development Workflow

### Local Development Setup

**Expected startup sequence** (from `scripts/setup.sh`):

```bash
# 1. Clone with submodules
git clone --recursive <repo>

# 2. Initialize submodules
git submodule update --init --recursive

# 3. Set up environment files
cp storefront/.env.example storefront/.env

# 4. Build containers
docker compose build

# 5. Start infrastructure
docker compose up -d db cache

# 6. Run migrations
docker compose run --rm api python3 manage.py migrate

# 7. Seed data (optional)
docker compose run --rm api python3 manage.py populatedb --createsuperuser

# 8. Start all services
docker compose up -d
```

### Required Tools and Versions

| Tool | Version | Purpose |
|------|---------|---------|
| Docker | Latest | Container runtime |
| Docker Compose | v2.x | Service orchestration |
| Git | Any | Version control with submodules |
| Node.js | 22.x | (Optional) Local app development |
| pnpm | 9.x/10.x | (Optional) Package management |
| Python | 3.12 | (Optional) Script execution |
| AWS CLI | (Optional) | DynamoDB table setup |

### Environment Variables Required

**Platform Level** (`common.env`, `backend.env`):
- `DATABASE_URL` - PostgreSQL connection string
- `CACHE_URL` - Valkey/Redis URL
- `CELERY_BROKER_URL` - Celery broker URL
- `SECRET_KEY` - Django secret key
- `DEFAULT_CHANNEL_SLUG` - Default sales channel
- `OTEL_EXPORTER_OTLP_ENDPOINT` - Jaeger endpoint

**Storefront** (`storefront/.env`):
- `NEXT_PUBLIC_SALEOR_API_URL` - GraphQL API URL
- `NEXT_PUBLIC_STOREFRONT_URL` - Public storefront URL
- `NEXT_PUBLIC_DEFAULT_CHANNEL` - Channel slug
- `MEILISEARCH_URL` - Search engine URL

**Custom Apps** (inline in `docker-compose.yml`):
- `SECRET_KEY` - Per-app encryption key
- `DATABASE_URL` - PostgreSQL URL (inventory-ops-db)
- `APP_API_BASE_URL` - App's external URL for webhooks
- `APP_IFRAME_BASE_URL` - App's dashboard iframe URL

### Docker / Compose Usage

**docker-compose.yml defines**:
- 17 services (including profiles)
- 9 volumes for persistence
- 1 network (`saleor-backend-tier`)

**Profiles**:
- `tools` - price-sync CLI
- `workers` - price-sync-worker daemon

### Known Friction Points

1. **Build-time API dependency**: Storefront requires API running during build (GraphQL introspection)
2. **Submodule complexity**: Nested submodules in saleor-apps require `--recursive` clone
3. **Hardcoded values**: Channel ID, warehouse ID hardcoded in `storefront/src/pages/transaction.tsx`
4. **No frozen lockfile**: Dockerfiles use `--no-frozen-lockfile` (non-reproducible)
5. **Memory requirements**: Docker Desktop needs 5GB+ RAM allocated
6. **Shared database schema**: POS and Buylist apps share inventory-ops database via symlinked Prisma schema

### Reproducibility Assessment

**☐ Partially reproducible**

| Aspect | Status | Notes |
|--------|--------|-------|
| Infrastructure | ✓ | Docker Compose defines all services |
| Data | ⚠ | `populatedb` creates sample data, no seed for custom apps |
| Dependencies | ⚠ | `--no-frozen-lockfile` in Dockerfiles |
| Configuration | ⚠ | Hardcoded values, no environment abstraction |

---

## 3. Build & Artifact Model

### What "Build" Means

| Component | Build Process | Output |
|-----------|---------------|--------|
| Saleor API | Pre-built image | `ghcr.io/saleor/saleor:3.22` |
| Dashboard | Pre-built image | `ghcr.io/saleor/saleor-dashboard:latest` |
| Storefront | Multi-stage Dockerfile | `saleor-storefront:local` |
| Custom Apps | Multi-stage Dockerfile | `saleor-platform-{app}` |
| saleor-mcp | Multi-stage Dockerfile | Unnamed local image |

### Artifact Production

| Artifact Type | Produced? | Location |
|---------------|-----------|----------|
| Docker images | Yes | Local Docker daemon only |
| OCI bundles | No | - |
| Static assets | Partial | Inside containers (.next/static) |
| Source maps | No | Not configured |

### Tagging / Versioning

**Current state**: No versioning strategy

- Images tagged as `:local` or unnamed
- No semantic versioning
- No commit SHA tagging
- No registry push configured

### Artifact Promotion Feasibility

**Partial**: Would require changes

**Blockers**:
1. Build-time environment variables baked into images (`NEXT_PUBLIC_*`)
2. No registry configured
3. No tagging/versioning pipeline
4. Storefront build requires running API (network: host)

---

## 4. Data & State

### Databases

| Database | Type | Port | Purpose | ORM |
|----------|------|------|---------|-----|
| saleor | PostgreSQL 15 | 5432 | Core Saleor data | Django ORM |
| inventory_ops | PostgreSQL 15 | 5433 | Custom apps data | Prisma |
| dynamodb-local | DynamoDB | 8001 | Stripe APL + config | DynamoDB Toolbox |

### Migrations

| Component | Tool | Location | Apply Method |
|-----------|------|----------|--------------|
| Saleor API | Django | Inside image | `docker compose run api python3 manage.py migrate` |
| Custom Apps | Prisma | `saleor-apps/apps/inventory-ops/prisma/migrations/` | `pnpm prisma migrate deploy` |

**Migration Notes**:
- POS and Buylist symlink to inventory-ops schema
- Migrations run from inventory-ops, not individual apps
- No automated migration in CI/CD

### Seeding Strategy

| Data Type | Strategy | Command |
|-----------|----------|---------|
| Sample products | Django command | `populatedb --createsuperuser` |
| MTG cards | Python script | `scripts/bulk-sync-scryfall.py` |
| Meilisearch index | Python script | `scripts/sync-meilisearch.py` |
| Custom app data | None | Manual via UI |

### Caches, Queues, and External Services

| Service | Type | Persistence | Purpose |
|---------|------|-------------|---------|
| Valkey | Cache + Queue | Volatile (tmpfs optional) | Session cache, Celery broker |
| Meilisearch | Search index | Volume (`meilisearch-data`) | Product search |
| Jaeger | APM | tmpfs | Trace storage |
| Mailpit | Dev email | Memory | Test email capture |

### State Classification

| State Type | Environment-Specific | Shared |
|------------|---------------------|--------|
| User data | Yes | No |
| Product catalog | Partially | Source data from Scryfall |
| Inventory | Yes | No |
| Orders | Yes | No |
| Search index | Derived | From PostgreSQL |
| Sessions | Yes | No |

---

## 5. Current CI / Automation

### CI Provider

**GitHub Actions**

### Detected Workflows

**Platform level** (`.github/workflows/`):

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| test-platform | `test-platform.yml` | PR | Backend tests, storefront checks |

**saleor-apps level** (submodule):

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| main.yml (QA) | PR, push to main | Lint, type check, unit tests |
| e2e.yml | Manual/scheduled | E2E tests against Saleor cloud |
| prepare-release.yml | Manual | Changeset release |

### Jobs Executed

**test-platform.yml**:
```
verify_backend:
  - docker compose build
  - docker compose run api pytest

verify_storefront:
  - pnpm install
  - tsc --noEmit
  - pnpm lint
  - pnpm test
```

### Gaps Relative to Production-Grade Pipeline

| Gap | Severity | Description |
|-----|----------|-------------|
| No staging deploy | HIGH | No automated deployment to any environment |
| No production deploy | HIGH | Manual deployment only |
| No image registry | MEDIUM | Images not pushed to registry |
| No migration automation | MEDIUM | Database changes manual |
| No security scanning | MEDIUM | No SAST/DAST/container scanning |
| No artifact promotion | MEDIUM | Can't promote tested artifacts |
| Limited test coverage | LOW | Backend tests exist, E2E limited |
| No smoke tests | LOW | No post-deploy verification |

---

## 6. Environment Model (As-Is)

### Local

| Aspect | Configuration |
|--------|---------------|
| How configured | `docker-compose.yml` with inline env vars |
| How code reaches it | `docker compose build` from source |
| Secrets management | Plaintext in compose file |
| Mutability | Modified in-place |

### Staging

**Does not exist**

### Production

**Inference**: Not configured in repository

No production deployment configuration, secrets management, or infrastructure-as-code detected.

---

## 7. Deployment Constraints & Risks

### Tight Coupling Between Components

| Coupling | Risk | Description |
|----------|------|-------------|
| Storefront ↔ API | **HIGH** | Build requires running API for GraphQL introspection |
| POS/Buylist ↔ inventory-ops | **MEDIUM** | Shared Prisma schema via symlink |
| Custom Apps ↔ DynamoDB | **LOW** | APL storage for Stripe app |

### Migration / Schema Risks

| Risk | Level | Description |
|------|-------|-------------|
| Django migrations | **MEDIUM** | No rollback strategy documented |
| Prisma migrations | **MEDIUM** | Shared across 3 apps, must coordinate |
| No migration testing | **HIGH** | Migrations run directly in environments |

### Hardcoded Assumptions

| Location | Hardcoded Value | Risk |
|----------|-----------------|------|
| `storefront/src/pages/transaction.tsx:10-11` | `saleorChannelId`, `saleorWarehouseId` | **HIGH** |
| `docker-compose.yml:152` | `SECRET_KEY` for Stripe app | **MEDIUM** |
| `docker-compose.yml:324` | `INSTALLATION_ID` for price-sync | **MEDIUM** |
| `backend.env:7` | `SECRET_KEY=changeme` | **HIGH** |

### Secrets / Credentials Risks

| Risk | Level | Description |
|------|-------|-------------|
| Plaintext secrets in compose | **HIGH** | `SECRET_KEY`, database passwords visible |
| JWT token in `.mcp.json` | **MEDIUM** | Auth token committed to repo |
| No secrets rotation | **MEDIUM** | Static credentials |
| Default passwords | **HIGH** | `saleor/saleor`, `inventory/inventory` |

### Downtime Sensitivity

| Operation | Impact | Mitigation Available |
|-----------|--------|---------------------|
| Database migration | Full | None (single instance) |
| App restart | Per-service | None (no HA) |
| API restart | Full storefront outage | None |
| Search reindex | Degraded search | Background job |

### Automation Harm Potential

| Risk | Level | Description |
|------|-------|-------------|
| Unverified migrations | **HIGH** | Could corrupt production data |
| Build-time secrets | **MEDIUM** | Could leak via images |
| Force push to main | **LOW** | Protected by documented policy |

---

## 8. Delivery Readiness Assessment

### Can this repo support automated staging deploys today?

**No**

**Justification**:
- No staging environment defined
- No container registry configured
- Build-time environment variables prevent artifact promotion
- No secrets management for staging credentials
- No deployment automation (CD) exists

### Can this repo support safe production deploys today?

**No**

**Justification**:
- All risks from staging apply
- Default credentials still in configuration
- No production infrastructure defined
- No rollback strategy
- No monitoring/alerting configured

### Is artifact promotion feasible?

**Needs refactor**

**Justification**:
- `NEXT_PUBLIC_*` variables baked at build time prevent runtime configuration
- Would need to either:
  1. Move to runtime environment variable injection
  2. Build per-environment artifacts
- No registry to promote between

---

## 9. Recommended Delivery Phases (No Code)

### Phase 0: Foundation (Risk: LOW)

**Goals**:
- Establish reproducible local development
- Document all environment variables
- Remove hardcoded values from source code

**What must change**:
- Create `.env.example` templates for all services
- Extract hardcoded IDs to environment variables
- Document all required variables in SETUP.md
- Update Dockerfiles to use `--frozen-lockfile`

**What must NOT change**:
- Existing service architecture
- Database schemas
- Docker Compose structure

**Risk**: LOW - Documentation and configuration only

---

### Phase 1: CI Quality Gates (Risk: LOW)

**Goals**:
- Expand CI coverage
- Add security scanning
- Ensure all tests pass on PR

**What must change**:
- Add container image scanning (Trivy, Snyk)
- Add secret scanning (gitleaks)
- Add type checking for all TypeScript
- Add Prisma migration validation
- Update test-platform.yml with comprehensive checks

**What must NOT change**:
- Deployment targets (still local only)
- Release process

**Risk**: LOW - No deployment changes

---

### Phase 2: Automated Staging (Risk: MEDIUM)

**Goals**:
- Establish staging environment
- Automate deployments to staging
- Implement secrets management

**What must change**:
- Choose hosting provider (Vercel, Railway, AWS, etc.)
- Set up container registry (GHCR, ECR, etc.)
- Implement secrets management (1Password, Vault, cloud secrets)
- Create staging infrastructure
- Add deployment workflow triggered on merge to `platform/main`
- Implement database migration automation with dry-run

**What must NOT change**:
- Production (not yet created)
- `main` branch (upstream mirror)

**Risk**: MEDIUM - First deployment automation

---

### Phase 3: Safe Production Deploys (Risk: MEDIUM-HIGH)

**Goals**:
- Production environment with HA considerations
- Blue-green or rolling deployments
- Automated rollback capability
- Monitoring and alerting

**What must change**:
- Production infrastructure provisioning
- Implement proper secret rotation
- Configure backup strategy for databases
- Set up monitoring (Datadog, New Relic, or similar)
- Implement feature flags for risky changes
- Add smoke tests post-deployment
- Create runbook for manual rollback

**What must NOT change**:
- Staging environment (reference for testing)
- CI quality gates

**Risk**: MEDIUM-HIGH - Production is customer-facing

---

## 10. Open Questions / Ambiguities

The following cannot be determined from the repository alone:

### Hosting & Infrastructure

| Question | Impact |
|----------|--------|
| Where will staging/production be hosted? | Determines all IaC choices |
| What is the expected traffic volume? | Sizing and scaling requirements |
| Are there geographic requirements? | Multi-region vs single region |
| What is the budget for infrastructure? | Service tier selections |

### Compliance & Security

| Question | Impact |
|----------|--------|
| Is PCI-DSS compliance required for payments? | Security controls scope |
| Are there data residency requirements? | Database/storage location |
| What is the RTO/RPO for disaster recovery? | Backup strategy |
| Who needs access to production? | IAM design |

### Operational Requirements

| Question | Impact |
|----------|--------|
| What is the acceptable downtime window? | Deployment strategy |
| Who is on-call for production issues? | Alerting routing |
| What SLAs apply to the storefront? | Monitoring thresholds |
| Is there an existing monitoring stack? | Integration vs new setup |

### Business Context

| Question | Impact |
|----------|--------|
| When is the target go-live date? | Phase prioritization |
| Are there peak traffic periods (release dates, etc.)? | Scaling automation |
| What is the current production state (if any)? | Migration complexity |
| Are there third-party integrations beyond Stripe? | API dependencies |

---

## Appendix A: Service Port Reference

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Storefront | HTTP |
| 3001 | Stripe App | HTTP |
| 3002 | Inventory Ops | HTTP |
| 3003 | Buylist | HTTP |
| 3004 | POS | HTTP |
| 5432 | PostgreSQL (Saleor) | PostgreSQL |
| 5433 | PostgreSQL (Inventory) | PostgreSQL |
| 6000 | saleor-mcp | HTTP |
| 6379 | Valkey | Redis |
| 7700 | Meilisearch | HTTP |
| 8000 | Saleor API | HTTP |
| 8001 | DynamoDB Local | HTTP |
| 8025 | Mailpit UI | HTTP |
| 9000 | Dashboard | HTTP |
| 16686 | Jaeger UI | HTTP |

---

## Appendix B: File Quick Reference

| Purpose | File |
|---------|------|
| All services | `docker-compose.yml` |
| Saleor config | `backend.env`, `common.env` |
| Storefront config | `storefront/.env.example` |
| Setup script | `scripts/setup.sh` |
| Architecture | `docs/reference/architecture.md` |
| Git workflow | `docs/reference/git-philosophy.md` |
| Security checklist | `docs/setup/security-checklist.md` |
| CI workflow | `.github/workflows/test-platform.yml` |
| Prisma schema | `saleor-apps/apps/inventory-ops/prisma/schema.prisma` |

---

*This document should be sufficient for another AI or human to design and implement a full delivery pipeline without re-inspecting the repository.*
