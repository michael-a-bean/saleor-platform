# Local Review Gate

A deterministic PR-style local review gate for the saleor-platform repository.

## Overview

The local review gate inspects git diffs for risky changes and produces a markdown report. It's designed to catch common issues before they reach code review or CI/CD.

## What It Checks

### File Pattern Detection

| Category | Patterns | Severity |
|----------|----------|----------|
| CI/CD | `.github/workflows/*` | HIGH |
| Infrastructure | `Dockerfile`, `docker-compose*` | MEDIUM |
| Database | `prisma/schema`, `prisma/migrations/*`, Django migrations | HIGH |
| Secrets | `.env*`, `backend.env`, `common.env` | CRITICAL |
| Frontend | `storefront/*` with `NEXT_PUBLIC_` additions | MEDIUM |
| Apps | `saleor-apps/*` | MEDIUM |
| Dependencies | `package.json`, `requirements*.txt`, lock files | MEDIUM |

### Secret Pattern Detection

Scans diffs for common secret patterns:
- AWS Access Keys (`AKIA...`)
- Stripe API Keys (`sk_live_...`, `sk_test_...`)
- GitHub Tokens (`ghp_...`, `gho_...`)
- Slack Tokens (`xox...`)
- Private Keys (`-----BEGIN ... PRIVATE KEY-----`)
- Password assignments in code

### Optional Scanners

If installed, these tools enhance detection:
- **gitleaks**: Comprehensive secret detection
- **trivy**: Vulnerability and misconfiguration scanning

The tool degrades gracefully if these are not installed.

## Running the Review

### Via Makefile (Recommended)

```bash
# Run with defaults
make localreview

# View available options
make help
```

### Via Script Directly

```bash
./scripts/localreview.sh
```

### Via PAI Skill

Read the skill documentation:
```bash
cat .claude/skills/local-review.md
```

Or invoke in a Claude Code session by reading the local-review skill.

## Configuration

All options are set via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_REF` | `origin/platform/main` | Git ref to diff against |
| `SCOPE` | `auto` | What to check: `auto`, `staged`, or `all` |
| `CHANGED_ONLY` | `true` | Only check changed files |
| `FAIL_ON` | `HIGH` | Minimum severity to fail |
| `OUTPUT_PATH` | `docs/ai-reviews/localreview.md` | Report output path |

### Scope Options

- **auto**: Checks staged changes if any exist, otherwise diffs against BASE_REF
- **staged**: Only checks staged changes (`git diff --cached`)
- **all**: Checks all changes against BASE_REF

### Severity Levels

| Level | Meaning |
|-------|---------|
| CRITICAL | Must fix immediately (e.g., exposed secrets) |
| HIGH | Should fix before commit (e.g., CI changes, migrations) |
| MEDIUM | Review and address as appropriate |
| LOW | Informational |

### FAIL_ON Threshold

Set `FAIL_ON` to control the exit code:

```bash
# Only fail on HIGH or CRITICAL
FAIL_ON=HIGH make localreview

# Fail on MEDIUM and above
FAIL_ON=MEDIUM make localreview

# Never fail (always exit 0)
FAIL_ON=NONE make localreview
```

## Understanding the Report

Reports are written to `docs/ai-reviews/localreview.md` (by default) and contain:

### Summary Section

Quick overview of files changed and findings count.

### Diff Statistics

Output from `git diff --stat` showing what changed.

### Findings Table

| Column | Description |
|--------|-------------|
| Severity | CRITICAL, HIGH, MEDIUM, or LOW |
| Category | Type of finding (CI/CD, Secrets, etc.) |
| Finding | Brief description of the issue |
| Evidence | File path or pattern matched |
| Recommendation | Suggested action |

### Scanner Results

Output from gitleaks and trivy if available.

### Next Actions

Checklist of recommended follow-up steps.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No findings at or above FAIL_ON threshold |
| 1 | Findings at or above FAIL_ON threshold |
| 2 | Script error (not in git repo, etc.) |

## Examples

### Basic Review Before Commit

```bash
make localreview
```

### Review Last 5 Commits

```bash
BASE_REF=HEAD~5 make localreview
```

### Review Only Staged Changes

```bash
SCOPE=staged make localreview
```

### Strict Review (Fail on Medium)

```bash
FAIL_ON=MEDIUM make localreview
```

### Custom Report Location

```bash
OUTPUT_PATH=/tmp/my-review.md make localreview
```

## Integration Suggestions

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
SCOPE=staged FAIL_ON=HIGH ./scripts/localreview.sh
```

### CI Pipeline

```yaml
- name: Local Review Gate
  run: make localreview
```

## Troubleshooting

### "Not inside a git repository"

Ensure you're running from within the saleor-platform directory.

### No findings but expected some

- Check `BASE_REF` is correct and reachable
- Check `SCOPE` matches your intent
- Run with `SCOPE=all` to check all uncommitted changes

### Scanner not found warnings

Install optional tools for enhanced detection:

```bash
# gitleaks
brew install gitleaks  # macOS
# or download from https://github.com/gitleaks/gitleaks

# trivy
brew install trivy  # macOS
# or download from https://github.com/aquasecurity/trivy
```

## Files

| File | Purpose |
|------|---------|
| `scripts/localreview.sh` | Main review script |
| `Makefile` | Developer interface |
| `.claude/skills/local-review.md` | PAI skill documentation |
| `docs/localreview/README.md` | This documentation |
| `docs/ai-reviews/localreview.md` | Generated reports (gitignored) |
