# MVP Test Plan

**Created**: 2026-01-03
**Last Updated**: 2026-01-28
**Purpose**: Comprehensive test coverage for hobby gaming commerce platform MVP
**Framework**: Vitest (unit tests), PactumJS (E2E API tests)

---

## Executive Summary

This test plan covers all MVP functionality across four main areas:
1. **Storefront** - Cart, checkout, filtering, product display
2. **Buylist App** - Customer card buybacks, pricing rules
3. **Inventory Ops** - WAC/COGS, purchase orders, price sync
4. **POS App** - Register operations, transactions, customer integration

> **Status Update (2026-01-28)**: Verification against codebase shows actual coverage is ~5%, not ~15%.
> Only 1 test file exists: `saleor-apps/apps/pos/src/modules/register/register-router.test.ts`
> No test files found in: inventory-ops, buylist, or storefront.
> See `.claude/plans/OPEN-PLANS-STATUS.md` for detailed verification.

**Current Coverage**: ~5% (1 test file exists)
**Target Coverage**: 80%+ for business-critical logic

---

## Test Categories

### 1. Unit Tests (Isolated Logic)
- Pure functions, calculations, validation
- No database or external dependencies
- Fast execution (<1ms per test)

### 2. Integration Tests (Module Interactions)
- tRPC router endpoints with mocked DB
- GraphQL query/mutation handlers
- Webhook processors

### 3. E2E Tests (Full Flows)
- Complete user journeys
- Real database operations
- API endpoint testing

---

## Part 1: Storefront Tests

### 1.1 Cart Operations

**File**: `storefront/src/lib/cart/__tests__/cart-operations.test.ts`

```typescript
describe("Cart Operations", () => {
  describe("addToCart", () => {
    it("should add a new item to empty cart");
    it("should increment quantity for existing item");
    it("should respect max quantity limits");
    it("should handle out-of-stock variants");
    it("should update cart totals after add");
  });

  describe("updateCartLineQuantity", () => {
    it("should update quantity for existing line");
    it("should remove line when quantity is 0");
    it("should recalculate totals after update");
    it("should handle +/- button increments");
    it("should validate against available stock");
  });

  describe("removeFromCart", () => {
    it("should remove line from cart");
    it("should update totals after removal");
    it("should handle removing last item");
  });
});
```

### 1.2 Filter Logic

**File**: `storefront/src/lib/filters/__tests__/filter-logic.test.ts`

```typescript
describe("Filter Logic", () => {
  describe("parseFiltersFromURL", () => {
    it("should parse color filters from query string");
    it("should parse multiple filter types");
    it("should handle range filters (price min/max)");
    it("should decode URL-encoded values");
    it("should return empty filters for no params");
  });

  describe("buildFilterQueryString", () => {
    it("should build query string from filter state");
    it("should handle multi-select filters");
    it("should preserve non-filter params");
    it("should URL-encode special characters");
  });

  describe("applyFiltersToProducts", () => {
    it("should filter by single attribute");
    it("should filter by multiple attributes (AND)");
    it("should filter by price range");
    it("should handle empty filter set");
  });

  describe("clearFilters", () => {
    it("should clear all filters while preserving other params");
    it("should clear single filter type");
    it("should handle already-empty filters");
  });
});
```

### 1.3 Checkout Flow

**File**: `storefront/src/checkout/__tests__/checkout-flow.test.ts`

```typescript
describe("Checkout Flow", () => {
  describe("Guest Checkout", () => {
    it("should allow checkout without login");
    it("should capture email for order notifications");
    it("should offer account creation option");
    it("should create account when checkbox selected");
  });

  describe("Address Validation", () => {
    it("should validate required address fields");
    it("should validate email format");
    it("should validate phone format");
    it("should accept valid addresses");
  });

  describe("Shipping Method Selection", () => {
    it("should display available shipping methods");
    it("should update totals on method change");
    it("should preserve selection across page refresh");
  });

  describe("Payment Processing (Stripe)", () => {
    it("should initialize Stripe elements");
    it("should handle successful payment");
    it("should handle payment failure with error message");
    it("should handle 3DS authentication");
    it("should redirect to confirmation on success");
  });

  describe("Order Confirmation", () => {
    it("should display order number");
    it("should display order summary");
    it("should show continue shopping button");
    it("should handle missing order gracefully");
  });
});
```

