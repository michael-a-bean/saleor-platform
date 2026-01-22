# Council Prompt: Meilisearch Terraform Implementation

**Created:** 2026-01-21
**Status:** READY FOR EXECUTION
**Input:** `docs/ops/diagnostics/2026-01-21-meilisearch-terraform-investigation.md`
**Purpose:** Design and implement Meilisearch infrastructure in Terraform with sync automation

---

## Executive Decisions (Pre-Made)

The following decisions have been made and are NOT open for debate:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| VPC Strategy | **Redeploy in Terraform-managed VPC** | Eliminate drift, enable IaC recovery |
| Infrastructure | **Create all resources in Terraform** | Full automation, no manual steps |
| Authentication | **Configure MEILI_MASTER_KEY** | Security best practice |
| Sync Strategy | **Three-tier approach** | Initial, scheduled maintenance, webhook-triggered |

---

## Execute This Council

```
/council

**Topic:** Meilisearch Terraform Implementation and Sync Architecture

**Context:**

We completed a multi-agent investigation (see docs/ops/diagnostics/2026-01-21-meilisearch-terraform-investigation.md) that found:

1. Meilisearch runs in wrong VPC (vpc-03bec...) while Terraform manages vpc-0b036...
2. No Terraform resources for Meilisearch (task def, service, service discovery)
3. No API authentication (MEILI_MASTER_KEY not configured)
4. Manual sync scripts only - no automation

**Decisions Already Made:**
- Redeploy Meilisearch in Terraform-managed VPC (not import existing)
- Create all infrastructure via Terraform
- Configure proper authentication
- Implement three-tier sync: initial, scheduled, webhook

**Technical Constraints:**

1. **Terraform Structure:**
   - Root: `infra/terraform/main.tf`
   - ECS Module: `infra/terraform/modules/ecs/main.tf`
   - Variables flow: `variables.tf` → `main.tf` → module variables
   - State: S3 backend with workspace isolation (staging/production)

2. **Existing Patterns:**
   - ECS services use Fargate launch type
   - Service Discovery namespace: `saleor-platform-staging.local`
   - CloudWatch log groups: `/ecs/${name_prefix}/${service}`
   - Security groups defined in ALB module

3. **Meilisearch Requirements:**
   - Image: `getmeili/meilisearch:v1.6`
   - Port: 7700
   - Storage: Needs persistent data (EFS or EBS)
   - Memory: 512MB minimum, 1GB+ recommended
   - CPU: 256 units minimum

4. **Sync Requirements:**
   - Saleor GraphQL API for product data
   - Existing script: `scripts/sync-meilisearch.py` (works, needs adaptation)
   - Channels: `webstore`, `singles-builder`
   - ~51,000 products per channel

**Questions for Council:**

1. **ECS Task Architecture:**
   - Single task with persistent storage vs. managed Meilisearch Cloud?
   - EFS vs. EBS for data persistence?
   - Task placement constraints for data locality?

2. **Service Discovery:**
   - Use existing namespace or create Meilisearch-specific?
   - DNS naming convention for multi-environment?

3. **Initial Sync Strategy:**
   - Run as ECS one-shot task after service starts?
   - Include in deployment pipeline?
   - How to handle first-time vs. existing index?

4. **Maintenance Sync:**
   - ECS Scheduled Task (CloudWatch Events) vs. Lambda?
   - Frequency: hourly, daily, or based on data volume?
   - Delta sync vs. full reindex?

5. **Webhook Sync:**
   - Saleor webhook → where? (API Gateway + Lambda, SQS + Worker, direct ECS task?)
   - Which Saleor events: PRODUCT_CREATED, PRODUCT_UPDATED, PRODUCT_DELETED?
   - Batching strategy for high-volume updates?

6. **Security:**
   - MEILI_MASTER_KEY in Secrets Manager vs. SSM Parameter Store?
   - How to rotate keys without downtime?
   - Network policies for webhook endpoint?

7. **Migration Plan:**
   - How to migrate existing staging data?
   - Cutover strategy (blue-green, canary)?
   - Rollback procedure if sync fails?

**Deliverables Expected:**

1. **Terraform Resource Specifications** - Exact resources to create
2. **Sync Architecture Diagram** - How data flows from Saleor to Meilisearch
3. **Implementation Plan** - Ordered steps with dependencies
4. **Risk Assessment** - What could go wrong and mitigations
```

---

## Council Configuration

**Recommended Agents:**

| Agent | Perspective | Focus Areas |
|-------|-------------|-------------|
| **Infrastructure/Terraform** | IaC patterns, AWS best practices | ECS, EFS, Service Discovery, IAM |
| **Search/Meilisearch Expert** | Search engine operations | Indexing, performance, data model |
| **Event-Driven Architecture** | Webhooks, async processing | SQS, Lambda, event routing |
| **DevOps/Reliability** | Deployment, monitoring, recovery | Rollback, health checks, alerting |

---

## Background: Investigation Findings Summary

From `docs/ops/diagnostics/2026-01-21-meilisearch-terraform-investigation.md`:

### Current State

