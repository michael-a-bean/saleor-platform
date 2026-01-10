# Synthesized Feature Roadmap
## Saleor Hobby Gaming Commerce Platform

**Generated**: 2026-01-09
**Sources**: Claude Opus 4.5, Gemini 2.0 Flash, GPT-4o
**Method**: Cross-model consensus analysis with weighted prioritization

---

## Executive Summary

Three AI models independently analyzed the Saleor hobby gaming platform and achieved strong consensus on critical gaps. This document synthesizes their recommendations into an actionable roadmap.

### Consensus Findings

| Gap | Claude | Gemini | GPT-4o | Consensus |
|-----|:------:|:------:|:------:|:---------:|
| POS COGS on Sale | Critical | Critical | Critical | **UNANIMOUS** |
| Tax Calculation | Critical | Critical | Critical | **UNANIMOUS** |
| Square Terminal Payments | Critical | Critical | Critical | **UNANIMOUS** |
| Offline POS Mode | High | High | High | **UNANIMOUS** |
| Inventory Sync | Critical | Critical | - | Strong |
| Price Sync Automation | Medium | High | High | Strong |
| Thermal Printing | Low | High | High | Moderate |
| Test Coverage | Medium | Medium | - | Moderate |

---

## Roadmap Phases

### Phase 1: Revenue Protection (Weeks 1-3)
*Critical items that directly impact revenue and compliance*

#### 1.1 POS COGS on Sale ⚠️ CRITICAL
**Consensus**: All three models rated this as the #1 priority.

**Implementation**:
```typescript
// When completing POS transaction, create CostLayerEvent for each line
await tx.costLayerEvent.create({
  data: {
    installationId,
    eventType: "POS_SALE",
    saleorVariantId: line.saleorVariantId,
    saleorWarehouseId: transaction.saleorWarehouseId,
    qtyDelta: -line.quantity,  // Negative for sales
    unitCost: currentWac,      // Use WAC as cost basis
    wacAtEvent: newWac,
    qtyOnHandAtEvent: newQty,
    totalValueAtEvent: newValue,
    sourceTransactionLineId: line.id,
  },
});
```

**Files to modify**:
- `pos/src/modules/payments/payments-router.ts` (in complete mutation)

**Effort**: 2-3 days
**Risk if skipped**: No margin tracking, impossible to assess profitability

---

#### 1.2 Tax Calculation ⚠️ CRITICAL
**Consensus**: Unanimous. $0 tax is a compliance risk.

**Recommended approach** (from Gemini):
1. Integrate AvaTax app (already in saleor-apps)
2. Or use Saleor's built-in tax configuration
3. Store tax breakdown in `PosTransaction` and `PosTransactionLine`

**Implementation options**:
- **Option A**: Use Saleor's tax settings via GraphQL when creating order
- **Option B**: Integrate AvaTax API directly in POS app
- **Option C**: Simple percentage-based tax (configurable per register/location)

**Files to modify**:
- `pos/src/modules/transactions/transactions-router.ts` (recalculateTransactionTotals)

**Effort**: 3-5 days depending on approach
**Risk if skipped**: Legal compliance issues, potential fines

---

#### 1.3 Square Terminal Card Payments ⚠️ CRITICAL
**Consensus**: Unanimous. Cash-only limits sales significantly.

**Current state**: OAuth, device management, and webhook handling exist. Payment flow not wired.

**Implementation** (from Gemini):
1. In `payments-router.ts`, add `recordCardPayment` mutation
2. Call Square Terminal API to initiate checkout
3. Handle webhook for payment confirmation
4. Only complete POS transaction after Square confirms

**Files to modify**:
- `pos/src/modules/payments/payments-router.ts`
- `pos/src/modules/square/terminal/terminal-checkout-service.ts`

**Effort**: 5-7 days (including testing with sandbox)
**Risk if skipped**: 30-50% of potential sales lost

---

### Phase 2: Operational Stability (Weeks 4-6)
*Items that prevent business disruption*

#### 2.1 Saleor ↔ Local Inventory Sync
**Consensus**: Claude and Gemini rated Critical; prevents stock drift.

**Recommended approach**: Webhook-based (preferred over polling)
1. Create Saleor App subscribing to `productVariantStockUpdated`
2. On webhook, update local inventory tracking
3. Implement conflict resolution (last-write-wins or flag for review)

**Alternative**: Polling job every 5 minutes

**Effort**: 3-5 days
**Risk if skipped**: Overselling, customer dissatisfaction

---

#### 2.2 Offline POS Mode
**Consensus**: Unanimous. Network down = no sales.

**Current state**: Full sync service exists with IndexedDB backing. Never connected to UI.

**Implementation**:
1. Initialize SyncService in POS app startup
2. Use TransactionQueueService for offline transaction storage
3. Use ProductCacheService for offline product lookup
4. Add UI indicator for online/offline status
5. Auto-sync when connectivity restored

**Files to modify**:
- `pos/src/pages/transaction.tsx` (or new React context)
- `pos/src/lib/offline/sync-service.ts` (already implemented)

**Effort**: 5-7 days
**Risk if skipped**: Complete sales halt during outages

---

#### 2.3 Thermal Receipt Printing
**Consensus**: Moderate (Gemini/GPT high, Claude low). Quick win.

**Current state**: ESC/POS code exists in `pos/src/lib/hardware/escpos.ts`

**Implementation**:
1. Add printer connection management to React context
2. Wire print button to ESC/POS commands after transaction complete
3. Fall back to browser print if no thermal printer connected

