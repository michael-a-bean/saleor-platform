# Drift Prevention: Next Steps

**Created:** 2026-01-27
**Context:** VPC drift remediation complete, immediate steps implemented
**Reference:** `docs/ops/audits/drift-prevention-council-2026-01-27.md`

---

## Completed (2026-01-27)

- [x] VPC alignment - 60+ imports, state aligned with production
- [x] Orphaned VPC cleanup - Deleted `vpc-088fb7c0a22060c10`, saving ~$75/month
- [x] Weekly drift detection workflow - `.github/workflows/terraform-drift-detection.yml`
- [x] Resource tagging - `ManagedBy=terraform` added to VPC module
- [x] Incident change log template - `docs/ops/incident-changes.md`
- [x] Agent rules - `.claude/rules/infrastructure.md`
- [x] **Apply Terraform tags** - 10 VPC resources now have `ManagedBy=terraform` tags applied
- [x] **AWS Config rule** - Required tags rule monitors VPCs, subnets, security groups, NAT gateways, ALBs
- [x] **Quarterly IAM audit workflow** - `.github/workflows/iam-audit.yml` runs quarterly and compares snapshots

---

## Short-Term Actions (This Month) ✅ COMPLETED

### 1. Apply Terraform Tags to Existing Resources ✅

**Status:** COMPLETED 2026-01-27

Tags are now applied to production. Verified via terraform apply:

```bash
cd infra/terraform

# Preview tag changes
docker run --rm -v "$(pwd):/workspace" -v "$HOME/.aws:/root/.aws:ro" \
  -w /workspace -e AWS_REGION=us-west-1 \
  hashicorp/terraform:1.5 plan -var-file=environments/staging.tfvars

# Apply (will add ManagedBy tags to 10 VPC resources)
docker run --rm -v "$(pwd):/workspace" -v "$HOME/.aws:/root/.aws:ro" \
  -w /workspace -e AWS_REGION=us-west-1 \
  hashicorp/terraform:1.5 apply -var-file=environments/staging.tfvars
```

**Result:** 10 resources updated with ManagedBy, Environment, Project, Repository, Module tags.

---

### 2. AWS Config Rule for Required Tags ✅

**Status:** COMPLETED 2026-01-27

AWS Config is now enabled with a required-tags rule.

```bash
# Prompt for Claude:
"Create an AWS Config rule that alerts when EC2/VPC resources are created
without a ManagedBy tag. Add to infra/terraform/modules/monitoring/ or main.tf.
The rule should check: VPCs, subnets, security groups, NAT gateways, ELBs."
```

**Implementation approach:**
```hcl
# Add to main.tf or create modules/config/main.tf
resource "aws_config_config_rule" "required_tags" {
  name = "${local.name_prefix}-required-tags"

  source {
    owner             = "AWS"
    source_identifier = "REQUIRED_TAGS"
  }

  input_parameters = jsonencode({
    tag1Key   = "ManagedBy"
    tag1Value = "terraform"
  })

  scope {
    compliance_resource_types = [
      "AWS::EC2::VPC",
      "AWS::EC2::Subnet",
      "AWS::EC2::SecurityGroup",
      "AWS::EC2::NatGateway",
      "AWS::ElasticLoadBalancingV2::LoadBalancer"
    ]
  }
}
```

---

### 3. Quarterly IAM Policy Audit Formalization ✅

**Status:** COMPLETED 2026-01-27

The IAM audit workflow is now automated via `.github/workflows/iam-audit.yml`.

```bash
# Prompt for Claude:
"Create a quarterly IAM audit workflow:
1. GitHub Actions scheduled workflow (quarterly)
2. Compares current IAM policies vs Terraform state
3. Outputs diff to docs/ops/audits/iam-snapshots-YYYYMMDD/
4. Creates GitHub issue if drift detected

Reference: docs/ops/audits/iam-snapshots-20260127/ for format"
```

