> **ARCHIVED** — mtg-import consolidated into inventory-ops (Mar 2026). This plan is no longer applicable.

# Plan: Decouple mtg-import Prisma Schema from inventory-ops

## Context

The mtg-import app's `prisma/schema.prisma` is a **symlink** to inventory-ops's 2,200-line, ~50-model schema. This causes recurring build/deploy friction:

- Dockerfile must `COPY apps/inventory-ops/prisma/` into the build context just so the symlink resolves
- `prisma generate` produces a client with 50+ models when mtg-import only uses 4
- The `@/generated/prisma` vs `@prisma/client` import confusion just caused a CI build failure
- Migration ownership is unclear (inventory-ops runs all migrations; mtg-import runs none)

**Solution: Standalone Prisma schema, same physical database.** This eliminates all build friction with zero AWS cost change. The database stays shared — only the schema definition is separated.

## Approach: Option A (Standalone Schema, Shared DB)

**NOT Option B (separate database)** — the pain is build friction only. A separate RDS instance adds ~$15-30/mo cost and operational overhead for zero runtime benefit. Option B becomes justified only if mtg-import needs schema-version isolation, compliance-level DB separation, or grows to 10+ models.

## Files to Modify

| File | Change |
|------|--------|
| `saleor-apps/apps/mtg-import/prisma/schema.prisma` | Replace symlink with standalone 4-model schema |
| `saleor-apps/apps/mtg-import/prisma/migrations/migration_lock.toml` | Create |
| `saleor-apps/apps/mtg-import/prisma/migrations/0001_initial/migration.sql` | Create (baseline DDL) |
| `saleor-apps/apps/mtg-import/prisma/migrations/0002_add_skipped/migration.sql` | Create (skipped column) |
| `saleor-apps/apps/mtg-import/Dockerfile` | Remove `COPY apps/inventory-ops/prisma/` line |
| `.github/workflows/deploy-staging.yml` | Add mtg-import migration step, remove OMITTED comment |

## Step 1: Replace Symlink with Standalone Schema

Delete the symlink. Create a real `schema.prisma` containing only:
- `AppInstallation` (duplicated model definition — same physical table, owned by inventory-ops migrations)
- `ImportJob`, `ImportedProduct`, `SetAudit` (mtg-import's own 3 models)
- `ImportJobStatus`, `ImportJobType` enums

AppInstallation is duplicated so Prisma can generate typed client code with FK relationships. mtg-import will NEVER run migrations against AppInstallation — only inventory-ops owns that table's DDL.

## Step 2: Create Baseline Migration Files

Create `prisma/migrations/0001_initial/migration.sql` with the DDL for the 3 mtg-import tables + enums + indexes + FKs. Create `0002_add_skipped/migration.sql` for the `skipped` column added later.

These migrations will NOT be re-run against the live database. Instead, run:
```bash
prisma migrate resolve --applied 0001_initial
prisma migrate resolve --applied 0002_add_skipped
```
This marks them as already-applied in `_prisma_migrations` without executing DDL.

## Step 3: Update Dockerfile

Remove line 20: `COPY apps/inventory-ops/prisma/ ./apps/inventory-ops/prisma/`

The `prisma generate` step now resolves directly to the standalone schema.

## Step 4: Update CI/CD

In `deploy-staging.yml`, add a migration step for mtg-import after inventory-ops:
```yaml
- name: Run Prisma migrations (mtg-import)
  run: ./scripts/deploy/aws/run-migrations.sh staging prisma mtg-import
```
Remove the "INTENTIONALLY OMITTED" comment block.

## Step 5: Remove inventory-ops MTG Models

After mtg-import owns its own schema, remove the `ImportJob`, `ImportedProduct`, `SetAudit` model definitions and their enums from inventory-ops's schema. This keeps inventory-ops's schema clean and prevents confusion about ownership. Run `prisma generate` in inventory-ops to verify its client still builds.

## One-Time Operational Steps

Against the live staging database (after deploying the new migration files):
```bash
cd saleor-apps/apps/mtg-import
DATABASE_URL=$STAGING_DB_URL pnpm prisma migrate resolve --applied 0001_initial
DATABASE_URL=$STAGING_DB_URL pnpm prisma migrate resolve --applied 0002_add_skipped
```

## Verification

1. `prisma generate` in mtg-import succeeds without the symlink
2. `SKIP_ENV_VALIDATION=true npx next build` succeeds
3. `pnpm test:unit --run` passes (250/251, same pre-existing timeout)
4. Dockerfile builds without the inventory-ops COPY line
5. `prisma generate` in inventory-ops still succeeds after removing mtg models
6. CI deploy workflow builds and deploys mtg-import successfully
