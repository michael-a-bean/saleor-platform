# Council: Terraform Drift Prevention

**Date:** 2026-01-27
**Context:** Post-mortem on VPC drift remediation requiring 60+ imports and $75-80/month waste
**Participants:** Architect, Engineer, Security, DevOps/SRE

---

## Executive Summary

The VPC drift was caused by **manual incident response** on 2026-01-22 that created infrastructure outside Terraform, followed by **no drift detection** to catch the divergence. All 10 ECS services ARE in Terraform state - the problem was at the VPC/network layer.

**Key Finding:** This was not a case of "unmanaged services" but rather **unmanaged foundation resources** that everything else depended on.

---

## Council Findings by Perspective

### Architect: Systemic Design Issues

**Root Causes Identified:**
1. **Orphaned Infrastructure Pattern** - Resources created manually/inconsistently, creating phantom VPC
2. **Missing Mandatory Verification** - No CI pipeline enforced `terraform plan` checks
3. **Import-Heavy Recovery** - 60+ imports = infrastructure built outside Terraform (ClickOps to Code)

**Recommendations:**
| Tier | Mechanism | Catches |
|------|-----------|---------|
| Proactive | CI plan checks | Drift before merge |
| Detective | Nightly drift reports | Drift from manual changes |
| Corrective | AWS Config rules | Unmanaged resources |

**Critical Action:** VPC module should output a `vpc_fingerprint` - any VPC change becomes explicit destroy/recreate decision.

---

### Engineer: Operational Tooling

**Proposed CI/CD Implementation:**

```yaml
# .github/workflows/terraform-drift.yml
name: Terraform Drift Detection
on:
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours
  workflow_dispatch:

jobs:
  drift-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Terraform Plan
        run: |
          docker run --rm -v $PWD:/workspace hashicorp/terraform:1.5 \
            -chdir=/workspace/infra/terraform plan -detailed-exitcode \
            -var-file=environments/staging.tfvars \
            -no-color > drift-report.txt 2>&1
        continue-on-error: true
      - name: Alert on Drift
        if: failure()
        run: |
          # Post to Slack/Discord
          echo "Terraform drift detected - see drift-report.txt"
```

**Service Control Policy (SCP) for VPC Protection:**
```json
{
  "Effect": "Deny",
  "Action": ["ec2:CreateVpc", "ec2:DeleteVpc"],
  "Resource": "*",
  "Condition": {
    "StringNotLike": {
      "aws:PrincipalArn": "arn:aws:iam::*:role/*-terraform-*"
    }
  }
}
```

---

### Security: Audit Blind Spots

**Three Critical Attack Surfaces Created by Drift:**

1. **Configuration Tampering via CI/CD** - `ignore_changes = [task_definition]` means compromised deployments can modify IAM role assignments, inject environment variables, alter network configs without Terraform detection

2. **Policy Drift Without Traceability** - 6 imported IAM roles have no audit trail in version control for manual changes

3. **Dual-Access Attack Vector** - S3 bucket with both CloudFront OAC and public access was defense-in-depth failure

**Compensating Controls Required:**

| Control | Purpose | Implementation |
|---------|---------|----------------|
| Quarterly IAM snapshots | Detect policy drift | `docs/ops/audits/iam-snapshots-*/` |
| CloudTrail monitoring | Track all config changes | Already enabled |
| ECS deploy logging | Immutable deployment history | S3 bucket with Object Lock |
| AWS Config rules | Real-time drift detection | Custom rules for VPC/IAM |

**Key Insight:** The `ignore_changes` pattern is acceptable IF compensated by runtime auditing. Currently, that compensating control is missing.

---

### DevOps/SRE: Pragmatic Implementation

**For a Small Team:**

1. **Break-Glass Runbook** - Pre-approved emergency procedures with corresponding Terraform import commands ready

2. **Incident Change Log** - Every manual AWS change logged to `docs/ops/incident-changes.md` with AWS CLI command used

3. **48-Hour Reconciliation Window** - After every incident, non-negotiable block to import manual changes

**Lightweight Drift Detection:**
- Weekly scheduled `terraform plan` (not every 4 hours - too noisy for small team)
- Monday 9 AM cron job, results to Slack
- Manual review, not automated alerts

**Shadow Infrastructure Detection:**
```bash
# Monthly orphan check
aws ec2 describe-vpcs --query "Vpcs[?!Tags[?Key=='managed-by']]"
aws ec2 describe-security-groups --query "SecurityGroups[?!Tags[?Key=='managed-by']]"
```

---

## Consensus Recommendations

### Immediate Actions (This Week)

1. **Add weekly drift detection workflow** - Simple GitHub Actions cron job with `terraform plan`
2. **Tag all Terraform resources** - `managed-by = "terraform"` tag on every resource
3. **Create incident change log template** - `docs/ops/incident-changes.md`

### Short-Term Actions (This Month)

4. **AWS Config rule for required tags** - Alert on untagged resources
5. **Quarterly IAM policy comparison** - Formalize the snapshot process that exists
6. **Document VPC fingerprint** - Add to expected-divergence.md

### Medium-Term Actions (This Quarter)

7. **SCP for critical resources** - Block VPC creation outside Terraform roles
8. **CloudTrail alerting** - Real-time alerts on IAM/VPC changes
9. **ECS deployment audit trail** - S3 bucket with immutable logs

---

## What We Got Right

Despite the VPC drift, several things prevented this from being worse:

| Practice | Benefit |
|----------|---------|
| `lifecycle { ignore_changes = [task_definition] }` | Services survived VPC confusion |
| ECS Service Discovery | Services found each other despite VPC migration |
| S3 media bucket in correct VPC | No data access disruption |
| Quick manual intervention | 2026-01-22 incident was resolved same day |

The issue was **detection and reconciliation**, not the fundamental architecture.

---

## Cost of Not Acting

| Risk | Probability | Impact | Cost |
|------|-------------|--------|------|
| Orphaned resources accumulate | High | ~$75-100/month waste | $900-1200/year |
| Security blind spot exploited | Low | Critical data breach | Catastrophic |
| Next incident requires 60+ imports | Medium | 4-8 hours remediation | $800-1600 (time) |
| Audit failure (SOC2/compliance) | Medium | Failed certification | Business impact |

**Bottom Line:** A $0/month GitHub Actions workflow prevents $900+/year in waste and reduces incident remediation time by 4-8 hours.

---

## Implementation Priority

```
Week 1: Add drift detection workflow + resource tagging
Week 2: Create incident change log template + document in runbook
Week 3: AWS Config rule for required tags
Week 4: Quarterly IAM audit formalization
```

---

**Council Consensus:** The drift was preventable with basic CI/CD practices. The team should implement weekly drift detection immediately - it costs nothing and would have caught this in the first week, not after a month of accumulation.
