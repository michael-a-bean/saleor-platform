# ISSUE-008 Investigation: Storefront Test Coverage

**Investigation Date:** 2026-01-23
**Current Coverage:** 1.9% (7 test files / 363 TypeScript files)
**Target Coverage:** 60% (6-month goal)

## Executive Summary

The storefront has critically low test coverage. Current testing is limited to utility functions; there are zero tests for React components, page routes, custom hooks, or the checkout flow.

## Current State by Directory

| Directory | Files | Tested | Coverage |
|-----------|-------|--------|----------|
| checkout/ | 208 | 2 | 0.96% |
| app/ | 75 | 0 | 0% |
| lib/ | 18 | 2 | 11% |
| ui/ | 57 | 0 | 0% |
| **Total** | **363** | **7** | **1.9%** |

## Infrastructure Assessment

**Already Set Up:**
- Vitest 2.1.8 configured
- Testing-library/react 16.0.1 installed
- Path aliases configured

**Missing:**
- Custom render wrapper with providers
- GraphQL mocking setup (MSW or vitest.mock)
- Mock data factories (Address, Product, Checkout, Order)
- Provider stubs (CheckoutProvider, AuthProvider)
- Coverage thresholds in vitest.config

## Quick Wins (4-5 hours total)

1. **`lib/utils.ts`** - formatDate, formatMoney (30 min)
2. **`lib/filters/buildGraphQLFilter.ts`** - MTG filters to GraphQL (1.5 hrs)
3. **`checkout/lib/utils/url.ts`** - URL parsing (1 hr)
4. **`checkout/lib/utils/phoneNumber.ts`** - Phone validation (30 min)

## Recommended Sprint Plan

### Phase 1: Foundation (Days 1-2)
- Create test infrastructure (`__tests__/utils/`, fixtures/)
- Write 40-60 utility tests
- **Expected Coverage:** 4-6%

### Phase 2: Checkout Internals (Days 3-7)
- State management tests (zustand stores)
- Hook tests with mocked GraphQL
- **Expected Coverage:** 10-12%

### Phase 3: Components (Days 8-14)
- UI component tests
- Checkout component tests
- Integration tests
- **Expected Coverage:** 18-22%

## Critical Gaps by Business Impact

1. **Checkout Hooks** (37 files) - Revenue critical, 30 hrs
2. **CheckoutProvider** (2 files) - Revenue critical, 12 hrs
3. **Payment Section** - Revenue critical, 8 hrs
4. **Filter Building** (4 files) - High impact, 3 hrs
5. **Page Routes** (75 files) - High impact, 40+ hrs

## Total Effort Estimate

| Phase | Hours | Coverage Target |
|-------|-------|-----------------|
| Phase 1 | 4-5 | 4-6% |
| Phase 2 | 20-25 | 10-12% |
| Phase 3 | 25-30 | 18-22% |
| **Total** | **~55** | **18-22%** |

6-month target of 60% requires sustained effort across multiple sprints.
