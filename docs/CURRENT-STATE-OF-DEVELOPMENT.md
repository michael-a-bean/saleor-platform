# Saleor Platform — Current State of Development

**Generated:** 2026-02-12
**Platform:** Hobby Gaming E-Commerce (MTG/Board Games/Miniatures)
**Owner:** Michael Bean (michael-a-bean)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Repository Architecture](#repository-architecture)
3. [Branch Inventory](#branch-inventory)
4. [Repository Deep Dives](#repository-deep-dives)
5. [Infrastructure](#infrastructure)
6. [Active Work & WIP](#active-work--wip)
7. [Development Timeline](#development-timeline)
8. [Architecture & Dependencies](#architecture--dependencies)
9. [Deployment Stack](#deployment-stack)
10. [Known Issues & Technical Debt](#known-issues--technical-debt)
11. [Recommendations](#recommendations)

---

## Executive Summary

The Saleor Platform is a **customized fork of Saleor** tailored for a hobby gaming e-commerce business. It consists of a monorepo orchestrating multiple services: a Django/GraphQL backend (Saleor core), a Next.js storefront, and several custom Saleor Apps managed as git submodules within a Turborepo monorepo.

**Key Numbers:**
| Metric | Value |
|--------|-------|
| Total Git Repositories | 5 (1 parent + 4 submodule repos) |
| Total Branches (all repos) | 9 local, 11 remote |
| Custom Saleor Apps | 5 (inventory-ops, buylist, pos, price-sync, mtg-import) |
| Standard Saleor Apps | 8 (avatax, cms, klaviyo, np-atobarai, search, segment, smtp, stripe) |
| Terraform Modules | 11 (alb, cloudfront, dynamodb, ecr, ecs, elasticache, iam, meilisearch, rds, s3, vpc) |
| Docker Services | 16 |
| Total Codebase | ~3+ GB |
| Last Activity | 2026-02-01 (saleor-platform), 2026-01-27 (saleor-apps) |

**Overall Status:** Active development, primary work on `platform/main` branch. MTG Import App recently completed. POS App at Phase 1 MVP (~95%). Inventory-Ops ADR-001 merged. Infrastructure fully Terraform-managed on AWS.

---

## Repository Architecture

```
saleor-platform (parent repo)
├── github.com/michael-a-bean/saleor-platform.git
│
├── saleor-apps/ (git submodule → github.com/michael-a-bean/saleor-apps.git)
│   ├── apps/
│   │   ├── inventory-ops/ (submodule → github.com/michael-a-bean/saleor-app-inventory-ops.git)
│   │   ├── buylist/ (submodule → github.com/michael-a-bean/saleor-app-buylist.git)
│   │   ├── pos/ (independent repo → github.com/michael-a-bean/saleor-app-pos.git)
│   │   ├── price-sync/ (submodule → github.com/michael-a-bean/saleor-app-price-sync.git) [DEPRECATED]
│   │   ├── mtg-import/ [on remote branch only, not on current local]
│   │   ├── avatax/, cms/, klaviyo/, np-atobarai/, search/, segment/, smtp/, stripe/
│   │   └── (standard Saleor apps, tracked selectively via .gitignore)
│   └── packages/ (13 shared packages: domain, trpc, logger, otel, etc.)
│
├── storefront/ (Next.js, tracked in parent repo — no independent .git)
│
├── infra/terraform/ (AWS infrastructure)
│   └── modules/ (alb, cloudfront, dynamodb, ecr, ecs, elasticache, iam, meilisearch, rds, s3, vpc)
│
├── scripts/ (Python/Bash tooling — import, sync, backup, deploy)
├── saleor-mcp/ (MCP server for AI assistant integration) [empty on disk]
├── tools/ (delivery, research)
└── docs/ (decisions, ops, reference, research, debug)
```

**Git Tracking Strategy (saleor-apps/.gitignore):**
The saleor-apps repo uses a **selective tracking strategy** — it ignores everything by default (`/*`) and explicitly tracks only:
- Custom submodule apps: `inventory-ops`, `buylist`, `price-sync`, `pos`
- Stripe app HTTP staging customizations (specific files)
- Shared trpc package `http-batch-link.ts` (basePath fix critical for ALB routing)

---

## Branch Inventory

### 1. saleor-platform (Parent Repo)

| Branch | Type | Current | Status | Last Commit | Description |
|--------|------|---------|--------|-------------|-------------|
| `platform/main` | Local | **YES** | Up to date w/ remote | 2026-02-01 | **Primary development branch** — all custom work goes here |
| `main` | Local | No | Mirrors upstream | — | Upstream Saleor mirror. **NEVER commit here.** |
| `feature/inventory-ops-improvements` | Local + Remote | No | Merged (PR #1) | — | ADR-001 costing layer — already merged |
| `origin/platform/main` | Remote | — | Tracked | 2026-02-01 | Remote tracking for platform/main |
| `origin/main` | Remote | — | Tracked | — | Upstream mirror remote |

**Git Tag:** `v1.0.0`

**Uncommitted Changes on platform/main:**
- `.mcp.json` — Added `autoStart: false` to 3 MCP server configs (7 insertions, 4 deletions)
- `saleor-apps` submodule — points to newer commits than tracked
- **Untracked files:**
  - `docs/ops/audits/iam-snapshots-20260127/`
  - `docs/ops/audits/s3-policy-backup-20260127/`
  - `docs/ops/audits/terraform-plan-20260127.txt`
  - `docs/ops/prompts/AWS-ARCHITECTURE-TERRAFORM-DRIFT-REMEDIATION.md`
  - `docs/ops/prompts/VPC-ALIGNMENT-MAINTENANCE.md`

### 2. saleor-apps (Submodule)

| Branch | Type | Current | Status | Last Commit | Description |
|--------|------|---------|--------|-------------|-------------|
| `main` | Local | **YES** | **10 commits behind remote** | 2026-01-27 | Main development branch |
| `origin/main` | Remote | — | Ahead of local | 2026-01-31 | Has mtg-import commits |
| `origin/feature/inventory-ops-improvements` | Remote | — | Stale | 2026-01-22 | Old feature branch |

**Notable:** Local `main` is 10 commits behind `origin/main`. The remote has mtg-import app commits that haven't been pulled locally.

### 3. inventory-ops (Submodule of saleor-apps)

| Branch | Type | Current | Status | Last Commit | Description |
|--------|------|---------|--------|-------------|-------------|
| `main` | Local | **YES** | Up to date | 2026-01-27 | Active development |
| `feature/adr-001-implementation` | Local | No | Merged into main | 2026-01-22 | ADR-001 costing layer — completed |
| `origin/main` | Remote | — | Tracked | 2026-01-27 | — |
| `origin/feature/adr-001-implementation` | Remote | — | Merged | 2026-01-22 | — |

**Status:** Clean working tree.

### 4. buylist (Submodule of saleor-apps)

| Branch | Type | Current | Status | Last Commit | Description |
|--------|------|---------|--------|-------------|-------------|
| `main` | Local | **YES** | Up to date | 2026-01-22 | Active development |
| `origin/main` | Remote | — | Tracked | — | — |

**Status:** Clean except untracked `.turbo/` and `node_modules/redis`.

### 5. pos (Independent Repo in saleor-apps/apps/)

| Branch | Type | Current | Status | Last Commit | Description |
|--------|------|---------|--------|-------------|-------------|
| `main` | Local | **YES** | Up to date | 2026-01-23 | Phase 1 MVP (~95%) |
| `origin/main` | Remote | — | Tracked | 2026-01-23 | — |

**Status:** Clean working tree.

### 6. price-sync (Submodule — DEPRECATED)

| Branch | Type | Current | Status | Last Commit | Description |
|--------|------|---------|--------|-------------|-------------|
| `(HEAD detached at 7e33ae7)` | Detached | **YES** | Deprecated | 2026-01-04 | Moved to standalone service |
| `main` | Local | No | — | — | — |
| `origin/main` | Remote | — | — | — | — |

**Status:** App has been **removed from service** and moved to a standalone worker. HEAD is detached at the removal commit.

---

## Repository Deep Dives

### A. saleor-platform (Parent Monorepo)

**Purpose:** Orchestrates all services, infrastructure, and deployment for the hobby gaming e-commerce platform.

**Key Components:**
- `docker-compose.yml` — 16 services (see Deployment Stack)
- `Makefile` — Comprehensive developer operations (validate, lint, typecheck, test, deploy)
- `scripts/` — 400KB+ of Python/Bash tooling for MTG imports, Scryfall sync, Meilisearch, database ops
- `infra/terraform/` — Full AWS infrastructure (see Infrastructure)
- `docs/` — Extensive documentation: ADRs, ops runbooks, audits, research, debug guides
- `.claude/` — AI assistant configuration with domain-specific skills and rules

**Validation Pipeline (`make validate`):**
1. Docker-compose validation
2. Linting (storefront + apps)
3. Type checking (TypeScript)
4. Unit tests (all projects)
5. Migration check (Django + Prisma)
6. Local review gate (git diff risk patterns)

**Recent Activity (last 20 commits on platform/main):**
- MTG Import App implementation and deployment infrastructure
- Submodule updates for inventory-ops, buylist, pos
- Terraform fixes and formatting
- Documentation cleanup and archival

---

### B. Storefront (Next.js)

**Path:** `/home/michael/saleor-platform/storefront`
**Framework:** Next.js 16 (App Router) + React 19 + TypeScript 5.3
**Git:** Part of parent saleor-platform repo (no independent git)

**Tech Stack:**
- Styling: TailwindCSS 3.4 with custom brand tokens
- State: Zustand (cart/checkout)
- GraphQL: urql + graphql-codegen
- Search: Meilisearch (MTG singles)
- Payments: Stripe integration
- Auth: Saleor SDK
- Testing: Playwright (E2E/visual), Vitest (unit)
- ~35,865 lines of TypeScript/TSX

**Routes:**
- Multi-tenant via `[channel]` dynamic parameter
- Main: Home, Magic (sets/singles/sealed), Board Games, Miniatures, Supplies
- Catalog: Products, Categories, Collections, Search
- Account: Login, Orders
- Staff-only: Singles Builder (Meilisearch-powered)
- Checkout: Portable checkout system (framework-agnostic)
- API: Health, Draft Mode, Contact, Scryfall Icon proxy, Singles Builder lookup

**Brand/Design System:**
- Custom font: Polymath Display/Text
- Colors: Deep Purple (#07074E), Bright Blue (#00B3C5), Sunny Yellow (#FFCF01), Fresh Green (#005B23), Bleached Bone (#E3D2B2)
- MTG rarity colors: Mythic, Rare, Uncommon, Common
- Centralized in `src/lib/brand.ts` with validation script

**Security:**
- CSP headers with whitelisted domains (Stripe, Google Tag Manager, Scryfall)
- X-Content-Type-Options, X-XSS-Protection, X-Frame-Options
- HTTPS enforcement in production
- Staff auth for singles-builder routes

---

### C. Inventory-Ops App

**Path:** `saleor-apps/apps/inventory-ops`
**Repo:** github.com/michael-a-bean/saleor-app-inventory-ops.git
**Framework:** Next.js (App Router) + tRPC + Prisma
**Port:** 3002
**Total Commits:** Multiple (main branch active)

**Purpose:** Purchase orders, Weighted Average Cost (WAC), Cost of Goods Sold (COGS) tracking, goods receipt processing.

**Key Features:**
- WAC (Weighted Average Cost) calculations
- COGS tracking with cost layer events
- Purchase order management
- Goods receipt processing
- Scheduled reconciliation (cron-based, per ADR-001)
- Multi-tenant via AppInstallation

**Recent Major Work:**
- **ADR-001 Implementation** (merged 2026-01-23): Costing layer improvements including enhanced scheduled reconciliation, ESLint fixes, PrismaClientLike type for transaction compatibility
- **Phase 2 Data Integrity** (2026-01-16): WAC concurrency fixes, goods receipt transactions

**Database:** PostgreSQL on port 5433 (separate from Saleor core DB)

---

### D. POS App (Point of Sale)

**Path:** `saleor-apps/apps/pos`
**Repo:** github.com/michael-a-bean/saleor-app-pos.git
**Framework:** Next.js (App + Pages Router) + tRPC + Prisma
**Port:** 3004
**Total Commits:** 52

**Status: Phase 1 MVP ~95% Complete**

**Working Features:**
- Register session management (open/close with cash denomination tracking)
- Barcode/SKU scanning + cart management
- Customer search, creation, attachment
- Store credit system (reads from buylist)
- Cash payment processing with change calculation
- Browser receipt printing (80mm thermal)
- Singles Builder one-click cart import
- Transaction void with reason capture
- Comprehensive audit logging

**Architecture:**
- Symlinked Prisma schema (`→ ../../inventory-ops/prisma/schema.prisma`) — shared DB
- tRPC routers: register, transactions, payments, customers, receipts
- Square Terminal integration (Phase 4-5 — OAuth, webhook handlers, terminal checkout)
- Offline mode infrastructure (IndexedDB via Dexie, cursor-based pagination, sync service)
- Circuit breaker pattern for external API calls

**Critical Fixes Applied:**
- Payment router: Transaction isolation, idempotency keys, Decimal.js, COGS atomicity, outbox pattern, register state validation, store credit validation
- Docker: Health checks, BASE_PATH support for ALB routing, crypto.randomUUID polyfill
- Session context: Replaced hardcoded values with dynamic session context (ISSUE-012)

**Roadmap:**
- Phase 2: Returns, Stripe Terminal, split payments
- Phase 3: Tax exemption, cash drops, reports
- Phase 4: Offline mode production, local cache, reconciliation
- Phase 5: ESC/POS printer, cash drawer

**Known Limitations:**
- Cash-only payments (card readers Phase 2)
- No returns processing yet
- Tax hardcoded to $0
- Browser print only (no ESC/POS)
- Single test file (`register-router.test.ts`)

---

### E. Buylist App

**Path:** `saleor-apps/apps/buylist`
**Repo:** github.com/michael-a-bean/saleor-app-buylist.git
**Port:** 3003

**Purpose:** Card buyback system — customers sell cards back to the store.

**Recent Work:**
- P2-3 fix: Remove duplicate cost events from createAndPay
- Block cancellation after payout
- Redis APL support
- Docker/ECS deployment fixes (BASE_PATH, health checks, polyfills)
- ESLint cleanup

**Integration:** Generates CustomerCredit records consumed by POS app for store credit payments.

---

### F. Price-Sync (DEPRECATED as Saleor App)

**Path:** `saleor-apps/apps/price-sync`
**Status:** HEAD detached at removal commit (7e33ae7)

The price-sync functionality has been **moved to a standalone service** (referenced as `price-sync` and `price-sync-worker` in docker-compose). The Saleor App wrapper was removed.

Features before migration: Report generation, trend calculation, staged approvals, Scryfall price sync.

---

### G. MTG Import App (Remote Branch Only)

**Status:** Exists on `origin/main` of saleor-apps but not on local `main` (10 commits behind).

The MTG Import App was recently completed with:
- Complete Saleor App implementation for Scryfall data import
- Prisma migrations
- Vitest configuration
- Dockerfile aligned with inventory-ops pattern
- Standalone server
- Health endpoint and smoke tests

The parent `saleor-platform` has the deployment infrastructure (Terraform resources, ECS, ECR) already committed on `platform/main`.

---

## Infrastructure

### Terraform Modules (infra/terraform/modules/)

| Module | Purpose |
|--------|---------|
| `alb` | Application Load Balancer — routes traffic to ECS services |
| `cloudfront` | CDN distribution for storefront and static assets |
| `dynamodb` | DynamoDB tables (Stripe app APL) |
| `ecr` | Container registries for each app |
| `ecs` | ECS Fargate services and task definitions |
| `elasticache` | Valkey (Redis replacement) cluster |
| `iam` | IAM roles and policies |
| `meilisearch` | Search engine instance |
| `rds` | PostgreSQL RDS instances |
| `s3` | S3 buckets (media, backups, static assets) |
| `vpc` | VPC, subnets, security groups, NAT |

**Terraform State:** Remote backend (S3 + DynamoDB locking)
**Plan Files:** `staging.tfplan`, `tfplan`, `vpc-alignment.tfplan` present

**Critical Infrastructure Rules:**
- No untracked AWS changes — everything must be in Terraform
- VPC alignment maintenance documented
- IAM snapshots taken (2026-01-27)
- Drift prevention council review completed (2026-01-27)

---

## Active Work & WIP

### Uncommitted/Unstaged Changes

| Repo | File/Change | Status |
|------|-------------|--------|
| saleor-platform | `.mcp.json` (autoStart:false) | Modified, not staged |
| saleor-platform | `saleor-apps` submodule pointer | Behind remote |
| saleor-platform | 5 untracked audit/prompt docs | Not tracked |
| saleor-apps | Local `main` 10 commits behind remote | Needs pull |
| buylist | `.turbo/`, `node_modules/redis` | Untracked build artifacts |
| price-sync | Detached HEAD | Deprecated, needs cleanup |

### Feature Branches

| Branch | Repo | Status | Description |
|--------|------|--------|-------------|
| `feature/inventory-ops-improvements` | saleor-platform, saleor-apps | **MERGED** (PR #1) | ADR-001 costing layer |
| `feature/adr-001-implementation` | inventory-ops | **MERGED** | ADR-001 implementation |

**No active feature branches.** All feature work has been merged. Development is currently on `platform/main`.

### In-Progress Work

1. **MTG Import App deployment** — Infrastructure committed to platform/main, app code on saleor-apps remote. Needs local pull to sync.
2. **POS Phase 2** — Returns, Stripe Terminal, split payments not yet started.
3. **Infrastructure audit docs** — Several untracked audit documents from 2026-01-27 session.

---

## Development Timeline

| Date | Activity | Repos Affected |
|------|----------|----------------|
| 2026-02-01 | MTG Import App — increase memory to 2GB for Scryfall bulk download | saleor-platform |
| 2026-01-31 | MTG Import App — vitest config for unit tests | saleor-apps (remote) |
| 2026-01-30 | MTG Import App — initial Prisma migrations | saleor-apps (remote) |
| 2026-01-29 | MTG Import App — smoke tests, Dockerfile fixes | saleor-apps (remote) |
| 2026-01-27 | Inventory-ops lint fixes, infrastructure audits | saleor-apps, inventory-ops, saleor-platform |
| 2026-01-23 | POS ISSUE-012 (replace hardcoded values), ADR-001 merge | pos, inventory-ops, saleor-apps |
| 2026-01-22 | ESLint cleanup across buylist, pos, inventory-ops | All custom apps |
| 2026-01-21 | ADR-001 costing layer implementation | inventory-ops |
| 2026-01-16 | Phase 2/3/4 improvements (data integrity, reliability, cache pagination) | pos, inventory-ops |
| 2026-01-15 | POS Docker/deployment fixes (health checks, BASE_PATH, smoke tests) | pos |
| 2026-01-10 | POS payment router critical fixes, offline sync | pos |
| 2026-01-09 | POS Square Terminal integration, COGS tracking, tax calculation | pos |
| 2026-01-06 | Square webhook handler, terminal checkout service | pos |
| 2026-01-04 | Price-sync moved to standalone service | price-sync |

---

## Architecture & Dependencies

### Inter-Service Dependencies

```
                    ┌─────────────────┐
                    │   CloudFront    │
                    │     (CDN)       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │      ALB        │
                    │ (Path Routing)  │
                    └──┬──┬──┬──┬──┬──┘
                       │  │  │  │  │
          ┌────────────┘  │  │  │  └────────────┐
          │               │  │  │               │
   ┌──────▼──────┐ ┌──────▼──┐│┌──▼──────┐ ┌────▼─────┐
   │  Storefront │ │ Inv-Ops ││ │ Buylist │ │   POS    │
   │  (Next.js)  │ │  :3002  ││ │  :3003  │ │  :3004   │
   │   :3000     │ └────┬────┘│ └────┬────┘ └────┬─────┘
   └──────┬──────┘      │    │      │            │
          │              │    │      │            │
          │         ┌────▼────▼──────▼────────────▼─────┐
          │         │       PostgreSQL (Inventory)       │
          │         │           Port 5433                │
          │         └───────────────────────────────────┘
          │
   ┌──────▼──────┐     ┌───────────────┐
   │  Saleor API │────▶│  PostgreSQL   │
   │  (Django)   │     │  (Core) :5432 │
   │   :8000     │     └───────────────┘
   └──────┬──────┘
          │
   ┌──────▼──────┐     ┌───────────────┐
   │  Dashboard  │     │    Valkey     │
   │   :9000     │     │  (Cache) :6379│
   └─────────────┘     └───────────────┘
```

**Shared Database Pattern:**
- POS and Inventory-Ops share the same PostgreSQL database (port 5433)
- POS symlinks its Prisma schema to inventory-ops (`prisma/schema.prisma → ../../inventory-ops/prisma/schema.prisma`)
- Buylist creates CustomerCredit records consumed by POS
- Migrations must be run from inventory-ops only

**Data Flow:**
1. **Storefront** → Saleor API (GraphQL) → PostgreSQL (core)
2. **Storefront** → Meilisearch (search) for MTG singles
3. **POS** → Saleor API (draft orders, payments) + Inventory DB (COGS, sessions, transactions)
4. **Inventory-Ops** → Saleor API (webhooks) + Inventory DB (WAC, purchase orders, cost events)
5. **Buylist** → Saleor API + Inventory DB (customer credit)
6. **Price-Sync Worker** → Scryfall API → Saleor API (price updates)
7. **MTG Import** → Scryfall API → Saleor API (product creation)

---

## Deployment Stack

### Docker Compose Services (16 total)

| Service | Image/Build | Port | Purpose |
|---------|-------------|------|---------|
| `api` | Saleor core | 8000 | GraphQL API |
| `dashboard` | Saleor Dashboard | 9000 | Admin UI |
| `db` | PostgreSQL 15 | 5432 | Core database |
| `cache` | Valkey 8.1 | 6379 | Caching layer |
| `worker` | Celery | — | Background jobs |
| `jaeger` | Jaeger | 16686 | Distributed tracing |
| `mailpit` | Mailpit | 8025 | Email testing |
| `storefront` | Next.js (built) | 3000 | Customer-facing store |
| `stripe-app` | Saleor Stripe App | 3001 | Payment processing |
| `dynamodb-local` | DynamoDB Local | 8001 | Local DynamoDB |
| `inventory-ops-app` | Custom app | 3002 | Inventory management |
| `buylist-app` | Custom app | 3003 | Card buyback |
| `pos-app` | Custom app | 3004 | Point of sale |
| `saleor-mcp` | MCP server | 6000 | AI assistant integration |
| `meilisearch` | Meilisearch | 7700 | Search engine |
| `price-sync` + `price-sync-worker` | CLI + daemon | — | Price synchronization |

### Technology Versions

| Technology | Version |
|------------|---------|
| Node.js | >=22.0.0 (apps), >=18 (storefront) |
| pnpm | >=10.0.0 (apps), >=9.4.0 (storefront) |
| Next.js | 16.0.7 (storefront) |
| React | 19.1.2 (storefront) |
| TypeScript | 5.3.3 |
| PostgreSQL | 15 |
| Prisma | 5.22.0 |
| Valkey | 8.1 |
| Terraform | Configured in versions.tf |
| Docker | Multi-stage builds (node:22-alpine) |

---

## Known Issues & Technical Debt

### High Priority

1. **saleor-apps local is 10 commits behind remote** — MTG Import App code exists on remote but hasn't been pulled to local `main`. This means the local saleor-apps submodule doesn't have the mtg-import app.

2. **price-sync detached HEAD** — The deprecated price-sync app has a detached HEAD. Should be cleaned up (branch deleted or properly pointed).

3. **POS test coverage** — Only 1 test file (`register-router.test.ts`) across the entire POS app. Payment router, transaction logic, and offline sync have zero test coverage.

4. **POS hardcoded values** — While ISSUE-012 addressed some hardcoded values, the README still lists hardcoded channel/warehouse IDs as known gotchas.

5. **Tax calculation** — POS tax is hardcoded to $0. Not yet implemented.

### Medium Priority

6. **Untracked audit documents** — 5 files from the 2026-01-27 infrastructure audit session are untracked in saleor-platform.

7. **MCP configuration change uncommitted** — `.mcp.json` has unstaged changes adding `autoStart: false`.

8. **Storefront React Compiler rules disabled** — ESLint config has a TODO noting React Compiler rules need refactoring.

9. **Feature branches not cleaned up** — `feature/inventory-ops-improvements` branch exists in both saleor-platform and saleor-apps even though PR #1 is merged.

### Low Priority

10. **Build artifacts in submodules** — `.turbo/` and `node_modules/redis` untracked in buylist.

11. **Missing saleor-mcp on disk** — The saleor-mcp directory appears empty despite being referenced in docker-compose.

---

## Recommendations

### Immediate Actions

1. **Pull saleor-apps to sync with remote** — `git -C saleor-apps pull origin main` to bring in the MTG Import App code locally.

2. **Commit or stash uncommitted changes** — The `.mcp.json` change and untracked audit docs should be either committed or explicitly gitignored.

3. **Clean up merged feature branches** — Delete `feature/inventory-ops-improvements` from saleor-platform, saleor-apps, and inventory-ops (both local and remote).

4. **Resolve price-sync detached HEAD** — Either delete the price-sync submodule entirely or point it to a branch.

### Near-Term Improvements

5. **POS test coverage** — Priority: payment router tests, transaction flow tests. The payment router has complex financial logic that needs coverage.

6. **Tax calculation implementation** — Blocking POS from production use for tax-jurisdictions.

7. **Storefront React Compiler refactoring** — Address the TODO in eslint.config.mjs.

### Architectural Considerations

8. **Submodule complexity** — The 3-level nesting (platform → saleor-apps → inventory-ops/buylist/pos) creates friction. Consider whether all custom apps need to be submodules or if some could be moved to the saleor-apps monorepo directly.

9. **Shared Prisma schema via symlink** — POS's dependency on inventory-ops's schema creates a tight coupling. Migrations in inventory-ops directly affect POS. This is intentional but should be documented as a critical dependency.

10. **MTG Import App deployment** — The app infrastructure (Terraform) is on platform/main but the app code is only on saleor-apps remote. These should be synchronized before deploying.

---

*Document generated by PAI system on 2026-02-12. For questions or updates, review the individual CLAUDE.md files in each repository for domain-specific context.*
