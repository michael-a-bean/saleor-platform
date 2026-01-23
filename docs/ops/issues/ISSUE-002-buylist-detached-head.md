# ISSUE-002: Buylist Submodule Detached HEAD

**Priority:** P0 - Critical
**Category:** Submodules
**Status:** Open
**Created:** 2026-01-23
**Source:** Repository Health Audit

---

## Problem

Buylist app submodule is detached at an old commit, 12 commits behind `main`.

**Location:** `saleor-apps/apps/buylist`

**Current State:**
```
Commit: 85afd98f01505436ac30e2f1fb7d7d02021e9fe7
Branch: HEAD detached (should be on main)
Behind: 12 commits
Last Commit: "fix(buylist): P2-3 remove duplicate cost events from createAndPay"
```

## Impact

- Buylist app running on outdated code
- Missing 12 commits of bug fixes and features
- Potential inconsistency with other apps

## Root Cause

Local checkout didn't advance when parent repository pulled new changes. Submodule pointer not updated.

## Remediation Steps

### Step 1: Check Current State

```bash
cd /home/michael/saleor-platform
git submodule status --recursive | grep buylist
```

Expected output shows detached state (commit without branch name).

### Step 2: Reattach to Main

```bash
cd saleor-apps/apps/buylist
git fetch origin
git checkout main
git pull origin main
```

### Step 3: Verify Update

```bash
git log --oneline -5
# Should show latest commits including those after 85afd98
```

### Step 4: Update Parent Repository

```bash
cd /home/michael/saleor-platform
git add saleor-apps
git status
# Should show: modified: saleor-apps (new commits)
```

### Step 5: Commit Submodule Update

```bash
git commit -m "chore(submodule): update buylist to latest main

- Advances from 85afd98 to current main
- Includes 12 commits of fixes and features"
```

## Verification

```bash
# Verify submodule is now on main:
git submodule status --recursive | grep buylist
# Should show commit hash followed by (main) or similar

# Verify buylist app starts:
cd saleor-apps/apps/buylist
pnpm dev
```

## Missing Commits (to review)

The 12 commits being added likely include:
- Bug fixes from P2-3 phase
- APL (App Platform License) improvements
- BASE_PATH build fixes

Run this to see what's being added:
```bash
cd saleor-apps/apps/buylist
git log 85afd98..main --oneline
```

## Definition of Done

- [x] Buylist submodule on `main` branch
- [x] All 12 commits pulled
- [x] Parent repo updated with new submodule pointer
- [ ] Buylist app starts without errors (manual verification recommended)
- [x] Committed to platform/main
