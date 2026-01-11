# Backups Runbook

This runbook covers backup and recovery procedures for the Saleor Platform on AWS.

## Backup Overview

| Component | Backup Method | Retention | RTO | RPO |
|-----------|--------------|-----------|-----|-----|
| RDS PostgreSQL | Automated snapshots | 7 days (staging), 35 days (prod) | ~30 min | ~5 min (Multi-AZ) |
| S3 Media | Versioning | 365 days to Glacier | Immediate | None (always current) |
| ElastiCache Redis | Redis backup | 7 days | ~15 min | Last backup |
| ECS Task Definitions | AWS managed | Unlimited revisions | Immediate | None |

## RDS Backups

### Automated Snapshots

RDS automatically takes daily snapshots during the backup window (03:00-04:00 UTC).

Configuration:
- **Staging**: 7 days retention
- **Production**: 35 days retention, Multi-AZ for HA

### Manual Snapshots

Create a manual snapshot before risky operations:

```bash
# Create snapshot
aws rds create-db-snapshot \
  --db-instance-identifier saleor-platform-production-saleor \
  --db-snapshot-identifier saleor-platform-production-manual-$(date +%Y%m%d-%H%M%S)

# Wait for completion
aws rds wait db-snapshot-available \
  --db-snapshot-identifier <snapshot-id>
```

### Pre-Deployment Snapshots

Deployment workflows automatically create snapshots before migrations:
- Snapshot ID format: `saleor-platform-{env}-pre-deploy-{timestamp}` (production) or `saleor-platform-{env}-pre-migrate-{timestamp}` (staging)
- These are in addition to automated daily snapshots

#### Snapshot Policy by Environment

| Environment | Behavior | Wait for Completion | Rationale |
|-------------|----------|---------------------|-----------|
| **Staging** | Best-effort, async | No | Faster deploys; staging data less critical |
| **Production** | Required, blocking | Yes (with timeout) | Guaranteed recovery point before migrations |

#### Production Snapshot Timeout

Production deployments wait for the snapshot to become `available` before proceeding with migrations. This ensures a verified recovery point exists.

**Configuration Variables** (set in GitHub Actions repository variables):

| Variable | Default | Description |
|----------|---------|-------------|
| `SNAPSHOT_WAIT_TIMEOUT_SECONDS` | `1800` (30 min) | Maximum time to wait for snapshot |
| `ALLOW_DEPLOY_WITHOUT_SNAPSHOT_WAIT` | `false` | Emergency override to proceed without verified snapshot |

**Timeout Behavior:**
- The workflow polls RDS every 30 seconds until snapshot status is `available`
- If timeout is reached and `ALLOW_DEPLOY_WITHOUT_SNAPSHOT_WAIT=false`: **workflow fails**
- If timeout is reached and `ALLOW_DEPLOY_WITHOUT_SNAPSHOT_WAIT=true`: **workflow proceeds with warning**

**When to Adjust Timeout:**
- Large databases (>100GB) may need longer timeout (e.g., 3600s)
- If snapshots consistently timeout, check RDS performance or increase timeout

**Emergency Override:**
Only use `ALLOW_DEPLOY_WITHOUT_SNAPSHOT_WAIT=true` when:
1. A critical hotfix must deploy immediately
2. You accept the risk of no verified pre-migration backup
3. You have verified recent automated snapshot exists

```bash
# Check for recent automated snapshots before using override
aws rds describe-db-snapshots \
  --db-instance-identifier saleor-platform-production-saleor \
  --query 'DBSnapshots[?Status==`available`]|sort_by(@, &SnapshotCreateTime)[-1].[DBSnapshotIdentifier,SnapshotCreateTime]' \
  --output table
```

### Listing Snapshots

```bash
# List all snapshots for an instance
aws rds describe-db-snapshots \
  --db-instance-identifier saleor-platform-production-saleor \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table
```

## Restore Procedures

### Scenario 1: Point-in-Time Recovery (Last 5 Minutes)

For Multi-AZ production, restore to a specific point in time:

