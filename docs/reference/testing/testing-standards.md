# Testing Standards Reference

**Converted from**: `.claude/plans/mvp-test-plan.md` (archived 2026-01-28)
**Purpose**: Reference document for test patterns, not a plan to execute

---

## Overview

This document captures testing patterns and specifications for the hobby gaming commerce platform. Use this as a reference when writing tests, not as a checklist to complete.

**Framework**: Vitest (unit tests), PactumJS (E2E API tests)

---

## Test Categories

### Unit Tests (Isolated Logic)
- Pure functions, calculations, validation
- No database or external dependencies
- Fast execution (<1ms per test)

### Integration Tests (Module Interactions)
- tRPC router endpoints with mocked DB
- GraphQL query/mutation handlers
- Webhook processors

### E2E Tests (Full Flows)
- Complete user journeys
- Real database operations
- API endpoint testing

---

## Test Patterns by Domain

### 1. Pricing & WAC

**Critical business logic - requires high coverage**

```typescript
describe("WAC Calculation", () => {
  it("should calculate weighted average from cost events");
  it("should handle GOODS_RECEIPT events");
  it("should handle BUYLIST_RECEIPT events");
  it("should handle SALE events (FIFO/LIFO)");
  it("should handle SALE_RETURN events");
  it("should maintain per-warehouse separation");
});

describe("Pricing Rule Engine", () => {
  it("should match rules by set code condition");
  it("should match rules by rarity condition");
  it("should evaluate AND/OR conditions");
  it("should respect rule priority ordering");
  it("should apply PERCENTAGE_MODIFIER correctly");
  it("should apply condition multipliers (NM/LP/MP/HP/DMG)");
});
```

### 2. Buylist Operations

```typescript
describe("Buylist CRUD", () => {
  it("should create draft buylist with date-prefix number");
  it("should add lines with calculated pricing");
  it("should transition DRAFT -> PENDING_VERIFICATION -> VERIFIED -> PAID");
  it("should block invalid status transitions");
});

describe("Buylist Payout", () => {
  it("should create CashMovement for cash payouts");
  it("should create CustomerCredit for store credit payouts");
  it("should use idempotency keys to prevent duplicates");
});
```

### 3. POS Operations

```typescript
describe("Register Operations", () => {
  it("should open register with cash count");
  it("should prevent multiple open registers per user");
  it("should calculate expected cash on close");
  it("should track cash movements (sales, drops, payouts)");
});

describe("Transaction Management", () => {
  it("should add/remove lines from cart");
  it("should attach customer for credit payments");
  it("should complete transaction and create Saleor order");
  it("should void transaction and reverse payments");
});

describe("Store Credit Payment", () => {
  it("should validate sufficient balance");
  it("should deduct from CustomerCredit atomically");
  it("should create CreditTransaction record");
});
```

### 4. Inventory Operations

```typescript
describe("Purchase Order Flow", () => {
  it("should transition DRAFT -> PENDING -> APPROVED -> RECEIVED");
  it("should handle partial receiving");
  it("should create goods receipt on receive");
});

describe("Goods Receipt Processing", () => {
  it("should create CostLayerEvent for each line");
  it("should update Saleor stock levels");
  it("should allocate landed costs proportionally");
  it("should recalculate WAC");
});

describe("Price Sync", () => {
  it("should stage price changes as PENDING");
  it("should flag anomalies above threshold");
  it("should require approval before applying");
  it("should create SellPriceSnapshot on approval");
});
```

### 5. Storefront

```typescript
describe("Cart Operations", () => {
  it("should add item to cart");
  it("should increment quantity for existing item");
  it("should respect max quantity limits");
  it("should update totals after changes");
});

describe("Filter Logic", () => {
  it("should parse filters from URL query string");
  it("should handle multi-select filters");
  it("should filter by price range");
});

describe("Checkout Flow", () => {
  it("should validate address fields");
  it("should handle Stripe payment success/failure");
  it("should redirect to confirmation on success");
});
```

---

## Test Infrastructure

### Vitest Config

```typescript
// vitest.config.ts
export default {
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setup-tests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
};
```

### Test Setup

```typescript
// src/setup-tests.ts
import { vi } from 'vitest';

// Mock Prisma client
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

// Mock environment variables
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test');
```

### Mock Factories

```typescript
// src/__tests__/factories/index.ts
export const createMockBuylist = (overrides = {}) => ({
  id: 'buylist-123',
  buylistNumber: 'BL-20260103-0001',
  status: 'DRAFT',
  ...overrides,
});

export const createMockCostEvent = (overrides = {}) => ({
  id: 'event-123',
  eventType: 'GOODS_RECEIPT',
  qtyDelta: 10,
  ...overrides,
});
```

---

## Test Commands

```bash
# Run all unit tests
pnpm test:ci

# Run specific app tests
pnpm --filter saleor-app-buylist test
pnpm --filter saleor-app-inventory-ops test
pnpm --filter saleor-app-pos test

# Run with coverage
pnpm test:ci -- --coverage

# Watch mode for development
pnpm --filter saleor-app-buylist test -- --watch
```

---

## Priority Guidelines

When adding tests, prioritize:

| Priority | Domain | Reason |
|----------|--------|--------|
| P0 | Pricing Rule Engine | Business-critical, complex logic |
| P0 | WAC Calculation | Financial accuracy required |
| P0 | Buylist Payout | Money movement, idempotency |
| P1 | Price Sync Approval | Data integrity |
| P1 | PO/GR Flow | Inventory accuracy |
| P1 | Register Operations | Cash tracking |
| P2 | Storefront Cart/Checkout | User-facing but simpler logic |
| P2 | E2E Flows | Integration confidence |

---

## Current State (as of 2026-01-28)

| App | Test Files | Notes |
|-----|------------|-------|
| pos | 1 | `register-router.test.ts` |
| inventory-ops | 0 | No tests |
| buylist | 0 | No tests |
| storefront | 0 | No tests |

This document captures patterns for future test writing, not a backlog to clear.
