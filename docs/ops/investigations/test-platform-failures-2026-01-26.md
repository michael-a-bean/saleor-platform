# Test-Platform Pipeline Failures Investigation

**Date:** 2026-01-26
**Status:** IN PROGRESS - Phase 0 Complete, Awaiting CI Verification
**Environment:** Staging (NOT local)
**Branch:** `platform/main`
**Latest Commit:** `377494f` - terraform format fix pushed

---

## Executive Summary

The `test-platform` workflow has been consistently failing while `deploy-staging` succeeds. A Council analysis (Architect, Engineer, Security, Researcher) identified the root cause as **pipeline divergence** - the test and deploy workflows don't share validation gates.

**Immediate blocker:** `terraform fmt -check -recursive` fails on `modules/s3/main.tf`

**Systemic issue:** Security scans (gitleaks) are blocked when formatting fails, creating security blind spots.

---

## Problem Statement

### Observed Behavior

| Workflow | Recent Status | Pattern |
|----------|---------------|---------|
| `deploy-staging` | Succeeds | Consistently passes |
| `test-platform` | Fails | Consistently fails on terraform validation |

### Recent Failure Evidence

```
Run ID: 21378304373
Job: Terraform Validation > Terraform Format Check
Error: modules/s3/main.tf
Exit code: 3 (formatting differs)
```

### Impact

1. **CI/CD confusion** - Developers see green deploys but red tests
2. **Security blind spot** - gitleaks never runs when terraform fmt fails first
3. **Technical debt accumulation** - Formatting issues compound over time

---

## Root Cause Analysis

### Council Findings (4-Agent Debate)

**Unanimous Agreement:**
- `terraform fmt -recursive` must be run immediately
- Security scans should not be blocked by formatting failures
- Test and deploy pipelines must share validation gates
- Pre-commit hooks are valuable but bypassable

**Pipeline Divergence Diagram:**

```
test-platform.yml                    deploy-staging.yml
─────────────────                    ──────────────────
├── verify_backend                   ├── build (images)
├── verify_storefront                ├── migrate
├── verify_apps                      ├── deploy (services)
├── validate_migrations              ├── deploy-apps
├── security_scan (gitleaks) ←───────── NOT HERE (gap!)
├── verify_builds                    ├── validate-urls
├── container_scan                   └── smoke-test
├── validate_compose
└── terraform_validate ←──────────────── NOT HERE (gap!)
```

**Key Insight:** The pipelines serve different purposes but should share validation contracts.

---

## Implementation Plan

### Phase 1: Immediate Fix (P0) - READY TO IMPLEMENT

**Goal:** Unblock the test-platform pipeline

**Action:**
```bash
cd /home/michael/saleor-platform/infra/terraform
terraform fmt -recursive
git add -A
git commit -m "fix(ci): terraform format for s3 module"
git push origin platform/main
```

**Risk:** Zero - formatting only, no functional changes
**Verification:** `terraform fmt -check -recursive` passes locally before push

### Phase 2: Security Scan Independence (P1)

**Goal:** Ensure gitleaks runs regardless of other job failures

**Action:** Modify `.github/workflows/test-platform.yml`:
- Remove implicit dependency chain that blocks gitleaks
- Run security_scan in parallel with terraform_validate
- Both converge at a final gate

**Current (problematic):**
```yaml
security_scan:
  name: Secret Scanning
  runs-on: ubuntu-latest
  # No explicit needs: but runs after checkout
```

**Proposed:**
```yaml
security_scan:
  name: Secret Scanning
  runs-on: ubuntu-latest
  # Explicitly independent - no needs: clause
  # Runs in parallel with all other validation jobs
```

**Risk:** Low - job ordering only
**Verification:** Workflow syntax validation, test on feature branch first

### Phase 3: Pipeline Unification (P2)

**Goal:** deploy-staging should run terraform validation

**Action:** Add terraform validation job to `deploy-staging.yml`:
```yaml
terraform_check:
  name: Terraform Validation
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: hashicorp/setup-terraform@v3
    - run: terraform fmt -check -recursive
      working-directory: infra/terraform
    - run: terraform init -backend=false
      working-directory: infra/terraform
    - run: terraform validate
      working-directory: infra/terraform
```

**Risk:** Low - adds gates, doesn't change deployment
**Verification:** Workflow runs successfully with terraform validation

### Phase 4: Pre-commit Hooks (P3)

**Goal:** Shift-left - catch formatting issues before push

