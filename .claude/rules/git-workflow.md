# Git Critical Rules

> **Full procedures**: See `docs/reference/git-philosophy.md` for complete workflow.

## Branch Protection (CRITICAL)

| Branch | Status |
|--------|--------|
| `main` | **NEVER MODIFY** — mirrors upstream |
| `platform/main` | Primary work branch |
| `feature/*` | Development branches |

Always verify before changes:
```bash
git branch --show-current  # Must NOT show "main"
```

## Prohibited Actions

- Force-push to `platform/main`
- Commit secrets or `.env` files
- Large reformatting of upstream files
- Breaking dependency upgrades without isolation
