# Saleor Staging → Production Readiness Audit

**Version:** 1.0
**Date:** 2026-01-16
**Platform:** Saleor Hobby Gaming (MTG Commerce)

---

## Context & Motivation

This staging environment represents months of integration work: Saleor core, custom apps (Stripe, Inventory-Ops, Buylist, POS, Price-Sync), Next.js storefront, and AWS ECS infrastructure. Before moving to production, we need comprehensive documentation of:

1. **Current Issues** — What's broken or degraded right now?
2. **Code Quality** — Are there patterns that will cause problems at scale?
3. **Production Blockers** — What MUST be fixed before go-live?
4. **Risk Assessment** — What might fail under production load?

---

## Instructions

Execute this audit in **5 parallel workstreams**, then synthesize findings into a unified report.

### Phase 1: Parallel Discovery (Run All Simultaneously)

**Workstream 1: Infrastructure Health**
```
Launch: Task tool with Explore agent
Prompt: "Thoroughly explore the staging infrastructure configuration:
- Terraform configs in infra/terraform/
- ECS task definitions and service configs
- Load balancer and health check configurations
- Environment variable patterns and secrets management
- Database connection pooling and scaling settings
Document: Configuration drift risks, missing HA patterns, single points of failure."
```

**Workstream 2: API & GraphQL Analysis**
```
Launch: Task tool with Explore agent + Saleor MCP tools
Actions:
1. mcp__saleor-mcp__health_check — Verify Meilisearch connectivity
2. mcp__saleor-mcp__channels — Document channel configuration
3. mcp__saleor-mcp__list_indexes — Verify search index health
4. mcp__saleor-graphql__introspect-schema — Capture full schema
5. Test critical queries: products, orders, customers with pagination
Document: API gaps, missing indexes, query performance concerns.
```

**Workstream 3: Custom Apps Code Review**
```
Launch: pr-review-toolkit agents in parallel:
- code-reviewer: Review saleor-apps/apps/stripe/
- code-reviewer: Review saleor-apps/apps/inventory-ops/
- code-reviewer: Review saleor-apps/apps/buylist/
- code-reviewer: Review saleor-apps/apps/pos/
- code-reviewer: Review saleor-apps/apps/price-sync/
- silent-failure-hunter: Scan all apps for suppressed errors
Focus: Error handling, data validation, transaction safety, auth patterns.
```

**Workstream 4: Storefront Production Readiness**
```
Launch: Task tool with Explore agent
Path: storefront/
Check:
- Build configuration (next.config.js)
- Environment handling (staging vs production)
- Error boundaries and fallbacks
- Image optimization and CDN config
- SEO metadata and structured data
- Cart/checkout flow completeness
Document: SSR issues, build warnings, missing error handling.
```

**Workstream 5: Security & Secrets Audit**
```
Launch: Bash + Grep tools
Actions:
1. Scan for hardcoded secrets: grep -r "sk_live\|sk_test\|password\s*=" --include="*.ts" --include="*.tsx" --include="*.env*"
2. Check .gitignore coverage for sensitive files
3. Review auth token handling in apps
4. Check CSP headers in storefront
5. Verify HTTPS enforcement patterns
Document: Exposed secrets, missing sanitization, auth vulnerabilities.
```

---

### Phase 2: Deep Dive Analysis

After Phase 1 completes, execute targeted investigations:

**Database Schema Review**
```
Use: saleor-database skill
Check:
- Missing indexes on high-cardinality columns
- The critical discounted_price_amount NULL issue
- Foreign key constraints and cascade behaviors
- Large table sizes and partition candidates
```

**Dependency Audit**
```
Bash: bun audit (for each package.json)
Check:
- Known vulnerabilities in dependencies
- Outdated packages with security patches
- License compatibility for commercial use
```

**Performance Baseline**
```
Document current response times:
- GraphQL query latency (products, orders, checkout)
- Storefront page load times
- App iframe initialization time
- Search response times via Meilisearch
```

