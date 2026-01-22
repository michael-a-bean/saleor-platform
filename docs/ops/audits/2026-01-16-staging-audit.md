# Staging Production Readiness Audit Report

**Date:** 2026-01-16
**Auditor:** Gen (PAI)
**Platform:** Saleor Hobby Gaming (MTG Commerce)
**Environment:** Staging

---

## Executive Summary

1. **Critical Race Conditions** - Inventory-ops and buylist apps have race conditions in WAC calculations and financial operations that can corrupt inventory valuation and cause duplicate payouts
2. **Missing Infrastructure Scaling** - No ECS auto-scaling policies, single Celery Beat instance, and insufficient database connection pooling for 100k+ product scale
3. **Security Gap** - Two script files contain hardcoded 256-bit encryption keys; storefront lacks CSP headers
4. **Storefront Build Risks** - Checkout page missing `dynamic = "force-dynamic"` will cause build failures; 23 pages force-dynamic kills ISR caching
5. **Offline POS Idempotency** - Offline transactions lack idempotency keys, risking duplicate orders on sync failures

---

## Current Issues (P0-P3)

### P0: Production Blockers

| Issue | Location | Impact | Remediation |
|-------|----------|--------|-------------|
| Race condition in WAC calculations | `saleor-apps/apps/inventory-ops/src/modules/cost-layers/wac-service.ts:336-404` | Concurrent receipts can corrupt WAC, causing incorrect inventory valuation and COGS | Use Prisma transactions with `Serializable` isolation or implement optimistic concurrency |
| Buylist cancellation allows paid buylists | `saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts:1081-1128` | Customers receive store credit, then buylist cancelled without reversal | Disallow cancellation after payment OR implement full reversal logic |
| Goods receipt posting not transaction-wrapped | `saleor-apps/apps/inventory-ops/src/modules/goods-receipts/goods-receipts-router.ts:563-696` | Partial failures leave inconsistent state between Saleor stock and cost layer events | Wrap entire posting operation in Prisma `$transaction()` |
| Hardcoded encryption keys | `scripts/setup-stripe-config.js:4`, `scripts/fix-stripe-config.js:30` | If used in production, encrypted Stripe config is compromised | Move to environment variable `SECRET_KEY` |
| Checkout page missing dynamic flag | `storefront/src/app/checkout/page.tsx` | Build will fail with `DYNAMIC_SERVER_USAGE` error | Add `export const dynamic = "force-dynamic"` |
| Offline transaction idempotency missing | `saleor-apps/apps/pos/src/lib/offline/transaction-queue.ts:32-77` | Sync failures cause duplicate orders and double-charged customers | Add `idempotencyKey` using `crypto.randomUUID()` at creation |
| Cash drawer silent failure | `saleor-apps/apps/pos/src/lib/hardware/printer.ts:211-215` | Cash drawer fails to open without notification, operational confusion | Add retry logic, logging, and actionable error messages |
| No ECS container auto-scaling | `infra/terraform/modules/ecs/main.tf` | API/storefront 100% failure when demand exceeds fixed capacity | Add `aws_appautoscaling_target` and CPU/memory policies |

### P1: High Priority

| Issue | Location | Impact | Remediation |
|-------|----------|--------|-------------|
| Single Celery Beat instance | `infra/terraform/modules/ecs/main.tf:152-153` | If beat task fails, all scheduled jobs halt | Use distributed lock or dedicated scheduler |
| No database connection pooling | `infra/terraform/modules/rds/main.tf` | Connection exhaustion under load | Deploy RDS Proxy or PgBouncer |
| Database max_connections insufficient | `infra/terraform/modules/rds/main.tf:76-79` | Only 200 connections, tight margin for 9 services | Increase to 400 for production |
| No RDS read replicas | `infra/terraform/modules/rds/main.tf:90-150` | Heavy reporting/sync locks tables, API timeouts | Add read replica for reporting/indexing |
| Missing CSP headers | `storefront/next.config.js` | XSS vulnerability, no inline script protection | Add security headers middleware |
| Image optimization disabled | `storefront/next.config.js:11` | Poor Core Web Vitals, larger page sizes | Set `NEXT_IMAGE_UNOPTIMIZED=false` in production |
| No root error boundary | `storefront/src/app/layout.tsx:62-72` | Unhandled crashes propagate to entire app | Add ErrorBoundary wrapping `{children}` |
| Stock validation missing in cart | `storefront/src/app/[channel]/(main)/cart/page.tsx:45-96` | Users checkout with OOS items, failed orders | Add real-time stock check before checkout |
| Stripe API no retry logic | `saleor-apps/apps/stripe/src/modules/stripe/stripe-payment-intents-api.ts:27-44` | Transient failures cause unnecessary payment failures | Implement exponential backoff for 429/5xx |
| Cost layer events created twice (buylist) | `saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts:606-659` | Double cost tracking or wrong variant ID | Remove from createAndPay or clarify as provisional |
| Square terminal no timeout recovery | `saleor-apps/apps/pos/src/modules/square/terminal/terminal-checkout-service.ts:152-155` | Checkouts stuck indefinitely if webhook fails | Add polling with auto-cancel exceeding deadline |
| Network printer endpoints missing | `saleor-apps/apps/pos/src/lib/hardware/printer.ts:234-265` | Network printing always fails | Implement `/api/print/*` endpoints |

