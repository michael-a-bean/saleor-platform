# Infrastructure Incident Change Log

**Purpose:** Track all manual AWS changes made during incident response for Terraform reconciliation.

**Rule:** Every manual AWS CLI command that creates, modifies, or deletes infrastructure MUST be logged here within 24 hours. This prevents Terraform drift accumulation.

---

## Template

When you make a manual change, copy this template and fill in the details:

```markdown
### [DATE] - [Brief Description]

**Incident:** [Link to incident or brief description]
**Responder:** [Your name]
**Time:** [When the change was made]

**Changes Made:**
```bash
# Paste the actual AWS CLI commands used
aws ec2 create-vpc --cidr-block 10.0.0.0/16
```

**Resources Created/Modified:**
- Resource type: [e.g., VPC, Security Group, ECS Service]
- Resource ID: [e.g., vpc-0123456789abcdef0]
- Region: [e.g., us-west-1]

**Terraform Reconciliation Status:**
- [ ] Import block added to `imports.tf`
- [ ] Terraform plan shows no unexpected drift
- [ ] Documentation updated (if applicable)

**Notes:**
[Any additional context about why this was necessary]
```

---

## Change History

### 2026-01-27 - VPC Alignment Reconciliation

**Incident:** VPC drift discovered - Terraform state pointed to wrong VPC
**Responder:** Michael
**Time:** 2026-01-27

**Changes Made:**
- Deleted orphaned VPC `vpc-088fb7c0a22060c10` and all child resources
- Added 60+ import blocks to align state with production VPC

**Resources Deleted:**
- VPC: vpc-088fb7c0a22060c10
- VPC Endpoints: 6
- NAT Gateway: nat-066af8ccd5fe4c7d0
- Security Groups: 8
- Subnets: 4
- Internet Gateway: igw-05ed067171b33f107
- Route Tables: 2

**Terraform Reconciliation Status:**
- [x] Import blocks added to `imports.tf`
- [x] Terraform plan shows "No changes"
- [x] Documentation updated (`docs/reference/expected-divergence.md`)

**Notes:**
This was a remediation of accumulated drift from the 2026-01-22 VPC migration. Weekly drift detection workflow now implemented to prevent recurrence.

---

### 2026-01-22 - VPC Migration During Incident

**Incident:** Service connectivity issues
**Responder:** Michael
**Time:** 2026-01-22

**Changes Made:**
- Created new VPC manually via AWS Console
- Migrated ALB, ECS services, RDS, ElastiCache to new VPC
- Updated security groups and routing

**Resources Created:**
- VPC: vpc-0b0360f5c0c874c59 (now production)
- Subnets, route tables, NAT gateway, VPC endpoints

**Terraform Reconciliation Status:**
- [x] Import blocks added to `imports.tf` (completed 2026-01-27)
- [x] Terraform plan shows "No changes" (completed 2026-01-27)
- [x] Documentation updated

**Notes:**
This was the root cause of the VPC drift. Manual changes were necessary to restore service, but reconciliation was delayed 5 days.

---

## Reconciliation Checklist

After any manual infrastructure change:

1. **Within 24 hours:**
   - [ ] Log the change in this file
   - [ ] Note all resource IDs created

2. **Within 48 hours:**
   - [ ] Create import blocks in `infra/terraform/imports.tf`
   - [ ] Run `terraform plan` to verify alignment
   - [ ] Update `docs/reference/expected-divergence.md` if intentional drift

3. **Weekly review:**
   - [ ] Check GitHub Actions drift detection results
   - [ ] Review any open drift issues
   - [ ] Close reconciled items
