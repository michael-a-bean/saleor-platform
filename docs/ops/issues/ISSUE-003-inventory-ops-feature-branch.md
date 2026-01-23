# ISSUE-003: Inventory-ops on Feature Branch

**Priority:** P0 - Critical (Needs Decision)
**Category:** Submodules
**Status:** Open - Awaiting Decision
**Created:** 2026-01-23
**Source:** Repository Health Audit

---

## Problem

Inventory-ops submodule is on `feature/adr-001-implementation` branch instead of `main`.

**Location:** `saleor-apps/apps/inventory-ops`

**Current State:**
```
Commit: 50b66293251c43be327d0ddf1ac0075c670dc68b
Branch: feature/adr-001-implementation
Last Commit: "fix(cron): enhance scheduled reconciliation per ADR-001"
```

## Context

This may be **intentional**. The feature branch contains ADR-001 implementation:
- Circuit breaker for webhooks
- Reconciliation endpoint and service
- Scheduled daily reconciliation cron
- Event-driven reconciliation triggers

ADR-001 was approved on 2026-01-19 and implementation appears complete.

## Decision Required

Before proceeding, answer these questions:

1. **Is ADR-001 implementation complete?**
   - [ ] Circuit breaker tested
   - [ ] Reconciliation endpoint tested
   - [ ] Cron job tested
   - [ ] All acceptance criteria met

2. **Are there any blockers to merging?**
   - [ ] No pending code review
   - [ ] No failing tests
   - [ ] No production concerns

3. **Should this merge to main?**
   - [ ] Yes - merge and update submodule
   - [ ] No - keep on feature branch (document why)

## Remediation Steps (After Decision to Merge)

### Step 1: Merge Feature Branch in saleor-apps

```bash
cd saleor-apps/apps/inventory-ops
git checkout main
git merge feature/adr-001-implementation
git push origin main
```

### Step 2: Clean Up Feature Branch

```bash
git branch -d feature/adr-001-implementation
git push origin --delete feature/adr-001-implementation
```

### Step 3: Update Parent Repository

```bash
cd /home/michael/saleor-platform
git add saleor-apps
git commit -m "chore(submodule): update inventory-ops after ADR-001 merge

- Merges feature/adr-001-implementation to main
- Includes circuit breaker, reconciliation, and cron improvements
- Closes ADR-001 implementation phase"
```

## If Staying on Feature Branch

If decision is to keep on feature branch, document:

```bash
# Add note to this file explaining why
# Example reasons:
# - Needs more testing in staging
# - Waiting for dependent feature
# - Performance validation required
```

## Verification

```bash
# After merge, verify:
cd saleor-apps/apps/inventory-ops
git branch --show-current
# Should output: main

# Run tests:
pnpm test

# Start app:
pnpm dev
```

## Related Documents

- `docs/decisions/ADR-001-inventory-ops-costing-layer.md`
- `docs/decisions/ADR-001-implementation-handoff.md`

## Definition of Done

- [ ] Decision made (merge or keep on feature branch)
- [ ] If merged: feature branch deleted
- [ ] If merged: parent repo updated
- [ ] Documentation updated with decision rationale
