# Skills Index

Skills provide detailed procedures for specific tasks. Read only the skills relevant to your current work.

## Operations

| Skill | When to Use |
|-------|-------------|
| [docker-ops](./docker-ops.md) | Starting/stopping services, viewing logs, rebuilding containers, debugging |
| [storefront-dev](./storefront-dev.md) | Building storefront, GraphQL codegen, Next.js development |
| [saleor-graphql](./saleor-graphql.md) | API queries/mutations, schema exploration, testing operations |
| [saleor-database](./saleor-database.md) | Direct SQL queries, data inspection, bulk updates, debugging |

## Domain

| Skill | When to Use |
|-------|-------------|
| [inventory-ops](./inventory-ops.md) | Purchase orders, goods receipts, WAC calculation, COGS tracking |
| [buylist](./buylist.md) | Customer card buybacks, FOH/BOH workflow, quote management |
| [price-sync](./price-sync.md) | Scryfall price imports, market price synchronization |
| [mtg-catalog](./mtg-catalog.md) | Card queries, attributes, catalog data model |

## Validation

| Skill | When to Use |
|-------|-------------|
| [local-review](./local-review.md) | Pre-commit review gate, risky pattern detection, secrets scanning |

## Usage Notes

- Skills contain commands, queries, and procedures that would clutter CLAUDE.md
- Each skill has a `When to Use` section at the top
- Skills are loaded on-demand—don't read all of them upfront
- If a skill doesn't exist for a task, check `docs/` or ask the user
