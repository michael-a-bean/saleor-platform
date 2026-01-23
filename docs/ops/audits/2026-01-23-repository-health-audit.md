# Repository Health Audit - 2026-01-23

**Generated:** 2026-01-23 12:45 PST
**Branch:** platform/main (5c43488)
**Method:** 6-agent parallel analysis (Git, Submodules, Infrastructure, Code, Docs, Security)

---

## Quick Reference

| Priority | Count | Categories |
|----------|-------|------------|
| **P0 - Critical** | 5 | Security, Submodules, Docker |
| **P1 - High** | 6 | Testing, Docs, CI/CD |
| **P2 - Medium** | 6 | Tech Debt, Cleanup |

---

## P0 - Critical Issues

### ISSUE-001: CSP Allows unsafe-eval (Security)

**Status:** Open
**Severity:** HIGH
**File:** `storefront/src/middleware.ts:28`

**Problem:**
Content Security Policy permits `unsafe-eval`, increasing XSS attack surface.

```typescript
// Current (vulnerable):
script-src 'self' https://js.stripe.com https://www.googletagmanager.com 'unsafe-inline' 'unsafe-eval'
```

**Root Cause:** Blanket permission added during development, possibly for Stripe/GTM compatibility.

**Remediation:**
1. Test if `unsafe-eval` is actually required by Stripe or GTM
2. Remove `unsafe-eval` from CSP directive
3. Consider replacing `unsafe-inline` with nonce-based CSP for stronger protection

**Verification:**
```bash
# After fix, verify storefront still loads Stripe checkout
cd storefront && pnpm dev
# Test checkout flow with Stripe payment
```

**References:**
- Stripe CSP docs: https://stripe.com/docs/security/guide#content-security-policy
- GTM CSP docs: https://developers.google.com/tag-platform/tag-manager/csp

---

### ISSUE-002: Buylist Submodule Detached HEAD (Submodules)

**Status:** Open
**Severity:** HIGH
**Location:** `saleor-apps/apps/buylist`

**Problem:**
Buylist app is detached at commit `85afd98`, 12 commits behind `main`.

**Current State:**
```
Commit: 85afd98f01505436ac30e2f1fb7d7d02021e9fe7
Branch: HEAD detached (should be on main)
Behind: 12 commits
Last Commit: "fix(buylist): P2-3 remove duplicate cost events from createAndPay"
```

**Remediation:**
```bash
cd saleor-apps/apps/buylist
git checkout main
git pull origin main
cd ../../..
git add saleor-apps
git commit -m "chore(submodule): update buylist to latest main"
```

**Verification:**
```bash
git submodule status --recursive | grep buylist
# Should show commit on main branch, not detached
```

---

### ISSUE-003: Inventory-ops on Feature Branch (Submodules)

**Status:** Resolved (2026-01-23)
**Severity:** MEDIUM
**Location:** `saleor-apps/apps/inventory-ops`

**Problem:**
Inventory-ops was on `feature/adr-001-implementation` branch instead of `main`.

**Resolution:**
Merged `feature/adr-001-implementation` into `main`:
- Circuit breaker pattern for external API calls
- Enhanced scheduled reconciliation
- Cron job improvements

Submodule pointers updated in both saleor-apps and saleor-platform.

---

### ISSUE-004: Docker Dashboard Image Unpinned (Infrastructure)

**Status:** Open
**Severity:** HIGH
**File:** `docker-compose.yml`

**Problem:**
Saleor Dashboard uses `:latest` tag, causing unpredictable updates.

```yaml
# Current (risky):
image: ghcr.io/saleor/saleor-dashboard:latest
```

**Risk:**
- Container will pull latest dashboard on every start
- Could introduce breaking changes without warning
- Production instability risk

**Remediation:**
```yaml
# Pin to specific version matching API:
image: ghcr.io/saleor/saleor-dashboard:3.22
```

**Verification:**
```bash
docker compose pull dashboard
docker compose up -d dashboard
# Verify dashboard loads at localhost:9000
```

---

### ISSUE-005: Local .env Contains Active Secrets (Security)

**Status:** Open
**Severity:** CRITICAL (for production readiness)
**File:** `.env`

**Problem:**
Local development `.env` file contains actual cryptographic secrets that must be rotated before any production deployment.

