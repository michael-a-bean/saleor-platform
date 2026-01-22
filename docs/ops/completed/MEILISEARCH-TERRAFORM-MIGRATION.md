# Meilisearch Terraform Migration

**Created:** 2026-01-22
**Purpose:** Migrate Meilisearch from manual deployment to Terraform-managed infrastructure
**Priority:** P0 - Production blocker

---

## Executive Summary

Meilisearch is currently manually deployed in `vpc-03bec79de659bddf7` but Terraform manages infrastructure in `vpc-0b0360f5c0c874c59`. This creates:
- **Infrastructure drift** - manual changes aren't tracked
- **Recovery risk** - can't recreate environment from code
- **Production blocker** - Meilisearch won't deploy to production

The Terraform module at `infra/terraform/modules/meilisearch/` is complete and production-ready. We need to migrate from manual to Terraform-managed deployment.

---

## Current State

### Manual Deployment (To Be Removed)
```
VPC: vpc-03bec79de659bddf7 (different from Terraform-managed)
Service: meilisearch.saleor-platform-staging.local:7700
Data: Index data exists but will be re-synced
Authentication: None (MEILI_MASTER_KEY not set)
```

### Terraform Module (Ready to Deploy)
```hcl
# infra/terraform/modules/meilisearch/main.tf
Features:
- EFS-backed persistent storage (Fargate-compatible)
- Service Discovery for internal DNS
- Secrets Manager for MEILI_MASTER_KEY
- Health checks and deployment circuit breaker
- Transit encryption for EFS
```

### Supporting Infrastructure (Already in main.tf)
```hcl
# Sync infrastructure (SNS → SQS → Worker)
- aws_sns_topic.product_events
- aws_sqs_queue.meilisearch_sync
- aws_sqs_queue.meilisearch_sync_dlq
- aws_ecs_task_definition.meilisearch_sync_worker

# Scheduled tasks
- 15-minute catchup sync (rate(15 minutes))
- Daily full reconciliation (cron(0 6 * * ? *))

# Monitoring
- DLQ depth alarm
- Queue backlog alarm
- Service health alarm
```

---

## Migration Steps

### Phase 1: Preparation (Non-Destructive)

1. **Create staging.tfvars file**
   ```hcl
   # infra/terraform/staging.tfvars
   environment        = "staging"
   meilisearch_enabled = true
   # Leave meilisearch_master_key empty to auto-generate
   ```

2. **Verify Terraform plan**
   ```bash
   cd infra/terraform
   terraform init
   terraform plan -var-file=staging.tfvars
   ```

   Expected: Plan should show creation of:
   - `module.meilisearch[0].aws_efs_file_system.meilisearch`
   - `module.meilisearch[0].aws_efs_access_point.meilisearch`
   - `module.meilisearch[0].aws_efs_mount_target.meilisearch[0]`
   - `module.meilisearch[0].aws_efs_mount_target.meilisearch[1]`
   - `module.meilisearch[0].aws_security_group.efs`
   - `module.meilisearch[0].aws_ecs_task_definition.meilisearch`
   - `module.meilisearch[0].aws_ecs_service.meilisearch`
   - `module.meilisearch[0].aws_service_discovery_service.meilisearch`
   - `aws_secretsmanager_secret.meilisearch_master_key[0]`
   - Plus SNS/SQS/scheduled task resources

3. **Document current index state**
   ```bash
   # Via saleor-mcp or curl
   curl http://meilisearch.saleor-platform-staging.local:7700/indexes | jq
   ```
   Save index names and document counts for verification.

### Phase 2: Remove Manual Deployment

> **Note:** Deletion of the current manually deployed Meilisearch is acceptable and expected. The manual deployment is in the wrong VPC, lacks proper authentication, and cannot be imported into Terraform state cleanly. Index data will be re-synced after the Terraform-managed deployment is running.

4. **Stop and delete manual ECS service**
   ```bash
   aws ecs update-service \
     --cluster saleor-platform-staging \
     --service meilisearch \
     --desired-count 0

   aws ecs delete-service \
     --cluster saleor-platform-staging \
     --service meilisearch \
     --force
   ```

5. **Delete manual task definition** (all revisions or deregister)
   ```bash
   aws ecs list-task-definitions \
     --family-prefix saleor-platform-staging-meilisearch \
     --query 'taskDefinitionArns'

   # For each:
   aws ecs deregister-task-definition \
     --task-definition <task-definition-arn>
   ```

6. **Delete manual Service Discovery service** (if exists)
   ```bash
   aws servicediscovery list-services \
     --filters Name=NAMESPACE_ID,Values=<namespace-id>,Condition=EQ

   aws servicediscovery delete-service \
     --id <service-id>
   ```

### Phase 3: Apply Terraform

7. **Apply Terraform configuration**
   ```bash
   cd infra/terraform
   terraform apply -var-file=staging.tfvars
   ```