**Manual process (until automated):**
```bash
# Run quarterly
mkdir -p docs/ops/audits/iam-snapshots-$(date +%Y%m%d)

# Snapshot all IAM roles
for role in saleor-platform-staging-ecs-execution \
            saleor-platform-staging-ecs-api-task \
            saleor-platform-staging-ecs-worker-task \
            saleor-platform-staging-ecs-storefront-task \
            saleor-platform-staging-ecs-apps-task \
            saleor-platform-staging-github-actions-deploy; do
  aws iam get-role --role-name $role > "docs/ops/audits/iam-snapshots-$(date +%Y%m%d)/${role}.json"
  aws iam list-role-policies --role-name $role >> "docs/ops/audits/iam-snapshots-$(date +%Y%m%d)/${role}.json"
  aws iam list-attached-role-policies --role-name $role >> "docs/ops/audits/iam-snapshots-$(date +%Y%m%d)/${role}.json"
done
```

---

## Medium-Term Actions (This Quarter)

### 4. Service Control Policy (SCP) for VPC Protection

Prevent VPC creation outside Terraform by restricting to specific IAM roles.

```bash
# Prompt for Claude:
"Create an AWS Organizations SCP that denies ec2:CreateVpc and ec2:DeleteVpc
actions unless the principal ARN matches *-terraform-* or *-github-actions-*.
This prevents console/CLI VPC creation that caused the 2026-01-22 drift.

Note: Requires AWS Organizations. Check if enabled first."
```

**Check prerequisites:**
```bash
# Check if AWS Organizations is enabled
aws organizations describe-organization 2>&1
```

---

### 5. CloudTrail Alerting for Critical Changes

Real-time alerts when IAM or VPC configuration changes outside Terraform.

```bash
# Prompt for Claude:
"Set up CloudTrail + CloudWatch alerting for:
- CreateVpc, DeleteVpc, ModifyVpcAttribute
- CreateSecurityGroup, AuthorizeSecurityGroup*
- CreateRole, PutRolePolicy, AttachRolePolicy
- Any IAM changes to saleor-platform-* roles

Alert to SNS topic that notifies via email or Slack."
```

---

### 6. ECS Deployment Audit Trail

Compensating control for `ignore_changes = [task_definition]` pattern.

```bash
# Prompt for Claude:
"Create an S3 bucket with Object Lock for ECS deployment audit logs.
Modify the GitHub Actions deploy workflow to:
1. Export task definition JSON before deploy
2. Upload to s3://saleor-platform-audit-logs/ecs-deploys/YYYY-MM-DD/
3. Include: service name, task def revision, deployer, commit SHA

This creates immutable audit trail for task definition changes that
Terraform intentionally ignores."
```

---

## Verification Commands

### Check Drift Detection is Working

```bash
# Manually trigger drift detection
gh workflow run terraform-drift-detection.yml

# Check workflow runs
gh run list --workflow=terraform-drift-detection.yml
```

### Check Resource Tags

```bash
# Verify VPC resources have ManagedBy tag
aws ec2 describe-vpcs --vpc-ids vpc-0b0360f5c0c874c59 \
  --query 'Vpcs[*].Tags' --output table

# Find resources WITHOUT ManagedBy tag (orphan detection)
aws ec2 describe-security-groups \
  --query "SecurityGroups[?!Tags[?Key=='ManagedBy']].[GroupId,GroupName]" \
  --output table
```

### Verify Terraform State Alignment

```bash
cd infra/terraform
docker run --rm -v "$(pwd):/workspace" -v "$HOME/.aws:/root/.aws:ro" \
  -w /workspace -e AWS_REGION=us-west-1 \
  hashicorp/terraform:1.5 plan -var-file=environments/staging.tfvars -detailed-exitcode

# Exit code 0 = no changes (aligned)
# Exit code 2 = drift detected
```

---

## Quick Reference

| Action | Command/Prompt |
|--------|---------------|
| Apply tags | `terraform apply` |
| Check drift | `gh workflow run terraform-drift-detection.yml` |
| Find orphans | `aws ec2 describe-* --query "...[?!Tags[?Key=='ManagedBy']]"` |
| IAM snapshot | See section 3 above |
| Log manual change | Edit `docs/ops/incident-changes.md` |

---

## Related Documentation

- `docs/ops/audits/drift-prevention-council-2026-01-27.md` - Full council analysis
- `docs/reference/expected-divergence.md` - Intentional drift patterns
- `docs/ops/incident-changes.md` - Manual change log
- `.claude/rules/infrastructure.md` - Agent rules
- `.github/workflows/terraform-drift-detection.yml` - Weekly detection