**Exposed Secrets:**
- `SECRET_KEY` (Django)
- `STRIPE_APP_SECRET_KEY`
- `INVENTORY_OPS_SECRET_KEY`
- `BUYLIST_SECRET_KEY`
- `POS_SECRET_KEY`
- Database credentials

**Note:** File IS properly gitignored. This is a production-readiness concern, not a git leak.

**Remediation (before production):**
```bash
# Generate new secrets:
openssl rand -hex 32  # For each SECRET_KEY

# For production, use AWS Secrets Manager or similar:
aws secretsmanager create-secret --name saleor/production/SECRET_KEY --secret-string "$(openssl rand -hex 32)"
```

**Verification:**
- Confirm `.env` in `.gitignore` (line 16) ✓
- Run `git log -p -- .env` to verify no historical commits

---

## P1 - High Priority Issues

### ISSUE-006: Jaeger Image Version Unspecified (Infrastructure)

**Status:** Resolved (2026-01-23)
**Severity:** MEDIUM
**File:** `docker-compose.yml`

**Problem:**
Jaeger tracing service has no version specified, implicitly using `:latest`.

**Resolution:**
Pinned to `jaegertracing/jaeger:2.14.0` in commit `9980542`.

---

### ISSUE-007: CI/CD Emergency Overrides Unguarded (Infrastructure)

**Status:** Resolved (2026-01-23)
**Severity:** HIGH
**Files:** `.github/workflows/deploy-production.yml`

**Problem:**
Two emergency override flags can bypass critical safety checks without audit trail:
- `skip_approval` - Bypasses GitHub environment approval gate
- `ALLOW_DEPLOY_WITHOUT_SNAPSHOT_WAIT` - Deploys without verified backup

**Resolution:**
Added `audit-overrides` job as the first step in the workflow that:
- Logs timestamp, triggered-by user, and run ID for all deployments
- Emits GitHub Actions `::warning::` annotations when overrides are active
- Writes override details to job summary for visibility
- Both override flags are now audited before any deployment work begins

---

### ISSUE-008: Storefront Test Coverage 1.9% (Code Quality)

**Status:** Open
**Severity:** HIGH
**Location:** `storefront/`

**Problem:**
Only 7 test files exist for 363 TypeScript files (1.9% coverage).

**Missing Coverage:**
- Zero component tests
- Zero page tests
- Zero checkout flow tests (most critical user journey)
- Zero integration tests

**Existing Tests:**
```
src/checkout/components/AddressForm/utils.test.ts
src/checkout/sections/Summary/utils.test.ts
src/checkout/sections/PaymentSection/utils.test.ts
src/checkout/lib/utils/money.test.ts
src/checkout/lib/utils/common.test.ts
src/lib/meilisearch.test.ts
src/lib/filters/urlFilters.test.ts
```

**Remediation:**
1. Create test infrastructure (fixtures, mocks directory)
2. Add component tests for checkout flow first
3. Target 60% coverage in 6 months

**Getting Started:**
```bash
cd storefront
pnpm add -D @testing-library/react @testing-library/jest-dom
# Create first component test for CheckoutForm
```

---

### ISSUE-009: Architecture Docs 28 Days Stale (Documentation)

**Status:** Resolved (2026-01-23)
**Severity:** MEDIUM
**File:** `docs/reference/architecture.md`

**Problem:**
Architecture documentation last updated Dec 26, 2025. Does not reflect:
- Meilisearch Terraform migration (Jan 21-22)
- ADR-001 costing layer improvements
- Staging deployment changes

**Resolution:**
Updated `docs/reference/architecture.md` with:
1. New "Meilisearch Infrastructure" section covering local dev and Terraform deployment
2. Reference to ADR-001 in Inventory Ops App section
3. Added Meilisearch to service details table and technology stack
4. Updated "Last updated" date to January 2026

---

### ISSUE-010: 3 Stale Remote Branches (Git)

**Status:** Resolved (2026-01-23)
**Severity:** LOW
**Location:** Remote branches

**Problem:**
Three branches have not been updated in 8-11 days.

**Resolution:**
Deleted all 3 stale remote branches:
- `diagnose/staging-deploy-blockers-20260115`
- `fix/dashboard-app-iframe-blank`
- `infra/staging-ecs-apps`

---

### ISSUE-011: No Release Tags (Git)

**Status:** Resolved (2026-01-23)
**Severity:** MEDIUM
**Location:** Repository-wide

**Problem:**
265 commits on platform/main without any semantic version tags.

