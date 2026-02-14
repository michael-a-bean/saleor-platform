# Expected Terraform Divergence

**Last Updated:** 2026-02-14
**Source:** Council analysis of AWS architecture drift

This document catalogs **intentional drift** between Terraform state and AWS reality. Consult this before interpreting `terraform plan` output to distinguish expected changes from actual drift.

---

## ECS Task Definitions (Intentional - Always Stale)

All ECS services use `lifecycle { ignore_changes = [task_definition] }` to allow CI/CD deployments without Terraform interference.

**Affected Services:**
- `api` - Saleor API
- `worker` - Celery worker
- `storefront` - Next.js storefront
- `dashboard` - Saleor Dashboard
- `stripe` - Stripe payment app
- `inventory-ops` - Inventory operations app
- `buylist` - Customer buylist app
- `pos` - Point of sale app
- `meilisearch` - Search service

**Why This Exists:**

Task definitions are versioned resources in AWS. Each deployment creates a new revision:
- CI/CD deploys `task-definition:42`
- Terraform state still references `task-definition:35`
- This is expected - Terraform should NOT overwrite CI/CD deployments

**Security Implication:**

This pattern creates audit blind spots. A compromised deployment could modify:
- IAM role assignments
- Secret references
- Network configuration

**Audit Strategy:**

Quarterly comparison of running task definition vs Terraform state:

```bash
# Get running task definition
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services api \
  --query 'services[0].taskDefinition'

# Compare against Terraform
terraform state show 'module.ecs.aws_ecs_task_definition.api'
```

---

## HTTPS Migration (2026-02-14)

Staging now uses HTTPS with custom domain `*.staging.michaelbean.org`.

### What Changed

| Component | Before | After |
|-----------|--------|-------|
| Domain | ALB DNS name (HTTP only) | `staging.michaelbean.org` (HTTPS) |
| ACM Certificate | None | Wildcard `*.staging.michaelbean.org` + apex |
| ALB HTTP Listener | Forward to storefront (default) | 301 redirect to HTTPS |
| ALB HTTPS Listener | None | Host-based routing on port 443 |
| ALB Routing | Path-based on HTTP listener | Host-based on HTTPS listener |
| Route53 Records | None | api, www, dashboard, apps, apex → ALB |

### Routing Topology Change

**Before (HTTP, path-based):**
- `alb-dns:80/graphql/*` → API target group
- `alb-dns:80/dashboard/*` → Dashboard target group
- `alb-dns:80/apps/stripe/*` → Stripe target group
- `alb-dns:80` (default) → Storefront target group

**After (HTTPS, host-based):**
- `api.staging.michaelbean.org:443/*` → API target group
- `dashboard.staging.michaelbean.org:443/*` → Dashboard target group
- `apps.staging.michaelbean.org:443/stripe/*` → Stripe target group
- `staging.michaelbean.org:443` (default) → Storefront target group
- Port 80 → 301 redirect to port 443

### Terraform Control

| Variable | Value | File |
|----------|-------|------|
| `enable_https` | `true` | `staging.tfvars` |
| `create_acm_certificate` | `true` | `staging.tfvars` |
| `route53_zone_id` | `Z04460563Q0BF3J4587VW` | `staging.tfvars` |
| `domain_name` | `staging.michaelbean.org` | `staging.tfvars` |

### Import Block Cleanup

HTTP listener rules (`*_http[0]`) were removed from `imports.tf` — they were destroyed when `enable_https=true` was applied. HTTPS routing uses the HTTPS listener instead.

---

## Cost Optimization Changes (2026-02-12)

The following changes were applied via Terraform to reduce staging costs (~$94/mo savings).

### VPC Interface Endpoints Removed

Four interface VPC endpoints (ECR API, ECR DKR, CloudWatch Logs, SSM) and their security group were **destroyed**. NAT gateway handles this traffic. Gateway endpoints (S3, DynamoDB) remain — they are free.

**Terraform control:** `create_interface_endpoints = false` in `staging.tfvars`.