### 1.4 Product Display

**File**: `storefront/src/ui/components/__tests__/product-display.test.tsx`

```typescript
describe("Product Display", () => {
  describe("ProductElement", () => {
    it("should render product name and price");
    it("should display set icon with correct rarity color");
    it("should show stock status indicator");
    it("should handle missing thumbnail gracefully");
    it("should link to product detail page");
  });

  describe("VariantSelector", () => {
    it("should display condition options");
    it("should update price on variant change");
    it("should disable out-of-stock variants");
    it("should preselect first available variant");
  });

  describe("OtherPrintings", () => {
    it("should display alternative printings");
    it("should show set icon for each printing");
    it("should link to each printing's product page");
    it("should handle products with no other printings");
  });

  describe("MTGCardAttributes", () => {
    it("should render mana cost symbols");
    it("should display oracle text");
    it("should show card type line");
    it("should render color identity icons");
  });
});
```

---

## Part 2: Buylist App Tests

### 2.1 Buylist CRUD Operations

**File**: `saleor-apps/apps/buylist/src/modules/buylists/__tests__/crud.test.ts`

```typescript
describe("Buylist CRUD", () => {
  describe("buylists.create", () => {
    it("should create draft buylist with required fields");
    it("should generate buylist number with date prefix");
    it("should associate with installation and warehouse");
    it("should set initial status to DRAFT");
  });

  describe("buylists.list", () => {
    it("should list buylists for installation");
    it("should filter by status");
    it("should filter by date range");
    it("should paginate results");
    it("should sort by date descending");
  });

  describe("buylists.get", () => {
    it("should return buylist with lines");
    it("should include customer information");
    it("should include payout details");
    it("should return null for non-existent ID");
  });

  describe("buylists.update", () => {
    it("should update customer information");
    it("should allow updates only in DRAFT status");
    it("should reject updates to completed buylists");
  });

  describe("buylists.addLine", () => {
    it("should add line with variant and quantity");
    it("should calculate pricing using rule engine");
    it("should apply condition multiplier");
    it("should validate quantity is positive");
  });

  describe("buylists.updateLine", () => {
    it("should update line quantity");
    it("should recalculate pricing on change");
    it("should validate against minimum offer");
  });

  describe("buylists.removeLine", () => {
    it("should remove line from buylist");
    it("should recalculate totals");
    it("should handle removing last line");
  });
});
```

### 2.2 Pricing Rule Engine

**File**: `saleor-apps/apps/buylist/src/modules/pricing/__tests__/rule-engine.test.ts`

```typescript
describe("Pricing Rule Engine", () => {
  describe("Rule Matching", () => {
    it("should match rules by set code condition");
    it("should match rules by rarity condition");
    it("should match rules by finish condition");
    it("should evaluate AND conditions (all must match)");
    it("should evaluate OR conditions (any can match)");
    it("should respect rule priority ordering");
    it("should skip inactive rules");
    it("should skip rules outside time window");
  });

  describe("Action Types", () => {
    describe("PERCENTAGE_MODIFIER", () => {
      it("should apply percentage to base price");
      it("should handle 50% modifier correctly");
      it("should handle 0% modifier (no change)");
      it("should handle negative percentage");
    });

    describe("FIXED_MODIFIER", () => {
      it("should add fixed amount to price");
      it("should subtract fixed amount from price");
      it("should not go below zero");
    });

    describe("SET_PERCENTAGE", () => {
      it("should set price to percentage of market");
      it("should ignore previous modifiers");
    });

    describe("SET_MINIMUM", () => {
      it("should enforce minimum price");
      it("should not change price above minimum");
    });

    describe("SET_MAXIMUM", () => {
      it("should enforce maximum price");
      it("should not change price below maximum");
    });
  });

  describe("Rule Stacking", () => {
    it("should apply multiplicative stacking correctly");
    it("should apply additive stacking correctly");
    it("should respect stacking mode per rule");
    it("should apply rules in priority order");
  });

  describe("Condition Multipliers", () => {
    it("should apply NM multiplier (100%)");
    it("should apply LP multiplier (~85%)");
    it("should apply MP multiplier (~70%)");
    it("should apply HP multiplier (~50%)");
    it("should apply DMG multiplier (~25%)");
  });

  describe("Edge Cases", () => {
    it("should handle no matching rules");
    it("should handle product with no market price");
    it("should handle zero quantity");
    it("should handle very high prices");
    it("should handle very low prices");
  });
});
```

