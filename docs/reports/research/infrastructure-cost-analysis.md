# Staging Environment Cost Analysis

**Agent**: Codebase Explorer (Infrastructure Costs)
**Date**: 2026-02-13
**Scope**: AWS staging environment cost analysis with performance implications
**Environment**: AWS Account 546464732019 (us-west-1)

---

## Executive Summary

The staging environment is **well-optimized for MVP demo use** following a February 12, 2026 cost optimization that reduced spending by ~$94/month (30% savings).

- **Current baseline**: ~$220/month
- **Demo readiness**: 100% -- All critical services over-provisioned
- **Optimization potential**: $18-115/month additional savings available
- **Demo performance risk**: Minimal at current configuration
- **Recommendation**: Keep current, no changes needed for MVP

---

## Current Staging Architecture

### Active AWS Services & Monthly Costs

| Service | Resource | Configuration | Cost/mo |
|---------|----------|---------------|---------|
| ECS Fargate | API | 1x 1024 CPU, 2048 MB | $48 |
| | Worker | 1x 256 CPU, 1024 MB | $8 |
| | Beat | 1x 256 CPU, 512 MB | $4 |
| | Storefront | 1x 256 CPU, 512 MB | $4 |
| | Stripe App | 1x 256 CPU, 512 MB | $4 |
| | Inventory-Ops | 1x 256 CPU, 512 MB | $4 |
| | Buylist | 1x 256 CPU, 512 MB | $4 |
| | POS | 1x 256 CPU, 512 MB | $4 |
| | Meilisearch | 1x 256 CPU, 512 MB | $4 |
| | Dashboard | **Scaled to 0** | $0 |
| | MTG Import | **Scaled to 0** (on-demand) | $0 |
| Database | RDS PostgreSQL | db.t3.small, 100 GB, 7-day backup | $23 |
| Cache | ElastiCache Redis | cache.t3.micro, single-AZ | $7 |
| Load Balancer | ALB | HTTP/path-based routing | $9 |
| Network | NAT Gateway | 1x single-AZ | $32 |
| CDN | CloudFront | PriceClass_100 (US/Europe) | $5 |
| Storage | S3 media | ~50 GB | $1.50 |
| | EFS (Meilisearch) | ~2 GB | $0.50 |
| Monitoring | CloudWatch Logs | 14-day retention | $3 |
| Registry | ECR | 10 repos | $2 |
| Serverless | DynamoDB (Stripe) | On-demand | $1 |
| Secrets | SSM Parameters | 8 parameters | $0.40 |
| **TOTAL** | | | **~$220/mo** |

---

## Cost Breakdown by Category

```
Infrastructure (Network + Compute)     $115/mo  (52%)
  NAT Gateway + EIP                    $32/mo   (14.5%)  <-- Largest single cost
  ECS Fargate tasks                    $44/mo   (20%)
  RDS Database                         $23/mo   (10.5%)
  ALB                                  $9/mo    (4%)
  ElastiCache                          $7/mo    (3%)

Data & Content Delivery                $9.50/mo (4%)
  CloudFront CDN                       $5/mo
  CloudWatch monitoring                $3/mo
  S3 media storage                     $1.50/mo
  EFS persistence                      $0.50/mo

Misc Services                          $3.20/mo (1.5%)
  ECR repositories                     $2/mo
  DynamoDB                             $1/mo
  NAT egress + SNS/SQS                 $0.20/mo
```

---

## Resource Utilization (7-day averages, Feb 12, 2026)

| Service | CPU Util | Provisioned | Headroom | Memory |
|---------|----------|-------------|----------|--------|
| API | 1.3% | 1024 CPU | 98.7% | Not tracked |
| Worker | 0.8% | 256 CPU | 99.2% | 0% risk |
| Beat | 0.3% | 256 CPU | 99.7% | Negligible |
| Storefront | 0.2% | 256 CPU | 99.8% | Static gen |
| Meilisearch | 0.1% | 256 CPU | 99.9% | ~42 MB |
| RDS | 5.3% | db.t3.small | 94.7% | 55% free |
| ElastiCache | 0.24% | cache.t3.micro | 99.76% | ~6.2 MB |

All services 10x+ over-provisioned. Intentional for demo smoothness.

---

## Already Optimized (February 2026)

| Optimization | Savings | Status |
|-------------|---------|--------|
| VPC Interface Endpoints removed (4) | ~$29/mo | Done |
| RDS db.t3.medium to db.t3.small | ~$26/mo | Done |
| Dashboard scaled to 0 | ~$9/mo | Done |
| Container Insights disabled | ~$9/mo | Done |
| Worker CPU 512 to 256 | ~$2/mo | Done |
| Meilisearch right-sized | ~$9/mo | Done |
| Single NAT Gateway (vs HA) | ~$32/mo saved vs dual | Done |
| **Total savings** | **~$94/mo** | |

---

## Available Optimization Opportunities

### TIER 1: No Demo Impact (Recommended Post-MVP)

**Fargate Spot for non-critical services**
- Savings: $18-20/month
- Eligible: Worker, Beat, Stripe App, Inventory-Ops, Buylist, POS
- Protected (keep on-demand): API, Storefront
- Implementation: 2-3 hours

**Scheduled auto-scaling (20h/day off)**
- Savings: $83-115/month
- Requires 2-5 minute warm-up before demos
- Best for: post-MVP when demo timing is predictable

### TIER 2: Measurable Performance Impact (NOT Recommended)

| Option | Savings | Risk |
|--------|---------|------|
| API downsize (512 CPU) | $12/mo | +10-50ms latency |
| RDS to db.t3.micro | $10/mo | CRITICAL: OOM risk |
| Disable CloudFront | $5/mo | CRITICAL: 10x slower images |

---

## Cost Comparison Scenarios

| Scenario | Monthly | Annual | Demo Impact |
|----------|---------|--------|-------------|
| A: Current (Recommended) | $220 | $2,640 | None |
| B: + Fargate Spot | $202 | $2,424 | None |
| C: + Scheduled shutdown | $137-156 | $1,644-1,872 | 2-5 min warm-up |
| D: Spot + Scheduled | $119 | $1,428 | Minimal |
| E: Bare minimum | $92 | $1,104 | CRITICAL failure risk |

---

## NAT Gateway: The Largest Single Cost

$32.83/month (14.6% of budget) is the per-hour gateway charge, not data transfer.

Actual egress: ~1 GB/month = $0.045 in data costs.

**Why not eliminate?** ECS tasks in private subnets require NAT for:
- Container image pulls from ECR
- Webhook calls to Stripe, Scryfall, etc.
- Database migrations fetching remote schemas

**Alternative (VPC endpoints)**: Would cost $29/month for 4 endpoints -- nearly the same. Already evaluated and rejected for staging.

---

## Recommendation

**Keep Scenario A ($220/month) through MVP demo phase.** Performance is excellent, all services have 10x+ headroom, and cost is reasonable for a staging environment running 9 production-grade services.

**Post-MVP**: Implement Scenario B (Fargate Spot, $202/month) as first optimization, then evaluate Scenario C (scheduled shutdown) based on demo frequency.
