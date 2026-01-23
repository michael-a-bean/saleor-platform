# Repository Issues Index

**Source:** Repository Health Audit (2026-01-23)
**Full Audit:** `../audits/2026-01-23-repository-health-audit.md`

---

## How to Use

Each issue file is self-contained with:
- Problem description
- Impact analysis
- Step-by-step remediation
- Verification commands
- Definition of done checklist

Start a new session and reference the specific issue file to tackle it independently.

---

## P0 - Critical (Fix This Week)

| Issue | Category | File | Status |
|-------|----------|------|--------|
| ISSUE-001 | Security | [CSP unsafe-eval](ISSUE-001-csp-unsafe-eval.md) | Resolved (2026-01-23) |
| ISSUE-002 | Submodules | [Buylist detached HEAD](ISSUE-002-buylist-detached-head.md) | Resolved (2026-01-23) |
| ISSUE-003 | Submodules | [Inventory-ops feature branch](ISSUE-003-inventory-ops-feature-branch.md) | Needs Decision |
| ISSUE-004 | Infrastructure | [Docker dashboard unpinned](ISSUE-004-docker-dashboard-unpinned.md) | Resolved (2026-01-23) |
| ISSUE-005 | Security | Local .env secrets (see audit) | Open |

---

## P1 - High (Next Sprint)

| Issue | Category | Notes |
|-------|----------|-------|
| ISSUE-006 | Infrastructure | Jaeger image version unspecified |
| ISSUE-007 | CI/CD | Emergency overrides unguarded |
| ISSUE-008 | Code Quality | [Storefront test coverage 1.9%](ISSUE-008-storefront-test-coverage.md) |
| ISSUE-009 | Documentation | Architecture docs 28 days stale |
| ISSUE-010 | Git | 3 stale remote branches |
| ISSUE-011 | Git | No release tags |

---

## P2 - Medium (This Quarter)

| Issue | Category | Notes |
|-------|----------|-------|
| ISSUE-012 | Tech Debt | POS app has 80+ TODOs |
| ISSUE-013 | Code Quality | React Compiler disabled |
| ISSUE-014 | Tech Debt | 909 deprecated GraphQL usages |
| ISSUE-015 | Code Quality | TypeScript @ts-ignore in form hooks |
| ISSUE-016 | Documentation | API documentation incomplete |
| ISSUE-017 | Infrastructure | Meilisearch auth disabled (dev-only) |

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