**Resolution:**
Created `v1.0.0` release tag marking ADR-001 completion milestone.

---

## P2 - Medium Priority Issues

### ISSUE-012: POS App Has 80+ TODOs (Tech Debt)

**Status:** Open
**Severity:** MEDIUM
**Location:** `saleor-apps/apps/pos/`

**Problem:**
POS application has highest concentration of technical debt markers.

**Key Files:**
- `src/pages/transaction.tsx` - Lines 683, 863, 1577
- `src/pages/register/open.tsx` - Warehouse selection
- `src/modules/products/products-router.ts`

**Sample Issues:**
```typescript
Line 683: // TODO: Replace with actual warehouse selector
Line 863: completedByName: "Cashier", // TODO: Get from user context
Line 1577: totalTax: 0, // TODO: Calculate tax refund
```

**Remediation:**
Schedule dedicated tech debt sprint (estimated 40 hours).

---

### ISSUE-013: React Compiler Disabled (Code Quality)

**Status:** Open
**Severity:** MEDIUM
**File:** `storefront/eslint.config.mjs`

**Problem:**
React Compiler ESLint rules explicitly disabled, blocking React 19 optimizations.

**Root Cause:**
Multiple hooks and components need refactoring to be compiler-compatible.

**Remediation:**
1. Identify incompatible hooks (form hooks in checkout)
2. Refactor to compiler-compatible patterns
3. Re-enable React Compiler rules

---

### ISSUE-014: 909 Deprecated GraphQL Usages (Tech Debt)

**Status:** Open
**Severity:** LOW
**File:** `storefront/src/checkout/graphql/index.ts`

**Problem:**
909 instances of deprecated GraphQL fields, mostly Saleor 4.0 migration warnings.

**Remediation:**
Plan Saleor 3.22 → 4.0 migration for Q2 2026.

---

### ISSUE-015: TypeScript @ts-ignore in Form Hooks (Code Quality)

**Status:** Open
**Severity:** MEDIUM
**Files:**
- `storefront/src/checkout/hooks/useForm/FormProvider.tsx`
- `storefront/src/checkout/hooks/useForm/useForm.ts`
- `storefront/src/checkout/hooks/useSubmit/useSubmit.ts`

**Problem:**
3 `@ts-ignore` directives suppress type errors in critical checkout hooks.

**Remediation:**
Refactor form hooks to eliminate type suppressions (estimated 20 hours).

---

### ISSUE-016: API Documentation Incomplete (Documentation)

**Status:** Resolved (2026-01-23)
**Severity:** MEDIUM
**Location:** `docs/`

**Problem:**
Missing documentation:
- GraphQL mutation examples with error codes
- Webhook payload specifications beyond sync-contracts.md
- API versioning policy

**Resolution:**
Created `docs/api/` directory with:
- `README.md` - Index linking to all API docs
- `graphql-reference.md` - Query/mutation patterns, error codes, examples
- `webhooks.md` - Event types, payloads, registration patterns
- `versioning-policy.md` - Version pinning, deprecation handling, migration planning

---

### ISSUE-017: Meilisearch Auth Disabled for Dev (Infrastructure)

**Status:** Resolved (2026-01-23)
**Severity:** MEDIUM (dev-only)
**File:** `docker-compose.yml`

**Problem:**
Meilisearch runs without authentication in development.

**Resolution:**
Added comprehensive production configuration documentation in docker-compose.yml:
- Clear PRODUCTION CONFIGURATION block with environment variable pattern
- Key generation command (`openssl rand -base64 32`)
- Instructions for storing key in `.env` file
- Reference to `${MEILISEARCH_MASTER_KEY}` variable pattern

---

## Health Scores Summary

| Area | Score | Key Issue |
|------|-------|-----------|
| Git State | 9/10 | 3 stale branches |
| Submodules | 6/10 | buylist detached |
| Infrastructure | 7/10 | unpinned images |
| Code Quality | 6.9/10 | 1.9% test coverage |
| Documentation | 7/10 | stale architecture docs |
| Security | 7/10 | CSP unsafe-eval |

---

## Session Starter Commands

Each issue above can be tackled in a new session. Use these commands to get context:

```bash
# Start session for any issue:
cd /home/michael/saleor-platform

# Check current state:
git status
git submodule status --recursive

# Read this audit:
cat docs/ops/audits/2026-01-23-repository-health-audit.md
```

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-23 | Gen (6-agent analysis) | Initial audit |
