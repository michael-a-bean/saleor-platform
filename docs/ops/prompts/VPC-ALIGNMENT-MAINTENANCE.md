# VPC Alignment Maintenance Prompt

**Date Created:** 2026-01-27
**Status:** READY FOR MAINTENANCE WINDOW
**Source:** AWS Architecture drift remediation (Phase 3 incomplete)
**Priority:** Medium (security gap already fixed)

---

## Context

During Terraform drift remediation on 2026-01-27, we discovered a fundamental VPC mismatch:

| VPC | ID | Purpose |
|-----|-----|---------|
| Terraform-managed | `vpc-088fb7c0a22060c10` | Currently in Terraform state |
| Production | `vpc-0b0360f5c0c874c59` | Where all real resources run |

**Why this matters:** Any `terraform apply` affecting VPC-bound resources would recreate them in the wrong VPC, causing service outage.

**Security gap:** Already fixed via AWS CLI on 2026-01-27 (S3 bucket locked to CloudFront-only access).

---

## Prerequisites

Before starting this maintenance:

1. **Maintenance window scheduled** - This requires coordination
2. **Backups verified** - RDS snapshot, EFS backup
3. **Rollback plan documented** - How to revert if something goes wrong
4. **Testing environment ready** - Verify changes in staging before production

---

## Step 1: Document Production VPC Resources

Get all resource IDs in the production VPC:

```bash
# VPC
aws ec2 describe-vpcs --vpc-ids vpc-0b0360f5c0c874c59

# Subnets
aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-0b0360f5c0c874c59"

# Internet Gateway
aws ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=vpc-0b0360f5c0c874c59"

# NAT Gateway
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=vpc-0b0360f5c0c874c59"

# Route Tables
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-0b0360f5c0c874c59"

# Elastic IP (for NAT)
aws ec2 describe-addresses --filters "Name=tag:Name,Values=*saleor*nat*"

# VPC Endpoints
aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=vpc-0b0360f5c0c874c59"

# Security Groups
aws ec2 describe-security-groups --filters "Name=vpc-id,Values=vpc-0b0360f5c0c874c59"
```

---

## Step 2: Remove Old VPC from Terraform State

```bash
cd /home/michael/saleor-platform/infra/terraform

# List all VPC-related resources
terraform state list | grep 'module.vpc'

# Remove each resource (example)
terraform state rm 'module.vpc[0].aws_vpc.main'
terraform state rm 'module.vpc[0].aws_subnet.private[0]'
terraform state rm 'module.vpc[0].aws_subnet.private[1]'
terraform state rm 'module.vpc[0].aws_subnet.public[0]'
terraform state rm 'module.vpc[0].aws_subnet.public[1]'
terraform state rm 'module.vpc[0].aws_internet_gateway.main'
terraform state rm 'module.vpc[0].aws_nat_gateway.main[0]'
terraform state rm 'module.vpc[0].aws_eip.nat[0]'
terraform state rm 'module.vpc[0].aws_route_table.public'
terraform state rm 'module.vpc[0].aws_route_table.private[0]'
terraform state rm 'module.vpc[0].aws_route_table_association.public[0]'
terraform state rm 'module.vpc[0].aws_route_table_association.public[1]'
terraform state rm 'module.vpc[0].aws_route_table_association.private[0]'
terraform state rm 'module.vpc[0].aws_route_table_association.private[1]'
# ... and VPC endpoints
```

---

## Step 3: Update imports.tf with Production VPC IDs

Add these imports to `infra/terraform/imports.tf`:

```hcl
# =============================================================================
# Production VPC - Imported 2026-XX-XX
# =============================================================================
import {
  to = module.vpc[0].aws_vpc.main
  id = "vpc-0b0360f5c0c874c59"
}

import {
  to = module.vpc[0].aws_subnet.private[0]
  id = "subnet-0885b491c2d394fb6"  # us-west-1a
}

import {
  to = module.vpc[0].aws_subnet.private[1]
  id = "subnet-0917a8f4d0d7b7080"  # us-west-1b
}

import {
  to = module.vpc[0].aws_subnet.public[0]
  id = "subnet-03f8a9b1c117c7c19"  # us-west-1a
}

import {
  to = module.vpc[0].aws_subnet.public[1]
  id = "subnet-04358a3ccacd34e6c"  # us-west-1b
}

import {
  to = module.vpc[0].aws_internet_gateway.main
  id = "igw-029a454967ff72400"
}

import {
  to = module.vpc[0].aws_nat_gateway.main[0]
  id = "nat-05ca5f050c37e97a1"
}

import {
  to = module.vpc[0].aws_eip.nat[0]
  id = "eipalloc-0b7171488dae2fece"
}

import {
  to = module.vpc[0].aws_route_table.public
  id = "rtb-0558fbd2834d65219"
}

import {
  to = module.vpc[0].aws_route_table.private[0]
  id = "rtb-037085d4ee7ffdea8"
}

# VPC Endpoints - get IDs from Step 1 output
```

---

## Step 4: Run Terraform Plan

```bash
terraform plan -var-file=environments/staging.tfvars
```

Expected outcome:
- No destroys (critical)
- Only expected changes (ECS task definitions, etc.)
- Imports should show as "will be imported"

---

## Step 5: Apply if Plan Looks Safe

```bash
terraform apply -var-file=environments/staging.tfvars
```

---

## Step 6: Verify Services

After apply:

```bash
# Check ECS services
aws ecs describe-services --cluster saleor-platform-staging \
  --services api worker storefront dashboard meilisearch \
  --query 'services[*].[serviceName,runningCount]'

# Check ALB health
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:us-west-1:546464732019:targetgroup/saleor-platform-staging-api/28b0d316d9f3989d

# Verify site is accessible
curl -I https://[your-domain]
```

---

## Rollback Plan

If something goes wrong:

1. **Services down:** Check CloudWatch logs for errors
2. **Target group issues:** Services may need force deployment
3. **Full rollback:** Revert imports.tf changes, remove imported state, run apply

---

## Post-Maintenance Cleanup

1. Delete orphaned VPC (`vpc-088fb7c0a22060c10`) and its resources
2. Delete orphaned VPC (`vpc-03bec79de659bddf7`) if still exists
3. Update `docs/reference/expected-divergence.md` to reflect aligned state
4. Run full Terraform plan to verify clean state

---

## Related Documentation

- `docs/reference/expected-divergence.md` - Documents current drift
- `docs/ops/prompts/AWS-ARCHITECTURE-TERRAFORM-DRIFT-REMEDIATION.md` - Original analysis
- `docs/ops/audits/iam-snapshots-20260127/` - IAM policy snapshots
- `infra/terraform/imports.tf` - Current import configuration
