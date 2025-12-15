# Git Workflow Rules

## Branch Structure

| Branch | Purpose | Modifiable? |
|--------|---------|-------------|
| `main` | Upstream mirror | **NEVER** |
| `platform/main` | Primary work branch | Yes |
| `feature/*` | Development branches | Yes |

## Before Any Changes

```bash
git status
git branch --show-current  # Must show platform/main or feature/*
```

## Feature Development

```bash
# Create feature branch
git checkout platform/main
git checkout -b feature/<description>

# After completion
git checkout platform/main
git merge feature/<description>
git push origin platform/main
```

## Syncing Upstream (Exact Sequence)

```bash
git checkout main
git fetch upstream
git reset --hard upstream/main
git push origin main --force-with-lease

git checkout platform/main
git merge main
git push origin platform/main
```

## Commit Messages

Use conventional commits with imperative mood:
- `feat(storefront): add product filtering`
- `fix(api): resolve pricing calculation`
- `docs: update context document`
- `chore(docker): optimize build`

## Prohibited Actions

- Force-push to `platform/main`
- Commit secrets or `.env` files
- Large reformatting of upstream files
- Breaking dependency upgrades without isolation
