# Migration Execution Model

**Generated**: 2026-01-10
**Purpose**: Document how Django and Prisma migrations execute in ECS
**Scope**: Both staging and production environments

---

## Overview

This platform runs two separate database migration systems:

1. **Django Migrations**: Saleor API schema (PostgreSQL `saleor` database)
2. **Prisma Migrations**: Inventory operations schema (PostgreSQL `inventory_ops` database)

Both run as ECS one-off tasks before service deployment.

---

## Database Architecture

```
RDS PostgreSQL Instance(s)
├── Database: saleor
│   ├── Owner: saleor (user)
│   ├── Schema: public (Django-managed)
│   └── Used by: api, worker
│
└── Database: inventory_ops
    ├── Owner: saleor or inventory (user)
    ├── Schema: public (Prisma-managed)
    └── Used by: inventory-ops-app, pos-app
```

**Staging**: Both databases on same RDS instance
**Production**: Option for separate RDS instances (see `create_separate_inventory_db` variable)

---

## Migration Execution Flow

### Workflow Execution Order

```
deploy-staging.yml / deploy-production.yml

1. build (parallel: all images)
     ↓
2. migrate
   a. Create pre-migration RDS snapshot
   b. Run Django migrations (Saleor)
   c. Run Prisma migrations (inventory_ops)
     ↓
3. deploy (parallel: api, worker, storefront, dashboard)
     ↓
4. deploy-apps (parallel: stripe-app, inventory-ops-app, etc.)
     ↓
5. smoke-test
```

**Critical**: Migrations MUST complete before any service deployment.

---

## Django Migrations

### Task Definition

```hcl
# infra/terraform/modules/ecs/main.tf
resource "aws_ecs_task_definition" "migrate" {
  family = "${local.name_prefix}-migrate"
  container_definitions = [{
    name    = "migrate"
    image   = var.saleor_api_image  # Same as API
    command = ["python", "manage.py", "migrate", "--noinput"]
    secrets = [
      { name = "SECRET_KEY", valueFrom = "...api/SECRET_KEY" },
      { name = "DATABASE_URL", valueFrom = "...api/DATABASE_URL" }
    ]
  }]
}
```

### Execution

```bash
# scripts/deploy/aws/run-migrations.sh staging django

1. Get network config from existing API service
2. Verify container "migrate" exists in task definition
3. Run ECS task with command override
4. Wait for task completion
5. Check exit code (0 = success)
```

### SSM Parameters Required

| Parameter | Example Value |
|-----------|---------------|
| `/saleor/{env}/api/SECRET_KEY` | `abc123...` (generated) |
| `/saleor/{env}/api/DATABASE_URL` | `postgresql://saleor:pass@rds-endpoint:5432/saleor` |

### Expected Behavior

- First run: Creates all Saleor tables (~100+ migrations)
- Subsequent runs: Applies only new migrations
- Duration: 30 seconds (empty) to 5+ minutes (initial or large migration)

### Common Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `relation does not exist` | DATABASE_URL wrong | Verify SSM parameter |
| `permission denied` | User lacks CREATE | Check RDS user permissions |
| `Migration conflicts` | Code and DB out of sync | May need manual resolution |
| `TimeoutError` | RDS not reachable | Check security groups |

---

## Prisma Migrations

### Task Definition

**CURRENT GAP**: No dedicated Prisma migration task definition in Terraform.

The migration script uses `inventory-ops-app` task definition, which may not exist on first deploy.

**Workaround**: Use inventory-ops-app task definition with command override.

### Execution

```bash
# scripts/deploy/aws/run-migrations.sh staging prisma

1. Get network config from existing API service
2. Use task definition: saleor-platform-{env}-inventory-ops-app
3. Verify container "inventory-ops-app" exists
4. Run with command: ["npx", "prisma", "migrate", "deploy"]
5. Wait for completion
```

### SSM Parameters Required

| Parameter | Example Value |
|-----------|---------------|
| `/saleor/{env}/inventory-ops-app/DATABASE_URL` | `postgresql://saleor:pass@rds-endpoint:5432/inventory_ops` |

### Expected Behavior

- First run: Creates inventory_ops schema (WAC, purchase orders, etc.)
- Subsequent runs: Applies pending migrations
- Duration: 10 seconds (empty) to 2+ minutes (initial)

### Common Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Database does not exist` | inventory_ops DB not created | Create DB manually (see MANUAL_STEPS.md) |
| `P1001: Can't reach database` | Wrong connection string | Verify SSM parameter |
| `Migration has already been applied` | Re-run is idempotent | Not an error, just informational |

---

## Migration Safety Requirements

### Pre-Migration Snapshot (Staging)

```yaml
# Snapshot creation initiated, not waited
aws rds create-db-snapshot \
  --db-instance-identifier saleor-platform-staging-saleor \
  --db-snapshot-identifier "saleor-platform-staging-pre-migrate-${TIMESTAMP}"
```

**Behavior**: Fire-and-forget. Snapshot may not be complete before migrations run.

