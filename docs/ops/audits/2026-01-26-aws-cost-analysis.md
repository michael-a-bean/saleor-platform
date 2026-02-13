# AWS Cost Analysis & Remediation Plan — 2026-01-26

**Conducted by:** Multi-Agent Council (Architect, FinOps, Security, Research)
**Account ID:** 546464732019
**Primary Region:** us-west-1
**Architecture:** ECS Fargate with RDS, ElastiCache, ELB

---

## Monthly Spend Breakdown (Last 30 Days)

| Rank | Service | Cost (USD) | % of Total |
|------|---------|-----------|------------|
| 1 | **Amazon VPC** | $57.89 | 26.1% |
| 2 | **Amazon ECS (Fargate)** | $48.65 | 21.9% |
| 3 | **Amazon RDS** | $37.57 | 16.9% |
| 4 | **EC2 - Other** | $32.86 | 14.8% |
| 5 | **Amazon CloudWatch** | $24.92 | 11.2% |
| 6 | **Amazon ELB** | $8.74 | 3.9% |
| 7 | **Amazon ElastiCache** | $7.48 | 3.4% |
| 8 | **Amazon Route 53** | $2.03 | 0.9% |
| 9 | **Amazon ECR** | $1.52 | 0.7% |
| 10 | **AWS Secrets Manager** | $0.05 | <0.1% |
| | **TOTAL** | **$221.74** | 100% |

### Regional Distribution

| Region | Cost (USD) |
|--------|-----------|
| us-west-1 | $219.71 (98.9%) |
| global | $2.03 (0.9%) |
| us-east-1 | <$0.01 |

---

## Cost Anomalies Detected

### Anomaly 1: NAT Gateway Spike (CRITICAL)

- **Service:** Amazon Elastic Block Store / NAT Gateway
- **Period:** Jan 11-22, 2026
- **Impact:** $23.92 unexpected spend (~3987% above expected)
- **Root Cause:** NAT Gateway hours ($20.99) + data transfer ($2.21)
- **Severity:** 0.7/1.0 score

### Anomaly 2: CloudWatch Metrics Surge

- **Service:** Amazon CloudWatch
- **Period:** Jan 15-22, 2026
- **Impact:** $10.10 unexpected spend (143% above expected)
- **Root Cause:** MetricMonitorUsage in us-west-1 ($17.14 vs $7.04 expected)
- **Severity:** 0.61/1.0 score

---

## Reserved Instance / Savings Plan Status

- **Reserved Instances:** None purchased (0% coverage)
- **Savings Plans:** None active (0% coverage)
- **On-Demand Exposure:** 100% of workloads running at full price

---

## Security Assessment Findings

### Duplicate Security Group Sprawl (CRITICAL)

7 duplicate security group pairs across two VPCs:
- **Configuration drift risk** — duplicates diverge over time, weaker twin gets exploited
- **Audit confusion** — unclear which SG rules are enforced on which resources
- **launch-wizard-1 in Default VPC** — classic forgotten test artifact with overly permissive defaults

### Stopped Cloud9 Instance (Dormant Attack Surface)

A Cloud9 instance stopped since 2023:
- Attached EBS volume potentially containing credentials/SSH keys
- Security group still active
- 2+ years of unpatched state

### Root User Operations (MAJOR RED FLAG)

Operating as root for infrastructure management:
- No audit trail of individual actions
- No MFA enforcement at operation level
- Maximum blast radius if credentials leak

---

## Orphan Resource Discovery (Follow-up Investigation)

### Orphan VPC Resources (~$29/month in VPC endpoints)

| Resource Type | Count | Cost Impact |
|---------------|-------|-------------|
| VPC Endpoints (Interface) | 4 | **~$29/mo** |
| VPC Endpoints (Gateway) | 2 | Free |
| Subnets | 4 | Free |
| Security Groups | 7 | Free |
| Internet Gateway | 1 | Free |
| Route Tables | 3 | Free |

Interface endpoints (SSM, logs, ecr.dkr, ecr.api) cost ~$7.30/month each.

### CloudWatch Log Retention — 5 groups with "Never expire"

| Log Group | Retention | Recommended |
|-----------|-----------|-------------|
| /aws/codebuild/mb-portfolio-deployment | Never | 30 days |
| /aws/codebuild/michaelbean_org | Never | 30 days |
| /ecs/saleor-platform-staging | Never | 14 days |
| /ecs/saleor-platform-staging/db-setup | Never | 7 days |
| /ecs/saleor-platform-staging/prisma-push | Never | 7 days |

### Already Remediated

- **Orphan EIP released** (54.241.148.60) — saves ~$3.65/mo
- **NAT Gateway + EC2 cleanup** — saves ~$37/mo

---

## Council Consensus: Remediation Action Plan

### Agreed by all 4 council members:

| Priority | Action | Owner | Timeline |
|----------|--------|-------|----------|
| P0 | Lock root user, enable MFA, create IAM admin | Security | Day 1 (< 1 hour) |
| P0 | Verify CloudTrail is active | Security | Day 1 |
| P1 | Delete orphaned resources ($45-50 waste) | FinOps | Days 2-3 |
| P1 | Implement instance scheduling (off-hours) | FinOps | Days 4-7 |
| P2 | IaC reconciliation — import existing state | Architecture | Weeks 2-3 |
| P2 | Security group consolidation (7 → 2-3) | Architecture + Security | Week 3 |
| P3 | Terraform drift detection in CI | Architecture | Week 4 |

### Estimated Impact

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Monthly Cost | $222 | $130-150 | 60 days |
| Cost Reduction | — | 32-40% | 60 days |
| Security Groups | 7 duplicates | 2-3 consolidated | 30 days |
| Root User Status | Active | Locked + MFA | Day 1 |
| IaC Coverage | Drifted | Reconciled | 30 days |

### Effort Required

~20-30 hours total across 4 weeks:
- Day 1: 1-2 hours (root lockdown + CloudTrail)
- Week 1: 4-6 hours (cleanup + scheduling)
- Weeks 2-4: 15-20 hours (IaC reconciliation)

---

## Savings Summary

| Category | Monthly Savings | Status |
|----------|----------------|--------|
| NAT Gateway removal | $21-25 | Completed |
| EIP release | $3.65 | Completed |
| EC2 cleanup | ~$12 | Completed |
| Orphan VPC endpoints | ~$29 | Pending |
| CloudWatch optimization | $10-17 | Pending |
| Log retention policies | $2-5 | Pending |
| Instance scheduling (off-hours) | $30-50 | Pending |
| **Total Already Saved** | **~$37/mo** | |
| **Total Pending Savings** | **~$71-101/mo** | |
| **Combined Annual Impact** | **$1,296-1,656/yr** | |

---

## Key Decisions

- **RI/SP commitments:** Not appropriate for staging environments (Council consensus)
- **$222/month baseline:** Reasonable for staging environment of this scope — optimization focuses on waste elimination and scheduling, not commitment purchases
- **IaC reconciliation:** Root cause of drift, addresses both cost and security simultaneously

---

## Source Sessions

- AWS Cost Explorer analysis: 2026-01-26 16:33
- Security position assessment: 2026-01-26 16:37
- Council debate (3 rounds): 2026-01-26 16:39
- Orphan resource discovery: 2026-01-26 17:10

---

*Consolidated from PAI Council multi-agent analysis*
