# PR Review Pipeline

## Flow

```
create-pr skill (or manual)
        │
        ├─ Step 1: Branch safety check
        ├─ Step 2: localreview.sh (deterministic — secrets, env, patterns)
        ├─ Step 3: codex-review.sh (AI — Codex CLI via ChatGPT Plus)
        │          • P0 → blocks PR creation
        │          • P1 → warns, proceeds
        │          • P2 → informational
        ├─ Step 4: Submodule push
        ├─ Step 5: git push + gh pr create
        │
        ▼
┌───────────────┐
│  CI Checks    │
│  (lint, test, │
│   build, etc) │
└───────┬───────┘
        │
        ▼
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

Code review happens **locally before push** via the Codex CLI (`codex review --base platform/main`).

- Uses GPT-5.4 via ChatGPT Plus subscription (no separate API billing)
- Runs as part of `create-pr` skill pipeline (Step 3)
- P0 findings block PR creation; P1/P2 are advisory
- Review guidelines loaded from `AGENTS.md` in the repo root
- Full report saved to `docs/ai-reviews/codex-review.md`
- Can also be run standalone: `./scripts/codex-review.sh`

### Why Local Instead of Web Review

| Factor | Codex Web Review (old) | Codex CLI Review (current) |
|--------|----------------------|--------------------------|
| Timing | After PR creation (too late) | Before push (actionable) |
| Blocking | Advisory only (COMMENT) | P0 blocks PR creation |
| Cost | ChatGPT Plus (same) | ChatGPT Plus (same) |
| Feedback loop | Fix → push → wait → review | Fix → review → push |
| Enforcement | Can't block merge | Blocks PR creation |

### Severity (defined in AGENTS.md)

| Level | Meaning | Action |
|-------|---------|--------|
| P0 (critical) | Security, data loss, crashes | Blocks PR creation |
| P1 (warning) | Bugs, logic errors, race conditions | Warning, review recommended |
| P2 (note) | Style, naming, minor improvements | Informational |

## Key Design Decisions

1. **Review before push, not after** — Codex CLI runs locally before `gh pr create`. Issues are caught when they're cheapest to fix.

2. **Only P0 blocks by default** — P1/P2 are shown but don't prevent PR creation. Override with `--fail-on-p1` for stricter mode.

3. **Auto-merge requires no review approval** — Only green CI + `auto-merge` label + not draft. Codex already reviewed locally.

4. **babysit-pr ignores review comments** — The babysit skill only fixes CI failures. Code review is handled pre-push.

5. **One reviewer, one rubric** — Codex CLI with `AGENTS.md` severity rules. No stacked AI opinions.

6. **test-platform runs on PRs only** — Not on push to `platform/main`. Deploy-staging handles post-merge.

## Workflow Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Codex review guidelines and project context |
| `scripts/codex-review.sh` | Codex CLI review wrapper (severity parsing, exit codes) |
| `scripts/localreview.sh` | Deterministic local review (secrets, patterns) |
| `.github/workflows/auto-merge.yml` | Auto-merge on green CI |
| `.claude/skills/create-pr.md` | PR creation with pre-flight checks |
| `.claude/skills/babysit-pr.md` | CI failure auto-fix, human escalation |
| `.github/PULL_REQUEST_TEMPLATE.md` | Standardized PR description |

## Setup

### Prerequisites
- Node.js 22+ via fnm
- `npm i -g @openai/codex`
- `codex login --device-auth` (authenticate with ChatGPT Plus)

### Standalone Usage
```bash
# Review current branch against platform/main
./scripts/codex-review.sh

# Custom base branch
BASE_REF=main ./scripts/codex-review.sh

# Block on P1 too
FAIL_ON=P1 ./scripts/codex-review.sh

# No blocking (informational only)
FAIL_ON=NONE ./scripts/codex-review.sh
```

## Troubleshooting

### Codex CLI not authenticated
```bash
codex login status          # Check status
codex login --device-auth   # Re-authenticate
```

### Review taking too long
Large diffs (500+ lines) can take 1-2 minutes. For very large PRs, use `--skip-codex` and rely on the deterministic localreview.sh.

### Auto-merge not triggering
Check all three conditions:
1. All CI checks completed successfully (not just pending)
2. PR has the `auto-merge` label
3. PR is not in draft state

### Auto-merge not firing after CI passes
The auto-merge workflow uses `workflow_run` (not `check_suite`) to listen for `test-platform` completion. If Container Builds finishes after auto-merge first runs, remove and re-add the `auto-merge` label to re-trigger.