8. **Wait for ECS service stability**
   ```bash
   aws ecs wait services-stable \
     --cluster saleor-platform-staging \
     --services meilisearch
   ```

9. **Verify Service Discovery**
   ```bash
   # Check DNS resolution from within VPC
   dig +short meilisearch.saleor-platform-staging.local
   ```

### Phase 4: Data Population

10. **Run full sync to populate indexes**
    ```bash
    # Option A: Via sync scripts
    python scripts/sync-meilisearch.py --channel webstore --full
    python scripts/sync-meilisearch.py --channel singles-builder --full

    # Option B: Manually trigger scheduled task
    aws events put-events --entries '[{
      "Source": "manual",
      "DetailType": "Meilisearch Full Sync",
      "Detail": "{\"mode\": \"full\"}",
      "EventBusName": "default"
    }]'
    ```

11. **Verify index health**
    ```bash
    # Via saleor-mcp
    curl http://meilisearch.saleor-platform-staging.local:7700/health
    curl http://meilisearch.saleor-platform-staging.local:7700/indexes | jq
    ```

### Phase 5: Verification

12. **Test storefront search**
    - Navigate to storefront search page
    - Verify autocomplete works
    - Verify search results return products

13. **Verify scheduled tasks are running**
    ```bash
    # Check EventBridge rules
    aws events list-rules --name-prefix saleor-platform-staging-meilisearch

    # Check recent task invocations
    aws logs filter-log-events \
      --log-group-name /ecs/saleor-platform-staging/meilisearch-sync-worker \
      --start-time $(date -d '1 hour ago' +%s000)
    ```

14. **Verify authentication**
    ```bash
    # Get the generated master key
    aws secretsmanager get-secret-value \
      --secret-id saleor/staging/meilisearch/master-key \
      --query SecretString --output text

    # Test authenticated endpoint
    curl -H "Authorization: Bearer <key>" \
      http://meilisearch.saleor-platform-staging.local:7700/keys
    ```

---

## Rollback Procedure

If issues occur, you can rollback by:

1. **Manually redeploy Meilisearch** (temporary)
   ```bash
   # Re-run manual ECS deployment using previous task definition
   aws ecs create-service \
     --cluster saleor-platform-staging \
     --service-name meilisearch \
     --task-definition saleor-platform-staging-meilisearch \
     --desired-count 1 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[...],securityGroups=[...],assignPublicIp=DISABLED}"
   ```

2. **Destroy Terraform Meilisearch resources** (if needed)
   ```bash
   terraform destroy -target=module.meilisearch -var-file=staging.tfvars
   ```

---

## Production Deployment

After staging is verified:

1. **Create production.tfvars**
   ```hcl
   environment          = "production"
   meilisearch_enabled  = true
   db_multi_az          = true
   db_deletion_protection = true
   # Production sizing (Council recommendation)
   # cpu = 1024, memory = 4096 (set in main.tf based on environment)
   ```

2. **Plan and apply to production**
   ```bash
   terraform plan -var-file=production.tfvars
   terraform apply -var-file=production.tfvars
   ```

3. **Initial index population**
   Run full sync for all channels after deployment.

---

## Success Criteria

- [ ] Meilisearch ECS service running with Terraform-managed task definition
- [ ] EFS mount successful (persistent data across restarts)
- [ ] Service Discovery DNS resolving correctly
- [ ] Secrets Manager master key configured
- [ ] Storefront search functional
- [ ] 15-minute catchup sync running
- [ ] Daily reconciliation scheduled
- [ ] CloudWatch alarms configured
- [ ] All infrastructure in same VPC as other services

---

## Related Files

| File | Purpose |
|------|---------|
| `infra/terraform/modules/meilisearch/main.tf` | Meilisearch module definition |
| `infra/terraform/modules/meilisearch/variables.tf` | Module input variables |
| `infra/terraform/main.tf:494-519` | Module invocation |
| `infra/terraform/main.tf:521-962` | Sync infrastructure (SNS/SQS/EventBridge/alarms) |
| `infra/terraform/variables.tf:375-386` | meilisearch_enabled, meilisearch_master_key |
| `docs/ops/diagnostics/2026-01-21-meilisearch-terraform-investigation.md` | Original investigation |

---

## Appendix: tfvars Template

```hcl
# infra/terraform/staging.tfvars

# Core
environment  = "staging"
project_name = "saleor-platform"
aws_region   = "us-west-2"

# Domain
domain_name = "your-domain.com"

# GitHub OIDC
github_org = "your-github-org"

# Meilisearch
meilisearch_enabled = true
# meilisearch_master_key = "" # Leave empty to auto-generate

# Optional: Alerting
# alert_sns_topic_arn = "arn:aws:sns:us-west-2:123456789:alerts"
```