### 2.3 Buylist Payout Flow (extends existing test)

**File**: `saleor-apps/apps/buylist/src/modules/buylists/__tests__/payout.test.ts`

```typescript
describe("Buylist Payout", () => {
  describe("createAndPay", () => {
    it("should transition buylist to PENDING_VERIFICATION");
    it("should create payout record with method");
    it("should store idempotency key");
    it("should return existing buylist on duplicate key");

    describe("Cash Payout", () => {
      it("should record against POS register session");
      it("should create CashMovement with PAYOUT type");
      it("should update register totalCashOut");
    });

    describe("Store Credit Payout", () => {
      it("should require customer account");
      it("should create/update CustomerCredit record");
      it("should create CreditTransaction");
      it("should make credit immediately available");
    });

    describe("Check Payout", () => {
      it("should record check number as reference");
      it("should set status to PENDING until cleared");
    });
  });

  describe("Status Transitions", () => {
    it("should allow DRAFT -> PENDING_VERIFICATION");
    it("should allow PENDING_VERIFICATION -> VERIFIED");
    it("should allow VERIFIED -> PAID");
    it("should allow PENDING_VERIFICATION -> REJECTED");
    it("should block invalid transitions");
  });
});
```

### 2.4 Customer Integration

**File**: `saleor-apps/apps/buylist/src/modules/customers/__tests__/customers.test.ts`

```typescript
describe("Customer Integration", () => {
  describe("customers.search", () => {
    it("should search by email");
    it("should search by name");
    it("should search by phone");
    it("should return credit balance");
    it("should return buylist history count");
  });

  describe("customers.create", () => {
    it("should create Saleor customer via GraphQL");
    it("should create local CustomerCredit record");
    it("should validate email uniqueness");
  });

  describe("customers.getCredit", () => {
    it("should return current credit balance");
    it("should return transaction history");
  });
});
```

---

## Part 3: Inventory Ops Tests

### 3.1 WAC Calculation (extends existing test)

**File**: `saleor-apps/apps/inventory-ops/src/modules/cost-layers/__tests__/wac-comprehensive.test.ts`

```typescript
describe("WAC Comprehensive", () => {
  // Existing tests from wac-service.test.ts plus:

  describe("Real Database Integration", () => {
    it("should calculate WAC from actual cost events");
    it("should handle concurrent receipts correctly");
    it("should maintain consistency under load");
  });

  describe("Event Type Processing", () => {
    it("should handle GOODS_RECEIPT events");
    it("should handle BUYLIST_RECEIPT events");
    it("should handle SALE events");
    it("should handle SALE_RETURN events");
    it("should handle STOCK_ADJUSTMENT events");
    it("should handle REVERSAL events");
  });

  describe("Multi-Warehouse", () => {
    it("should calculate WAC per warehouse");
    it("should not mix warehouse inventories");
    it("should handle warehouse-specific receipts");
  });
});
```

### 3.2 Purchase Order Flow

**File**: `saleor-apps/apps/inventory-ops/src/modules/purchase-orders/__tests__/po-flow.test.ts`

```typescript
describe("Purchase Order Flow", () => {
  describe("purchaseOrders.create", () => {
    it("should create PO with supplier and lines");
    it("should generate PO number");
    it("should set status to DRAFT");
    it("should calculate expected totals");
  });

  describe("purchaseOrders.submit", () => {
    it("should transition DRAFT -> PENDING");
    it("should validate all lines have quantities");
    it("should set submitted timestamp");
  });

  describe("purchaseOrders.approve", () => {
    it("should transition PENDING -> APPROVED");
    it("should record approver");
    it("should allow receiving after approval");
  });

  describe("purchaseOrders.receive", () => {
    it("should create goods receipt");
    it("should update line received quantities");
    it("should handle partial receiving");
    it("should transition to RECEIVED when complete");
  });

  describe("Status Transitions", () => {
    it("DRAFT -> PENDING (submit)");
    it("PENDING -> APPROVED (approve)");
    it("PENDING -> REJECTED (reject)");
    it("APPROVED -> RECEIVED (receive all)");
    it("APPROVED -> PARTIALLY_RECEIVED (partial)");
    it("block invalid transitions");
  });
});
```

