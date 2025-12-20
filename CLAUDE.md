# Saleor Platform - Claude Code Instructions

## Project Overview

Saleor e-commerce platform fork configured as an **MTG card marketplace** with 106k+ products.

- **Stack**: Django/GraphQL API + Next.js 15 storefront + React dashboard
- **Database**: PostgreSQL 15 with Valkey cache
- **Current state**: Fully functional with MTG card catalog imported

## Critical Rules

1. **Never commit to `main`** - It mirrors upstream `saleor/saleor-platform`
2. **Work on `platform/main`** or `feature/*` branches only
3. **Prefer extensions over modifications** - Use apps, webhooks, env vars
4. **Always verify branch** before making changes: `git branch --show-current`

## Common Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f api
docker compose logs -f storefront

# Django management
docker compose exec api python manage.py <command>
docker compose exec api python manage.py update_search_indexes

# Rebuild storefront after code changes
docker compose build storefront && docker compose up -d storefront

# Database access
docker compose exec db psql -U saleor -d saleor
```

## Service URLs

| Service | URL |
|---------|-----|
| Storefront | http://localhost:3000 |
| GraphQL API | http://localhost:8000/graphql/ |
| Dashboard | http://localhost:9000 |
| Inventory Ops | http://localhost:3002 (via Dashboard Apps) |
| Buylist | http://localhost:3003 (via Dashboard Apps) |
| Stripe App | http://localhost:3001 (via Dashboard Apps) |
| Saleor MCP | http://localhost:6000 (AI assistant integration) |
| Mailpit | http://localhost:8025 |
| Jaeger | http://localhost:16686 |

## Code Style

- **Python**: Follow existing Saleor patterns
- **TypeScript**: Strict mode, use existing component patterns
- **Commits**: Imperative mood with conventional prefixes (`feat:`, `fix:`, `docs:`, `chore:`)

## Key Directories

```
storefront/src/           # Next.js customer-facing app
  app/[channel]/          # Channel-scoped pages
  ui/components/          # React components
  lib/                    # Utilities and helpers
  graphql/                # GraphQL queries/fragments
saleor-apps/apps/         # Saleor apps (submodule)
  inventory-ops/          # Inventory management app
  buylist/                # Customer card buyback app
  stripe/                 # Stripe payment app
scripts/                  # Custom scripts (MTG import, etc.)
docs/                     # Reference documentation
```

## Skills

Project-specific skills are available in `.claude/skills/`:

| Skill | Purpose |
|-------|---------|
| `saleor-graphql` | Execute GraphQL queries against the API |
| `saleor-database` | PostgreSQL queries and data inspection |
| `storefront-dev` | Next.js development and builds |
| `docker-ops` | Container management |
| `mtg-catalog` | MTG card data queries |
| `inventory-ops` | Inventory management app (POs, GRs, WAC, COGS) |
| `buylist` | Customer card buyback app (quotes, pricing, BOH) |

**Note**: Inventory Ops and Buylist share a database for cross-app cost tracking. See `docs/INVENTORY_OPS_SETUP.md` for integration details.

## References

| Category | Location | Purpose |
|----------|----------|---------|
| **Active** | `docs/INVENTORY_OPS_SETUP.md` | Inventory Ops app setup |
| **Architecture** | `docs/reference/architecture.md` | Full platform architecture |
| **Git Philosophy** | `docs/reference/git-philosophy.md` | Detailed git workflow guide |
| **Legacy** | `docs/legacy/` | One-time setup docs, historical analyses |
| **Rules** | `.claude/rules/` | Critical gotchas (minimal) |
| **Skills** | `.claude/skills/` | Detailed procedures (on-demand) |