**Effort**: 2-3 days
**Risk if skipped**: Poor customer experience, slower checkout

---

### Phase 3: Automation & Quality (Weeks 7-10)
*Items that reduce manual work and improve reliability*

#### 3.1 Price Sync Automation
**Consensus**: Strong (all models mentioned, varying priority)

**Recommended approach**:
1. Convert `sync-scryfall.py` scripts to scheduled jobs
2. Use cron or Temporal workflow
3. Run daily at low-traffic time (e.g., 4 AM)
4. Alert on failures

**Alternative** (from Gemini): Event-driven with message queue

**Effort**: 2-3 days
**Risk if skipped**: Stale prices, lost margin on buylists

---

#### 3.2 Meilisearch Auto-Sync
**Consensus**: Moderate. Manual sync causes stale search.

**Recommended approach**:
1. Subscribe to Saleor `productUpdated` webhook
2. Update Meilisearch index on change
3. Or trigger from price-sync job completion

**Effort**: 2-3 days
**Risk if skipped**: Search shows old prices/stock

---

#### 3.3 Test Coverage Expansion
**Consensus**: Moderate (Claude and Gemini emphasized)

**Priority test areas** (from Claude):
1. POS transaction complete flow (with COGS)
2. Buylist createAndPay workflow
3. Returns processing
4. Offline sync round-trip

**Target**: 60%+ coverage on critical paths

**Effort**: 5-10 days (ongoing)
**Risk if skipped**: Regressions on critical workflows

---

### Phase 4: User Experience (Weeks 11-14)
*Items that improve staff and customer experience*

#### 4.1 Returns UI
**Consensus**: Moderate. Currently API-only.

**Implementation**:
1. Add Returns page in POS app
2. Search original transaction by receipt number
3. Select lines and quantities to return
4. Process refund (cash or card reversal)

**Effort**: 5-7 days

---

#### 4.2 Multi-Register Support
**Consensus**: Moderate. Data model ready, needs UI.

**Implementation**:
1. Register selection on login/session open
2. Display current register in header
3. Cash drawer reconciliation per register

**Effort**: 3-5 days

---

#### 4.3 Analytics Dashboard
**Consensus**: Mentioned by all three models.

**Key metrics**:
- Daily/weekly/monthly sales
- Top selling products
- Margin by category
- Buylist profitability
- Inventory turnover

**Recommended tools** (from GPT): Looker, Tableau, or custom with Chart.js

**Effort**: 10-15 days

---

## Unique Insights by Model

### Gemini-Specific Recommendations
1. **Condition Grading Standardization**: Create objective grading criteria with reference images
2. **Image Capture for Buylists**: Document card condition at purchase time
3. **Pre-order Support**: Missing revenue opportunity for new MTG sets
4. **Event-Driven Architecture**: Consider Kafka/RabbitMQ for scalability

### GPT-4o-Specific Recommendations
1. **Loyalty Program**: Integrate Smile.io or Yotpo for customer rewards
2. **Mobile Application**: Streamlined in-store operations
3. **Serverless Computing**: AWS Lambda for pricing/tax calculations

### Claude-Specific Insights
1. **O(1) WAC Optimization**: Already implemented - leverage for COGS
2. **Hardcoded ID Tech Debt**: Fix before multi-location rollout
3. **TypeScript Suppressions**: Document or refactor checkout hooks

---

## Risk Matrix

| Gap Not Addressed | Probability | Impact | Risk Score |
|-------------------|:-----------:|:------:|:----------:|
| No COGS tracking | High | Critical | **9** |
| Tax compliance | High | Critical | **9** |
| Cash-only POS | High | High | **8** |
| Inventory drift | Medium | High | **6** |
| Network outage | Medium | High | **6** |
| Stale pricing | Medium | Medium | **4** |
| Low test coverage | High | Medium | **6** |

---

## Recommended Immediate Actions

### This Week
1. [ ] Fix hardcoded channel/warehouse IDs in POS (tech debt)
2. [ ] Create CostLayerEvent on POS sale complete (COGS)
3. [ ] Research tax integration options

### Next Sprint
4. [ ] Implement tax calculation (Option A, B, or C)
5. [ ] Wire Square Terminal to payment flow
6. [ ] Begin offline POS integration

### This Month
7. [ ] Deploy card payments to production
8. [ ] Set up inventory sync webhook
9. [ ] Automate price sync scheduling

---

## Architecture Considerations

### For Multi-Location (Future)
All three models noted the existing multi-tenant architecture. For multi-location:
- Add `locationId` alongside `warehouseId`
- Centralized inventory service (Gemini recommendation)
- Per-location tax configuration
- Inter-location transfers

### Costing Method Decision
| Method | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| WAC | Simple, already implemented | Less accurate for collectibles | **Keep for most items** |
| FIFO | Better for appreciating items | More complex | Consider for high-value |
| Specific ID | Most accurate | Very complex | Reserve for items >$100 |

---

## Conclusion

The three AI models achieved remarkable consensus on the critical gaps: **COGS, tax, and card payments** should be addressed immediately. The existing codebase has strong foundations (WAC calculation, offline infrastructure, Square integration scaffolding) that just need to be connected.

**Estimated total effort for Phase 1**: 10-15 days
**Estimated ROI**: Enables margin tracking and potentially 30-50% more sales via card acceptance

---

*This roadmap synthesizes analyses from Claude Opus 4.5, Gemini 2.0 Flash, and GPT-4o. Individual model outputs are available in the same directory.*