```bash
# Find the latest restorable time
aws rds describe-db-instances \
  --db-instance-identifier saleor-platform-production-saleor \
  --query 'DBInstances[0].LatestRestorableTime'

# Restore to new instance
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier saleor-platform-production-saleor \
  --target-db-instance-identifier saleor-platform-production-restored \
  --restore-time 2024-01-15T10:30:00Z \
  --db-subnet-group-name saleor-platform-production-db-subnet \
  --vpc-security-group-ids sg-xxxxxxxx
```

### Scenario 2: Restore from Snapshot

```bash
# Restore to new instance from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier saleor-platform-production-restored \
  --db-snapshot-identifier saleor-platform-production-pre-migrate-20240115-103000 \
  --db-subnet-group-name saleor-platform-production-db-subnet \
  --vpc-security-group-ids sg-xxxxxxxx

# Wait for instance to be available
aws rds wait db-instance-available \
  --db-instance-identifier saleor-platform-production-restored
```

### Post-Restore Steps

1. **Verify Data:**
   ```bash
   # Connect to restored instance
   psql -h <restored-endpoint> -U saleor -d saleor
   # Run verification queries
   ```

2. **Update SSM Parameters:**
   ```bash
   # Update DATABASE_URL to point to restored instance
   aws ssm put-parameter \
     --name "/saleor/production/api/DATABASE_URL" \
     --type "SecureString" \
     --value "postgresql://saleor:xxx@<restored-endpoint>:5432/saleor" \
     --overwrite
   ```

3. **Restart Services:**
   ```bash
   # Force new deployment to pick up new connection string
   aws ecs update-service \
     --cluster saleor-platform-production \
     --service api \
     --force-new-deployment
   ```

4. **Rename Instances (Optional):**
   ```bash
   # Delete or rename old instance
   # Rename restored instance to original name
   ```

## S3 Media Recovery

### Object Versioning

S3 bucket has versioning enabled. To recover deleted or modified files:

```bash
# List object versions
aws s3api list-object-versions \
  --bucket saleor-platform-media-production-123456789012 \
  --prefix path/to/file

# Restore specific version
aws s3api copy-object \
  --bucket saleor-platform-media-production-123456789012 \
  --copy-source saleor-platform-media-production-123456789012/path/to/file?versionId=xxx \
  --key path/to/file
```

### Bulk Recovery

For bulk recovery of accidentally deleted files:

```bash
# List delete markers
aws s3api list-object-versions \
  --bucket saleor-platform-media-production-123456789012 \
  --prefix media/ \
  --query 'DeleteMarkers[?IsLatest==`true`].[Key,VersionId]' \
  --output text

# Remove delete markers to restore files
# (Script this for bulk operations)
```

## ElastiCache Backups

### Manual Backup

```bash
# Create backup
aws elasticache create-snapshot \
  --replication-group-id saleor-platform-production-cache \
  --snapshot-name saleor-platform-production-cache-manual-$(date +%Y%m%d)
```

### Restore from Backup

```bash
# Restore to new cluster
aws elasticache create-replication-group \
  --replication-group-id saleor-platform-production-cache-restored \
  --replication-group-description "Restored from backup" \
  --snapshot-name <snapshot-name> \
  --cache-subnet-group-name saleor-platform-production-redis \
  --security-group-ids sg-xxxxxxxx
```

## Disaster Recovery

### Complete Environment Recovery

In case of complete environment loss:

1. **Restore RDS from latest snapshot**
2. **Restore ElastiCache if needed (or recreate - data is cacheable)**
3. **Verify S3 bucket is accessible**
4. **Run Terraform to recreate infrastructure:**
   ```bash
   cd infra/terraform
   terraform init
   terraform plan -var-file=environments/production.tfvars
   terraform apply -var-file=environments/production.tfvars
   ```
5. **Update DNS if endpoints changed**
6. **Verify all services**

### Cross-Region Recovery

For cross-region disaster recovery:
1. Enable cross-region RDS snapshot copy
2. Replicate S3 bucket cross-region
3. Maintain Terraform state in different region
4. Document region-specific configurations

## Backup Verification

### Monthly Verification Checklist

- [ ] Verify automated snapshots are being created
- [ ] Test restore from recent snapshot to test instance
- [ ] Verify S3 versioning is working
- [ ] Verify ElastiCache backups if configured
- [ ] Document any issues and remediate
