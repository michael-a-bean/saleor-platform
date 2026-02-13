# MTG Import App - Overnight Autonomous Build Prompt

**Created**: 2026-01-28
**Purpose**: Unattended overnight build of the complete MTG Import Saleor App

---

## How to Run

```bash
# Start new session with dangerously-skip-permissions for overnight unattended run
cd ~/saleor-platform
claude --dangerously-skip-permissions
```

Then paste the prompt below.

**Note:** AWS credentials must be configured (`~/.aws/credentials` or environment variables).

---

## Autonomous Build Prompt

```
/THEALGORITHM

Build the complete MTG Import Saleor App as specified in .claude/plans/mtg-import-app-plan.md

## Ideal State Criteria (ISC)

The app is COMPLETE when ALL of the following are true:

### Pre-Flight (AWS Resources)
- [ ] RDS database is running and accessible
- [ ] ECS services (api, worker) are running with desiredCount >= 1
- [ ] API health check passes
- [ ] GraphQL endpoint responds

### Infrastructure
- [ ] App scaffolded at `saleor-apps/apps/mtg-import/`
- [ ] Follows existing app patterns from `saleor-apps/apps/inventory-ops/`
- [ ] Prisma schema created and migrations run
- [ ] App installs successfully in Saleor dashboard
- [ ] `bun install` and `bun run build` succeed with zero errors

### Core Functionality
- [ ] Scryfall client downloads and caches bulk data
- [ ] Job queue (Prisma-based) creates, runs, and tracks jobs
- [ ] Priority column works (0=prerelease, 1=reprint, 2=backfill)
- [ ] QueueService interface allows future BullMQ swap

### Import Pipeline
- [ ] Products created via GraphQL mutations (triggers webhooks)
- [ ] Variants created with all finishes (nonfoil, foil, etched)
- [ ] Channel listings created for both channels
- [ ] Checkpoint/resume works (can stop and restart import)
- [ ] Both `price_amount` AND `discounted_price_amount` set (prevents crashes)

### Audit System
- [ ] Set-level audit compares Scryfall vs Saleor
- [ ] Tracks: variant_count, priced_count, indexed_count, sellable_timestamp
- [ ] Missing card detection works
- [ ] Remediation jobs can be created from audit results

### Dashboard UI
- [ ] Import status page shows job progress
- [ ] New set import trigger works
- [ ] Audit trigger and results display
- [ ] Job history with logs

### Validation
- [ ] TypeScript compiles with zero errors
- [ ] ESLint passes
- [ ] All critical paths have error handling
- [ ] No hardcoded secrets or credentials

## Execution Instructions

1. **Spin up AWS resources if needed** (see AWS Resource Management below)
2. **Read the plan first**: `.claude/plans/mtg-import-app-plan.md`
3. **Study existing patterns**: `saleor-apps/apps/inventory-ops/` for job queue, Prisma, tRPC
4. **Follow project rules**: Check `.claude/rules/` especially database.md and git-workflow.md
5. **Work on correct branch**: Must be `platform/main` or `feature/*`, NEVER `main`

## AWS Resource Management

Before starting implementation, check if staging resources are running. If scaled down, spin them up.

### Check and Start ECS Services

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services saleor-platform-staging-api saleor-platform-staging-worker \
  --region us-west-1 \
  --query 'services[*].[serviceName,desiredCount,runningCount]' \
  --output table

# If desiredCount is 0, scale up API
aws ecs update-service \
  --cluster saleor-platform-staging \
  --service saleor-platform-staging-api \
  --desired-count 1 \
  --region us-west-1

# Scale up worker if needed
aws ecs update-service \
  --cluster saleor-platform-staging \
  --service saleor-platform-staging-worker \
  --desired-count 1 \
  --region us-west-1

# Scale up apps service (for Saleor Apps including the new mtg-import)
aws ecs update-service \
  --cluster saleor-platform-staging \
  --service saleor-platform-staging-apps \
  --desired-count 1 \
  --region us-west-1
```

### Check RDS Status

```bash
# Check if RDS is available
aws rds describe-db-instances \
  --db-instance-identifier saleor-platform-staging \
  --region us-west-1 \
  --query 'DBInstances[0].DBInstanceStatus'

# If stopped, start it
aws rds start-db-instance \
  --db-instance-identifier saleor-platform-staging \
  --region us-west-1

# Wait for it to become available (can take 5-10 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier saleor-platform-staging \
  --region us-west-1
```

### Check ElastiCache/Valkey

```bash
# Check cache cluster status
aws elasticache describe-cache-clusters \
  --cache-cluster-id saleor-platform-staging \
  --region us-west-1 \
  --query 'CacheClusters[0].CacheClusterStatus'
```

### Verify Services Are Ready

After spinning up, verify connectivity:

```bash
# Wait for API to respond (may take 2-3 minutes after ECS starts)
# Using ALB DNS since staging doesn't have custom domain
ALB_URL="http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com"

timeout 300 bash -c "until curl -s ${ALB_URL}/graphql/ > /dev/null; do sleep 10; done"

# Check GraphQL endpoint
curl -s "${ALB_URL}/graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ shop { name } }"}' | jq .
```

### Resource Spin-Up Sequence

Execute in this order (dependencies):
1. RDS (database) - wait for available
2. ElastiCache (if applicable)
3. ECS services (API, worker)
4. Wait for health checks to pass

## Implementation Order

Execute phases in order, validating each before proceeding:

### Phase 0: AWS Resource Spin-Up
1. Check RDS status, start if stopped, wait for available
2. Check ECS services (api, worker, apps), scale to desiredCount=1 if at 0
3. Wait for API health check to pass (up to 5 minutes)
4. Verify GraphQL endpoint responds
5. **Validation**: `curl http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/graphql/` returns valid response

### Phase 1: App Scaffold
1. Create `saleor-apps/apps/mtg-import/` directory structure
2. Copy boilerplate from inventory-ops (package.json, tsconfig, etc.)
3. Set up Prisma schema with ImportJob, ImportedProduct, SetAudit models
4. Create app manifest and registration routes
5. **Validation**: `bun install && bun run build` succeeds

### Phase 2: Scryfall Client
1. Implement bulk data download from Scryfall
2. Add local caching (don't re-download if recent)
3. Implement set API client
4. Implement card search client
5. **Validation**: Can fetch and parse bulk data, extract card by set

### Phase 3: Job Queue
1. Implement QueueService interface
2. Implement PrismaQueueService
3. Add priority column handling
4. Implement job processor with polling
5. **Validation**: Can create job, process it, mark complete

### Phase 4: Import Pipeline
1. Implement Scryfall → Saleor transform
2. Implement GraphQL product creation
3. Implement variant creation (all finishes)
4. Implement channel listing creation
5. Implement checkpoint/resume
6. **Validation**: Can import a single set end-to-end

### Phase 5: Audit System
1. Implement SetAudit model
2. Implement set comparison (Scryfall vs Saleor)
3. Calculate sellable completeness metrics
4. Implement remediation job creation
5. **Validation**: Can audit a set and identify gaps

### Phase 6: Dashboard UI
1. Create import status page
2. Create new set import trigger
3. Create audit UI
4. Create job history view
5. **Validation**: All pages render without errors

## Key Files to Reference

Read these before starting:
- `.claude/plans/mtg-import-app-plan.md` - Full design spec
- `saleor-apps/apps/inventory-ops/` - Pattern to follow
- `docs/reference/sync-contracts.md` - Webhook integration
- `.claude/rules/database.md` - discounted_price_amount gotcha

## Error Handling

If you encounter errors:
1. Log the error clearly
2. Attempt to fix automatically
3. If unfixable, document in `.claude/issues/mtg-import-build-issues.md`
4. Continue with next phase if possible

## Commit Strategy

- Commit after each phase completes successfully
- Use descriptive commit messages
- Format: `feat(mtg-import): Phase N - [description]`
- Do NOT commit broken code

## Success Criteria

The overnight build is SUCCESSFUL if:
1. All ISC checkboxes can be marked complete
2. `bun run build` succeeds in the mtg-import app
3. App can be installed in Saleor dashboard
4. At least one set can be imported end-to-end
5. Audit can detect missing cards in a set

Document final status in `.claude/plans/mtg-import-build-report.md`
```

---

## Permission Changes Required

The `--dangerously-skip-permissions` flag auto-accepts all tool use. This is required for overnight unattended operation.

**Alternative (more granular):**
```bash
claude --allowedTools "Edit,Write,Read,Glob,Grep,Bash,Task"
```

---

## Post-Run Validation

After the overnight run, verify:

```bash
cd ~/saleor-platform/saleor-apps/apps/mtg-import

# Check build
bun install
bun run build

# Check TypeScript
bun run typecheck

# Check ESLint
bun run lint

# Check Prisma
bunx prisma generate
bunx prisma migrate status
```

---

## Rollback

If the build fails catastrophically:

```bash
# Check what was created
git status

# Revert all changes if needed
git checkout -- .
git clean -fd

# Or create a WIP branch
git checkout -b wip/mtg-import-overnight-attempt
git add -A
git commit -m "WIP: overnight build attempt"
```

---

## Post-Completion: Spin Down Resources (Optional)

If you want to spin down staging resources after the build to save costs:

```bash
# Scale down ECS services
aws ecs update-service \
  --cluster saleor-platform-staging \
  --service saleor-platform-staging-api \
  --desired-count 0 \
  --region us-west-1

aws ecs update-service \
  --cluster saleor-platform-staging \
  --service saleor-platform-staging-worker \
  --desired-count 0 \
  --region us-west-1

aws ecs update-service \
  --cluster saleor-platform-staging \
  --service saleor-platform-staging-apps \
  --desired-count 0 \
  --region us-west-1

# Stop RDS (saves significant cost)
aws rds stop-db-instance \
  --db-instance-identifier saleor-platform-staging \
  --region us-west-1
```

**Note:** Add `--spin-down-after` to the prompt if you want automatic spin-down after completion.