---

### Phase 3: Production Readiness Gate

Using the GATE template pattern, verify these criteria:

#### MANDATORY (Block Production)

- [ ] **No Hardcoded Secrets** — All secrets via SSM/env vars
- [ ] **Error Boundaries Complete** — No unhandled crashes propagate to users
- [ ] **Database Migrations Clean** — No pending or failed migrations
- [ ] **Health Checks Functional** — All /health endpoints return 200
- [ ] **Auth Token Security** — No tokens in URLs or logs
- [ ] **HTTPS Enforced** — No mixed content, redirects work
- [ ] **Rollback Tested** — ECS rollback procedure verified
- [ ] **Logging Functional** — CloudWatch capturing all services
- [ ] **FileAPL Replaced** — Redis APL for app auth persistence

#### RECOMMENDED (Fix Before High Traffic)

- [ ] Rate limiting configured on GraphQL
- [ ] CDN caching for static assets
- [ ] Database connection pooling optimized
- [ ] Alerting configured for error rates
- [ ] Backup/restore procedure documented
- [ ] Load testing completed

---

## Output Format

Generate a unified report with this structure:

```markdown
# Staging Audit Report — [DATE]

## Executive Summary
[3-5 bullet critical findings]

## Current Issues (P0-P3)

### P0: Production Blockers
| Issue | Location | Impact | Remediation |
|-------|----------|--------|-------------|

### P1: High Priority
[Same table format]

### P2: Medium Priority
[Same table format]

### P3: Technical Debt
[Same table format]

## Code Review Findings

### By Component
- **Stripe App**: [findings]
- **Inventory-Ops**: [findings]
- **Buylist**: [findings]
- **POS**: [findings]
- **Price-Sync**: [findings]
- **Storefront**: [findings]

### Cross-Cutting Concerns
- Error handling patterns
- Logging consistency
- Type safety
- Test coverage gaps

## Infrastructure Assessment

### Current State
[ECS services, health, resource utilization]

### Scaling Concerns
[What breaks at 10x, 100x current load]

### Recommended Changes
[Prioritized infrastructure improvements]

## Security Findings

### Critical
[Immediate action required]

### Moderate
[Fix before production]

### Low
[Best practice improvements]

## Production Readiness Checklist
[Completed GATE checklist with status]

## Recommended Production Timeline

### Before Go-Live (Mandatory)
1. [Action item with owner]

### Week 1 Post-Launch
1. [Action item]

### Month 1 Post-Launch
1. [Action item]

## Appendices
- A: Full dependency audit results
- B: Performance baseline measurements
- C: Infrastructure configuration snapshots
```

---

## Tools Required

| Tool | Purpose |
|------|---------|
| Task (Explore) | Codebase navigation and discovery |
| Task (code-reviewer) | Systematic code review |
| Task (silent-failure-hunter) | Error handling audit |
| mcp__saleor-mcp__* | Saleor API and data inspection |
| mcp__saleor-graphql__* | GraphQL schema and queries |
| mcp__github__* | Repository and PR context |
| Grep/Glob | Pattern searching |
| Bash | Command execution for audits |

---

## Execution Notes

1. **Parallelism**: Phase 1 workstreams have no dependencies — run all 5 simultaneously
2. **Context Preservation**: Each agent should document findings immediately
3. **Severity Classification**:
   - P0: Blocks production, data loss risk, security vulnerability
   - P1: Significant user impact, needs fix within 1 week
   - P2: Degraded experience, fix within 1 month
   - P3: Technical debt, track for future
4. **Evidence**: Include file paths, line numbers, and code snippets for all findings

---

## Success Criteria

This audit is complete when:
- [ ] All 5 workstreams have reported findings
- [ ] Production readiness gate is fully evaluated
- [ ] Unified report generated with prioritized action items
- [ ] Report committed to docs/ops/audits/[date]-staging-audit.md
