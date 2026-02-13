# AWS Architecture & Terraform Drift Remediation

**Date Created:** 2026-01-27
**Status:** READY FOR IMPLEMENTATION
**Council Session:** 4-agent debate (Architect, Engineer, Security, Researcher)
**Priority:** High

---

## Executive Summary

A Council analysis identified infrastructure drift and security gaps in the saleor-platform AWS deployment. This document provides a phased remediation plan with executable commands for future sessions.

**Critical Findings:**
1. S3 bucket runs BOTH CloudFront OAC AND public access simultaneously (security gap)
2. Six imported IAM roles may have policy drift from Terraform state
3. ECS task definitions intentionally diverge due to `lifecycle { ignore_changes }` pattern
4. Documentation gaps from VPC migration (2026-01-22) create false positive drift alerts
5. CloudFront is defined in Terraform but traffic routing unverified

---

## Quick Reference

| Issue | Severity | Phase | Effort |
|-------|----------|-------|--------|
| S3 dual-access (OAC + public) | **HIGH** | 3 | Low |
| IAM policy drift | **HIGH** | 1 | Medium |
| Missing expected-divergence.md | Medium | 1 | Low |
| CloudFront traffic verification | Medium | 2 | Low |
| Meilisearch scheduled tasks | Low | 2 | Low |

---

## Phase 1: Pre-Flight Documentation & IAM Audit

**Goal:** Establish baseline before running terraform plan to distinguish intentional from accidental drift.

### 1.1 Create Expected Divergence Documentation

Create `docs/reference/expected-divergence.md`:

```markdown
# Expected Terraform Divergence

This document catalogs intentional drift between Terraform state and AWS reality.

## ECS Task Definitions (Intentional)

All ECS services use `lifecycle { ignore_changes = [task_definition] }` to allow CI/CD deployments without Terraform interference.

**Affected Services:**
- api, worker, storefront, dashboard
- stripe, inventory-ops, buylist, pos apps
- meilisearch

**Why:** Task definitions are versioned. CI/CD deploys new revisions; Terraform tracks what it last applied. This is expected.

**Audit Strategy:** Compare running task definition ARN vs Terraform state quarterly for security-relevant drift (IAM roles, secrets).

## VPC Migration Changes (2026-01-22)

The following were recreated outside Terraform during VPC migration and later imported:

- ALB: Recreated in new VPC (vpc-0b0360f5c0c874c59)
- RDS: Recreated with new subnet group
- ElastiCache: Recreated with new subnet group
- Meilisearch EFS: Created fresh in new VPC

**Old VPC:** vpc-03bec79de659bddf7 (orphaned resources may exist)
**New VPC:** vpc-0b0360f5c0c874c59 (Terraform-managed)

## Manual Environment Variable Additions

The following were added via AWS CLI during investigations:

| Variable | Service | Date | Investigation |
|----------|---------|------|---------------|
| AWS_MEDIA_BUCKET_NAME | api, worker, migrate | 2026-01-25 | staging-images |

These are now in Terraform ECS module but running tasks may have older definitions.
```

### 1.2 Snapshot IAM Policies

Run these commands to capture current IAM policy state before terraform plan:

```bash
# Create output directory
mkdir -p /home/michael/saleor-platform/docs/ops/audits/iam-snapshots-$(date +%Y%m%d)
cd /home/michael/saleor-platform/docs/ops/audits/iam-snapshots-$(date +%Y%m%d)

# Snapshot all 6 imported roles
ROLES=(
  "saleor-platform-staging-ecs-execution"
  "saleor-platform-staging-ecs-api-task"
  "saleor-platform-staging-ecs-worker-task"
  "saleor-platform-staging-ecs-storefront-task"
  "saleor-platform-staging-ecs-apps-task"
  "saleor-platform-staging-github-actions-deploy"
)

for ROLE in "${ROLES[@]}"; do
  echo "Snapshotting $ROLE..."
  aws iam get-role --role-name "$ROLE" > "${ROLE}-role.json"
  aws iam list-attached-role-policies --role-name "$ROLE" > "${ROLE}-attached.json"
  aws iam list-role-policies --role-name "$ROLE" > "${ROLE}-inline.json"

  # Get inline policy documents
  for POLICY in $(aws iam list-role-policies --role-name "$ROLE" --query 'PolicyNames[]' --output text); do
    aws iam get-role-policy --role-name "$ROLE" --policy-name "$POLICY" > "${ROLE}-${POLICY}.json"
  done
done

echo "IAM snapshots complete. Review files before proceeding."
```

