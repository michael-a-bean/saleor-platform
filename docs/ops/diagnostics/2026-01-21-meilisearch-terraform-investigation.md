# Meilisearch & Terraform Deployment Investigation

**Date:** 2026-01-21
**Investigators:** 4 parallel expert agents (INFRA-TF, MEILI-SVC, NET-CONN, INT-VALID)
**Status:** COMPLETE

---

## Executive Summary

1. **Meilisearch is NOT managed by Terraform** - manually deployed in a different VPC, creating infrastructure drift and recovery risk
2. **Production deployment does not exist** - search functionality will be unavailable in production
3. **VPC mismatch** - Terraform manages `vpc-0b0360f5c0c874c59`, actual deployment in `vpc-03bec79de659bddf7`
4. **No authentication configured** - MEILI_MASTER_KEY not set anywhere (relies on network isolation only)
5. **No index sync automation** - manual scripts only, no scheduled workers or webhooks

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AWS VPC (ACTUAL: vpc-03bec...)                   │
│                        Note: Terraform manages different VPC!           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              Application Load Balancer (Public)                  │   │
│  │              Ports: 80 (HTTP), 443 (HTTPS optional)             │   │
│  │              NO Meilisearch routing                             │   │
│  └────────────────────────────┬────────────────────────────────────┘   │
│                               │                                         │
│         ┌─────────────────────┼─────────────────────┐                  │
│         │                     │                     │                  │
│         ▼                     ▼                     ▼                  │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐            │
│  │ Storefront  │      │  Dashboard  │      │    API      │            │
│  │ (Port 3000) │      │  (Port 80)  │      │ (Port 8000) │            │
│  └──────┬──────┘      └─────────────┘      └──────┬──────┘            │
│         │                                         │                    │
│         │ Port 7700                              │ Port 7700          │
│         │ (Security Group)                       │ (Security Group)   │
│         │                                         │                    │
│         └──────────────────┬─────────────────────┘                    │
│                            ▼                                           │
│                 ┌─────────────────────┐                                │
│                 │    MEILISEARCH      │                                │
│                 │    (Port 7700)      │                                │
│                 │                     │                                │
│                 │ DNS: meilisearch.   │                                │
│                 │ saleor-platform-    │                                │
│                 │ staging.local:7700  │                                │
│                 │                     │                                │
│                 │ Status: MANUAL      │                                │
│                 │ (Not in Terraform)  │                                │
│                 └─────────────────────┘                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Internal Services                            │   │
│  │  RDS PostgreSQL (5432)  │  ElastiCache Redis (6379)            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Terraform Analysis

### Module Structure

```
ROOT (main.tf)
├── VPC Module ──────────── Creates vpc-0b0360f5c0c874c59 (NOT where Meilisearch runs)
├── S3 Module ───────────── Media bucket
├── ECR Module ──────────── 6 repositories (no Meilisearch)
├── DynamoDB Module ─────── Stripe app table
├── ElastiCache Module ──── Redis cache/broker
├── RDS Module ──────────── PostgreSQL database
├── ALB Module ──────────── Load balancer + 7 target groups (no Meilisearch)
├── IAM Module ──────────── 8 IAM roles
└── ECS Module ──────────── 7 task definitions, 6+ services
    └── MISSING: Meilisearch task definition & service
```

### Resource Inventory

| Category | Count | Notes |
|----------|-------|-------|
| VPC Resources | 15 | VPC, subnets, NAT, endpoints |
| Container Registry | 6 | ECR repos for apps |
| Database | 2-3 | RDS instances + proxy |
| Cache | 1-2 | ElastiCache clusters |
| Load Balancing | 11 | ALB + 7 target groups + listeners |
| ECS | 13+ | Cluster, task defs, services |
| IAM | 19 | Roles + policies |
| **Meilisearch** | **0** | **Not managed by Terraform** |

### Critical Gap: Meilisearch Not in Terraform

**What exists in Terraform:**
- CloudWatch log group: `/ecs/saleor-platform-staging/meilisearch` (managed)
- Variable: `meilisearch_url` passed to ECS services
- Variable: `meilisearch_image = "getmeili/meilisearch:v1.6"` (defined but unused)

