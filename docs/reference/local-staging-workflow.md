# Local Development vs Staging Workflow

**Created:** 2026-01-18
**Status:** ACTIVE
**Source:** Council Debate on Environment Isolation

---

## Overview

This document defines the safe workflow for local development that cannot accidentally break staging. The key insight from the council debate:

> **"The boundary is data, not infrastructure."** — Jordan (Saleor Expert)

Build-time variables (`NEXT_PUBLIC_*`) get baked into Docker images, making them environment-specific. This is by design and cannot be changed at runtime.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `make validate-env` | Quick validation (pre-push) |
| `make validate-env-strict` | Strict validation (pre-deploy) |
| `make validate-env-full` | Full validation including database |
| `make setup-hooks` | Install git hooks |
| `make db-reset` | Reset local database (guarded) |

---

## The Golden Rules

### 1. Never Push Local Images to ECR

Local Docker builds have `localhost` URLs baked in. They **cannot** work on staging.

```bash
# Local build (for local development only)
docker compose build storefront
# Image has: NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/

# Staging build (via CI/CD only)
docker build --build-arg NEXT_PUBLIC_BUILD_ENV=staging \
             --build-arg NEXT_PUBLIC_SALEOR_API_URL=http://staging-alb.../graphql/ \
             ./storefront
```

### 2. Treat App Installations as Environment-Specific

Saleor app installations store URLs permanently. If you install an app locally with `localhost` URLs, that installation is broken for staging.

**Do:**
- Install apps separately in each environment
- Use tunneling (ngrok) for local webhook testing if needed

**Don't:**
- Try to share app installations between environments
- Install apps with localhost URLs in staging database

### 3. Use CI/CD for Staging Deployments

The safest path to staging:
1. Push code to `platform/main` or feature branch
2. CI/CD builds with correct staging URLs
3. CI/CD pushes to ECR with `staging-{sha}` tag
4. CI/CD deploys to ECS

---

## Local Development Workflow

### Initial Setup

```bash
# 1. Copy environment template
cp .env.example .env
# Edit .env with your local values

# 2. Install git hooks
make setup-hooks

# 3. Start the stack
docker compose up -d

# 4. Run migrations
docker compose run --rm api python manage.py migrate
```

### Daily Development

```bash
# Start the stack
docker compose up -d

# Make changes to code...

# Run validation before committing
make validate-env

# Commit and push (pre-push hook runs automatically)
git add .
git commit -m "feat: your changes"
git push origin feature/your-branch
```

### Testing Changes Locally

```bash
# Rebuild storefront after changes
docker compose build storefront
docker compose up -d storefront

# Check the environment banner in browser
# Should show: "LOCAL | API: localhost"
```

---

## Deploying to Staging

### Via CI/CD (Recommended)

1. Create PR to `platform/main`
2. CI runs validation
3. Merge triggers deployment
4. CI builds with staging URLs
5. CI deploys to ECS

### Manual Deployment (Requires Validation)

```bash
# 1. Run strict validation
make validate-env-strict

# 2. Switch to staging context (if using Terraform)
cd infra/terraform
terraform workspace select staging

# 3. Apply infrastructure changes
terraform apply
```

---

## Environment Detection

The validation scripts detect environment from multiple sources (in priority order):

1. `SALEOR_ENVIRONMENT` environment variable
2. `DEPLOY_ENV` environment variable (CI/CD)
3. Git branch inference (`*staging*` → staging, `main` → production)
4. Default: `local`

---

## Validation Checks

### Pre-Push Checks (`make validate-env`)

| Check | What it validates |
|-------|-------------------|
| Branch protection | Not on `main` or `master` |
| No secrets | No AWS keys, Stripe keys, etc. in staged files |
| No localhost | No localhost URLs in non-local environments |

### Pre-Deploy Checks (`make validate-env-strict`)

All pre-push checks, plus:

| Check | What it validates |
|-------|-------------------|
| Docker context | Correct Docker context for environment |
| Pricing integrity | No NULL `discounted_price_amount` values |
| App URLs | No localhost URLs in Saleor app installations |

---

## Troubleshooting

### "ERROR: Direct push to 'main' is prohibited"

You're on the wrong branch. Use `platform/main`:

```bash
git checkout platform/main
git cherry-pick <your-commit>
git push origin platform/main
```

### "ERROR: Found X apps with localhost URLs"

Saleor apps have localhost URLs in the database. This happens when you install apps locally against a staging database.

**Fix:**
```sql
-- List affected apps
SELECT id, name, manifest_url FROM app_app
WHERE manifest_url LIKE '%localhost%';

-- Delete and reinstall with correct URLs
DELETE FROM app_app WHERE id = <id>;
```

### "ERROR: Found X variants with NULL discounted_price_amount"

Pricing data is incomplete. This causes runtime errors.

**Fix:**
```sql
UPDATE product_productvariantchannellisting
SET discounted_price_amount = price_amount
WHERE discounted_price_amount IS NULL AND price_amount IS NOT NULL;
```

### Bypassing Hooks (Use Sparingly)

```bash
# Skip pre-push hook
git push --no-verify

# Skip validation in make target
SKIP_VALIDATION=1 make deploy-staging  # If implemented
```

---

## File Reference

| File | Purpose |
|------|---------|
| `scripts/validate-environment.sh` | Main validation script |
| `scripts/db-validation.sh` | Database-specific validation |
| `.githooks/pre-push` | Git pre-push hook |
| `Makefile` | Validation targets |
| `storefront/src/lib/env.ts` | Frontend environment utilities |
| `storefront/src/ui/components/EnvBanner.tsx` | Visual environment indicator |

---

## Architecture Decision Records

### Why Separate Builds Per Environment?

`NEXT_PUBLIC_*` variables are compile-time constants in Next.js. They get inlined via webpack's DefinePlugin during build. Runtime injection is possible but breaks static optimization and adds complexity.

**Decision:** Accept separate builds. The complexity cost of runtime workarounds exceeds maintaining environment-specific builds.

### Why Git Hooks Instead of CI-Only?

Hooks provide immediate feedback. CI catches things hooks miss. Defense in depth.

**Decision:** Use both. Hooks for fast feedback, CI for enforcement.

### Why Database Validation?

Tag segregation provides false security. A staging-tagged image with production database credentials corrupts production.

**Decision:** Validate at database level, not just infrastructure level.

---

## Related Documentation

- `CLAUDE.md` - Project overview and rules
- `.claude/rules/database.md` - Pricing gotchas
- `.claude/rules/storefront.md` - Build requirements
- `docs/reference/git-philosophy.md` - Branch workflow