### 3.3 Goods Receipt Processing

**File**: `saleor-apps/apps/inventory-ops/src/modules/goods-receipts/__tests__/gr-processing.test.ts`

```typescript
describe("Goods Receipt Processing", () => {
  describe("goodsReceipts.create", () => {
    it("should create GR linked to PO");
    it("should copy expected quantities from PO");
    it("should allow variance from expected");
  });

  describe("goodsReceipts.post", () => {
    it("should create CostLayerEvent for each line");
    it("should update Saleor stock levels");
    it("should calculate landed cost allocation");
    it("should update PO received quantities");
    it("should recalculate WAC");
  });

  describe("Landed Cost Allocation", () => {
    it("should allocate by value (proportional)");
    it("should allocate by quantity (equal)");
    it("should include shipping in unit cost");
    it("should handle zero-cost items");
  });

  describe("Stock Posting", () => {
    it("should call Saleor stock update mutation");
    it("should handle posting errors");
    it("should roll back on failure");
  });
});
```

### 3.4 Price Sync Dashboard

**File**: `saleor-apps/apps/inventory-ops/src/modules/price-sync/__tests__/dashboard.test.ts`

```typescript
describe("Price Sync Dashboard", () => {
  describe("priceSync.getStatus", () => {
    it("should return current sync status");
    it("should include active job info");
    it("should return last sync timestamp");
    it("should return pending report count");
  });

  describe("priceSync.triggerFullSync", () => {
    it("should create PENDING job of type FULL");
    it("should prevent duplicate active jobs");
    it("should return job ID for tracking");
  });

  describe("priceSync.triggerDeltaSync", () => {
    it("should create PENDING job of type DELTA");
    it("should accept lookback days parameter");
    it("should validate lookback range (1-30)");
  });

  describe("priceSync.getJobs", () => {
    it("should list jobs with pagination");
    it("should filter by status");
    it("should order by createdAt descending");
  });

  describe("priceSync.cancelJob", () => {
    it("should cancel PENDING job");
    it("should reject cancel for RUNNING job");
    it("should reject cancel for COMPLETED job");
  });
});
```

### 3.5 Price Sync Reporting & Approval

**File**: `saleor-apps/apps/inventory-ops/src/modules/price-sync/__tests__/reporting.test.ts`

```typescript
describe("Price Sync Reporting", () => {
  describe("Report Generation", () => {
    it("should create report for sync job");
    it("should calculate change statistics");
    it("should detect anomalies above threshold");
    it("should calculate 7-day trend");
    it("should calculate 30-day trend");
  });

  describe("Pending Updates", () => {
    it("should stage price changes as PENDING");
    it("should not auto-apply any changes");
    it("should flag anomalies for review");
    it("should include old and new prices");
  });

  describe("priceSync.getReport", () => {
    it("should return report with pending updates");
    it("should include update statistics");
    it("should show anomaly count");
  });

  describe("priceSync.getPendingUpdates", () => {
    it("should filter by anomaly flag");
    it("should filter by direction (up/down)");
    it("should paginate results");
  });

  describe("priceSync.approveAll", () => {
    it("should apply all pending prices");
    it("should create SellPriceSnapshot records");
    it("should mark updates as APPROVED");
    it("should update report status");
  });

  describe("priceSync.approveSelected", () => {
    it("should apply only selected prices");
    it("should leave others as PENDING");
  });

  describe("priceSync.rejectAll", () => {
    it("should mark all as REJECTED");
    it("should not apply any prices");
  });

  describe("Anomaly Detection", () => {
    it("should flag changes > threshold");
    it("should respect configurable threshold");
    it("should not flag changes < threshold");
    it("should handle zero previous price");
  });

  describe("Trend Analysis", () => {
    it("should calculate 7-day trend direction");
    it("should calculate 30-day trend direction");
    it("should handle insufficient history");
    it("should return STABLE for small changes");
  });
});
```