### P2: Medium Priority

| Issue | Location | Impact | Remediation |
|-------|----------|--------|-------------|
| Single NAT gateway (staging) | `infra/terraform/modules/vpc/main.tf:96-127` | AZ failure loses all private subnet internet | Verify production uses multi-AZ NAT |
| Dashboard SPOF (desired_count=1) | `infra/terraform/modules/ecs/main.tf:401` | Dashboard task failure = admin down | Make configurable, set production to 2 |
| ALB health check timeouts | `infra/terraform/modules/alb/main.tf:180-189` | False-positive health failures under load | Increase timeout to 10s |
| 23 pages force-dynamic | `storefront/src/app/[channel]/(main)/*` | No ISR caching, every request hits API | Use hybrid ISR where possible |
| Stripe bundle not code-split | `storefront/package.json:22-24` | 30-50KB added to all pages | Use `dynamic(() => import(...))` for PaymentSection |
| Empty cart returns null | `storefront/src/app/checkout/page.tsx:15-17` | Blank page instead of user-friendly message | Return error page component |
| Sitemap localhost fallback | `storefront/src/app/sitemap.ts:9-10` | Production sitemap could point to localhost | Require env var in production |
| Product canonical URL missing channel | `storefront/src/app/[channel]/(main)/products/[slug]/page.tsx:53-56` | Duplicate content across channels | Include channel in canonical |
| Receipts hardcoded store info | `saleor-apps/apps/pos/src/modules/receipts/receipts-router.ts:143-145` | All receipts show placeholder info | Make configurable from installation settings |
| Offline IndexedDB unencrypted | `saleor-apps/apps/pos/src/lib/offline/db.ts:90-108` | PII exposure if device compromised | Implement encryption for customer data |
| Product cache 1000 limit | `saleor-apps/apps/pos/src/lib/offline/OfflineProviderWithSync.tsx:91` | Incomplete offline lookup for 100k+ products | Implement pagination or selective caching |

### P3: Technical Debt

| Issue | Location | Impact | Remediation |
|-------|----------|--------|-------------|
| Wildcard image hostname | `storefront/next.config.js:5-7` | Could serve malicious images if DB compromised | Restrict to specific CDN domains |
| Missing .gitignore patterns | Root `.gitignore` | `*.key`, `credentials*` not covered | Add patterns |
| JWT failure returns 500 | `saleor-apps/apps/stripe/src/modules/trpc/protected-client-procedure.ts:97-102` | Should be 401 UNAUTHORIZED | Change error code |
| Typo in class name | `saleor-apps/apps/stripe/src/app/api/webhooks/stripe/stripe-webhook-responses.ts:40` | `StripeWebhookSeverErrorResponse` | Rename to `ServerError` |
| Silent catch blocks (7) | `saleor-apps/apps/pos/src/lib/hardware/printer.ts` (multiple) | Hardware failures not logged | Add structured logging |
| console.error (12+ locations) | Multiple apps | No Sentry tracking | Replace with structured logger |
| Missing React Error Boundaries | All 3 custom apps | Crashes propagate to users | Add error boundaries |
| GR number generation race | `saleor-apps/apps/inventory-ops/src/modules/goods-receipts/goods-receipts-router.ts:41-64` | Duplicate numbers under concurrency | Use sequence table with lock |

---

## Code Review Findings

### By Component

**Stripe App**
- **Status:** Production-ready with minor improvements
- **Strengths:** Proper webhook signature validation, idempotency keys, encrypted secret storage, Result-based error handling, Sentry integration
- **Issues:** Missing retry logic for API calls (P1), DynamoDB idempotent retry handling (P1), no explicit timeout config (P2)

**Inventory-Ops**
- **Status:** Critical fixes required
- **Strengths:** Correct WAC formula, comprehensive audit trail, O(1) optimized lookup, reconciliation capability
- **Issues:** Race conditions in WAC (P0), posting not transaction-wrapped (P0), stock adjustment same pattern (P1), GR number race (P3)

