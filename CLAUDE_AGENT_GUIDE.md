# Claude Code Agent Guide for Saleor Platform

> **Note**: This is supplementary documentation. For quick reference, see:
> - `CLAUDE.md` - Concise instructions and commands
> - `.claude/rules/` - Topic-specific rules
> - `docs/SALEOR_CONTEXT.md` - Architecture reference

## Purpose

This guide defines the **philosophy and detailed procedures** for maintaining this Saleor platform fork.
The primary goal is to keep upstream Saleor fully updateable while allowing clean, versioned customization.

---

## Repository Structure

- **Upstream**: `saleor/saleor-platform`
- **Fork**: your GitHub fork
- **Branches**:
  - `main` → clean mirror of upstream (never modified)
  - `platform/main` → deployable product branch
  - `feature/*` → short‑lived development branches

---

## Hard Rules

1. **Never commit to `main`** - It mirrors upstream exactly
2. **Never modify upstream code** unless no extension point exists
3. **All work happens on `platform/main` or `feature/*`**
4. **Prefer additive extensions** over invasive changes
5. **Document every customization**

If uncertain, stop and ask before changing code.

---

## Git Workflow (Mandatory)

### Starting Work
Before editing anything, always confirm:

```bash
git status
git branch --show-current
git remote -v
```

You must be on:
- `platform/main`, or
- `feature/<description>`

### Feature Branch Creation
```bash
git checkout -b feature/<short-description>
```

### Merging Work
```bash
git checkout platform/main
git merge feature/<short-description>
git push origin platform/main
```

Never merge into `main`.

---

## Upstream Update Procedure (Exact Sequence)

When updating Saleor from upstream:

```bash
git checkout main
git fetch upstream
git reset --hard upstream/main
git push origin main --force-with-lease

git checkout platform/main
git merge main
git push origin platform/main
```

Claude Code must **never improvise** this flow.

---

## What “Keep Core Unmodified” Means

`saleor-platform` orchestrates services; customization should be **additive**.

### Preferred Customization Methods
- New Saleor **apps** (external services)
- Saleor **plugins**
- Webhooks + GraphQL integrations
- Environment variables
- Docker Compose overrides
- CI/CD configuration in fork only

### Avoid
- Editing vendored service code
- Large refactors of upstream files
- Formatting-only diffs in core files

---

## Recommended Custom Layout

Use clear separation for custom work:

```
apps/
  my_custom_app/
docs/
  customizations/
scripts/
docker/
  docker-compose.custom.yml
```

Follow existing repo conventions if present.

---

## Commit Standards

- Small, focused commits
- Imperative messages:
  - `feat(apps): add inventory sync app`
  - `chore(compose): add custom service`
  - `docs: document webhook flow`
- Never commit secrets
- Use `.env.example` files only

---

## Documentation Requirements

For every new app or service, include:
- `README.md` explaining:
  - purpose
  - local setup
  - required environment variables
  - webhook behavior
- Entry in `docs/customizations/`

---

## Guardrails for Claude Code

Claude Code must **not**:
- Force-push branches
- Modify `.env` files with secrets
- Introduce breaking dependency upgrades without isolation
- Change large upstream-owned files without justification

If a core patch is unavoidable:
- Keep diff minimal
- Isolate into its own commit
- Add rationale in documentation
- Flag as potential upstream PR candidate

---

## Delivery Checklist (Every Task)

Each change must include:
1. Summary of changes
2. Files touched
3. How to run/test locally
4. New environment variables
5. Upstream merge risk assessment

---

## Installation Rule

Claude Code itself **must be installed outside the repository**.
Only this guide and documentation live inside the repo.

---

## If Uncertain

Pause and ask:
> “Is this a plugin, an external app, or a core change?”

Default to **plugin or external app**.