### Pre-Migration Snapshot (Production)

```yaml
# Wait for snapshot completion
aws rds create-db-snapshot ...
aws rds wait db-snapshot-available --db-snapshot-identifier "${SNAPSHOT_ID}"
```

**Behavior**: Blocking. Migrations don't start until snapshot is available.

---

## Migration Ordering

### Django Before Prisma

Current order: Django → Prisma

**Rationale**:
- Django migrations create Saleor core schema
- Prisma migrations create inventory extension schema
- No cross-dependencies between schemas

**Cross-Database Dependencies**: None known. Each migration system targets a different database.

### If Both Target Same Database

If you merge inventory_ops into saleor database:
- Run Django first (creates product tables)
- Run Prisma second (may reference products)
- Ensure Prisma schema doesn't conflict with Django tables

---

## Idempotency

### Django

- Maintains `django_migrations` table tracking applied migrations
- Re-running `migrate --noinput` is safe (skips applied migrations)
- Never re-applies migrations unless the table is cleared

### Prisma

- Maintains `_prisma_migrations` table
- `prisma migrate deploy` is idempotent
- Will error if migrations have been manually modified

---

## Rollback Considerations

### Database Rollbacks Are NOT Automated

The rollback script (`rollback.sh`) only rolls back ECS services, NOT database migrations.

**Why**:
- Django has no automated reverse migrations in production mode
- Prisma reverse migrations can lose data
- Database state is harder to revert than application state

### Manual Rollback Procedure

1. **Stop the rollout**: Cancel workflow or let it fail
2. **Assess damage**: Are the new migrations forward-compatible?
3. **If forward-compatible**: Roll back services only, leave DB as-is
4. **If incompatible**: Restore from pre-migration snapshot

### Forward-Compatible Migrations (Expand-Contract Pattern)

Safe migrations that allow rollback:
```sql
-- Expand: Add column with default
ALTER TABLE products ADD COLUMN new_field VARCHAR(100) DEFAULT '';

-- Later: Contract (after code no longer uses old pattern)
ALTER TABLE products DROP COLUMN old_field;
```

Unsafe migrations:
```sql
-- Cannot rollback: Data destroyed
ALTER TABLE products DROP COLUMN important_field;
```

---

## Environment Variables

### For Django Migrations

```bash
SECRET_KEY         # From SSM (required)
DATABASE_URL       # From SSM: postgresql://user:pass@host:5432/saleor
DEBUG              # "false"
```

### For Prisma Migrations

```bash
DATABASE_URL       # From SSM: postgresql://user:pass@host:5432/inventory_ops
```

---

## Network Requirements

Migration tasks need:
- **Outbound to RDS**: Port 5432 via security group
- **Subnets**: Same private subnets as API service
- **Security Group**: Same as backend tasks (allows RDS access)

The migration script inherits network config from the API service:
```bash
NETWORK_CONFIG=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services api \
    --query 'services[0].networkConfiguration')
```

---

## IAM Requirements

### ECS Task Execution Role

Required permissions:
- `ssm:GetParameter` for `/saleor/{env}/api/*`
- `ssm:GetParameter` for `/saleor/{env}/inventory-ops-app/*`
- `logs:CreateLogStream`, `logs:PutLogEvents`

### ECS Task Role

Required permissions:
- None (migrations don't access AWS services, only database)

---

## Monitoring

### CloudWatch Log Groups

| Migration Type | Log Group |
|----------------|-----------|
| Django | `/ecs/saleor-platform-{env}/migrate` |
| Prisma | `/ecs/saleor-platform-{env}/inventory-ops-app` |

### Viewing Logs

```bash
# Django migration logs
aws logs tail /ecs/saleor-platform-staging/migrate --follow

# Prisma migration logs
aws logs tail /ecs/saleor-platform-staging/inventory-ops-app --follow
```

---

## First Deploy Blockers

### 1. inventory_ops Database Doesn't Exist

**Symptom**: Prisma migration fails with "database does not exist"

**Fix**: Create database before first deploy
```sql
-- Connect to RDS as saleor user
CREATE DATABASE inventory_ops;
```

### 2. inventory-ops-app Task Definition Doesn't Exist

**Symptom**: Migration script fails with "Task definition not found"

**Fix Options**:
1. Add task definition to Terraform (recommended)
2. Comment out Prisma migrations for first deploy
3. Create task definition manually via AWS CLI

### 3. SSM Parameters Not Created

**Symptom**: Task fails to start with "Unable to retrieve secret"

**Fix**: Create all required SSM parameters (see MANUAL_STEPS.md)

---

## Summary Checklist

Before first deployment:

- [ ] RDS instance created and accessible
- [ ] `saleor` database exists
- [ ] `inventory_ops` database exists
- [ ] SSM parameters created for API
- [ ] SSM parameters created for inventory-ops-app
- [ ] Migrate task definition exists (Terraform)
- [ ] inventory-ops-app task definition exists (if running Prisma migrations)
- [ ] Security group allows ECS → RDS on port 5432
