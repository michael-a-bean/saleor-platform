---
name: create-pr
description: Create a PR with pre-flight validation. Runs local review, creates branch if needed, pushes, and opens PR with auto-merge label.
---

# Create PR Skill

## When to Use

Use this skill when you need to:
- Create a pull request from local changes
- Run pre-flight validation before PR creation
- Automate the branch → push → PR → auto-merge flow

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

### Step 2: Run Local Review Gate

```bash
FAIL_ON=HIGH ./scripts/localreview.sh
```

If the local review fails with HIGH or CRITICAL findings:
- Show the findings to the user
- Ask whether to proceed or fix first
- Do NOT proceed silently

### Step 3: Handle Submodule Commits

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

### Step 4: Push and Create PR

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

## Test plan
- [ ] CI checks pass
- [ ] Codex review approves
- [ ] Changes verified locally

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 5: Report

Output the PR URL and remind the user:
- Auto-merge will trigger when all checks pass + Codex approves
- Use `/babysit-pr <number>` to monitor and auto-fix failures

## Arguments

| Arg | Description |
|-----|-------------|
| `--skip-review` | Skip the local review gate |
| `--no-auto-merge` | Don't add the auto-merge label |
| `--draft` | Create as draft PR |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | PR created successfully |
| 1 | Local review found blocking issues |
| 2 | Push or PR creation failed |
