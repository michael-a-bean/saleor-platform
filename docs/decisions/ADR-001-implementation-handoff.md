# ADR-001 Implementation Handoff

**Parent Document:** ADR-001-inventory-ops-costing-layer.md
**Date:** 2026-01-19
**Status:** Ready for Implementation

---

## Quick Summary for Implementation Council

The Architecture Council has **validated inventory-ops** as the correct costing layer approach. No architectural changes required. Implementation focus is **operational reliability improvements**.

### What's Approved
- Current database-per-service architecture
- Append-only CostLayerEvent ledger
- Webhook-based Saleor integration
- Pure WAC costing method

### What's NOT Approved (Deferred)
- Hybrid costing (WAC + specific identification)
- CQRS pattern for cross-service queries
- Any direct Saleor database writes

---

## Implementation Tasks

### Task 1: Reconciliation Endpoint

**Priority:** P0 (Critical)
**Estimated Effort:** 2-3 days
**Files to Create/Modify:**
- `src/modules/reconciliation/reconciliation-router.ts` (new)
- `src/modules/reconciliation/reconciliation-service.ts` (new)
- `prisma/schema.prisma` (add ReconciliationRun model)
- `src/modules/trpc/trpc-router.ts` (add reconciliation router)

**Acceptance Criteria:**
```gherkin
Given the reconciliation endpoint exists
When I call POST /api/trpc/reconciliation.run
Then it compares CostLayerEvent-derived quantities against Saleor stock
And returns any discrepancies with variant IDs, SKUs, and deltas
And stores the run result in ReconciliationRun table
```

**Schema Addition:**
```prisma
model ReconciliationRun {
  id               String    @id @default(uuid())
  installationId   String
  triggeredBy      String    // GOODS_RECEIPT | ORDER_FULFILLED | SCHEDULED | MANUAL
  startedAt        DateTime  @default(now())
  completedAt      DateTime?
  status           String    // RUNNING | PASSED | DIVERGENCE | FAILED
  discrepancyCount Int       @default(0)
  details          Json?

  installation     AppInstallation @relation(fields: [installationId], references: [id])

  @@index([installationId, startedAt])
}
```

**tRPC Procedures:**
```typescript
reconciliation.run        // Trigger reconciliation
reconciliation.getLatest  // Get most recent run
reconciliation.getHistory // List past runs with pagination
```

---

### Task 2: Circuit Breaker for Webhooks

**Priority:** P0 (Critical)
**Estimated Effort:** 1-2 days
**Files to Create/Modify:**
- `src/lib/circuit-breaker.ts` (new)
- `src/app/api/webhooks/saleor/order-fulfilled/route.ts` (modify)
- `prisma/schema.prisma` (add CircuitState model)

**Acceptance Criteria:**
```gherkin
Given the circuit breaker is CLOSED
When 3 consecutive webhook processing failures occur
Then the circuit opens
And an alert is sent (log + notification)
And subsequent webhooks are rejected with 503

Given the circuit is OPEN
When an operator manually resets via API
Then the circuit moves to HALF_OPEN
And the next webhook is attempted as a probe
```

**Configuration:**
```typescript
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3,        // Failures before opening
  resetTimeoutMs: 300000,     // 5 minutes before auto half-open
  halfOpenMaxAttempts: 1,     // Probes before closing
};
```

**Schema Addition:**
```prisma
model CircuitState {
  id              String   @id @default(uuid())
  installationId  String
  webhookType     String   // ORDER_FULFILLED | STOCK_UPDATED
  state           String   // CLOSED | OPEN | HALF_OPEN
  failureCount    Int      @default(0)
  lastFailure     DateTime?
  lastStateChange DateTime @default(now())

  @@unique([installationId, webhookType])
}
```

**tRPC Procedures:**
```typescript
circuit.getStatus   // Get current circuit state
circuit.reset       // Manually reset circuit (requires auth)
circuit.getHistory  // Audit log of state changes
```

---

### Task 3: Event-Driven Reconciliation Triggers

**Priority:** P1 (High)
**Estimated Effort:** 1 day
**Files to Modify:**
- `src/modules/goods-receipts/goods-receipts-router.ts` (post procedure)
- `src/app/api/webhooks/saleor/order-fulfilled/use-case.ts`

**Acceptance Criteria:**
```gherkin
Given a goods receipt is posted successfully
Then a reconciliation run is triggered for affected variants
And the run is stored with triggeredBy = "GOODS_RECEIPT"

Given an ORDER_FULFILLED webhook is processed successfully
Then a reconciliation run is triggered for fulfilled variants
And the run is stored with triggeredBy = "ORDER_FULFILLED"
```