### 1.3 Check for Orphaned Resources

```bash
# Check for security groups in old VPC
aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=vpc-03bec79de659bddf7" \
  --query 'SecurityGroups[*].[GroupId,GroupName,Description]' \
  --output table

# Check for orphaned target groups
aws elbv2 describe-target-groups \
  --query 'TargetGroups[?contains(TargetGroupName, `saleor`) && VpcId==`vpc-03bec79de659bddf7`].[TargetGroupName,TargetGroupArn]' \
  --output table
```

---

## Phase 2: Verification

**Goal:** Verify actual AWS state before making changes.

### 2.1 Verify CloudFront is Serving Traffic

```bash
# Check if CloudFront distribution exists
aws cloudfront list-distributions \
  --query 'DistributionList.Items[?contains(Comment, `saleor-platform-staging`)].[Id,DomainName,Status,Comment]' \
  --output table

# Get distribution ID (replace with actual)
DIST_ID="E1234567890ABC"

# Check CloudFront request metrics (last 7 days)
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name Requests \
  --dimensions Name=DistributionId,Value=$DIST_ID Name=Region,Value=Global \
  --start-time $(date -d '7 days ago' --iso-8601=seconds) \
  --end-time $(date --iso-8601=seconds) \
  --period 86400 \
  --statistics Sum \
  --output table

# Check if storefront is using CloudFront URL
aws ecs describe-task-definition \
  --task-definition saleor-platform-staging-api \
  --query 'taskDefinition.containerDefinitions[0].environment[?name==`AWS_MEDIA_CUSTOM_DOMAIN`].value' \
  --output text
```

**Expected:** If CloudFront is active, `AWS_MEDIA_CUSTOM_DOMAIN` should contain a `*.cloudfront.net` domain.

### 2.2 Run Terraform Plan (Read-Only)

```bash
cd /home/michael/saleor-platform/infra/terraform

# Initialize if needed
terraform init

# Plan without applying (read-only)
terraform plan -var-file=environments/staging.tfvars -out=staging-plan.tfplan 2>&1 | tee staging-plan-output.txt

# Review the plan output carefully
# Look for:
# - Resources to be destroyed (should be ZERO unless intentional)
# - IAM policy changes (compare against snapshots)
# - Unexpected in-place updates
```

### 2.3 Verify Meilisearch Scheduled Tasks

```bash
# Check if price-sync-worker image exists in ECR
aws ecr describe-images \
  --repository-name saleor-platform/price-sync-worker \
  --query 'imageDetails[*].[imageTags,imagePushedAt]' \
  --output table

# Check EventBridge rules exist
aws events list-rules \
  --name-prefix "saleor-platform-staging-meilisearch" \
  --query 'Rules[*].[Name,State,ScheduleExpression]' \
  --output table

# Check recent rule invocations (CloudWatch)
aws logs filter-log-events \
  --log-group-name "/aws/events/saleor-platform-staging" \
  --start-time $(date -d '24 hours ago' +%s)000 \
  --limit 10
```

---

## Phase 3: Remediation

**Goal:** Close security gaps and align Terraform state.

### 3.1 Explicitly Set CloudFront Variables

Update `infra/terraform/environments/staging.tfvars`:

```hcl
# CloudFront CDN (explicitly enabled - was using default)
enable_cloudfront = true
cloudfront_price_class = "PriceClass_100"
# DO NOT set cloudfront_only_media_access = true until Phase 3.2 verification passes
```

### 3.2 Verify CloudFront Traffic Before S3 Lockdown

**CRITICAL:** Only proceed after confirming CloudFront serves ALL media traffic.

```bash
# Check S3 bucket access logs for direct (non-CloudFront) requests
# If S3 server access logging is enabled:
aws s3 ls s3://saleor-platform-media-staging-546464732019-logs/ --recursive | tail -20

# Alternative: Check CloudFront vs S3 request ratios
# CloudFront requests should be >> 0 if CDN is working
```