**What's missing:**
- `aws_ecs_task_definition` for Meilisearch
- `aws_ecs_service` for Meilisearch
- `aws_service_discovery_private_dns_namespace`
- `aws_service_discovery_service`
- Auto-scaling configuration

---

## Meilisearch Configuration

### Deployment Status by Environment

| Environment | Status | Method | URL |
|-------------|--------|--------|-----|
| **Local** | Working | Docker Compose | `http://meilisearch:7700` |
| **Staging** | Working | Manual ECS | `http://meilisearch.saleor-platform-staging.local:7700` |
| **Production** | **NOT DEPLOYED** | N/A | N/A |

### Index Inventory (from MCP health check)

| Index | Primary Key | Created | Last Updated | Status |
|-------|-------------|---------|--------------|--------|
| `singles-builder-products` | id | 2026-01-05 | 2026-01-06 | Active |
| `webstore-products` | id | 2026-01-09 | 2026-01-20 | Active |

### Configuration Sources

| Source | Location | MEILISEARCH_URL |
|--------|----------|-----------------|
| Docker Compose | `docker-compose.yml:136` | `http://meilisearch:7700` |
| Local .env | `.env.example:111` | `http://meilisearch:7700` |
| Storefront .env | `storefront/.env.example:17` | `http://localhost:7700` |
| Terraform | `main.tf:207` | `http://meilisearch.${name_prefix}.local:7700` |
| ECS Task | `modules/ecs/main.tf:286` | Via `var.meilisearch_url` |

### Sync Mechanisms

| Method | Script | Trigger | Status |
|--------|--------|---------|--------|
| Full Sync | `scripts/sync-meilisearch.py` | Manual CLI | Works |
| Delta Sync | `scripts/meilisearch-delta-sync.py` | Manual CLI | Works |
| Auto-sync | `saleor-mcp/auto_sync.py` | Webhook | Enabled by default |
| Scheduled | None | N/A | **Missing** |

---

## Network & Security

### Security Group Rules for Port 7700

| Source | Destination | Port | Rule |
|--------|-------------|------|------|
| `ecs_backend` (self) | Meilisearch | 7700 | Backend services can reach Meilisearch |
| `ecs_frontend` | Meilisearch | 7700 | Storefront can reach Meilisearch |
| Internet | Meilisearch | 7700 | **BLOCKED** (correct) |
| ALB | Meilisearch | 7700 | **BLOCKED** (no target group) |

### Security Assessment

| Aspect | Status | Risk |
|--------|--------|------|
| Public Exposure | None | Low |
| TLS Encryption | None | Medium (internal traffic unencrypted) |
| API Authentication | **None** | High (no MEILI_MASTER_KEY) |
| Network Isolation | Yes | Low |

---

## Integration Consistency

### Environment Comparison Matrix

| Config | Local | Staging | Production |
|--------|-------|---------|------------|
| Meilisearch Service | Docker | Manual ECS | **MISSING** |
| API Key | None | None | None |
| Index Count | 2 | 2 | 0 |
| Sync Method | Manual | Manual | N/A |
| Terraform Managed | No | No | No |

### Code Behavior When Meilisearch Unavailable

```typescript
// storefront/src/app/[channel]/(main)/search/actions.ts
const isHealthy = await isMeilisearchHealthy();
if (!isHealthy) {
  console.warn("Meilisearch is not available, returning empty results");
  return { products: [], totalCount: 0, hasNextPage: false };
}
```

**Impact:** Users get empty search results, not an error page. No fallback to GraphQL search.

---

## Issues Found

### P0: Production Blockers

| Issue | Location | Impact | Remediation |
|-------|----------|--------|-------------|
| Meilisearch not in Terraform | `modules/ecs/main.tf` | Can't redeploy | Add ECS task def + service |
| VPC Mismatch | `imports.tf:114-145` | State drift | Reconcile VPCs or import |
| Production not deployed | N/A | No search in prod | Deploy before go-live |
| No index population on deploy | N/A | Empty search | Add init script |

