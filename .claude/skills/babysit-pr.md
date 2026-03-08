---
name: babysit-pr
description: Monitor a PR, fix CI failures, and escalate Codex critical findings to human. Uses /loop for polling.
---

# Babysit PR Skill

## When to Use

Use this skill when you need to:
- Monitor a PR until it merges or needs human intervention
- Auto-fix CI failures (lint, type-check, test, build)
- Poll PR status on an interval

## Workflow

### Step 1: Identify the PR

Accept a PR number as argument, or detect from the current branch:

```bash
PR_NUMBER=${1:-$(gh pr view --json number -q .number 2>/dev/null)}
```

### Step 2: Check PR Status

```bash
gh pr view $PR_NUMBER --json state,reviews,statusCheckRollup,labels,mergeable
```

Evaluate:
- **Merged** → Done, report success
- **Closed** → Done, report closure
- **All checks pass** → Auto-merge should handle it; verify
- **Checks failing** → Go to Step 3
- **Codex REQUEST_CHANGES** → Escalate to human (critical finding detected). Do NOT attempt to fix review comments. Notify via ntfy and stop.
- **Checks pending** → Wait, re-poll

### Step 3: Fix CI Failures

For each failing check:

1. Read the failure logs:
   ```bash
   gh run view <run-id> --log-failed
   ```

2. Categorize the failure:
   | Failure Type | Auto-Fix Strategy |
   |-------------|-------------------|
   | Lint errors | Run `pnpm lint:fix`, commit |
   | Type errors | Read error, fix types, commit |
   | Test failures | Read test output, fix code or test, commit |
   | Build errors | Read logs, fix, commit |
   | Trivy CVEs | Update deps or add to .trivyignore with justification |
   | Deploy errors | Usually infrastructure — flag for human |

3. Apply fix, commit, push:
   ```bash
   git add <fixed-files>
   git commit -m "fix: <description of CI fix>"
   git push
   ```

4. Re-poll after push (checks will re-run)

### Step 4: Loop or Complete

After each fix cycle:
- If max iterations reached (default: 5), stop and notify human
- If still failing, go back to Step 2
- If all passing, verify auto-merge triggers

### Guardrails

| Rule | Details |
|------|---------|
| Max iterations | 5 fix cycles before stopping |
| No force-push | Never force-push; always new commits |
| No test deletion | Never delete failing tests to make them pass |
| Human escalation | Infrastructure failures, unclear errors, repeated same failure, Codex REQUEST_CHANGES |
| Scope limit | Only fix files already in the PR diff |
| Review comments | IGNORE review comments entirely — only act on CI failures |

## Usage

```
/babysit-pr 50           # Monitor PR #50
/babysit-pr              # Monitor PR for current branch
/loop 5m /babysit-pr 50  # Poll every 5 minutes
```

## Integration

- Uses `gh` CLI for GitHub API
- Triggers auto-merge workflow when conditions met
- Works with `/loop` skill for interval polling
- Sends ntfy notification on completion or escalation
