# Rollback Runbook

This runbook covers rollback procedures for the Saleor Platform on AWS ECS/Fargate.

## Important Limitations

**Database migrations are NOT automatically rolled back.**

- ECS rollback only reverts container images
- If migrations were applied, the database schema may be incompatible with old code
- Always use expand/contract migrations to enable safe rollback

## ECS Service Rollback

### Using the Rollback Script

```bash
# Rollback all services to previous task definition
./scripts/deploy/aws/rollback.sh production

# Rollback specific service
./scripts/deploy/aws/rollback.sh production api
```

### Manual ECS Rollback

1. Find previous task definition revision:
   ```bash
   aws ecs list-task-definitions \
     --family-prefix saleor-platform-production-api \
     --sort DESC \
     --max-items 5
   ```

2. Update service to use previous revision:
   ```bash
   aws ecs update-service \
     --cluster saleor-platform-production \
     --service api \
     --task-definition saleor-platform-production-api:123 \
     --force-new-deployment
   ```

3. Wait for service to stabilize:
   ```bash
   aws ecs wait services-stable \
     --cluster saleor-platform-production \
     --services api
   ```

### GitHub Actions Automatic Rollback

The production deployment workflow includes automatic rollback on failure:
- If deployment fails, previous task definitions are restored
- Check workflow logs for rollback status
- Manual verification still required

## Database Rollback

### Scenario: Migration Broke Production

If a migration caused data issues:

1. **Assess the damage:**
   - What tables/columns were affected?
   - Is the old code compatible with current schema?

2. **Option A: Forward Fix (Preferred)**
   - Deploy a fix that handles both old and new schema
   - Create a new migration to fix the issue
   - Deploy the fix

3. **Option B: Restore from Snapshot**
   - Only if data was corrupted
   - Will cause data loss since snapshot time
   - See `backups.md` for restore procedure

### Preventing Migration Issues

Follow the expand/contract pattern:

**Expand Phase (safe):**
- Add new columns with defaults
- Add new tables
- Add new indexes

**Contract Phase (deploy after expand is stable):**
- Remove old columns
- Remove old tables
- Remove old indexes

**Never in one migration:**
- Rename columns (add new, migrate data, remove old)
- Change column types (add new, migrate, remove old)
- Remove columns still used by old code

## Rollback Decision Tree

```
Deployment Failed?
├── Yes
│   └── Automatic rollback triggered
│       └── Verify services recovered
│           ├── Yes → Monitor and investigate
│           └── No → Manual intervention needed
│
└── No, but issues found post-deploy
    └── Are migrations backward compatible?
        ├── Yes → Safe to rollback ECS
        │   └── Run: ./scripts/deploy/aws/rollback.sh production
        │
        └── No → Need forward fix
            └── Option 1: Deploy hotfix
            └── Option 2: Restore from snapshot (data loss)
```

## Rollback Checklist

- [ ] Identify what broke (service, migration, data)
- [ ] Check if migrations are backward compatible
- [ ] If safe, run rollback script
- [ ] Verify services are healthy
- [ ] Verify functionality restored
- [ ] Document incident for post-mortem
- [ ] Notify affected stakeholders

## Post-Rollback Steps

1. **Verify Recovery:**
   ```bash
   # Check service health
   curl https://api.example.com/health/

   # Check GraphQL
   curl -X POST https://api.example.com/graphql/ \
     -H "Content-Type: application/json" \
     -d '{"query": "{ channels { slug } }"}'
   ```

2. **Check Logs:**
   - CloudWatch Logs for errors
   - ECS service events for issues

3. **Create Incident Report:**
   - What failed?
   - What was the impact?
   - How was it resolved?
   - How to prevent in future?

4. **Fix and Re-deploy:**
   - Address root cause
   - Test thoroughly on staging
   - Re-deploy when ready
