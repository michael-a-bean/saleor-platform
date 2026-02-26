# Saleor Hobby Gaming Platform

## Project Purpose (WHY)

This repository is a Saleor Platform fork used to build a robust commerce stack for the **Hobby Gaming market** (MTG and similar secondary markets).

**Core goals:**
- E-commerce, POS, and internal ops on a single platform
- Buylist system with accurate costing (WAC / COGS) for secondary-market inventory
- Market-driven pricing and inventory workflows beyond standard Saleor use cases

Saleor is treated as a stable foundation, not something to rewrite.

## Project Overview (WHAT)

- **Stack**: Django + GraphQL API, Next.js storefront, React dashboard
- **Database**: PostgreSQL with Valkey cache
- **Scale**: 100k+ MTG products imported
- **Architecture**: Extend Saleor via apps, webhooks, workers, and configuration—not core modification

Key extensions live in `saleor-apps/apps/` and integrate tightly with pricing, inventory, and costing data.

## Non-Negotiable Rules (ALWAYS APPLY)

| Rule | Details |
|------|---------|
| **Never commit to `main`** | `main` mirrors upstream `saleor/saleor-platform` |
| **Work on `platform/main` or `feature/*`** | These are the only branches for changes |
| **Prefer extension over modification** | Use Saleor Apps, webhooks, workers, env configuration |
| **Always verify the active branch** | `git branch --show-current` before any changes |
| **No untracked infrastructure changes** | Manual AWS changes must be logged and reconciled with Terraform |

These rules apply to every task.

## How Claude Should Work (HOW)

You are expected to **do real work**, not just suggest changes.

**Default behavior:**
- Make changes incrementally
- Ask before running destructive, long-running, or data-mutating operations

**Verification expectations** (as appropriate to the task):
- API changes → GraphQL queries succeed
- Storefront changes → Next.js builds and pages load
- Data logic → Inspect via GraphQL or database queries
- Workers → Logs indicate successful execution
- Infrastructure changes → `terraform plan` shows expected changes only

If unsure, ask before acting rather than skipping verification.

## Where to Find Operational Details

This file stays intentionally lean. Detailed procedures live elsewhere and should be consulted only when relevant.

### Commands & Operations
- `.claude/skills/docker-ops` — Container management
- `.claude/skills/storefront-dev` — Next.js builds and development
- `.claude/skills/storefront-branding` — WotC/MTG graphics and visual identity
- `.claude/skills/saleor-graphql` — GraphQL queries and API exploration
- `.claude/skills/saleor-database` — PostgreSQL queries and data inspection
- `infra/terraform/` — AWS infrastructure (Terraform) — **read `.claude/rules/infrastructure.md` first**

### Domain-Specific Logic
- `.claude/skills/inventory-ops` — Purchase orders, goods receipts, WAC, COGS
- `.claude/skills/buylist` — Customer card buybacks, FOH/BOH workflow
- `.claude/skills/price-sync` — Scryfall market price synchronization
- `.claude/skills/mtg-catalog` — MTG card data and attributes

### Architecture & Rules
- `docs/reference/architecture.md` — Full platform architecture
- `docs/reference/git-philosophy.md` — Detailed git workflow guide
- `docs/reference/sync-contracts.md` — Data sync contracts (Saleor/Meilisearch/inventory-ops)
- `docs/reference/expected-divergence.md` — Terraform drift that is intentional vs concerning
- `.claude/rules/` — Critical gotchas (database, storefront, git, **infrastructure**)

### Legacy Material
- `docs-private/docs/legacy/` — Historical context only; do not auto-apply

**Before starting work, decide which of these are relevant and read only those.**

## Final Notes

- Follow existing Saleor and project patterns rather than inventing new ones
- Do not treat this file as a command reference or style guide
- This file exists to orient you, not constrain you unnecessarily