**Action:** Create `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.88.0
    hooks:
      - id: terraform_fmt
      - id: terraform_validate
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

**Risk:** Zero - local tooling only
**Verification:** Developers can still push with `--no-verify` if needed

### Phase 5: ECR Tag Immutability Review (P4)

**Goal:** Prevent supply chain attacks via tag overwriting

**Current State:** Staging uses MUTABLE tags for convenience
**Security Recommendation:** Review whether immutability can be enabled

**Risk:** Medium - could break existing deployment patterns
**Verification:** Test in isolated environment first

---

## Files to Modify

| Phase | File | Change |
|-------|------|--------|
| P0 | `infra/terraform/modules/s3/main.tf` | Format only |
| P1 | `.github/workflows/test-platform.yml` | Job dependencies |
| P2 | `.github/workflows/deploy-staging.yml` | Add terraform job |
| P3 | `.pre-commit-config.yaml` | New file |
| P4 | `infra/terraform/modules/ecr/main.tf` | Tag mutability |

---

## Historical Context

### Previous Related Fixes

| Date | Commit | Issue | Resolution |
|------|--------|-------|------------|
| 2026-01-15 | e6d2fca | ECR IMMUTABLE tags | Made configurable per environment |
| 2026-01-15 | e4acb1e | JSON parsing in deploy script | Use temp file instead of stdin |
| 2026-01-15 | 2eee5a5 | Hardcoded image versions | Preserve upstream images |
| 2026-01-15 | 5d72e58 | Smoke test redirect handling | Follow redirects for storefront |

### Related Documentation

- `docs/ops/staging_deploy_blocker_audit.md` - Full blocker audit
- `docs/ops/runbooks/staging-deployment-fixes-2026-01-15.md` - Previous fixes
- `docs/ops/staging_verification_checklist.md` - Post-deploy verification

---

## Session Resume Instructions

### To Continue This Work

1. **Read this document first** to understand context
2. **Check current status:**
   ```bash
   gh run list --workflow=test-platform.yml --limit 5
   cd infra/terraform && terraform fmt -check -recursive
   ```
3. **Identify current phase** from status section below
4. **Execute next phase** following the implementation plan

### Current Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| P0 - Format Fix | **COMPLETE** | Commit `377494f` - terraform fmt applied |
| P1 - Security Independence | **READY** | Awaits CI verification of P0 |
| P2 - Pipeline Unification | Pending | Awaits P0 verification |
| P3 - Pre-commit Hooks | Pending | Can be done in parallel |
| P4 - ECR Immutability | Pending | Requires separate investigation |

### Phase 0 Execution Log

- **Timestamp:** 2026-01-26 ~19:00 PST
- **Command:** `docker run --rm -v .../infra/terraform:/terraform hashicorp/terraform:1.5 fmt -recursive`
- **Files formatted:** `modules/s3/main.tf`, `modules/cloudfront/main.tf`
- **Changes:** Comment alignment and spacing normalization
- **Commit:** `377494f`
- **Workflow runs:** `21382996773` (test-platform), `21382996727` (deploy-staging)

---

## Council Debate Summary

### Participants

| Role | Agent | Key Position |
|------|-------|--------------|
| Architect | Serena Blackwood | Pipeline divergence is architectural; need validation contracts |
| Engineer | Marcus Webb | Fix formatting first, then unify pipelines; avoid premature abstraction |
| Security | Rook Blackburn | Security scans must not be gated behind style checks |
| Researcher | Ava Chen | Shift-left with pre-commit hooks; feedback loop latency is real issue |

### Key Disagreements

- **Parallel vs Sequential:** Architect prefers parallel validation; Security insists on sequential gates
- **Complexity Trade-off:** Engineer warns against over-engineering; Architect wants validation contracts

### Consensus Reached

1. Fix terraform fmt immediately (zero risk)
2. Security scans should run independently of formatting
3. Both pipelines need shared validation gates
4. Pre-commit hooks help but aren't sufficient alone

---

## Verification Commands

### Check Current State
```bash
# Terraform formatting
cd /home/michael/saleor-platform/infra/terraform
terraform fmt -check -recursive

# Recent workflow runs
gh run list --workflow=test-platform.yml --limit 10
gh run list --workflow=deploy-staging.yml --limit 10

# Specific run details
gh run view <RUN_ID> --log-failed
```

### After Phase 0 Fix
```bash
# Verify formatting passes locally
terraform fmt -check -recursive
echo $?  # Should be 0

# Watch workflow after push
gh run watch
```

---

## Contact / Ownership

- **Investigation Lead:** Gen (Claude Code)
- **Review Required:** Michael (platform owner)
- **Related Issues:** None open - this document serves as tracking

---

**Last Updated:** 2026-01-26 19:05 PST
**Next Action:** Monitor workflow run `21382996773` for test-platform success, then proceed to Phase 1
