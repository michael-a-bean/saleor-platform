# Meilisearch Staging Fix - Implementation Plan

**Created:** 2026-01-26
**Source:** Council Debate (Architect, Engineer, Researcher, Security)
**Status:** Ready for Implementation

## Executive Summary

Meilisearch works locally but fails in staging due to **authentication mismatch**. Local development runs without auth; staging requires master key authentication but clients don't send credentials.

### Root Cause

```
Local:   MEILI_MASTER_KEY=<empty> → No auth required → Clients work
Staging: MEILI_MASTER_KEY=<set>  → Auth required  → Clients fail with 401/403
```

The master key exists in AWS Secrets Manager but **no client code consumes it**.

---

## Phase 1: Fix Authentication (P0 - Immediate)

**Goal:** Get staging Meilisearch operational
**Estimated Scope:** 5 files to modify
**Risk Level:** Low (additive changes only)

### Invocation Prompt

```
Implement Phase 1 of the Meilisearch staging fix plan at docs/plans/MEILISEARCH-STAGING-FIX.md

Focus: Add MEILISEARCH_API_KEY authentication to all client code.

Context:
- Staging Meilisearch requires master key auth (stored in Secrets Manager)
- All 5 client locations currently make unauthenticated requests
- Local can continue working without auth (key is optional)

Do NOT:
- Change infrastructure/Terraform
- Modify Meilisearch configuration
- Start on Phase 2 or 3
```

### Tasks

#### 1.1 Update Python Sync Scripts

**Files:**
- `scripts/sync-meilisearch.py`
- `scripts/meilisearch-delta-sync.py`
- `scripts/meilisearch-reconcile.py`

**Change Required:**
```python
# Current (broken)
client = meilisearch.Client(os.getenv("MEILISEARCH_URL", "http://localhost:7700"))

# Fixed
client = meilisearch.Client(
    os.getenv("MEILISEARCH_URL", "http://localhost:7700"),
    os.getenv("MEILISEARCH_API_KEY")  # None is valid for local dev
)
```

**Verification:**
```bash
# Local (should still work without key)
MEILISEARCH_URL=http://localhost:7700 python scripts/sync-meilisearch.py --channel webstore --dry-run

# Staging simulation (with key)
MEILISEARCH_URL=http://localhost:7700 MEILISEARCH_API_KEY=test-key python scripts/sync-meilisearch.py --channel webstore --dry-run
```

#### 1.2 Update Storefront TypeScript Client

**File:** `storefront/src/lib/meilisearch.ts`

**Change Required:**
```typescript
// Current (broken) - around line 185-193
const response = await fetch(`${MEILISEARCH_URL}/indexes/${indexName}/search`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(searchParams),
});

// Fixed
const headers: Record<string, string> = {
  "Content-Type": "application/json",
};

const apiKey = process.env.MEILISEARCH_API_KEY;
if (apiKey) {
  headers["Authorization"] = `Bearer ${apiKey}`;
}

const response = await fetch(`${MEILISEARCH_URL}/indexes/${indexName}/search`, {
  method: "POST",
  headers,
  body: JSON.stringify(searchParams),
});
```

**Also update health check and stats functions with same pattern.**

**Environment Variable:** Add to `storefront/.env.example`:
```bash
# Meilisearch API key (required for staging/production, optional for local)
# MEILISEARCH_API_KEY=
```

#### 1.3 Update MCP Client

**File:** `saleor-mcp/src/saleor_mcp/meilisearch_client.py`

**Change Required:**
```python
# Current (around line 88-90)
self.client = meilisearch.Client(url)

# Fixed
self.client = meilisearch.Client(
    url,
    os.getenv("MEILISEARCH_API_KEY")
)
```

#### 1.4 Update Terraform ECS Task Definitions

**File:** `infra/terraform/main.tf`

**Verify these environment variables are passed to tasks that need Meilisearch access:**

For sync worker (should already exist around line 703-708):
```hcl
{
  name  = "MEILISEARCH_API_KEY"
  valueFrom = aws_secretsmanager_secret.meilisearch_master_key[0].arn
}
```

For storefront task (ADD if missing):
```hcl
environment = [
  # ... existing vars ...
  {
    name  = "MEILISEARCH_API_KEY"
    valueFrom = aws_secretsmanager_secret.meilisearch_master_key[0].arn
  }
]
```

