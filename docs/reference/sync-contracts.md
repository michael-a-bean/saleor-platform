# Sync Contracts: Saleor - Inventory-Ops - Meilisearch

**Created:** 2026-01-18
**Status:** Living Document
**Owner:** Platform Team

This document defines the data synchronization contracts between system components.
Changes to any contract should be documented here first.

---

## Data Flow Diagram

```
+-----------------------------------------------------------------------------+
|                              WRITE PATHS                                    |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +==============+    webhook    +==================+                        |
|  ||   Saleor   || ------------>||  inventory-ops  ||                        |
|  ||  (Django)  ||              ||  (Next.js App)  ||                        |
|  +==============+              +==================+                         |
|        |                               |                                    |
|        | ORDER_FULFILLED               | CostLayerEvent                     |
|        | PRODUCT_VARIANT_STOCK_UPDATED | WAC calculation                    |
|        v                               v                                    |
|  +--------------+               +------------------+                        |
|  |  PostgreSQL  |               |    Prisma DB     |                        |
|  |  (products)  |               |  (cost layers)   |                        |
|  +--------------+               +------------------+                        |
|        |                                                                    |
|        | sync scripts                                                       |
|        v                                                                    |
|  +--------------+                                                           |
|  | Meilisearch  |                                                           |
|  |  (search)    |                                                           |
|  +--------------+                                                           |
|                                                                             |
+-----------------------------------------------------------------------------+

+-----------------------------------------------------------------------------+
|                              READ PATHS                                     |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +------------+     GraphQL      +----------+                               |
|  | Storefront | <--------------> |  Saleor  |                               |
|  |  (Next.js) |                  |   API    |                               |
|  +------------+                  +----------+                               |
|        |                                                                    |
|        | search queries                                                     |
|        v                                                                    |
|  +--------------+                                                           |
|  | Meilisearch  |                                                           |
|  +--------------+                                                           |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Contract 1: Saleor -> inventory-ops (ORDER_FULFILLED)

| Field | Value |
|-------|-------|
| **Trigger** | Order fulfillment in Saleor |
| **Webhook URL** | `/api/webhooks/saleor/order-fulfilled` |
| **Subscription** | `ORDER_FULFILLED` |
| **Direction** | Saleor -> inventory-ops |

### Payload Structure

```json
{
  "order": {
    "id": "T3JkZXI6MTIzNA==",
    "number": "1234",
    "lines": [
      {
        "variant": {
          "id": "UHJvZHVjdFZhcmlhbnQ6NTY3OA==",
          "sku": "ff1b8fc5-...-NM-F"
        },
        "quantity": 2
      }
    ]
  }
}
```

### Action

1. Look up cost layers for each variant SKU
2. Calculate COGS using FIFO method
3. Create `CostLayerEvent` with type=`SALE`
4. Update WAC (Weighted Average Cost)

### Failure Modes

| Scenario | Handling |
|----------|----------|
| Webhook delivery fails | Saleor retries (3x with backoff) |
| Processing error | Log error, create `SaleorSyncJob` with status=`FAILED` |
| Missing cost data | Log warning, use default cost, flag for review |

---

## Contract 2: Saleor -> inventory-ops (STOCK_UPDATED)

| Field | Value |
|-------|-------|
| **Trigger** | Stock quantity change in Saleor (external) |
| **Webhook URL** | `/api/webhooks/saleor/stock-updated` |
| **Subscription** | `PRODUCT_VARIANT_STOCK_UPDATED` |
| **Direction** | Saleor -> inventory-ops |

### Payload Structure

```json
{
  "productVariant": {
    "id": "UHJvZHVjdFZhcmlhbnQ6NTY3OA==",
    "sku": "ff1b8fc5-...-NM-F",
    "stocks": [
      {
        "warehouse": { "id": "..." },
        "quantity": 10
      }
    ]
  }
}
```

### Action

1. Compare stock quantity with inventory-ops records
2. If mismatch, create `StockDiscrepancy` record
3. Flag for human review (no auto-correction)

### Failure Modes

| Scenario | Handling |
|----------|----------|
| Webhook delivery fails | Silent fail (advisory only) |
| Processing error | Log warning, skip |

---

## Contract 3: Import Script -> Saleor (Bulk Create)

| Field | Value |
|-------|-------|
| **Trigger** | Manual script execution |
| **Script** | `scripts/mtg_scryfall_import/import_command.py` |
| **Direction** | Scryfall JSON -> Saleor PostgreSQL |

### Data Source

- Scryfall bulk data API (default-cards.json)
- ~106k unique English paper cards
- 15 variants per card (5 conditions x 3 finishes)

### Action

1. Download Scryfall bulk data
2. Transform to Saleor product/variant structure
3. Create via Django ORM (bypasses GraphQL)
4. Checkpoint progress for resume capability

### Critical Issue (Known)

**Direct ORM bypasses GraphQL mutations**, which means:
- No webhook events emitted
- No validation rules applied
- Possible `discounted_price_amount = NULL` bug

**TODO:** Migrate to `productVariantBulkCreate` GraphQL mutation (Phase 5)

### Failure Modes

| Scenario | Handling |
|----------|----------|
| Import interrupted | Checkpoint saved to `/tmp/mtg_import_progress.json` |
| Duplicate SKU | Skip, log warning |
| Database error | Rollback batch, retry |

---

## Contract 4: Saleor -> Meilisearch (Search Sync)

| Field | Value |
|-------|-------|
| **Trigger** | Manual script or scheduled job |
| **Scripts** | `sync-meilisearch.py`, `meilisearch-delta-sync.py`, `meilisearch-reconcile.py` |
| **Direction** | Saleor PostgreSQL -> Meilisearch |

### Sync Scripts

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `sync-meilisearch.py` | Full sync | Initial load, after major changes |
| `sync-meilisearch.py --full` | Full reindex | After schema changes |
| `meilisearch-delta-sync.py` | Incremental sync | Hourly/daily updates |
| `meilisearch-reconcile.py` | Audit counts | After sync failures, daily health check |

### Document Schema

```json
{
  "id": "Product_12345",
  "name": "Lightning Bolt",
  "set_code": "LEA",
  "rarity": "common",
  "mana_value": 1,
  "color_identity": ["Red"],
  "in_stock": true,
  "min_price": 5.58,
  "last_indexed_at": "2026-01-18T10:30:00Z",
  "saleor_updated_at": "2026-01-18T10:00:00Z",
  "variants": [...]
}
```

### Index Settings

```json
{
  "searchableAttributes": ["name", "name_parts", "name_prefixes", "oracle_text", "keywords", "type_line", "set_name", "set_code", "searchable"],
  "filterableAttributes": ["color_identity", "colors", "conditions_available", "finishes_available", "in_stock", "keywords", "mana_value", "min_price", "rarity", "set_code", "set_name", "type_line"],
  "sortableAttributes": ["collector_number", "min_price", "name", "set_name", "type_line"]
}
```

### Failure Modes

| Scenario | Handling |
|----------|----------|
| Meilisearch unreachable | Fail, alert, retry |
| Partial sync failure | Log failed products, reconcile job detects |
| Token expiry mid-sync | Auto-refresh (4-minute token lifetime) |

---

## Contract 5: Storefront -> Meilisearch (Search)

| Field | Value |
|-------|-------|
| **Trigger** | User search query |
| **Direction** | Storefront -> Meilisearch |
| **Latency SLA** | <50ms p99 |

### Query Patterns

| Query Type | Example | Filter |
|------------|---------|--------|
| Card name search | "lightning bolt" | - |
| Set browsing | - | `set_code = "LEA"` |
| Rarity filter | - | `rarity = "mythic"` |
| CMC filter | "3-drops" | `mana_value = 3` |
| Color identity | "blue cards" | `color_identity = "Blue"` |
| In-stock only | - | `in_stock = true` |
| Combined | "blue mythics under $10" | Multiple filters |

---

## Reconciliation & Monitoring

### Daily Health Checks

```bash
# Run reconciliation to detect count mismatches
python scripts/meilisearch-reconcile.py --channel webstore

# Expected output:
# Saleor products:     99,400
# Meilisearch docs:    99,400
# Counts match perfectly!
```

### Alert Conditions

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Count mismatch | >1% difference | Alert + auto-sync |
| Sync job failure | Any | Alert |
| Meilisearch latency | >100ms p99 | Alert |

### Audit Log

All sync operations log to:
- Stdout (container logs)
- `/var/log/saleor/sync.log` (if configured)

---

## Future Improvements (Roadmap)

1. **Real-time Sync**: Subscribe to Saleor webhooks for immediate Meilisearch updates
2. **Dead Letter Queue**: Capture failed sync events for retry
3. **Bulk Mutation Migration**: Replace Django ORM import with GraphQL (Phase 5)
4. **Event Sourcing**: Full audit trail of all sync operations

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-18 | Initial document created | Gen (PAI) |
| 2026-01-18 | Added delta sync scripts | Gen (PAI) |