### 3.3 Lock Down S3 to CloudFront-Only Access

**Only after Phase 3.2 verification passes:**

Update `infra/terraform/environments/staging.tfvars`:

```hcl
# Remove direct S3 public access - all requests must go through CloudFront
cloudfront_only_media_access = true
```

Apply:

```bash
cd /home/michael/saleor-platform/infra/terraform

# Plan first
terraform plan -var-file=environments/staging.tfvars -target=module.s3

# Review the plan - should show bucket policy update only
# Apply if safe
terraform apply -var-file=environments/staging.tfvars -target=module.s3
```

### 3.4 Address IAM Policy Drift

If Phase 1.2 snapshots reveal drift from Terraform:

```bash
# Compare snapshot to Terraform state
# For each role, diff the snapshot against terraform state show

terraform state show 'module.iam.aws_iam_role.ecs_api_task'

# If drift detected, either:
# 1. Import the manual change into Terraform (preferred)
# 2. Let Terraform overwrite the manual change (destructive)
```

---

## Verification Commands

### Post-Remediation Checklist

```bash
# 1. S3 bucket policy is CloudFront-only
aws s3api get-bucket-policy --bucket saleor-platform-media-staging-546464732019 | jq '.Policy | fromjson'
# Should NOT contain "PublicReadForMedia" statement

# 2. CloudFront is serving media
curl -I "https://[CLOUDFRONT_DOMAIN]/products/test-image.jpg"
# Should return 200 or 403 (if image doesn't exist), NOT redirect to S3

# 3. Direct S3 access is blocked
curl -I "https://saleor-platform-media-staging-546464732019.s3.us-west-1.amazonaws.com/products/test-image.jpg"
# Should return 403 Forbidden

# 4. Terraform state is clean
terraform plan -var-file=environments/staging.tfvars
# Should show "No changes" or only expected ECS task definition drift
```

---

## Council Debate Summary

### Participants

| Role | Agent | Key Contribution |
|------|-------|------------------|
| Architect | Serena Blackwood | Identified CloudFront coherence gap; recommended expected-divergence.md |
| Engineer | Marcus Webb | Flagged ECS lifecycle pattern as intentional; prioritized CloudWatch verification |
| Security | Rook Blackburn | Identified S3 dual-access as active attack surface; recommended IAM snapshots |
| Researcher | Ava Chen | Found documentation gaps; recommended document-first approach |

### Consensus Points

1. **S3 dual-access must resolve** - CloudFront OAC + public access is security debt
2. **IAM policy drift is silent danger** - Six imported roles need audit
3. **ECS lifecycle ignore is intentional** - Document, don't chase
4. **CloudWatch verification before S3 lockdown** - Don't break production
5. **Document expected divergence** - Prevents false positive drift alerts

### Unresolved Tensions

| Issue | Positions |
|-------|-----------|
| S3 lockdown timing | Rook: Immediate after verification. Others: After full migration. |
| Document vs verify first | Ava: Document first. Marcus: Verify first. Serena: Parallel. |

---

## Session Resume Instructions

### To Continue This Work

1. **Read this document** to understand context
2. **Check current phase status:**
   ```bash
   # Which phases are complete?
   ls -la docs/reference/expected-divergence.md  # Phase 1.1
   ls -la docs/ops/audits/iam-snapshots-*        # Phase 1.2
   ```
3. **Resume at incomplete phase**
4. **Run verification commands** after each phase

### Files Modified By This Work

| File | Change |
|------|--------|
| `docs/reference/expected-divergence.md` | Created (Phase 1.1) |
| `docs/ops/audits/iam-snapshots-YYYYMMDD/` | Created (Phase 1.2) |
| `infra/terraform/environments/staging.tfvars` | Updated (Phase 3.1, 3.3) |

---

## Related Documentation

- `docs/ops/investigations/staging-images-2026-01-25.md` - S3/image resolution context
- `docs/prompts/cloudfront-cdn-implementation.md` - CloudFront design intent
- `infra/terraform/imports.tf` - Import history and VPC migration notes
- `docs/ops/investigations/test-platform-failures-2026-01-26.md` - CI/CD context

---

**Last Updated:** 2026-01-27
**Next Action:** Execute Phase 1 (Documentation + IAM Snapshots)