### Services Scaled to Zero

| Service | Reason | How to Restore |
|---------|--------|----------------|
| Dashboard | 0% CPU, 3MB memory | `dashboard_desired_count = 1` in tfvars |
| MTG Import | Batch job, run on-demand | `desired_count` in apps map or `aws ecs run-task` |

### Resources Right-Sized

| Resource | Before | After |
|----------|--------|-------|
| RDS | db.t3.medium | db.t3.small |
| Worker CPU | 512 | 256 |
| Meilisearch | 512 CPU / 1024 MB | 256 CPU / 512 MB |

### Container Insights Disabled

308 custom metrics were costing ~$9/mo with no alarms configured. Re-enable with `enable_container_insights = true` in tfvars.

**Full audit:** `docs/ops/audits/2026-02-12-cost-optimization.md`

---

## VPC Migration Resources (2026-01-22)

The following were recreated outside Terraform during VPC migration and later imported into state.

### VPC Context (RESOLVED - 2026-01-27)

**VPC alignment completed on 2026-01-27.**

| VPC | Status | ID | Contains |
|-----|--------|-----|----------|
| Original VPC | ~~Orphaned~~ **DELETED** | `vpc-03bec79de659bddf7` | N/A |
| Production VPC | **TERRAFORM-MANAGED** | `vpc-0b0360f5c0c874c59` | All infrastructure (ALB, ECS, RDS, ElastiCache, VPC endpoints) |
| Old Terraform VPC | ~~Orphaned~~ **DELETED** | `vpc-088fb7c0a22060c10` | N/A |

**Resolution Applied:**
1. ✅ Removed old VPC resources from Terraform state (21 resources)
2. ✅ Imported production VPC and all subnets, gateways, route tables, endpoints
3. ✅ Imported production security groups (8 resources)
4. ✅ Imported production service discovery namespace
5. ✅ Terraform state now aligned with AWS reality

**Cleanup Completed (2026-01-27):**
- ✅ `vpc-03bec79de659bddf7` - Already deleted (not found)
- ✅ `vpc-088fb7c0a22060c10` - Deleted with all resources (6 VPC endpoints, 1 NAT gateway, 8 security groups, 4 subnets, 1 IGW, 2 route tables)

### Recreated Resources

| Resource | Old Location | New Location | Import Status |
|----------|--------------|--------------|---------------|
| ALB | Old VPC | New VPC | **Removed from imports.tf** - Terraform creates fresh |
| RDS | Old VPC | New VPC | **Removed from imports.tf** - Terraform creates fresh |
| ElastiCache | Old VPC | New VPC | **Removed from imports.tf** - Terraform creates fresh |
| Meilisearch EFS | N/A | New VPC | **Terraform-managed** from creation |

### Orphaned Resources (CLEANED UP 2026-01-27)

All orphaned VPC resources have been deleted. No cleanup required.

---

## Imported IAM Roles (2026-01-22)

Six IAM roles were imported into Terraform state. Policy drift may exist if manual changes were made.

| Role | Import Source | Drift Risk |
|------|---------------|------------|
| `saleor-platform-staging-ecs-execution` | `imports.tf:79` | Medium |
| `saleor-platform-staging-ecs-api-task` | `imports.tf:84` | **High** (EFS access) |
| `saleor-platform-staging-ecs-worker-task` | `imports.tf:89` | Medium |
| `saleor-platform-staging-ecs-storefront-task` | `imports.tf:94` | Low |
| `saleor-platform-staging-ecs-apps-task` | `imports.tf:99` | Medium |
| `saleor-platform-staging-github-actions-deploy` | `imports.tf:104` | **High** (CI/CD) |

**Audit Command:**

```bash
# Compare actual vs Terraform-expected policies
aws iam list-role-policies --role-name saleor-platform-staging-ecs-api-task
terraform state show 'module.iam.aws_iam_role_policy.ecs_api_task_inline'
```

---

## Manual Environment Variable Additions

The following environment variables were added via AWS CLI during incident response, not through Terraform.