### 3.6 Stock Adjustments & Discrepancies

**File**: `saleor-apps/apps/inventory-ops/src/modules/stock/__tests__/adjustments.test.ts`

```typescript
describe("Stock Adjustments", () => {
  describe("stockAdjustments.create", () => {
    it("should create adjustment with lines");
    it("should set status to DRAFT");
    it("should calculate cost based on WAC");
  });

  describe("stockAdjustments.post", () => {
    it("should create CostLayerEvents");
    it("should update Saleor stock");
    it("should update WAC for additions");
    it("should use current WAC for reductions");
  });

  describe("stockAdjustments.reverse", () => {
    it("should create reversal events");
    it("should restore original quantities");
    it("should recalculate WAC");
  });

  describe("Adjustment Reasons", () => {
    it("should handle DAMAGE reason");
    it("should handle SHRINKAGE reason");
    it("should handle COUNT_CORRECTION reason");
    it("should handle EXPIRY reason");
    it("should handle FOUND_STOCK reason");
  });
});

describe("Stock Discrepancies", () => {
  describe("Webhook Detection", () => {
    it("should detect unauthorized stock changes");
    it("should create discrepancy record");
    it("should capture before/after quantities");
    it("should identify source of change");
  });

  describe("stockDiscrepancies.acknowledge", () => {
    it("should mark discrepancy as acknowledged");
    it("should record acknowledging user");
  });

  describe("stockDiscrepancies.resolve", () => {
    it("should mark as resolved");
    it("should optionally create adjustment");
  });

  describe("stockDiscrepancies.createAdjustment", () => {
    it("should create adjustment from discrepancy");
    it("should link adjustment to discrepancy");
  });
});
```

---

## Part 4: POS App Tests

### 4.1 Register Operations

**File**: `saleor-apps/apps/pos/src/modules/register/__tests__/register-ops.test.ts`

```typescript
describe("Register Operations", () => {
  describe("register.open", () => {
    it("should create register session");
    it("should record opening cash amount");
    it("should set status to OPEN");
    it("should prevent multiple open registers per user");
  });

  describe("register.close", () => {
    it("should transition to CLOSED");
    it("should calculate expected cash");
    it("should record counted cash");
    it("should calculate variance");
    it("should include buylist payouts in summary");
  });

  describe("register.cashDrop", () => {
    it("should create CashMovement with DROP type");
    it("should reduce drawer amount");
    it("should record drop reason");
  });

  describe("register.cashSummary", () => {
    it("should calculate total sales");
    it("should calculate total returns");
    it("should calculate total drops");
    it("should calculate buylist payouts");
    it("should calculate expected drawer amount");
  });

  describe("Buylist Payout Integration", () => {
    it("should list payouts for register session");
    it("should include buylist details in summary");
    it("should track payout count and total");
  });
});
```

### 4.2 Transaction Management

**File**: `saleor-apps/apps/pos/src/modules/transactions/__tests__/transactions.test.ts`

```typescript
describe("Transaction Management", () => {
  describe("transactions.create", () => {
    it("should create transaction with lines");
    it("should link to Saleor draft order");
    it("should set status to IN_PROGRESS");
  });

  describe("transactions.addLine", () => {
    it("should add product line");
    it("should lookup price from Saleor");
    it("should validate stock availability");
  });

  describe("transactions.removeLine", () => {
    it("should remove line from transaction");
    it("should recalculate totals");
  });

  describe("transactions.updateLineQuantity", () => {
    it("should update line quantity");
    it("should recalculate line total");
  });

  describe("transactions.attachCustomer", () => {
    it("should link customer to transaction");
    it("should enable store credit payment");
    it("should attach to Saleor order");
  });

  describe("transactions.complete", () => {
    it("should finalize Saleor order");
    it("should record payment methods");
    it("should generate receipt");
    it("should transition to COMPLETED");
  });

  describe("transactions.void", () => {
    it("should cancel Saleor order");
    it("should transition to VOIDED");
    it("should reverse any payments");
  });
});
```

