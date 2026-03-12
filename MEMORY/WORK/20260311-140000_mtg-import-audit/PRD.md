---
task: Full audit of MTG import logic, commit and PR
slug: 20260311-140000_mtg-import-audit
effort: extended
phase: complete
progress: 16/16
mode: interactive
started: 2026-03-11T14:00:00-07:00
updated: 2026-03-11T15:25:00-07:00
---

## Context

Full code audit of MTG import logic after consolidation into inventory-ops. ~100 issues found across 5 parallel audits. Fixing critical/high issues; documenting the rest.

## Criteria

- [x] ISC-1: Bulk BACKFILL triggers rebuildSetAudits (already fixed)
- [x] ISC-2: Missing installationId scoping fixed in verify/repairImages/summary/backfillFilter/rebuildSetAudits
- [x] ISC-3: rebuildSetAudits counts consistent with updateSetAudit (both include sentinels)
- [x] ISC-4: rebuildSetAudits `const updated` changed to `let` with proper counting
- [x] ISC-5: startJobProcessing marks job FAILED on init error
- [x] ISC-6: Circuit breaker FAILED not overwritten by CANCELLED
- [x] ISC-7: JSON.parse(errorLog) wrapped in try/catch
- [x] ISC-8: COMPLETED threshold uses error rate check (>50% errors = FAILED)
- [x] ISC-9: NaN price guard added to pipeline
- [x] ISC-10: Pagination cursor fix (fetch limit+1 pattern)
- [x] ISC-11: jobs.retry dedup check added
- [x] ISC-12: sets.scan uses Set for alreadyFailed lookup
- [x] ISC-13: Audit findings documented in PR description
- [x] ISC-14: All changes committed to feature branch
- [x] ISC-15: PR created with audit summary
- [x] ISC-16: No existing tests broken (671/671 pass)

## Decisions

- SKU 8-char prefix NOT fixed in this PR (requires migrating 103k products + price sync changes)
- MTGJSON streaming NOT fixed (fallback path, larger refactor)
- UI polling/hooks NOT fixed (separate UX PR)
- Attribute slug standardization NOT fixed (requires Saleor product type migration)

## Verification
