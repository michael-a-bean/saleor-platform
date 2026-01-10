---
name: local-review
description: Deterministic local review gate for code changes. Use when reviewing diffs before commit/PR, checking for risky patterns, or running pre-commit validation.
---

# Local Review Skill

## When to Use

Use this skill when you need to:
- Review local changes before committing
- Check for risky file pattern changes (CI/CD, Docker, migrations, env files)
- Detect potential secrets in diffs
- Generate a structured review report
- Run a pre-commit gate check

## Quick Start

```bash
# Run with defaults (diffs against origin/platform/main)
make localreview

# Or run the script directly
./scripts/localreview.sh
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_REF` | `origin/platform/main` | Git ref to diff against |
| `SCOPE` | `auto` | What to check: `auto`, `staged`, or `all` |
| `CHANGED_ONLY` | `true` | Only check changed files |
| `FAIL_ON` | `HIGH` | Minimum severity to fail: `HIGH`, `MEDIUM`, `LOW`, `NONE` |
| `OUTPUT_PATH` | `docs/ai-reviews/localreview.md` | Report output path |

## Usage Examples

### Default Review
```bash
make localreview
```

### Review Staged Changes Only
```bash
SCOPE=staged make localreview
```

### Review Against a Specific Commit
```bash
BASE_REF=HEAD~5 make localreview
```

### Lower Failure Threshold
```bash
FAIL_ON=MEDIUM make localreview
```

### Custom Output Path
```bash
OUTPUT_PATH=/tmp/review.md make localreview
```

## What It Checks

| Category | Patterns | Severity |
|----------|----------|----------|
| CI/CD | `.github/workflows/*` | HIGH |
| Infrastructure | `Dockerfile`, `docker-compose*` | MEDIUM |
| Database | `prisma/schema`, `prisma/migrations/*`, Django migrations | HIGH |
| Secrets | `.env*`, `backend.env`, `common.env` | CRITICAL |
| Frontend | `storefront/*` with `NEXT_PUBLIC_` additions | MEDIUM |
| Apps | `saleor-apps/*` | MEDIUM |
| Dependencies | `package.json`, `requirements*.txt`, lock files | MEDIUM |
| Inline Secrets | AWS keys, Stripe keys, GitHub tokens, private keys, passwords | CRITICAL |

## Optional Scanners

If installed, these tools enhance detection:

- **gitleaks**: Secret detection (output is redacted in reports)
- **trivy**: Vulnerability and misconfiguration scanning

The script degrades gracefully if these are not available.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No findings at or above FAIL_ON threshold |
| 1 | Findings at or above FAIL_ON threshold |
| 2 | Script error |

## Report Format

Reports are written to `docs/ai-reviews/localreview.md` by default and include:

- Summary statistics
- Diff statistics
- Findings table (Severity, Category, Finding, Evidence, Recommendation)
- Scanner results (if available)
- Next actions checklist

## Integration with PAI

To invoke via the skill system:

```
/local-review
```

Or use the Task tool with an appropriate prompt describing the review needs.
