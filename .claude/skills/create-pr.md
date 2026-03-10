---
name: create-pr
description: Create a PR with pre-flight validation. Runs local review, Codex CLI review, creates branch if needed, pushes, and opens PR with auto-merge label.
---

# Create PR Skill

## When to Use

Use this skill when you need to:
- Create a pull request from local changes
- Run pre-flight validation before PR creation
- Automate the branch → review → push → PR → auto-merge flow

## Workflow

When invoked, execute these steps in order:

### Step 1: Verify Branch Safety

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" = "main" ] || [ "$CURRENT" = "platform/main" ]; then
  echo "On $CURRENT — need a feature branch for PR."
fi
```

If on `main` or `platform/main`:
- Ask the user for a branch name, or auto-generate from the commit messages
- `git checkout -b feature/<name>`
- If the user declines, abort

### Step 2: Run Local Review Gate (deterministic)

```bash
FAIL_ON=HIGH ./scripts/localreview.sh
```

If the local review fails with HIGH or CRITICAL findings:
- Show the findings to the user
- Ask whether to proceed or fix first
- Do NOT proceed silently

### Step 3: Run Codex CLI Review (AI-powered)

```bash
FAIL_ON=P0 ./scripts/codex-review.sh
```

This runs `codex review --base platform/main` locally via the Codex CLI (authenticated with ChatGPT Plus). It:
- Diffs the branch against `platform/main`
- Analyzes with GPT-5.4 using `AGENTS.md` severity rubric
- P0 findings → **block PR creation** (show findings, ask user)
- P1 findings → **warn** but proceed (show findings)
- P2 findings → informational only

If the review finds P0 issues:
- Show the findings to the user
- Ask whether to fix first or override with `--skip-codex`
- Do NOT proceed silently

The full review report is saved to `docs/ai-reviews/codex-review.md`.

### Step 4: Handle Submodule Commits

Check if there are submodule changes that need pushing first:

```bash
git submodule foreach --quiet 'echo $name $(git status --porcelain | wc -l)'
```

For any submodule with uncommitted changes:
1. Commit changes in the submodule
2. Push the submodule branch
3. Update the parent repo's submodule pointer
4. Commit the pointer update in the parent

**CRITICAL**: Always push submodule commits BEFORE pushing the parent repo.

### Step 5: Push and Create PR

```bash
# Push branch with upstream tracking
git push -u origin HEAD

# Create PR targeting platform/main with auto-merge label
gh pr create \
  --base platform/main \
  --title "<concise title>" \
  --label "auto-merge" \
  --body "$(cat <<'EOF'
## Summary
<bullet points>

## Codex Review
<P0/P1/P2 counts from Step 3, or "clean">

## Test plan
- [ ] CI checks pass
- [ ] Changes verified locally

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 6: Report

Output the PR URL and remind the user:
- Auto-merge triggers when all CI checks pass
- Codex CLI already reviewed locally — no web review needed
- Use `/babysit-pr <number>` to monitor and auto-fix CI failures

## Arguments

| Arg | Description |
|-----|-------------|
| `--skip-review` | Skip both local review and Codex CLI review |
| `--skip-codex` | Skip only the Codex CLI review (keep local review) |
| `--no-auto-merge` | Don't add the auto-merge label |
| `--draft` | Create as draft PR |
| `--fail-on-p1` | Block on P1 findings too (default: P0 only) |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | PR created successfully |
| 1 | Review found blocking issues (local or Codex) |
| 2 | Push or PR creation failed |
| 3 | Codex CLI not installed or not authenticated |