**Buylist**
- **Status:** Critical fixes required
- **Strengths:** Decimal.js for financial calculations, idempotency on payouts, audit trail, condition-specific variant handling
- **Issues:** Cancellation race with paid buylists (P0), partial stock update failure handling (P0), cost events created twice (P1)

**POS**
- **Status:** Critical fixes required
- **Strengths:** Well-designed offline infrastructure, circuit breaker pattern, ESC/POS printer abstraction
- **Issues:** Offline idempotency missing (P0), cash drawer silent failure (P0), Square timeout (P1), network printer endpoints missing (P1)

**Storefront**
- **Status:** Multiple fixes required
- **Strengths:** Error pages in dev mode sanitized, XSS library used for dangerouslySetInnerHTML
- **Issues:** Checkout dynamic flag (P0), CSP headers (P1), error boundaries (P1), stock validation (P1), force-dynamic everywhere (P2)

### Cross-Cutting Concerns

**Error Handling Patterns**
- 7 silent catch blocks in POS hardware code return `false` without logging
- 12+ locations use `console.error` instead of structured logger with Sentry tracking
- None of the 3 custom apps (buylist, pos, inventory-ops) have React Error Boundaries

**Logging Consistency**
- Stripe app: Excellent - structured logging with context propagation, sensitive key masking
- Other apps: Logger configured but not consistently used in error paths

**Type Safety**
- Good overall - TypeScript strict mode enabled
- Zod validation on all tRPC inputs
- Some `ctx.apiClient!` non-null assertions that could throw

**Test Coverage Gaps**
- WAC calculations: Good test coverage
- Webhook signature validation: No tests found
- Hardware integration: No tests found

---

## Infrastructure Assessment

### Current State

| Service | Desired Count | CPU | Memory | Health Check |
|---------|---------------|-----|--------|--------------|
| API | 3 (prod) | 1024 | 2048 | /health/ (5s timeout) |
| Storefront | 2 (prod) | 512 | 1024 | /api/health (5s timeout) |
| Worker | 2 (prod) | 512 | 1024 | None (standalone) |
| Dashboard | 1 (hardcoded) | 256 | 512 | /health (5s timeout) |
| Apps (4) | 1 each | 256 | 512 | /api/health |

**Meilisearch Status:**
- Health: Available
- Indexes: 2 (`webstore-products`, `singles-builder-products`)
- Index creation dates: 2026-01-05 and 2026-01-09

**Saleor GraphQL API:**
- Status: 404 errors from MCP tools (may indicate API not running or MCP misconfiguration)
- Recommendation: Verify API health via direct curl test

### Scaling Concerns

**At 10x Current Load:**
- API tasks will hit 100% CPU, increased latency
- Database connections near exhaustion (200 limit)
- Storefront force-dynamic hits API on every request

**At 100x Current Load:**
- Complete failure without auto-scaling
- Database connection pool exhausted
- Single NAT gateway bottleneck (staging)
- Celery task backlog unbounded

### Recommended Infrastructure Changes

1. **Immediate:** Add ECS auto-scaling policies (target 70% CPU)
2. **Immediate:** Deploy RDS Proxy for connection pooling
3. **Immediate:** Increase max_connections to 400
4. **Week 1:** Add RDS read replica for reporting
5. **Week 1:** Implement ALB WAF with rate limiting
6. **Month 1:** Add cross-region backup for RDS

---

## Security Findings

### Critical

| Finding | Location | Severity |
|---------|----------|----------|
| Hardcoded 256-bit encryption key | `scripts/setup-stripe-config.js:4`, `scripts/fix-stripe-config.js:30` | CRITICAL |

### High

| Finding | Location | Severity |
|---------|----------|----------|
| No CSP headers in storefront | `storefront/next.config.js`, `storefront/src/middleware.ts` | HIGH |
| `dangerouslyAllowSVG: true` without CSP | `storefront/next.config.js` | HIGH |
| Wildcard image hostname | `storefront/next.config.js:5-7` | HIGH |

### Medium

| Finding | Location | Severity |
|---------|----------|----------|
| Missing .gitignore patterns (`*.key`, `credentials*`) | Root `.gitignore` | MEDIUM |
| Offline IndexedDB stores PII unencrypted | `saleor-apps/apps/pos/src/lib/offline/db.ts` | MEDIUM |
| No rate limiting on GraphQL/tRPC endpoints | Infrastructure-wide | MEDIUM |

### Low

| Finding | Location | Severity |
|---------|----------|----------|
| Webhook URL exposes deployment topology | `saleor-apps/apps/stripe/src/app/api/webhooks/stripe/webhook-params.ts:44-58` | LOW |

### Positive Findings

