---
task: Diagnose broken submodule change detection in CI pipeline
slug: 20260310-131500_diagnose-submodule-change-detection-regression
effort: extended
phase: complete
progress: 12/16
mode: interactive
started: 2026-03-10T13:15:00-07:00
updated: 2026-03-10T13:20:00-07:00
---

## Context

Submodule change detection in `deploy-staging.yml` stopped working after March 9-10 pipeline iterations. Three inventory-ops collection-import commits were silently skipped across 5 consecutive deploys despite the submodule pointer changing. The pipeline uses a three-phase detection system: (1) dorny/paths-filter for direct files, (2) `git diff --submodule=diff` for submodule content, (3) merge/OR of both results.

### Root Cause

Two commits on March 10 combined to break detection:

**Primary**: Commit `71aa8e3` changed `fetch-depth: 0` to `fetch-depth: 2` in the Detect Changes job. This broke submodule content diffing — `git diff --submodule=diff HEAD~1 HEAD` needs the submodule's actual commit objects (old and new) to compute file-level diffs. With shallow depth, the submodule diff header shows a pointer change but the content diff is empty, so `grep '^diff --git'` finds no lines → all apps return `false`.

**Secondary**: dorny/paths-filter has NEVER worked for submodule content (only sees pointer changes, not files inside). It was already compensated for by the submodule diff step. The `fetch-depth: 2` change also broke dorny's merge-base computation (no common ancestor in shallow clone), causing it to fall back to a full branch diff where submodule content is invisible.

**Net effect**: Both detection mechanisms are broken. dorny returns false for all apps. Submodule diff returns empty changed files. Merged result = false for everything.

### Working version timeline
- Feb 14: dorny added (never worked for submodules)
- Feb 17: Submodule diff step added (compensated for dorny)
- Feb 20: Prefix strip fix (submodule detection actually started working)
- **Feb 20 - Mar 9: WORKING** (fetch-depth: 0 + submodule diff)
- Mar 10: fetch-depth changed to 2 → **BROKEN**

### Risks
- `test-platform.yml` shares nearly identical detection logic and same `fetch-depth: 2` — likely also broken for submodule changes
- No shared detection script — logic is copy-pasted between two workflows, so any fix must be applied twice
- dorny is dead weight for submodule detection — adds complexity without value for app builds

## Criteria

- [x] ISC-1: Root cause of detection failure documented in PRD
- [ ] ISC-2: deploy-staging.yml submodule diff produces non-empty file list on submodule pointer changes (PENDING: needs next submodule push)
- [ ] ISC-3: deploy-staging.yml correctly detects inventory-ops changes when submodule pointer advances (PENDING: needs next submodule push)
- [ ] ISC-4: deploy-staging.yml correctly detects buylist changes when submodule pointer advances (PENDING: needs next submodule push)
- [ ] ISC-5: deploy-staging.yml correctly detects pos changes when submodule pointer advances (PENDING: needs next submodule push)
- [ ] ISC-6: deploy-staging.yml correctly detects stripe changes when submodule pointer advances (PENDING: needs next submodule push)
- [ ] ISC-7: deploy-staging.yml correctly detects mtg-import changes when submodule pointer advances (PENDING: needs next submodule push)
- [ ] ISC-8: deploy-staging.yml correctly detects shared packages changes (PENDING: needs next submodule push)
- [x] ISC-9: deploy-staging.yml storefront detection still works for direct file changes (dorny unmodified)
- [x] ISC-10: test-platform.yml receives same fix for submodule detection (identical step added)
- [x] ISC-11: force_all=true still bypasses all detection (verified in workflow)
- [x] ISC-12: Checkout time does not regress beyond current ~7min baseline (fetch-depth: 2 preserved, only submodule unshallowed)
- [x] ISC-13: No nested submodule checkout failures (submodules: true preserved, not recursive)
- [x] ISC-14: Step summary table still shows dorny vs submodule vs merged for debugging (verified)
- [ ] ISC-15: CI run succeeds end-to-end on platform/main push (run 22925609711 queued)
- [x] ISC-16: Fix committed to platform/main (commit 6f11762, pushed)

## Decisions

- **Option A chosen**: Targeted `git -C saleor-apps fetch --unshallow` after checkout. Keeps fast main repo checkout, fixes submodule diff computation. Applied to both deploy-staging.yml and test-platform.yml.

## Verification
