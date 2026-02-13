# Development Drift & Scope Analysis

**Agent**: Codebase Explorer (Scope Drift)
**Date**: 2026-02-13
**Scope**: Development history analysis, feature drift, technical debt
**Finding**: Significant intentional expansion beyond MVP scope

---

## Executive Summary

**Development Status**: 340 commits in 6 months (154 in last 30 days). The project has evolved into a **comprehensive, production-grade commerce platform** with 8 major subsystems extending well beyond the original MVP scope.

---

## 1. Features Built But Not in MVP Requirements

### A. Infrastructure Scope Expansion (12 Terraform Modules)

The MVP required basic staging. Actual infrastructure:

| Module | Purpose | MVP Required? |
|--------|---------|---------------|
| VPC | Multi-AZ NAT | No |
| CloudFront | CDN for static assets | No |
| Secrets | SSM Parameter Store | No |
| IAM | Role-based access control | No |
| ECR | Docker registries per app | No |
| ECS | Fargate orchestration | No |
| DynamoDB | Stripe APL | No |
| ElastiCache | Valkey caching | No |
| S3 | Media bucket | Partial |
| RDS | Managed PostgreSQL (2 dbs) | Yes |
| Meilisearch | EFS-backed search | Yes |
| ALB | Path routing | No |

**Cost Impact**: ~$94/month optimization applied Feb 12, 2026.

### B. Advanced POS Features (Beyond "Minimal")

MVP specified "minimal POS enough for buylist cash payout tracking." Built:

| Feature | Status | In MVP? |
|---------|--------|---------|
| Register Session Management | Complete | Partial |
| Barcode/SKU Scanning | Complete | No |
| Store Credit System | Complete | Implied |
| Cash Payment Processing | Complete | Yes |
| Browser Receipt Printing (80mm thermal) | Complete | No |
| Square Terminal Integration | Designed | No |
| Offline Mode | Designed | No |
| Tax Calculation | Hardcoded ($0) | Missing |
| Returns & Exchanges | Not started | No |
| Cash Drops & Reconciliation | Not started | No |

**52 commits** dedicated to POS app, ~10 tRPC routers, circuit breaker pattern, outbox pattern, transaction isolation. Only **1 test file**.

### C. Inventory-Ops Beyond "Costing Layer"

| Feature | Status | In MVP? |
|---------|--------|---------|
| WAC (O(1) lookups) | Complete | Yes |
| Purchase Order Management | Complete | Partial |
| Goods Receipts (partial receiving, reversals) | Complete | Yes |
| Landed Costs | Complete | No |
| COGS Tracking (ORDER_FULFILLED webhook) | Complete | Yes |
| Collection Imports (CSV) | Complete | Yes |
| Stock Adjustments | Complete | No |
| Price Sync Reports (trend analysis) | Complete | No |
| Reporting Suite (cost history, profitability) | Complete | No |
| Reconciliation Runs (per ADR-001) | Complete | No |

### D. Non-MVP Infrastructure Built

- Multi-tenant architecture (AppInstallation scoping)
- OpenTelemetry + Jaeger tracing + Sentry
- Multi-database architecture (2 PostgreSQL + Valkey)
- Comprehensive audit logging (append-only)
- 3-tier drift prevention (incident log + imports.tf + CI/CD)

---

## 2. Development Velocity Analysis

### Commit Distribution (6 months)

| Area | Commits | % of Total |
|------|---------|-----------|
| Infrastructure | 37 | 11% |
| POS App | 30+ | 9% |
| Inventory-Ops | 15+ | 4% |
| Documentation | 50+ | 15% |
| Maintenance/Fixes | 104+ | 31% |
| Other features | 104+ | 31% |

### Neglected Areas

1. **POS Test Coverage**: 1 test file, 0 tests on payment router
2. **Returns & Exchanges**: Placeholder page only
3. **Tax Calculation**: Hardcoded to $0
4. **React Compiler**: ESLint rules disabled (~50 hrs to fix Formik dependency)
5. **GraphQL Modernization**: 909+ deprecated usages

---

## 3. Technical Debt Indicators

### Disabled/Skipped Tests
- storefront/eslint.config.mjs: React Compiler rules disabled
- POS app: Only 1 test file for entire app
- 50+ TODO comments across codebase

### Hardcoded Values
- POS: Channel/Warehouse IDs (ISSUE-012)
- POS: Tax = $0
- Stripe app: BASE_PATH workaround

### Incomplete Features

| Feature | Status |
|---------|--------|
| Square Terminal | Designed (Phase 4-5) |
| Offline Mode | Designed (Phase 3-4) |
| Returns | Placeholder only |
| Tax Exemption | Not started |
| ESC/POS Printer | Not started |
| Cash Drawer | Not started |

### Detached/Orphaned Code
- price-sync submodule: Detached HEAD at 7e33ae7
- feature/inventory-ops-improvements: Merged but branch exists
- saleor-apps mtg-import: Not locally pulled (10 commits behind)

---

## 4. Scope Expansion Metrics

| Metric | MVP Estimate | Actual | Expansion |
|--------|-------------|--------|-----------|
| Terraform Modules | 2-3 | 12 | 4-6x |
| Custom Saleor Apps | 3 | 5 | 1.67x |
| Infrastructure Commits | 5-10 | 37 | 3.7-7.4x |
| Docker Services | 8-10 | 16 | 1.6-2x |

---

## 5. Evidence of Over-Engineering

### Infrastructure Drift Prevention
3-tier approach: incident-changes.md + imports.tf + CI/CD workflow + expected divergence docs. Triggered by VPC drift incident (2026-01-22) requiring 60+ imports.

### Cost Optimization Work
$94/month savings through RDS downsize, VPC endpoint removal, service right-sizing. Implies over-provisioned for actual workload.

### Observability Stack
OpenTelemetry instrumentation, Jaeger tracing, Sentry tracking, structured logging. 100+ telemetry imports.

### Multi-Database Architecture
2 PostgreSQL instances + Valkey cache. POS depends on inventory-ops Prisma schema via symlink.

---

## 6. Documentation Overhead

Per Council review (2026-01-28):
- 47 documentation issues needing cleanup
- 18 stale/outdated documents
- 9 duplicate information entries
- 30+ legacy files to archive

---

## 7. Recommendations

### Immediate (1-2 weeks)
1. Merge MTG Import App locally (pull saleor-apps remote)
2. Clean up merged feature branches
3. Resolve price-sync detached HEAD
4. Commit outstanding changes

### Short-term (1 month)
5. POS test coverage (payment router, transactions, COGS)
6. Tax calculation implementation
7. Returns feature: complete or remove placeholder
8. Document Prisma symlink as architecture decision

### Medium-term (1-3 months)
9. Evaluate infrastructure scope (CloudFront may be premature)
10. Archive 47+ identified doc issues
11. Plan React Compiler / Formik upgrade
12. Decide on standard Saleor apps (avatax, cms, segment, klaviyo)

---

## Conclusion

The drift is **real and intentional** (evidenced by ADR-001, council reviews, infrastructure audits). However, expansion has introduced architectural complexity, technical debt (50+ TODOs, 909+ deprecated usages, 1 test for POS), unfinished features, and documentation overhead that must be managed for MVP delivery.