```
Terraform VPC:     vpc-0b0360f5c0c874c59  ← Target for redeployment
Actual Meilisearch: vpc-03bec79de659bddf7  ← Will be decommissioned

Indexes Active:
- webstore-products (51,200+ docs, updated 2026-01-20)
- singles-builder-products (51,200+ docs, updated 2026-01-06)
```

### Missing Terraform Resources

```hcl
# NEED TO CREATE:
aws_ecs_task_definition.meilisearch
aws_ecs_service.meilisearch
aws_service_discovery_service.meilisearch
aws_efs_file_system.meilisearch_data (or EBS)
aws_efs_mount_target.meilisearch (x2 for HA)
aws_iam_role.meilisearch_task
aws_secretsmanager_secret.meilisearch_master_key
aws_cloudwatch_event_rule.meilisearch_sync (scheduled)
aws_cloudwatch_event_target.meilisearch_sync
```

### Existing Security Group Rules (Keep)

```
Port 7700 allowed from:
- ecs_backend (self-reference)
- ecs_frontend (storefront access)
```

### Sync Scripts Available

| Script | Purpose | Adaptation Needed |
|--------|---------|-------------------|
| `scripts/sync-meilisearch.py` | Full sync | Containerize, add env vars |
| `scripts/meilisearch-delta-sync.py` | Delta sync | Containerize, add scheduling |
| `saleor-mcp/auto_sync.py` | Webhook handler | Extract to standalone service |

---

## Implementation Phases (Proposed)

### Phase 1: Core Infrastructure

```
1. Create EFS file system for Meilisearch data
2. Create Meilisearch ECS task definition
3. Create Meilisearch ECS service
4. Create Service Discovery service
5. Store MEILI_MASTER_KEY in Secrets Manager
6. Update security groups if needed
7. Terraform apply → Service running
```

### Phase 2: Initial Sync

```
1. Create sync container image (from sync-meilisearch.py)
2. Create ECS task definition for sync job
3. Run initial sync as one-shot task
4. Verify indexes populated
```

### Phase 3: Scheduled Maintenance Sync

```
1. Create CloudWatch Event Rule (schedule)
2. Create Event Target → ECS task
3. Configure delta sync (not full reindex)
4. Test scheduled execution
```

### Phase 4: Webhook-Triggered Sync

```
1. Design event routing (API Gateway vs SQS)
2. Create webhook handler (Lambda or ECS task)
3. Configure Saleor webhooks
4. Test product create/update/delete events
```

### Phase 5: Migration & Cutover

```
1. Run parallel with old Meilisearch
2. Verify data parity
3. Switch storefront MEILISEARCH_URL
4. Decommission old service
```

---

## Expected Council Output

The council should produce:

### 1. Architecture Decision Records

```markdown
## ADR-001: Meilisearch Storage
- Decision: [EFS vs EBS]
- Rationale: [Why]
- Consequences: [Trade-offs]

## ADR-002: Sync Event Routing
- Decision: [API Gateway + Lambda vs SQS + Worker]
- Rationale: [Why]
- Consequences: [Trade-offs]
```

### 2. Terraform Resource Specifications

```hcl
# Pseudocode for each resource needed
resource "aws_ecs_task_definition" "meilisearch" {
  # Exact configuration
}
```

### 3. Sync Architecture Diagram

```
Saleor API ──webhook──> [?] ──> Meilisearch
                         │
                         └── What goes here?
```

### 4. Implementation Checklist

```markdown
## Phase 1: Infrastructure
- [ ] Task 1: Description
- [ ] Task 2: Description
...
```

### 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during migration | Medium | High | ... |

---

## Post-Council Actions

After council concludes:

1. **Create implementation plan** at `.claude/plans/meilisearch-terraform-implementation.md`
2. **Implement Phase 1** - Core Terraform resources
3. **Test in staging** - Verify service runs
4. **Implement Phase 2-4** - Sync mechanisms
5. **Document** - Update `docs/reference/architecture.md`

---

## Quick Execution

Copy this to run the council:

```
/council

Topic: Meilisearch Terraform Implementation and Sync Architecture

Context: Investigation complete (docs/ops/diagnostics/2026-01-21-meilisearch-terraform-investigation.md). Decisions made: redeploy in correct VPC, create Terraform resources, configure auth, implement three-tier sync (initial, scheduled, webhook).

Questions:
1. EFS vs EBS for Meilisearch data persistence?
2. Sync event routing: API Gateway + Lambda vs SQS + ECS Worker?
3. Scheduled sync frequency and strategy (delta vs full)?
4. Webhook batching for high-volume product updates?
5. Migration cutover strategy?

Deliver: Terraform specs, sync architecture, implementation plan, risk assessment.

Agents: Infrastructure expert, Search/Meilisearch expert, Event-driven architecture expert, DevOps/reliability expert
```

---

## Related Files

- Investigation: `docs/ops/diagnostics/2026-01-21-meilisearch-terraform-investigation.md`
- ECS Module: `infra/terraform/modules/ecs/main.tf`
- ALB Module: `infra/terraform/modules/alb/main.tf`
- Variables: `infra/terraform/variables.tf`
- Sync Script: `scripts/sync-meilisearch.py`
- Delta Sync: `scripts/meilisearch-delta-sync.py`
- Auto Sync: `saleor-mcp/src/saleor_mcp/auto_sync.py`
