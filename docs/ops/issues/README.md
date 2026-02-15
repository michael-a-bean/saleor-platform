# Repository Issues Index

> **DEPRECATED (Feb 14, 2026):** Issue tracking has moved to GitHub Issues.
> https://github.com/michael-a-bean/saleor-platform/issues
>
> Open items from this directory have been migrated. Files below are retained for historical context only.
>
> **Cross-reference (validated 2026-02-15):**
> - ISSUE-008 → [#7 Storefront test coverage](https://github.com/michael-a-bean/saleor-platform/issues/7) (8 tests / 371 files = 2.16%)
> - ISSUE-012 → [#3 POS product search](https://github.com/michael-a-bean/saleor-platform/issues/3), [#4 hardcoded IDs](https://github.com/michael-a-bean/saleor-platform/issues/4), [#2 tax](https://github.com/michael-a-bean/saleor-platform/issues/2)
> - ISSUE-013 → [#8 React Compiler / Formik](https://github.com/michael-a-bean/saleor-platform/issues/8) (8 files use Formik, all in checkout)
> - ISSUE-014 → [#9 Saleor 4.0 deprecations](https://github.com/michael-a-bean/saleor-platform/issues/9)

**Source:** Repository Health Audit (2026-01-23)
**Full Audit:** `../audits/2026-01-23-repository-health-audit.md`

---

## P0 - Critical (Fix This Week)

| Issue | Category | File | Status |
|-------|----------|------|--------|
| ISSUE-001 | Security | [CSP unsafe-eval](ISSUE-001-csp-unsafe-eval.md) | Resolved (2026-01-23) |
| ISSUE-002 | Submodules | [Buylist detached HEAD](ISSUE-002-buylist-detached-head.md) | Resolved (2026-01-23) |
| ISSUE-003 | Submodules | [Inventory-ops feature branch](ISSUE-003-inventory-ops-feature-branch.md) | Resolved (2026-01-23) |
| ISSUE-004 | Infrastructure | [Docker dashboard unpinned](ISSUE-004-docker-dashboard-unpinned.md) | Resolved (2026-01-23) |
| ISSUE-005 | Security | [Local .env secrets](ISSUE-005-env-secrets-production-readiness.md) | Resolved (2026-01-23) |

---

## P1 - High (Next Sprint)

| Issue | Category | Notes |
|-------|----------|-------|
| ISSUE-006 | Infrastructure | ~~Jaeger image version unspecified~~ Resolved (2026-01-23) |
| ISSUE-007 | CI/CD | ~~Emergency overrides unguarded~~ Resolved (2026-01-23) |
| ISSUE-008 | Code Quality | [Storefront test coverage 1.9%](ISSUE-008-storefront-test-coverage.md) |
| ISSUE-009 | Documentation | ~~Architecture docs 28 days stale~~ Resolved (2026-01-23) |
| ISSUE-010 | Git | ~~3 stale remote branches~~ Resolved (2026-01-23) |
| ISSUE-011 | Git | ~~No release tags~~ Resolved (2026-01-23) - v1.0.0 |

---

## P2 - Medium (This Quarter)

| Issue | Category | Notes |
|-------|----------|-------|
| ISSUE-012 | Tech Debt | ~~POS app has 80+ TODOs~~ Partial fix (2026-01-23) - Quick wins fixed, 14 TODOs remain |
| ISSUE-013 | Code Quality | React Compiler disabled - Blocked by Formik (~46-66 hrs) |
| ISSUE-014 | Tech Debt | 909 deprecated GraphQL usages - Saleor 4.0 migration planning |
| ISSUE-015 | Code Quality | ~~TypeScript @ts-ignore in form hooks~~ Resolved (2026-01-23) |
| ISSUE-016 | Documentation | ~~API documentation incomplete~~ Resolved (2026-01-23) |
| ISSUE-017 | Infrastructure | ~~Meilisearch auth disabled (dev-only)~~ Resolved (2026-01-23) - Production pattern documented |

---

## Quick Start Commands

```bash
# Navigate to repo
cd /home/michael/saleor-platform

# Check current state
git status
git submodule status --recursive

# Read full audit
cat docs/ops/audits/2026-01-23-repository-health-audit.md

# Read specific issue
cat docs/ops/issues/ISSUE-001-csp-unsafe-eval.md
```

---

## Session Workflow

1. Pick an issue from this index
2. Read the issue file completely
3. Follow remediation steps
4. Run verification commands
5. Check off Definition of Done items
6. Update issue status in this README
7. Commit changes with reference: `fix: resolve ISSUE-001 CSP unsafe-eval`

---

## Updating This Index

When an issue is resolved:
1. Change status from `Open` to `Resolved`
2. Add resolution date
3. Move to "Resolved" section at bottom (optional)

```markdown
| ISSUE-001 | Security | CSP unsafe-eval | Resolved (2026-01-24) |
```