- JWT verification with multi-layer middleware (Stripe, POS, Buylist)
- SQL injection: All raw queries use parameterized Prisma templates
- Error messages sanitized in production (storefront)
- Sensitive keys masked in logs (`token`, `secretKey`, `password`, `apiKey`, `cardNumber`)
- Webhook signature validation using SDK methods (Stripe, Square)
- `crypto.timingSafeEqual` for timing attack prevention (Square)

---

## Production Readiness Checklist

### MANDATORY (Block Production)

- [ ] **No Hardcoded Secrets** - FAIL: Two scripts contain hardcoded encryption keys
- [ ] **Error Boundaries Complete** - FAIL: No root error boundary in storefront; no React boundaries in custom apps
- [ ] **Database Migrations Clean** - UNKNOWN: Could not verify via MCP
- [ ] **Health Checks Functional** - PARTIAL: Meilisearch healthy; Saleor API returned 404 (investigate)
- [ ] **Auth Token Security** - PASS: Proper JWT validation, token masking in logs
- [ ] **HTTPS Enforced** - UNKNOWN: Could not verify ALB config
- [ ] **Rollback Tested** - UNKNOWN: Not tested in this audit
- [ ] **Logging Functional** - PARTIAL: CloudWatch configured but retention varies
- [ ] **FileAPL Replaced** - PASS: Redis APL configured for app auth persistence

### RECOMMENDED (Fix Before High Traffic)

- [ ] Rate limiting configured on GraphQL - NOT IMPLEMENTED
- [ ] CDN caching for static assets - PARTIAL: force-dynamic overrides ISR
- [ ] Database connection pooling optimized - NOT IMPLEMENTED (no RDS Proxy)
- [ ] Alerting configured for error rates - UNKNOWN
- [ ] Backup/restore procedure documented - UNKNOWN
- [ ] Load testing completed - NOT COMPLETED

---

## Recommended Production Timeline

### Before Go-Live (MANDATORY)

| Action | Owner | Estimate |
|--------|-------|----------|
| Remove hardcoded encryption keys from scripts | DevOps | |
| Add Prisma transactions to inventory-ops posting | Backend | |
| Fix buylist cancellation race condition | Backend | |
| Add offline transaction idempotency keys | POS Team | |
| Add `dynamic = "force-dynamic"` to checkout page | Frontend | |
| Add CSP headers middleware to storefront | Frontend | |
| Implement ECS auto-scaling policies | DevOps | |
| Deploy RDS Proxy for connection pooling | DevOps | |
| Add root error boundary to storefront | Frontend | |

### Week 1 Post-Launch

| Action | Owner |
|--------|-------|
| Add retry logic to Stripe API calls | Backend |
| Fix Square terminal timeout recovery | POS Team |
| Implement network printer endpoints | POS Team |
| Add RDS read replica | DevOps |
| Implement ALB WAF rate limiting | DevOps |
| Add structured logging to silent catch blocks | All Teams |

### Month 1 Post-Launch

| Action | Owner |
|--------|-------|
| Refactor storefront pages from force-dynamic to ISR | Frontend |
| Add React Error Boundaries to custom apps | All Teams |
| Implement offline IndexedDB encryption | POS Team |
| Add cross-region RDS backup | DevOps |
| Complete load testing | QA |

---

## Appendices

### A: Meilisearch Index Status

| Index | Primary Key | Created | Updated |
|-------|-------------|---------|---------|
| singles-builder-products | id | 2026-01-05 07:59:31 | 2026-01-06 06:56:51 |
| webstore-products | id | 2026-01-09 07:55:48 | 2026-01-09 19:30:36 |

### B: Performance Baseline

Not measured in this audit. Recommend establishing baselines for:
- GraphQL query latency (products, orders, checkout)
- Storefront page load times (TTFB, LCP, CLS)
- App iframe initialization time
- Meilisearch search response times

### C: Files Requiring Immediate Attention

```
# P0 Critical Files
scripts/setup-stripe-config.js:4
scripts/fix-stripe-config.js:30
saleor-apps/apps/inventory-ops/src/modules/cost-layers/wac-service.ts:336-404
saleor-apps/apps/inventory-ops/src/modules/goods-receipts/goods-receipts-router.ts:563-696
saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts:1081-1128
saleor-apps/apps/pos/src/lib/offline/transaction-queue.ts:32-77
saleor-apps/apps/pos/src/lib/hardware/printer.ts:211-215
storefront/src/app/checkout/page.tsx
infra/terraform/modules/ecs/main.tf
```

---

**Report Generated:** 2026-01-16 09:47 PST
**Methodology:** docs/ops/prompts/staging-production-readiness-audit.md
**Workstreams Completed:** 5/5
