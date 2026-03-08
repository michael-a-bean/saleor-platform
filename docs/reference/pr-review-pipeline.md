# PR Review Pipeline

## Flow

```
push to feature/* branch
        │
        ▼
┌───────────────┐     ┌──────────────────┐
│  CI Checks    │     │  Codex PR Review  │
│  (lint, test, │     │  (severity-based) │
│   build, etc) │     │                   │
└───────┬───────┘     └────────┬──────────┘
        │                      │
        │              ┌───────┴────────┐
        │              │                │
        │        [critical]        [warning/note]
        │         found?             only?
        │              │                │
        │       REQUEST_CHANGES     COMMENT
        │       (blocks merge)    (informational)
        │              │                │
        │              │         ┌──────┴──────┐
        │              │         │ Create GitHub│
        │              │         │ issues for   │
        │              │         │ each finding │
        │              │         └──────────────┘
        ▼              ▼                ▼
┌─────────────────────────────────────────────┐
│              Auto-Merge Check               │
│                                             │
│  ✅ All CI checks pass                      │
│  ✅ `auto-merge` label present              │
│  ✅ Not a draft PR                          │
│  ✅ No active Codex REQUEST_CHANGES         │
│                                             │
│  All four → squash merge                    │
└─────────────────────────────────────────────┘
```

## Severity Taxonomy

| Label | Meaning | Codex Action | Blocks Merge? |
|-------|---------|--------------|---------------|
| `[critical]` | Security, data loss, crashes, broken auth | REQUEST_CHANGES | Yes |
| `[warning]` | Bugs, logic errors, race conditions | COMMENT | No |
| `[note]` | Style, naming, minor improvements | COMMENT | No |

## Key Design Decisions

1. **Codex blocks only on `[critical]`** — REQUEST_CHANGES is reserved for security/data-loss/crash issues. Everything else is a COMMENT. This prevents infinite nit-pick fix loops.

2. **Verdict derived from content** — The workflow scans for `[critical]` labels in Codex output rather than trusting a first-line verdict format. This is more reliable.

3. **Non-blocking findings become GitHub issues** — `[warning]` and `[note]` findings are automatically created as GitHub issues with `codex-review` + severity labels. This ensures findings are tracked even when they don't block the PR. Dedup by title prevents duplicates on re-runs.

4. **babysit-pr ignores review comments** — The babysit skill only fixes CI failures. Codex REQUEST_CHANGES (critical findings) are escalated to a human, not auto-fixed.

5. **Auto-merge requires no approval** — Only green CI + `auto-merge` label + not draft + no active REQUEST_CHANGES. No Codex APPROVE needed.

6. **Previous REQUEST_CHANGES are dismissed on re-review** — When a new push triggers Codex, any prior REQUEST_CHANGES is dismissed so stale blocks don't persist.

## Workflow Files

| File | Purpose |
|------|---------|
| `.github/workflows/codex-pr-review.yml` | Codex review with severity rubric |
| `.github/workflows/auto-merge.yml` | Auto-merge on green CI |
| `.claude/skills/babysit-pr.md` | CI failure auto-fix, human escalation |
| `.claude/skills/create-pr.md` | PR creation with pre-flight checks |
| `.github/PULL_REQUEST_TEMPLATE.md` | Standardized PR description |

## Troubleshooting

### Codex keeps submitting REQUEST_CHANGES for non-critical issues
The workflow derives verdict from `[critical]` labels in the output. If Codex uses `[critical]` for minor issues, update the prompt in `codex-pr-review.yml` to be more specific about what constitutes critical.

### Auto-merge not triggering
Check all four conditions:
1. All CI checks completed successfully (not just pending)
2. PR has the `auto-merge` label
3. PR is not in draft state
4. No active Codex REQUEST_CHANGES review exists

### babysit-pr trying to fix review comments
It shouldn't — the skill only handles CI failures. If this happens, verify you're using the updated `babysit-pr.md` that removed Step 4 (Address Codex Review).

### Stale REQUEST_CHANGES blocking merge after fix
Push a new commit. The `synchronize` event triggers a new Codex review, which dismisses the previous REQUEST_CHANGES before submitting a fresh review.