### 4.3 Customer Search & Store Credit

**File**: `saleor-apps/apps/pos/src/modules/customers/__tests__/customers-credit.test.ts`

```typescript
describe("Customer Search & Store Credit", () => {
  describe("customers.search", () => {
    it("should search by email");
    it("should search by name");
    it("should return credit balance");
    it("should debounce search requests");
  });

  describe("customers.create", () => {
    it("should create Saleor customer");
    it("should initialize credit balance to zero");
  });

  describe("Store Credit Payment", () => {
    it("should check available balance");
    it("should deduct from credit balance");
    it("should create debit transaction");
    it("should handle insufficient balance");
    it("should support split tender");
  });

  describe("Credit Balance", () => {
    it("should show current balance");
    it("should include pending credits");
    it("should show transaction history");
  });
});
```

### 4.4 Payment Processing

**File**: `saleor-apps/apps/pos/src/modules/payments/__tests__/payments.test.ts`

```typescript
describe("Payment Processing", () => {
  describe("payments.process", () => {
    describe("Cash Payment", () => {
      it("should record cash amount");
      it("should calculate change due");
      it("should update register drawer");
    });

    describe("Card Payment", () => {
      it("should record card transaction");
      it("should store authorization code");
    });

    describe("Store Credit Payment", () => {
      it("should validate customer attached");
      it("should validate sufficient balance");
      it("should deduct from credit");
      it("should create transaction record");
    });

    describe("Split Tender", () => {
      it("should accept multiple payment methods");
      it("should validate total equals transaction amount");
      it("should record each payment separately");
    });
  });
});
```

---

## Part 5: Integration Tests

### 5.1 Saleor GraphQL Integration

**File**: `saleor-apps/apps/inventory-ops/src/modules/saleor/__tests__/graphql-integration.test.ts`

```typescript
describe("Saleor GraphQL Integration", () => {
  describe("Stock Updates", () => {
    it("should increase stock via productVariantStocksCreate");
    it("should update stock via productVariantStocksUpdate");
    it("should handle multiple warehouses");
  });

  describe("Order Queries", () => {
    it("should fetch order with lines and variants");
    it("should handle pagination for large orders");
  });

  describe("Product Queries", () => {
    it("should fetch product with pricing");
    it("should fetch variant stock levels");
  });
});
```

### 5.2 Webhook Handlers

**File**: `saleor-apps/apps/inventory-ops/src/app/api/webhooks/__tests__/webhooks.test.ts`

```typescript
describe("Webhook Handlers", () => {
  describe("ORDER_FULFILLED", () => {
    it("should create SALE cost event for each line");
    it("should calculate COGS at current WAC");
    it("should update inventory ledger");
  });

  describe("PRODUCT_VARIANT_STOCK_UPDATED", () => {
    it("should detect unauthorized changes");
    it("should create discrepancy record");
    it("should ignore changes from known sources");
  });
});
```

---

## Part 6: E2E Test Scenarios

### 6.1 Complete Buylist Flow

**File**: `saleor-apps/apps/buylist/e2e/buylist-flow.spec.ts`

```typescript
describe("Complete Buylist Flow", () => {
  it("should complete full buylist with cash payout", async () => {
    // 1. Create draft buylist
    // 2. Add card lines with pricing
    // 3. Attach customer
    // 4. Submit for verification
    // 5. Verify buylist
    // 6. Process cash payout
    // 7. Verify register updated
  });

  it("should complete buylist with store credit", async () => {
    // 1. Create draft buylist
    // 2. Add card lines
    // 3. Attach customer account
    // 4. Submit and verify
    // 5. Process store credit payout
    // 6. Verify customer credit increased
  });
});
```

### 6.2 Purchase Order to Stock

**File**: `saleor-apps/apps/inventory-ops/e2e/po-to-stock.spec.ts`

