# PR Review Pipeline

## Flow

```
push to feature/* branch
        │
        ▼
┌───────────────┐     ┌──────────────────┐
│  CI Checks    │     │  Codex Web Review │
│  (lint, test, │     │  (via ChatGPT     │
│   build, etc) │     │   Plus, advisory) │
└───────┬───────┘     └────────┬──────────┘
        │                      │
        │               COMMENT only
        │              (inline feedback,
        │               never blocks)
        │                      │
        ▼                      ▼
┌─────────────────────────────────────────────┐
│              Auto-Merge Check               │
│                                             │
│  ✅ All CI checks pass                      │
│  ✅ `auto-merge` label present              │
│  ✅ Not a draft PR                          │
│                                             │
│  All three → squash merge                   │
└─────────────────────────────────────────────┘
```

## Code Review

PR code review is handled by **Codex web-based review** (ChatGPT Plus subscription), not a GitHub Action.

- Reviews are **advisory only** — posted as `COMMENTED`, never blocking
- Triggered automatically on PR open (configured in chatgpt.com/codex settings)
- Can also be triggered manually with `@codex review` in a PR comment
- Review guidelines are customized via `AGENTS.md` in the repo root

### Severity (defined in AGENTS.md)

| Level | Meaning | Action |
|-------|---------|--------|
| P0 (critical) | Security, data loss, crashes | Review manually before merge |
| P1 (warning) | Bugs, logic errors, race conditions | Address when convenient |
| P2 (note) | Style, naming, minor improvements | Informational |

## Key Design Decisions

1. **Reviews are advisory, not blocking** — Codex web review only posts COMMENT reviews. Critical findings require human judgment, not automated merge gates.

2. **Auto-merge requires no review approval** — Only green CI + `auto-merge` label + not draft. This keeps velocity high for routine changes.

3. **babysit-pr ignores review comments** — The babysit skill only fixes CI failures. Code review findings are for human consideration.

## Workflow Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Codex review guidelines and project context |
| `.github/workflows/auto-merge.yml` | Auto-merge on green CI |
| `.claude/skills/babysit-pr.md` | CI failure auto-fix, human escalation |
| `.claude/skills/create-pr.md` | PR creation with pre-flight checks |
| `.github/PULL_REQUEST_TEMPLATE.md` | Standardized PR description |

## Troubleshooting

### Auto-merge not triggering
Check all three conditions:
1. All CI checks completed successfully (not just pending)
2. PR has the `auto-merge` label
3. PR is not in draft state

### Auto-merge not firing after CI passes
The auto-merge workflow uses `workflow_run` (not `check_suite`) to listen for `test-platform` completion. If Container Builds finishes after auto-merge first runs, remove and re-add the `auto-merge` label to re-trigger.

### babysit-pr trying to fix review comments
It shouldn't — the skill only handles CI failures. If this happens, verify you're using the updated `babysit-pr.md` that removed Step 4 (Address Codex Review).
