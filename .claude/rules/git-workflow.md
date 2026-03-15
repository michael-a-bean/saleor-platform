# Git Critical Rules

> **Full procedures**: See `docs/reference/git-philosophy.md` for complete workflow.

## Branch Model (CRITICAL)

| Branch | Purpose |
|--------|---------|
| `main` | **NEVER MODIFY** — mirrors upstream `saleor/saleor-platform`. Used only to pull Saleor updates. |
| `platform/main` | **Default branch.** All our work targets here. GitHub default branch is set to this. |
| `feature/*` | Short-lived development branches. Created off `platform/main`, merged back via PR. |

`platform/main` is the GitHub default branch. This is intentional — `workflow_run` triggers, PR defaults, and `git clone` all use `platform/main`. `main` exists solely as an upstream tracking branch.

Always verify before changes:
```bash
git branch --show-current  # Must NOT show "main"
```

## PR-First Workflow (CRITICAL)

**All changes must go through pull requests. Never push directly to `platform/main`.**

```
feature/* branch → push → PR targeting platform/main → test-platform CI → auto-merge → deploy-staging
```

1. Create a `feature/*` branch off `platform/main`
2. Make changes, commit, push the feature branch
3. Create a PR targeting `platform/main` with the `automerge` label
4. `test-platform` CI runs automatically (lint, tests, builds, security)
5. `auto-merge.yml` fires on `test-platform` completion — squash-merges if all required checks pass
6. `deploy-staging.yml` triggers on merge to `platform/main` — deploys to AWS

For submodule changes (saleor-apps/inventory-ops/etc.):
- Push changes to the submodule's branch first
- Update the submodule pointer in the platform repo's feature branch
- The PR and CI/CD pipeline always runs on the **platform** repo

## Prohibited Actions

- Push directly to `platform/main` (use PRs)
- Force-push to `platform/main`
- Commit to or modify `main` (upstream mirror)
- Commit secrets or `.env` files
- Large reformatting of upstream files
- Breaking dependency upgrades without isolation
