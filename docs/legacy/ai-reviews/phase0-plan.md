# Phase 0 Plan: Delivery Foundation

**Date:** 2026-01-10
**Author:** Claude Code (Gen)
**Status:** DRAFT - Pending Multi-Agent Review

---

## Objectives

1. Establish delivery invariants
2. Remove hardcoded values from source code
3. Make local development reproducible
4. Define validation entrypoints (Makefile/scripts)

---

## Scope Boundaries

### WILL Change
- Configuration files (.env.example templates)
- docker-compose.yml (environment variable references)
- Makefile (validation targets)
- Documentation (DELIVERY_CONTRACT.md)
- Dockerfiles (lockfile enforcement)

### WILL NOT Change
- Existing service architecture
- Database schemas
- Docker Compose service structure
- Application source code logic
- Git branch strategy

---

## Planned Changes

### 1. Create docs/DELIVERY_CONTRACT.md

Define canonical delivery invariants:

| Section | Content |
|---------|---------|
| **Environments** | local, staging, production definitions |
| **Artifact Strategy** | Image tagging (SHA-based), registry (GHCR) |
| **Promotion Rules** | local→staging (PR merge), staging→production (manual approval) |
| **Migration Rules** | Dry-run required, rollback documented |
| **Secrets Policy** | No plaintext in repo, .env for local only |

### 2. Create Platform-Level .env.example Files

Current state:
- `backend.env` - Contains `SECRET_KEY=changeme` (HIGH risk)
- `common.env` - Safe defaults
- `storefront/.env.example` - Exists, adequate

Required new files:
- `.env.example` (platform root) - Aggregated template with ALL required vars
- `apps.env.example` - Custom app environment variables

Variables to document:
```
# Platform Core
SECRET_KEY=<generate-random-64-char>
DATABASE_URL=postgres://user:password@host:5432/saleor

# Custom Apps
STRIPE_APP_SECRET_KEY=<generate-random-64-char>
INVENTORY_OPS_SECRET_KEY=<generate-random-64-char>
BUYLIST_SECRET_KEY=<generate-random-64-char>
POS_SECRET_KEY=<generate-random-64-char>
INSTALLATION_ID=<uuid-from-saleor-dashboard>
```

### 3. Extract Hardcoded Values from docker-compose.yml

Current hardcoded values (HIGH/MEDIUM severity):

| Line | Value | Risk | Action |
|------|-------|------|--------|
| 151 | `SECRET_KEY=677a28c7...` (stripe-app) | HIGH | → `${STRIPE_APP_SECRET_KEY}` |
| 192 | `SECRET_KEY=a1b2c3...` (inventory-ops-app) | HIGH | → `${INVENTORY_OPS_SECRET_KEY}` |
| 251 | `SECRET_KEY=b2c3d4...` (buylist-app) | HIGH | → `${BUYLIST_SECRET_KEY}` |
| 281 | `SECRET_KEY=c3d4e5...` (pos-app) | HIGH | → `${POS_SECRET_KEY}` |
| 321 | `INSTALLATION_ID=2735990c-...` (price-sync) | MEDIUM | → `${INSTALLATION_ID}` |
| 47-48 | `POSTGRES_USER/PASSWORD=saleor` | MEDIUM | → `${POSTGRES_USER}`, `${POSTGRES_PASSWORD}` |
| 211-213 | `POSTGRES_USER/PASSWORD=inventory` | MEDIUM | → env vars |

Strategy: Reference environment variables with fallback defaults for local dev:
```yaml
environment:
  - SECRET_KEY=${STRIPE_APP_SECRET_KEY:-dev-only-stripe-key}
```

### 4. Update Dockerfiles to Use --frozen-lockfile

Files to modify:

| File | Current | Change |
|------|---------|--------|
| `storefront/Dockerfile:14` | `--no-frozen-lockfile` | `--frozen-lockfile` |
| `saleor-apps/apps/inventory-ops/Dockerfile:23` | `--no-frozen-lockfile` | `--frozen-lockfile` |

**Note:** Requires updating pnpm-lock.yaml files first if they're stale.

### 5. Implement Comprehensive make validate

Expand current Makefile with:

```makefile
.PHONY: validate lint typecheck test migration-check docker-build

validate: lint typecheck test migration-check docker-build localreview
	@echo "All validation checks passed"

lint:
	@echo "Running linters..."
	cd storefront && pnpm lint
	cd saleor-apps && pnpm lint

typecheck:
	@echo "Running type checks..."
	cd storefront && pnpm exec tsc --noEmit
	cd saleor-apps && pnpm check-types

test:
	@echo "Running tests..."
	cd storefront && pnpm test
	cd saleor-apps && pnpm test:ci

migration-check:
	@echo "Validating migrations..."
	# Django migrations (check for pending)
	# Prisma migrations (validate schema)

docker-build:
	@echo "Verifying Docker builds..."
	docker compose build --dry-run 2>/dev/null || docker compose config
```

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking existing local dev | LOW | Provide fallback defaults in docker-compose.yml |
| Lockfile out of sync | MEDIUM | Update lockfiles before Dockerfile changes |
| Missing env vars on startup | LOW | Clear error messages and .env.example docs |
| Secrets in git history | N/A | Not removing existing history (Phase 0 scope) |

---

## Validation Criteria

Phase 0 complete when:
- [ ] `docker compose up` works with only `.env` file (copied from `.env.example`)
- [ ] `make validate` runs all checks (may have expected failures)
- [ ] No hardcoded secrets in docker-compose.yml
- [ ] DELIVERY_CONTRACT.md documents all environments and rules
- [ ] /localreview passes with no HIGH severity findings

---

## Questions for Multi-Agent Review

### For GPT-5.2 (Specification/Correctness)
1. Does the proposed .env structure adequately separate concerns?
2. Is the migration rule (dry-run required) sufficient for Phase 0?
3. Should we add explicit version pinning requirements?

### For Gemini 3 (Security/Ops Risk)
1. Are the fallback defaults (`:-dev-only-*`) acceptable for local dev?
2. Should we add additional scanning beyond gitleaks/trivy in Phase 0?
3. Any blast-radius concerns with the docker-compose.yml changes?

---

*This plan will be implemented after multi-agent review feedback is incorporated.*