**Implementation Notes:**
- Reconciliation should run asynchronously (don't block the main operation)
- Use Promise.resolve().then() or queue for background execution
- Only reconcile affected variants, not full inventory

---

### Task 4: Scheduled Reconciliation Job

**Priority:** P1 (High)
**Estimated Effort:** 0.5 days
**Files to Create:**
- `src/jobs/scheduled-reconciliation.ts` (new)
- Update deployment config for cron trigger

**Acceptance Criteria:**
```gherkin
Given the scheduled job runs daily at 02:00 UTC
Then a full reconciliation is performed for all variants
And the run is stored with triggeredBy = "SCHEDULED"
And alerts are sent if discrepancyCount > 0
```

**Cron Configuration:**
```
0 2 * * * /usr/bin/node /app/dist/jobs/scheduled-reconciliation.js
```

---

### Task 5: URL_ALIASES Cleanup

**Priority:** P2 (Medium)
**Estimated Effort:** 0.5 days
**Files to Modify:**
- `src/lib/normalized-apl.ts`
- Docker networking configuration

**Options:**
1. **Fix networking** — Use consistent hostnames in Docker Compose
2. **Environment config** — Move aliases to environment variables
3. **Document** — If workaround must remain, document why

**Current Code Location:**
```typescript
// src/lib/normalized-apl.ts
const URL_ALIASES: Record<string, string> = {
  'localhost:8000': 'api:8000',
  // ...
};
```

---

## Testing Requirements

### Unit Tests Required
- [ ] WAC calculation with reconciliation
- [ ] Circuit breaker state transitions
- [ ] Reconciliation discrepancy detection

### Integration Tests Required
- [ ] Goods receipt → reconciliation flow
- [ ] ORDER_FULFILLED webhook → reconciliation flow
- [ ] Circuit breaker open/close cycle

### Manual Test Scenarios
- [ ] Create GR, verify reconciliation runs
- [ ] Simulate webhook failure, verify circuit opens
- [ ] Manually reset circuit, verify recovery
- [ ] Run scheduled reconciliation, verify report

---

## Monitoring Requirements

### Metrics to Add
```typescript
// Reconciliation
reconciliation_runs_total{status, triggeredBy}
reconciliation_discrepancy_count{installationId}
reconciliation_duration_seconds

// Circuit Breaker
circuit_breaker_state{webhookType, state}
circuit_breaker_failures_total{webhookType}
webhook_processing_duration_seconds{webhookType}
```

### Alerts to Configure
- Circuit breaker OPEN for > 5 minutes
- Reconciliation discrepancy detected
- Scheduled reconciliation failed
- Webhook processing latency > 5 seconds

---

## Rollout Plan

### Phase 1: Development (Week 1)
- [ ] Implement reconciliation endpoint
- [ ] Implement circuit breaker
- [ ] Add unit tests

### Phase 2: Staging Validation (Week 2)
- [ ] Deploy to staging
- [ ] Run integration tests
- [ ] Simulate failure scenarios
- [ ] Validate monitoring/alerting

### Phase 3: Production (Week 3)
- [ ] Deploy circuit breaker (passive mode first)
- [ ] Enable reconciliation endpoint
- [ ] Enable scheduled reconciliation
- [ ] Switch circuit breaker to active mode

---

## Questions for Implementation Council

1. **Alerting channel** — Where should circuit breaker alerts go? (Slack, PagerDuty, email?)
2. **Reconciliation threshold** — At what discrepancy count should we alert? (Suggested: any > 0)
3. **Circuit breaker timeout** — Is 5 minutes appropriate for auto half-open?
4. **Scheduled reconciliation time** — Is 02:00 UTC acceptable?

---

## Success Criteria

Phase 1 is complete when:
- [ ] Reconciliation endpoint returns accurate discrepancy data
- [ ] Circuit breaker prevents cascade failures
- [ ] Event-driven reconciliation runs on every GR post and webhook
- [ ] Scheduled reconciliation runs daily
- [ ] Monitoring dashboard shows webhook health
- [ ] Zero reconciliation discrepancies in staging for 48 hours

---

## Reference Files

| File | Purpose |
|------|---------|
| `IMPLEMENTATION_PLAN.md` | Full app implementation history |
| `prisma/schema.prisma` | Current database schema |
| `src/modules/cost-layers/wac-service.ts` | WAC calculation logic |
| `src/app/api/webhooks/saleor/order-fulfilled/` | Webhook handler |
| `src/lib/saleor-client.ts` | Saleor GraphQL client |