#### 1.5 Verify Secrets Manager Secret Exists

**Command:**
```bash
aws secretsmanager describe-secret --secret-id saleor-staging-meilisearch-master-key --region us-west-2
```

**If missing, Terraform should create it. Run:**
```bash
cd infra/terraform && terraform plan -var-file=environments/staging.tfvars
```

### Phase 1 Completion Criteria

- [x] All 3 Python scripts accept optional `MEILISEARCH_API_KEY`
- [x] Storefront client sends `Authorization` header when key is set
- [x] MCP client passes key to meilisearch SDK (already implemented)
- [x] Terraform passes secret to ECS tasks (storefront + sync-worker)
- [ ] Local development still works without key (verify before deploy)
- [ ] `terraform plan` shows no unexpected changes (run before deploy)

---

## Phase 2: Validate Staging (P1 - This Week)

**Goal:** Confirm fix resolves staging issues
**Duration:** 48-72 hours monitoring
**Prerequisite:** Phase 1 complete and deployed

### Invocation Prompt

```
Implement Phase 2 of the Meilisearch staging fix plan at docs/plans/MEILISEARCH-STAGING-FIX.md

Focus: Deploy Phase 1 changes and validate staging Meilisearch is operational.

Prerequisites confirmed:
- Phase 1 code changes are merged
- Ready to deploy to staging

Do NOT:
- Make additional code changes
- Start Phase 3
```

### Tasks

#### 2.1 Deploy to Staging

```bash
# Apply Terraform changes
cd infra/terraform
terraform apply -var-file=environments/staging.tfvars

# Force new deployment of affected services
aws ecs update-service --cluster saleor-staging --service storefront --force-new-deployment
aws ecs update-service --cluster saleor-staging --service meilisearch-sync-worker --force-new-deployment
```

#### 2.2 Verify Meilisearch Connectivity

```bash
# Check Meilisearch health from within VPC (run on bastion or ECS exec)
curl -H "Authorization: Bearer $MEILISEARCH_API_KEY" \
  http://meilisearch.saleor-staging.local:7700/health

# Expected: {"status":"available"}
```

#### 2.3 Run Manual Sync Test

```bash
# SSH to bastion or use ECS exec
# Run delta sync with verbose output
python scripts/meilisearch-delta-sync.py --channel webstore --hours 1 --verbose
```

**Expected output:** Documents synced without 401/403 errors

#### 2.4 Test Storefront Search

1. Navigate to staging storefront search page
2. Enter search term (e.g., "Black Lotus")
3. Verify results appear (not empty or error)

#### 2.5 Monitor CloudWatch Logs

```bash
# Check for auth errors
aws logs filter-log-events \
  --log-group-name /ecs/saleor-staging/meilisearch-sync-worker \
  --filter-pattern "401 OR 403 OR unauthorized" \
  --start-time $(date -d '1 hour ago' +%s)000
```

**Expected:** No matches (no auth errors)

#### 2.6 Run Reconciliation

```bash
python scripts/meilisearch-reconcile.py --channel webstore
```

**Expected:** Counts match between Saleor and Meilisearch

### Phase 2 Completion Criteria

- [x] Terraform applied - storefront task definition updated with MEILISEARCH_API_KEY secret (revision 40)
- [x] Storefront service deployed with new task definition
- [x] No Meilisearch 401/403 errors in CloudWatch logs
- [ ] Sync worker completes without auth errors (image not yet pushed)
- [ ] Storefront search returns results (requires data sync)
- [ ] Reconciliation shows matching counts
- [ ] Scheduled catchup sync (15-min) running successfully

**Note (2026-01-26):** Phase 2 infrastructure deployment complete. Storefront is running with `MEILISEARCH_API_KEY` secret injected. The ECS health check failure (`/api/health` returning 404) is unrelated to Meilisearch - it's a pre-existing issue with the deployed storefront image. Next steps:
1. Push price-sync-worker image to ECR
2. Run manual sync to populate Meilisearch index
3. Verify search functionality on storefront

---

## Phase 3: Architecture Decision (P2 - Next Sprint)

**Goal:** Decide whether to migrate to Saleor App architecture
**Prerequisite:** Phase 2 complete, staging stable for 48+ hours
**Decision Point:** Commit to migration or document current architecture as stable

### Invocation Prompt