### P1: High Priority

| Issue | Location | Impact | Remediation |
|-------|----------|--------|-------------|
| No MEILI_MASTER_KEY | All environments | Security gap | Configure API key |
| No scheduled sync | `scripts/` | Stale data | Add ECS scheduled task |
| Missing fallback search | `search/actions.ts` | Poor UX | Add GraphQL fallback |
| Service Discovery not in TF | N/A | Manual recovery | Import or recreate |

### P2: Technical Debt

| Issue | Location | Impact | Remediation |
|-------|----------|--------|-------------|
| Hardcoded URLs in scripts | `sync-meilisearch.py:65-70` | Manual override | Use env vars |
| No health monitoring | CloudWatch | Silent failures | Add alarms |
| meilisearch_image unused | `variables.tf:276` | Confusing | Use in task def |
| No auto-scaling | N/A | Performance | Add scaling policy |

---

## Recommendations

### Immediate Actions (P0)

1. **Add Meilisearch to Terraform**
   ```hcl
   # modules/ecs/main.tf - Add:
   resource "aws_ecs_task_definition" "meilisearch" { ... }
   resource "aws_ecs_service" "meilisearch" { ... }
   resource "aws_service_discovery_service" "meilisearch" { ... }
   ```

2. **Resolve VPC Mismatch**
   - Option A: Import existing resources into Terraform state
   - Option B: Redeploy Meilisearch in Terraform-managed VPC

3. **Plan Production Deployment**
   - Create `production.tfvars` with Meilisearch configuration
   - Document deployment procedure
   - Plan index initialization

### Before Production (P1)

4. **Configure API Authentication**
   ```bash
   # Store in AWS Secrets Manager
   aws secretsmanager create-secret --name saleor-platform/meilisearch-master-key
   ```

5. **Add Index Sync Automation**
   - Create ECS scheduled task for daily full sync
   - Or implement webhook-based real-time sync

6. **Implement Search Fallback**
   - Add GraphQL product search as fallback
   - Feature flag for search method

### Future Improvements (P2)

7. **Add Monitoring**
   - CloudWatch alarms for Meilisearch health
   - Dashboard for index stats

8. **Enable Auto-scaling**
   - CPU-based scaling for Meilisearch service
   - Memory monitoring

---

## Next Steps

1. [ ] **Decision**: Reconcile VPC mismatch (import vs. redeploy)
2. [ ] **Create**: Meilisearch Terraform resources in `modules/ecs/main.tf`
3. [ ] **Configure**: MEILI_MASTER_KEY in Secrets Manager
4. [ ] **Document**: Production deployment runbook
5. [ ] **Implement**: Scheduled index sync task
6. [ ] **Test**: Verify search works after Terraform apply

---

## Appendix: File References

### Terraform Files
- `infra/terraform/main.tf:207` - meilisearch_url local
- `infra/terraform/variables.tf:276-280` - meilisearch_image variable
- `infra/terraform/modules/ecs/main.tf:44` - CloudWatch log group
- `infra/terraform/modules/ecs/main.tf:286` - MEILISEARCH_URL env var
- `infra/terraform/modules/ecs/main.tf:770-789` - Manual deployment comment
- `infra/terraform/modules/alb/main.tf:101-154` - Security group rules
- `infra/terraform/imports.tf:114-145` - VPC mismatch documentation

### Application Files
- `docker-compose.yml:299-312` - Local Meilisearch service
- `storefront/src/lib/meilisearch.ts` - Client implementation
- `storefront/src/app/[channel]/(main)/search/actions.ts` - Search action
- `scripts/sync-meilisearch.py` - Full sync script
- `scripts/meilisearch-delta-sync.py` - Delta sync script
- `saleor-mcp/src/saleor_mcp/auto_sync.py` - Auto-sync implementation

### Documentation
- `docs/deploy/aws/ENV_VARS.md:54` - Meilisearch URL reference
- `docs/ops/prompts/INVESTIGATE-meilisearch-terraform-deployment.md` - This investigation prompt
