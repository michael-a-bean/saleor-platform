# Migrations Runbook

This runbook covers database migration procedures for the Saleor Platform.

## Migration Types

### Django Migrations (Saleor Core)

- Managed by Django ORM
- Located in Saleor upstream codebase
- Applied via `python manage.py migrate`

### Prisma Migrations (Custom Apps)

- Managed by Prisma ORM
- Located in `saleor-apps/apps/inventory-ops/prisma/migrations/`
- Applied via `npx prisma migrate deploy`
- Shared by: inventory-ops-app, buylist-app, pos-app

## Safe Migration Practices

### The Expand/Contract Pattern

Always use the expand/contract pattern for schema changes:

**Phase 1: Expand (safe to rollback)**
```sql
-- Add new column with default
ALTER TABLE products ADD COLUMN new_field VARCHAR(255) DEFAULT '';
```

**Phase 2: Deploy code that writes to both old and new**
- Update application to write to both columns
- Deploy and verify

**Phase 3: Migrate data**
```sql
-- Backfill new column from old
UPDATE products SET new_field = old_field WHERE new_field = '';
```

**Phase 4: Contract (deploy after verify)**
- Update application to only use new column
- Deploy and verify
- Remove old column in separate migration

### Never Do These in Production

- Rename columns directly (use add/migrate/remove)
- Change column types directly
- Remove columns still referenced by running code
- Long-running data migrations in the same transaction

## Running Migrations

### Staging (Automated)

Migrations run automatically during staging deployment:
1. GitHub Actions triggers on merge to `platform/main`
2. Pre-migration RDS snapshot created
3. Django migrations run as ECS task
4. Prisma migrations run as ECS task
5. Services deployed

### Production (Semi-Automated)

Migrations run during production deployment after approval:
1. Pre-deployment RDS snapshot created (waits for completion)
2. Django migrations run
3. Prisma migrations run
4. Services deployed

### Manual Migration Run

If you need to run migrations manually:

```bash
# Django migrations
./scripts/deploy/aws/run-migrations.sh production django

# Prisma migrations
./scripts/deploy/aws/run-migrations.sh production prisma
```

## Monitoring Migrations

### CloudWatch Logs

Migration logs are written to:
- `/ecs/saleor-platform-{env}/migrate`

View logs:
```bash
aws logs tail /ecs/saleor-platform-staging/migrate --follow
```

### Migration Task Status

Check ECS task status:
```bash
# List recent tasks
aws ecs list-tasks \
  --cluster saleor-platform-staging \
  --family saleor-platform-staging-migrate \
  --desired-status STOPPED

# Describe task
aws ecs describe-tasks \
  --cluster saleor-platform-staging \
  --tasks <task-arn>
```

## Troubleshooting

### Migration Timed Out

Default timeout is 10 minutes. For long migrations:
1. Check if migration is still running (not stuck)
2. Consider breaking into smaller migrations
3. For data migrations, consider background jobs

### Migration Failed Mid-Way

1. Check CloudWatch logs for error
2. Determine which migration failed
3. Check database state:
   ```sql
   -- Django
   SELECT * FROM django_migrations ORDER BY id DESC LIMIT 10;

   -- Prisma
   SELECT * FROM _prisma_migrations ORDER BY started_at DESC LIMIT 10;
   ```
4. Fix the issue and re-run

### Lock Timeout

If migration times out waiting for locks:
1. Check for long-running queries:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC;
   ```
2. Consider running migration during low-traffic period
3. For index creation, use `CONCURRENTLY` if possible

### Schema Mismatch After Rollback

If code was rolled back but migrations weren't:
1. Deploy code that handles both schemas
2. Or restore from pre-migration snapshot (see backups.md)

## Creating New Migrations

### Django (if modifying Saleor core - rare)

```bash
docker compose run --rm api python manage.py makemigrations
```

### Prisma (for custom apps)

```bash
cd saleor-apps/apps/inventory-ops
npx prisma migrate dev --name add_new_field
```

## Pre-Production Migration Checklist

- [ ] Migration tested on staging
- [ ] Migration is backward compatible (can rollback)
- [ ] Large data migrations have been analyzed for lock impact
- [ ] RDS backup verified before proceeding
- [ ] Team notified of migration window
- [ ] Rollback plan documented