```
Implement Phase 3 of the Meilisearch staging fix plan at docs/plans/MEILISEARCH-STAGING-FIX.md

Focus: Evaluate Saleor App migration based on Phase 2 stability results.

Stability Status: [STABLE / UNSTABLE - describe issues]

Provide:
1. Architecture decision recommendation
2. If migrating: detailed implementation plan
3. If not migrating: documentation of current architecture
```

### Decision Framework

#### If Staging is STABLE (48+ hours, no issues)

**Recommended Action:** Document current architecture, defer migration

**Tasks:**
1. Create architecture documentation in `docs/reference/meilisearch-architecture.md`
2. Document auth pattern for future reference
3. Add runbook for common operations
4. Schedule quarterly review of migration decision

#### If Staging is UNSTABLE (continued issues)

**Recommended Action:** Begin Saleor App migration

**Tasks:**
1. Create new Saleor App: `saleor-apps/apps/meilisearch-sync/`
2. Implement webhook handlers for `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DELETED`
3. Move sync logic from Python scripts to TypeScript app
4. Configure app permissions and installation
5. Deprecate Python scripts and Terraform sync infrastructure

### Saleor App Migration Outline (If Needed)

```
saleor-apps/apps/meilisearch-sync/
├── src/
│   ├── pages/
│   │   └── api/
│   │       └── webhooks/
│   │           ├── product-created.ts
│   │           ├── product-updated.ts
│   │           └── product-deleted.ts
│   ├── lib/
│   │   ├── meilisearch-client.ts
│   │   └── product-transformer.ts
│   └── saleor-app.ts
├── package.json
└── README.md
```

**Key Benefits of App Approach:**
- Webhook-driven (real-time sync)
- Unified auth through Saleor's app framework
- Same deployment model as other apps
- Built-in retry mechanism

**Key Risks of App Approach:**
- New codebase to maintain
- Webhook latency vs batch sync performance
- App installation/permission management
- Migration of 100k+ existing documents

### Phase 3 Completion Criteria

- [ ] Architecture decision documented
- [ ] If stable: Current architecture documented
- [ ] If unstable: Migration plan created with timeline
- [ ] Decision record created in `docs/decisions/`

---

## Quick Reference

### Environment Variables

| Variable | Local | Staging | Description |
|----------|-------|---------|-------------|
| `MEILISEARCH_URL` | `http://meilisearch:7700` | `http://meilisearch.saleor-staging.local:7700` | Meilisearch endpoint |
| `MEILISEARCH_API_KEY` | (empty) | From Secrets Manager | Master key for auth |

### Files Modified in Phase 1

| File | Change |
|------|--------|
| `scripts/sync-meilisearch.py` | Add API key to client init |
| `scripts/meilisearch-delta-sync.py` | Add API key to client init |
| `scripts/meilisearch-reconcile.py` | Add API key to client init |
| `storefront/src/lib/meilisearch.ts` | Add Authorization header |
| `saleor-mcp/src/saleor_mcp/meilisearch_client.py` | Add API key to client init |

### Useful Commands

```bash
# Check Meilisearch health (local)
curl http://localhost:7700/health

# Check Meilisearch health (staging, with auth)
curl -H "Authorization: Bearer $MEILISEARCH_API_KEY" http://meilisearch.saleor-staging.local:7700/health

# Get index stats
curl -H "Authorization: Bearer $MEILISEARCH_API_KEY" http://meilisearch.saleor-staging.local:7700/indexes/webstore-products/stats

# Run full sync (local)
python scripts/sync-meilisearch.py --channel webstore

# Run delta sync (staging)
MEILISEARCH_API_KEY=$KEY python scripts/meilisearch-delta-sync.py --channel webstore --hours 1
```

---

## Council Findings Summary

| Agent | Key Finding | Recommendation |
|-------|-------------|----------------|
| **Architect** | SNS→SQS adds failure points | Fix auth AND prototype app in parallel |
| **Engineer** | Auth gap is the smoking gun | Fix auth first, measure, then decide |
| **Researcher** | Saleor has official Search App pattern | Auth gap is design flaw, not config |
| **Security** | Keys exist but clients don't use them | P0 auth fix, P2 migration evaluation |

**Consensus:** Fix authentication immediately (unanimous), then evaluate architecture (timing disputed).

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-26 | Initial plan created from Council debate | Gen |