```typescript
describe("Purchase Order to Stock", () => {
  it("should complete PO flow and update stock", async () => {
    // 1. Create purchase order
    // 2. Add lines with quantities
    // 3. Submit for approval
    // 4. Approve PO
    // 5. Create goods receipt
    // 6. Post goods receipt
    // 7. Verify Saleor stock updated
    // 8. Verify WAC calculated
  });

  it("should handle partial receiving", async () => {
    // 1. Create and approve PO
    // 2. Receive partial quantity
    // 3. Verify partial stock update
    // 4. Receive remainder
    // 5. Verify complete
  });
});
```

### 6.3 Price Sync Workflow

**File**: `saleor-apps/apps/inventory-ops/e2e/price-sync.spec.ts`

```typescript
describe("Price Sync Workflow", () => {
  it("should sync prices with approval", async () => {
    // 1. Trigger delta sync
    // 2. Wait for job completion
    // 3. Check pending updates created
    // 4. Review anomalies
    // 5. Approve selected updates
    // 6. Verify prices applied
  });

  it("should reject anomalous prices", async () => {
    // 1. Trigger sync with anomalies
    // 2. Review report
    // 3. Reject anomalies
    // 4. Verify prices not applied
  });
});
```

### 6.4 Storefront Checkout

**File**: `storefront/e2e/checkout.spec.ts`

```typescript
describe("Storefront Checkout", () => {
  it("should complete guest checkout", async () => {
    // 1. Add product to cart
    // 2. Navigate to checkout
    // 3. Enter shipping address
    // 4. Select shipping method
    // 5. Enter payment details
    // 6. Complete order
    // 7. Verify confirmation page
  });

  it("should handle cart quantity changes", async () => {
    // 1. Add product to cart
    // 2. Increase quantity with + button
    // 3. Decrease quantity with - button
    // 4. Verify totals update
  });

  it("should filter products correctly", async () => {
    // 1. Navigate to product list
    // 2. Apply color filter
    // 3. Verify filtered results
    // 4. Clear filters
    // 5. Verify all products shown
  });
});
```

---

## Test Infrastructure

### Setup Files

**Vitest Config** (`vitest.config.ts`):
```typescript
export default {
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setup-tests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
};
```

**Test Setup** (`src/setup-tests.ts`):
```typescript
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

**File**: `src/__tests__/factories/index.ts`
```typescript
export const createMockBuylist = (overrides = {}) => ({
  id: 'buylist-123',
  buylistNumber: 'BL-20260103-0001',
  status: 'DRAFT',
  // ... defaults
  ...overrides,
});

export const createMockCostEvent = (overrides = {}) => ({
  id: 'event-123',
  eventType: 'GOODS_RECEIPT',
  qtyDelta: 10,
  // ... defaults
  ...overrides,
});
```

---

## Test Execution

### Commands

```bash
# Run all unit tests
pnpm test:ci

# Run specific app tests
pnpm --filter saleor-app-buylist test
pnpm --filter saleor-app-inventory-ops test
pnpm --filter saleor-app-pos test

# Run with coverage
pnpm test:ci -- --coverage

# Run E2E tests
pnpm --filter saleor-app-buylist e2e
pnpm --filter saleor-app-inventory-ops e2e

# Watch mode for development
pnpm --filter saleor-app-buylist test -- --watch
```

### CI Pipeline

```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
    - run: pnpm install
    - run: pnpm test:ci
    - run: pnpm test:ci -- --coverage
    - uses: codecov/codecov-action@v3
```

---

## Priority Matrix

| Test Suite | Priority | Effort | Coverage Target |
|------------|----------|--------|-----------------|
| Pricing Rule Engine | P0 | 2 days | 95% |
| WAC Calculation | P0 | 1 day | 95% |
| Buylist createAndPay | P0 | 2 days | 90% |
| Price Sync Approval | P1 | 1 day | 85% |
| PO/GR Flow | P1 | 2 days | 85% |
| Register Operations | P1 | 1 day | 80% |
| Storefront Cart | P2 | 1 day | 80% |
| Storefront Checkout | P2 | 2 days | 80% |
| E2E Flows | P2 | 3 days | Critical paths |

---

## Success Criteria

- [ ] All P0 tests written and passing
- [ ] 80%+ code coverage on business logic
- [ ] All E2E critical paths covered
- [ ] CI pipeline running on all PRs
- [ ] No regressions in existing functionality
