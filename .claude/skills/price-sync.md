# Price Sync Skill

> **Full implementation**: `saleor-apps/apps/inventory-ops/src/modules/price-sync/`

## When to Use

- Syncing Scryfall market prices to Saleor variants
- Running delta or full price updates
- Investigating price anomalies or trends
- Reviewing and approving batch price changes

## Architecture Overview

Price sync operates as a job-based system with approval workflow:

1. **Jobs**: Triggered via dashboard or scheduled, creates pending updates
2. **Reports**: Generated after job completion with anomaly detection
3. **Approval**: Manual review for anomalies, auto-approve for small changes
4. **Snapshots**: Historical price records for trend analysis

## Job Types

| Type | Use Case | Notes |
|------|----------|-------|
| `FULL` | Initial import or recovery | Processes all variants from Scryfall bulk data |
| `DELTA` | Daily incremental updates | Processes variants active in lookback period |
| `VARIANT` | Single variant update | Immediate, bypasses job queue |

## Dashboard Endpoints (tRPC)

**Status & History:**
- `priceSync.getStatus` - Current sync state, active job info
- `priceSync.getHistory` - Recent price snapshots
- `priceSync.getStatsBySource` - Counts by price source
- `priceSync.getVariantHistory` - Price history for specific variant

**Job Management:**
- `priceSync.getJobs` - List sync jobs with pagination
- `priceSync.triggerFullSync` - Start full catalog sync
- `priceSync.triggerDeltaSync` - Start delta sync (configurable lookback)
- `priceSync.triggerVariantSync` - Sync single variant
- `priceSync.cancelJob` - Cancel pending job

**Reports & Approval:**
- `priceSync.getReport` - Get sync report by job ID
- `priceSync.getPendingReports` - List reports awaiting review
- `priceSync.getPendingUpdates` - Get individual price changes
- `priceSync.approveAll` - Approve all pending updates
- `priceSync.approveSelected` - Approve specific updates
- `priceSync.rejectAll` - Reject all pending updates
- `priceSync.rejectSelected` - Reject specific updates

**Settings:**
- `priceSync.getSettings` - Get anomaly thresholds, auto-approve rules
- `priceSync.updateSettings` - Configure sync behavior

## Anomaly Detection

The system flags anomalies based on configurable threshold (default 10%):

```typescript
// Example: Flag any price change > 10%
anomalyThreshold: 10.0

// Example: Auto-approve changes < 5%
autoApproveBelow: 5.0
```

**Anomaly reasons tracked:**
- Price spike (large increase)
- Price drop (large decrease)
- Missing historical data
- Source mismatch

## Trend Analysis

Each pending update includes trend data:
- `trend7Day` / `trend7DayPercent` - 7-day price direction
- `trend30Day` / `trend30DayPercent` - 30-day price direction
- `changeDirection` - UP, DOWN, or UNCHANGED

## Database Schema

**Key tables in inventory-ops Prisma schema:**
- `PriceSyncJob` - Job queue with status tracking
- `PriceSyncReport` - Aggregate stats per job
- `PendingPriceUpdate` - Individual price changes awaiting approval
- `SellPriceSnapshot` - Historical price records
- `PriceSyncSettings` - Installation-specific configuration

## Common Operations

### Check sync status
```bash
# Via GraphQL playground or dashboard
# Call priceSync.getStatus to see:
# - Last sync timestamp
# - Variants with prices
# - Updates in last 24h
# - Active job status
```

### Trigger delta sync for last 7 days
```bash
# Via dashboard or direct tRPC call
# Params: lookbackDays: 7, limit: 1000
```

### Investigate price anomalies
```bash
# 1. Get pending reports: priceSync.getPendingReports
# 2. View specific report: priceSync.getReport({ jobId })
# 3. Check anomalies: priceSync.getPendingUpdates({ jobId, anomaliesOnly: true })
# 4. Approve/reject: priceSync.approveSelected or rejectSelected
```

## Related Documentation

- `.claude/skills/inventory-ops.md` - Parent app overview
- `docs/reference/sync-contracts.md` - Contract 2: Price Sync
- `docs-private/.claude/plans/mvp-completion-plan.md` - Original implementation context
- `docs/SCRYFALL_SYNC_STATUS.md` - Scryfall data sync status

## Verification Commands

```bash
# Check if price-sync router exists
ls -la saleor-apps/apps/inventory-ops/src/modules/price-sync/

# Check for recent price sync logs
tail -50 logs/price-sync.log

# Check Prisma schema for price tables
grep -A5 "model PriceSyncJob" saleor-apps/apps/inventory-ops/prisma/schema.prisma
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Job stuck in PENDING | Worker not running | Check ECS task logs |
| No price updates | Scryfall bulk data stale | Re-download bulk data |
| All prices flagged anomaly | Threshold too low | Increase `anomalyThreshold` |
| Approval not persisting | Prisma connection issue | Check database connectivity |
