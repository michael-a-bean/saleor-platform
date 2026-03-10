---
task: Redesign PR and code review pipeline from scratch
slug: 20260307-091500_redesign-pr-code-review-pipeline
effort: deep
phase: plan
progress: 0/40
mode: interactive
started: 2026-03-07T09:15:00-08:00
updated: 2026-03-07T09:22:00-08:00
---

## Context

Michael's saleor-platform has a PR review pipeline (Codex PR review + auto-merge + babysit-pr + local-review) that was never battle-tested because most work was committed directly to `platform/main` (bypassing PRs entirely). When Codex was tried, it nit-picked endlessly and caused fix loops over edge cases. The pipeline also doesn't properly handle the saleor-apps submodule (where most custom app code lives).

The goal is to redesign the entire pipeline to be robust, practical, and optimized for a solo developer shipping agentic code changes (Claude Code writing code, creating PRs, fixing issues, merging).

### Problems Identified
1. **Pipeline bypass**: All work went to `platform/main` directly — PR pipeline never ran
2. **Codex nit-picking loop**: Codex REQUEST_CHANGES → babysit-pr fixes nits → new review finds new nits → infinite loop
3. **No review calibration**: Codex prompt treats all findings equally
4. **Submodule blindness**: dorny/paths-filter can't see submodule diffs; Codex misses submodule code
5. **Redundant review layers**: localreview.sh + Codex + babysit-pr = over-reviewed for solo dev
6. **No PR template**: Reviewers lack structured context
7. **create-pr skill unused**: Work went directly to platform/main

### Design Decisions (from First Principles + Council)
1. **Codex is purely advisory** — always COMMENT, never REQUEST_CHANGES. Solo dev is the authority.
2. **babysit-pr is blind to review comments** — only fixes CI failures (tests, lint, build, types). Review comments are informational only.
3. **No local GPT review layer** — Claude Code already reviews during development. Adding another AI opinion pre-PR is ceremony.
4. **Deterministic security gates block** — gitleaks, secret patterns, env file detection are the blocking non-test checks.
5. **Submodule review happens via expanded diff** — Codex gets full submodule diff content, not just pointer change.
6. **One AI reviewer, one constrained rubric** — don't multiply opinions across models.
7. **Auto-merge on green CI** — tests, types, lint, builds passing = merge. Codex COMMENT is logged but doesn't block.

### Risks
- Test suite gaps could let bugs through (test coverage is the real gate now)
- Codex advisory comments might be ignored entirely
- Submodule diff expansion could be very large for bulk changes

## Criteria

### Pipeline Architecture (7)
- [ ] ISC-1: Codex prompt outputs COMMENT only (never APPROVE/REQUEST_CHANGES)
- [ ] ISC-2: Codex prompt includes closed severity rubric (critical/warning/note)
- [ ] ISC-3: Codex prompt includes CLAUDE.md project conventions as context
- [ ] ISC-4: Codex prompt receives full submodule diff content
- [ ] ISC-5: Codex review action version pinned with comment explaining why
- [ ] ISC-6: Review severity taxonomy documented (critical/warning/note definitions)
- [ ] ISC-7: Pipeline flow diagram created in documentation

### Auto-Merge Workflow (5)
- [ ] ISC-8: Auto-merge triggers on all checks passing (no Codex approval required)
- [ ] ISC-9: Auto-merge removes Codex approval check from eligibility logic
- [ ] ISC-10: Auto-merge has staleness timeout (PR open > 24h without merge = notify)
- [ ] ISC-11: Failed auto-merge posts actionable PR comment
- [ ] ISC-12: Auto-merge only targets PRs with auto-merge label on platform/main

### babysit-pr Skill (5)
- [ ] ISC-13: babysit-pr ignores review comments entirely (blind to COMMENT body)
- [ ] ISC-14: babysit-pr only reads CI check exit codes for fix decisions
- [ ] ISC-15: babysit-pr categorizes failures: lint, types, test, build, security
- [ ] ISC-16: babysit-pr max 5 iterations then escalates to human
- [ ] ISC-17: babysit-pr documents what it fixed in commit messages

### create-pr Skill (5)
- [ ] ISC-18: create-pr enforces feature branch (auto-creates if on platform/main)
- [ ] ISC-19: create-pr runs localreview.sh as pre-flight gate
- [ ] ISC-20: create-pr handles submodule push-before-parent automatically
- [ ] ISC-21: create-pr populates PR template with structured sections
- [ ] ISC-22: create-pr adds auto-merge label by default

### PR Template (3)
- [ ] ISC-23: PR template created at .github/PULL_REQUEST_TEMPLATE.md
- [ ] ISC-24: Template includes Summary, Changes, Test Plan sections
- [ ] ISC-25: Template includes submodule changes checkbox

### Submodule Handling (4)
- [ ] ISC-26: Codex diff generation includes submodule content changes
- [ ] ISC-27: test-platform.yml detects saleor-apps content changes (not just pointer)
- [ ] ISC-28: Pipeline handles parent-only, submodule-only, and mixed changes
- [ ] ISC-29: Submodule diff capped at reasonable size to prevent CI timeout

### Deterministic Security Gates (3)
- [ ] ISC-30: localreview.sh secret detection preserved as pre-PR blocking gate
- [ ] ISC-31: gitleaks in CI (test-platform.yml) remains as blocking check
- [ ] ISC-32: localreview.sh runs pre-PR only (removed from CI to avoid redundancy)

### Documentation & Integration (5)
- [ ] ISC-33: Pipeline reference doc created at docs/reference/pr-review-pipeline.md
- [ ] ISC-34: CLAUDE.md updated to reference new pipeline documentation
- [ ] ISC-35: Agentic workflow documented: code → branch → PR → CI → merge
- [ ] ISC-36: Memory updated with pipeline architecture decisions
- [ ] ISC-37: Pre-push hook unchanged (existing branch protection preserved)

### Validation (3)
- [ ] ISC-38: Pipeline tested with dry-run on a real feature branch
- [ ] ISC-39: Pipeline works when ECS services scaled to 0 (no API needed)
- [ ] ISC-40: No unnecessary CI minutes from nit-pick fix loops

## Decisions

1. **Codex advisory-only**: Council unanimously agreed AI review should not block merge for solo dev. Tests are the real gate.
2. **No local GPT review**: Solo dev perspective — Claude Code already reviews during development, adding GPT pre-PR is ceremony.
3. **babysit-pr blind to reviews**: AI/ML perspective — the nit-pick loop exists because babysit-pr treats review comments as work items. Cut the feedback loop.
4. **Deterministic security blocking**: Security perspective — gitleaks/secret patterns should hard-block. AI review for security is advisory.
5. **One reviewer, one rubric**: AI/ML perspective — multiple AI models multiply opinions and compound nit-pick surface.

## Verification