| Variable | Service(s) | Date Added | Context |
|----------|-----------|------------|---------|
| `AWS_MEDIA_BUCKET_NAME` | api, worker, migrate | 2026-01-25 | staging-images investigation |

**Current State:** These are now defined in Terraform ECS module (`modules/ecs/main.tf`), but running tasks may have older definitions without this variable.

**Resolution:** Force new deployment to pick up Terraform-managed task definition:

```bash
aws ecs update-service \
  --cluster saleor-platform-staging \
  --service api \
  --force-new-deployment
```

---

## CloudFront CDN (Secured)

### Current Configuration (Updated 2026-01-27)

| Variable | Default | staging.tfvars | Effective |
|----------|---------|----------------|-----------|
| `enable_cloudfront` | `true` | Not set | `true` |
| `cloudfront_only_media_access` | `false` | Not set | `false` |

**Status:** S3 bucket policy was manually updated via AWS CLI on 2026-01-27 to remove `PublicReadForMedia` statement. This closes the security gap ahead of Terraform alignment.

### Applied Fix (2026-01-27)

The `PublicReadForMedia` policy statement was removed via:
```bash
aws s3api put-bucket-policy --bucket saleor-platform-media-staging-546464732019 \
  --policy file:///tmp/s3-policy-secure.json
```

**Verification:**
- Direct S3 access: 403 Forbidden ✅
- CloudFront access: 200 OK ✅

**Backup:** `docs/ops/audits/s3-policy-backup-20260127/current-policy.json`

### Terraform State Note

The S3 module will show policy drift until Terraform is aligned. This is expected and intentional - the manual fix was applied to close the security gap while VPC alignment is planned separately.

---

## Meilisearch Sync Infrastructure (Unverified)

The following resources are defined in Terraform but execution is unverified:

| Resource | Terraform Location | Status |
|----------|-------------------|--------|
| SNS Topic (product-events) | `main.tf:552` | Defined |
| SQS Queue (meilisearch-sync) | `main.tf:577` | Defined |
| SQS DLQ | `main.tf:564` | Defined |
| EventBridge (15-min catchup) | `main.tf:814` | Defined |
| EventBridge (daily reconcile) | `main.tf:860` | Defined |
| ECS Task (sync-worker) | `main.tf:705` | Defined |

**Verification Required:**

1. Does `price-sync-worker` image exist in ECR?
2. Are EventBridge rules enabled and invoking tasks?
3. Are any messages in DLQ (indicating failures)?

```bash
# Check ECR image
aws ecr describe-images --repository-name saleor-platform/price-sync-worker

# Check EventBridge rules
aws events list-rules --name-prefix saleor-platform-staging-meilisearch

# Check DLQ depth
aws sqs get-queue-attributes \
  --queue-url $(terraform output -raw meilisearch_sync_dlq_url) \
  --attribute-names ApproximateNumberOfMessages
```

---

## How to Use This Document

### Before Running `terraform plan`

1. Review this document
2. Note which drift is expected
3. Compare plan output against expected list
4. Investigate ONLY unexpected drift

### When You See Drift

| Drift Type | Action |
|------------|--------|
| ECS task definition | **Ignore** - Expected due to lifecycle rule |
| IAM policy change | **Investigate** - Compare against snapshots |
| S3 bucket policy | **Verify** - Check if CloudFront migration complete |
| New resource creation | **Review** - May be legitimate Terraform addition |
| Resource destruction | **STOP** - Requires investigation |

### Updating This Document

When making infrastructure changes:

1. If change is intentional divergence → Add to this document
2. If change should be Terraform-managed → Update `.tf` files
3. If change is temporary → Note with expected removal date

---

## Related Documentation

- `docs/ops/prompts/AWS-ARCHITECTURE-TERRAFORM-DRIFT-REMEDIATION.md` - Full remediation plan
- `infra/terraform/imports.tf` - Import history and comments
- `docs/ops/investigations/staging-images-2026-01-25.md` - S3/image context
