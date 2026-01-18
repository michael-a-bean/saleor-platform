# MTG Inventory Generation System Analysis

**Date:** 2026-01-18
**Method:** PAI Council Debate (4 agents, 3 rounds)
**Topic:** Evaluate current MTG singles inventory generation methods for functionality, breadth, best practices, and Saleor platform utilization

---

## Executive Summary

The MTG inventory generation system is **architecturally sound** with a **6/10 Saleor utilization score**. The major gaps are pipeline robustness (no delta sync), search completeness (missing MTG-critical filters), and Saleor bypass patterns (direct ORM creates validation gaps).

**Recommended priority**: Delta sync infrastructure → Meilisearch schema → Bulk mutation migration

**Scope note**: This analysis covers **inventory generation** (catalog import, variant creation, attribute sync). Price synchronization to storefront is intentionally deferred as a separate system - see "Price Sync Clarification" section.

---

## Council Members

| Agent | Focus Area |
|-------|------------|
| **Saleor Platform Expert** | Native Saleor capabilities - bulk mutations, webhooks, channels, metadata |
| **Secondary Market Specialist** | MTG market operations - TCGPlayer, condition grading, buylists |
| **Data Pipeline Architect** | ETL best practices, data integrity, idempotency, sync patterns |
| **Search & Performance Engineer** | Meilisearch optimization, query patterns, index design |

---

## Current System Architecture

### Data Sources
- **Primary**: Scryfall Bulk Data API (50GB+ JSON, ~106,872 English paper cards)
- **Secondary**: TCGPlayer (pricing/SKU mapping), MTGJSON (sealed products), Cardmarket (EU pricing)

### Import Pipeline
```
Scryfall JSON → import_command.py → Products + Base Variants (with prices)
                     ↓
create_finish_variants.py → Condition×Finish Variants ($0.00 placeholder prices)
                     ↓
sync-meilisearch.py → Search Index
```

### Price Tracking (Separate System)
```
Scryfall API → cron/price-sync → SellPriceSnapshot (inventory-ops DB)
                     ↓
bulk_price_sync.py → SellPriceSnapshot (inventory-ops DB)
```
> **Note:** Price tracking is intentionally decoupled from the storefront. See "Price Sync Clarification" below.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Django Import Command | `scripts/mtg_scryfall_import/import_command.py` | Bulk creates products/variants via direct ORM |
| Finish Variants | `scripts/mtg_finish_variants/create_finish_variants.py` | Creates NM/LP/MP/HP/DMG × NF/F/E variants |
| Price Tracking | `scripts/mtg_price_sync/bulk_price_sync.py` | Records market prices to `SellPriceSnapshot` (not Saleor) |
| Inventory Ops App | `saleor-apps/apps/inventory-ops/` | WAC, COGS, Purchase Orders in separate Prisma DB |
| Buylist App | `saleor-apps/apps/buylist/` | Customer card buybacks with pricing rules engine |
| Saleor MCP | `saleor-mcp/` | AI assistant integration with Saleor GraphQL |
| Meilisearch Sync | `scripts/sync-meilisearch.py` | Custom search indexing |

### SKU Structure
```
{scryfall-uuid}-{condition}-{finish}
Example: 550e8400-e29b-41d4-a716-446655440000-NM-F
```

### Current Custom Implementations (bypassing Saleor native features)
1. Direct Django ORM for bulk import (not using `productBulkCreate` GraphQL)
2. Custom Meilisearch instead of Saleor's Elasticsearch
3. Separate Prisma database for cost tracking (not Saleor metadata)
4. Custom pricing scripts (not Saleor webhooks)
5. Manual 15-variant explosion per product

### Scale

- 106,872 products (cards)
- ~1.6M variants (15 per product)
- Growing to 500k+ products with new sets

---

## Price Sync Clarification (Post-Analysis Finding)

**Important architectural note discovered during analysis:**

### Current State

The condition price multipliers (`NM: 1.0, LP: 0.9, MP: 0.75, HP: 0.5, DMG: 0.25`) are used in two places:

| Script | Writes To | Updates Storefront? |
|--------|-----------|---------------------|
| `import_command.py` | Saleor `ProductVariantChannelListing` | **Yes** (initial import only) |
| `create_finish_variants.py` | Saleor `ProductVariantChannelListing` | Sets **$0.00** placeholder |
| `bulk_price_sync.py` | inventory-ops `SellPriceSnapshot` | **No** |
| `/api/cron/price-sync` | inventory-ops `SellPriceSnapshot` | **No** |

### What This Means

1. **Initial import prices** are set correctly with condition multipliers
2. **Foil/Etched variants** created later have $0.00 prices until manually updated
3. **Price tracking** captures market changes in `SellPriceSnapshot` but does NOT push to Saleor
4. **Storefront displays** initial import prices indefinitely

### Intentional Architecture Decision

**Price sync to Saleor is intentionally deferred as a separate system.** Reasons:

1. **Complexity** - Pushing 1.6M variant prices requires careful batching, rate limiting, and error handling
2. **Business logic** - Price sync rules (markup, rounding, minimum margins) need business input
3. **Multi-source** - Future system should support TCGPlayer, Cardmarket, and manual overrides
4. **Optimization** - Can be built with proper delta detection and webhook-driven updates

### Future Work (Out of Scope for Inventory Generation)

A dedicated price-sync system should:

- Pull from `SellPriceSnapshot` (market prices)
- Apply business rules (markup, floor prices, competitor matching)
- Push to Saleor via `productVariantChannelListingUpdate` mutation
- Support manual price overrides and locks
- Emit webhooks for Meilisearch index updates

This is tracked separately from the inventory generation pipeline.

---

## Round 1: Initial Positions

### Saleor Platform Expert

From a Saleor-native perspective, several features are being underutilized that could reduce complexity:

**Underutilized Native Features:**
- **Metadata storage** - Saleor's metadata fields on Product/ProductVariant could store condition, finish, and cost data instead of a separate Prisma database. This keeps data co-located and queryable via GraphQL.
- **Webhooks** - `PRODUCT_VARIANT_CREATED` and `PRODUCT_VARIANT_UPDATED` could trigger price sync instead of manual scripts.
- **Bulk mutations** - `productVariantBulkCreate` handles up to 250 variants per call with proper validation and event emission.

**Where Custom Implementation Is Justified:**
- Meilisearch over Elasticsearch is defensible for MTG-specific faceting. Saleor's Elasticsearch lacks domain-specific tuning.
- The 15-variant explosion pattern is business logic Saleor cannot natively model.

**ORM Bypass Risks:**
Direct ORM access skips webhook emission, permission checks, and channel validation. The `discounted_price_amount` NULL issue is a direct consequence of bypassing GraphQL's validation layer.

**Concern:** The Prisma cost-tracking database creates data fragmentation. Saleor's private metadata with structured JSON could consolidate this.

---

### Secondary Market Specialist

The data model has solid foundations but I see gaps that will create operational friction.

**Condition Multipliers Need Refinement**: Your multipliers are too static. In practice, condition discounts vary by card value tier. A $500 dual land at LP often sells for 92-95% of NM, not 90%. I'd recommend tiered multiplier brackets based on base price.

**Critical Missing Attributes**:
- `legalities` - Essential for filtering (Commander legal? Modern legal?)
- `edhrec_rank` - Commander is 50%+ of secondary market demand
- `penny_rank` - Useful for budget deck filters
- `tcgplayer_product_id` vs `tcgplayer_id` (group vs product distinction)

**Pricing Source Concern**: You're missing `usd_foil` vs `usd` distinction in pricing logic. Foil multipliers range from 1.2x to 50x depending on age, rarity, and Commander demand.

**Buylist Integration**: Your SKU format works for sales but buylist needs to track acquisition cost per SKU for proper COGS. Is that captured?

---

### Data Pipeline Architect

From a data pipeline perspective, I see several structural concerns:

**Idempotency is fragile.** The sequential pipeline lacks clear checkpoint/recovery mechanisms. If `create_finish_variants.py` fails at 800k variants, can we resume or must we start over?

**Change detection is absent.** When Scryfall releases new sets or issues errata, how do we detect deltas? We need hash-based change detection or Scryfall's `updated_at` filtering.

**The dual-database architecture concerns me.** Saleor PostgreSQL holds canonical product data; Prisma holds WAC/COGS. Cross-database joins are impossible, making inventory valuation reports fragile.

**Missing critical safeguards:**
- No transactional boundaries around variant generation
- No dead-letter queue for failed price syncs
- No data validation layer between Scryfall JSON and database writes

**Question:** What happens when variant counts mismatch between Saleor and Meilisearch after a partial sync failure?

---

### Search & Performance Engineer

I see solid foundational decisions but significant gaps for MTG-specific search patterns.

**Why Meilisearch makes sense**: Typo tolerance for unusual spellings (Juzám Djinn, Æther Vial). Simpler operational model than Elasticsearch clusters.

**Index schema gaps**:
- **No `mana_value` (CMC)** - "show me all 3-drops" is fundamental
- **No `color_identity`** - Commander players need this
- **Missing `keywords`** - Flying, Trample should be filterable
- **No `legalities`** - "Standard-legal cards under $5" is common

**Performance at 1.6M variants**: Verify index rebuild time, memory footprint, and P95 query latency on complex filters.

**Missing feature**: Mana cost search syntax. Searching "{2}{U}{U}" needs preprocessing to tokenize mana symbols.

---

## Round 2: Responses & Challenges

### Saleor Platform Expert

**Addressing dual-database concern**: This is the most critical issue. Saleor's product model wasn't designed for MTG's variant complexity. The Prisma layer exists because Saleor's `ProductVariant` lacks native WAC/COGS fields. However, I challenge the "impossible joins" framing - the architecture uses Saleor IDs as foreign keys in Prisma, enabling application-level joins via GraphQL federation patterns.

**To Secondary Market Specialist**: Saleor's `ProductVariantChannelListing` already supports per-channel pricing, so tiered condition multipliers are implementable without schema changes. The buylist cost tracking gap is real - Saleor's `CostPrice` field lacks history.

**To Search Engineer**: Agreed on missing filterable attributes. The sync pipeline must explicitly map these to Meilisearch documents.

---

### Secondary Market Specialist

**Challenging metadata suggestion**: Saleor metadata is unsuitable for condition/finish tracking. Secondary market requires variant-level pricing across 8+ conditions × 2-4 finishes. That's 32 price points per card. Metadata lacks query performance for buylist calculations comparing offers against all conditions simultaneously.

**Supporting Data Pipeline Architect**: The fragmentation concern is understated. WAC calculations require transactional integrity across POs, goods receipts, and adjustments. Split databases make COGS reporting unreliable.

**Nuancing Search Engineer**: Legalities matter less than condition availability. Customers search "NM foil" more than "Modern legal." Prioritize `conditions_available` and `finishes_available` over format legality.

---

### Data Pipeline Architect

**To Saleor Expert on metadata**: Replacing Prisma with metadata trades schema validation for flexibility. You lose typed queries, migrations, and referential integrity. Prisma provides audit trails for WAC calculations that key-value pairs can't enforce.

**To Secondary Market on tiered multipliers**: Per-value-tier condition matrices explode configuration space. A $0.25 card doesn't justify five condition tiers. Suggest: two tiers only—"bulk" (<$2) and "singles."

**To Search Engineer on rebuild time**: Current architecture lacks incremental indexing—every price sync triggers full document replacement. We need document-level change detection, not batch rebuilds.

**Unaddressed trade-off**: Everyone assumes real-time sync. Batch processing with eventual consistency reduces API pressure significantly.

---

### Search & Performance Engineer

**To Data Pipeline Architect**: Without checkpointing, a failed sync could leave Meilisearch with 50k documents while Saleor has 100k - no reconciliation mechanism exists. We need `last_indexed_at` timestamp per document for delta sync.

**To Secondary Market Specialist**: Adding `edhrec_rank` and `penny_rank` is valuable, but every filterable field increases index size. I'd challenge whether `legalities` needs indexing versus being display-only fetched post-search.

**To Saleor Expert**: Metadata-based storage concerns me for search. Meilisearch can't efficiently filter nested structures. If prices move to metadata, we'd need to flatten during indexing anyway.

**Critical gap**: No search relevance tuning exists. `name` and `set_name` have equal weight currently.

---

## Round 3: Synthesis

### Saleor Platform Expert

**Agreement**: Metadata unsuitable for 32+ price points. Meilisearch justified. Batch processing correct. `conditions_available` over legalities in search.

**Disagreement**: I maintain Prisma creating a parallel database is problematic long-term. Split state between Django ORM and Prisma will cause reconciliation bugs during returns, adjustments, and audits.

**Recommendation**: Replace direct Prisma writes with webhook-triggered inventory operations. Use `privateMetadata` only for low-cardinality flags. Keep pricing in dedicated tables. Add audit trails via Saleor's `OrderEvent` pattern.

---

### Secondary Market Specialist

**Agreement**: Two-tier multiplier model (bulk/singles at $2) is pragmatically sufficient. Per-channel pricing supports tiered strategies. `conditions_available` more critical than legalities. Saleor CostPrice lacks history for WAC/COGS.

**Disagreement**: Foil pricing gaps are underappreciated. LP foil loses proportionally more value than LP non-foil. This needs near-term enhancement.

**Recommendation**: Ship current implementation with two-tier multipliers. Prioritize: (1) foil-specific condition curves, (2) cost history in inventory-ops, (3) legalities as display-only. Foundation is sound; refinements are incremental.

---

### Data Pipeline Architect

**Agreement**: System lacks change detection and reconciliation. COGS/WAC needs transactional guarantees. Meilisearch needs `last_indexed_at` for delta sync.

**Disagreement**: GraphQL federation is operationally fragile for transactional inventory costing. Sub-second WAC lookups during checkout shouldn't have network hops to separate database.

**Recommendation**: (1) Immediate: Add `last_modified_at` triggers and reconciliation counts. (2) Short-term: Implement `last_indexed_at` for delta sync. (3) Medium-term: Evaluate consolidating COGS into Saleor metadata. Dual-database needs explicit sync contracts.

---

### Search & Performance Engineer

**Agreement**: Meilisearch justified. `conditions_available` critical. Sync pipeline needs explicit attribute mapping. Batch processing is right choice.

**Disagreement**: Mana cost preprocessing should be higher priority. Searches like "3-drop red creatures" require expensive runtime parsing without it.

**Recommendation**: (1) Immediate: Add `conditions_available`, `finishes_available` to filterable. (2) Before launch: Document-level change detection. (3) Phase 2: Preprocessed mana cost fields. Focus optimization on attribute mapping layer.

---

## Council Synthesis

### Areas of Convergence (4/4 Agents Agree)

| Topic | Consensus |
|-------|-----------|
| **Meilisearch** | Justified over Saleor Elasticsearch for MTG-specific needs |
| **Metadata storage** | Unsuitable for high-cardinality pricing (32+ variants) |
| **Batch processing** | Correct over real-time for price sync |
| **conditions_available** | Higher priority filter than legalities |
| **Delta sync** | `last_indexed_at` needed for incremental updates |
| **Two-tier multipliers** | Bulk (<$2) vs Singles sufficient for now |

### Remaining Disagreements

| Topic | Tension |
|-------|---------|
| **Dual-database** | Platform Expert: fragmentation risk vs Pipeline Architect: transactional needs justify it |
| **Foil condition curves** | Market Specialist: critical gap vs Others: Phase 2 |
| **Mana cost preprocessing** | Search Engineer: high priority vs Others: defer |
| **GraphQL federation** | Platform Expert: enables joins vs Pipeline Architect: operationally fragile |

---

## Saleor Platform Utilization Scorecard

| Feature Category | Current Use | Rating | Opportunity |
|-----------------|-------------|--------|-------------|
| **Product Types & Attributes** | 22+ attributes defined | 8/10 | Add legalities, edhrec_rank |
| **Bulk Mutations** | Not used (direct ORM) | 3/10 | Migrate to `productVariantBulkCreate` |
| **Webhooks** | ORDER_FULFILLED, STOCK_UPDATED | 6/10 | Add VARIANT_CREATED for sync |
| **Channel Pricing** | Per-channel listings | 9/10 | Well utilized |
| **Metadata** | Minimal use | 4/10 | Use for sync status, not pricing |
| **Search (Elasticsearch)** | Replaced by Meilisearch | N/A | Justified replacement |
| **Cost Tracking** | External Prisma DB | 5/10 | Consider privateMetadata for simple cases |

**Overall Saleor Utilization: 6/10** - Solid foundation with clear optimization opportunities.

---

## Top 5 Architectural Recommendations

### 1. Add Delta Sync Infrastructure (HIGH PRIORITY)
- Implement `last_indexed_at` on variants
- Add `last_modified_at` triggers for change detection
- Reconciliation job to detect Saleor/Meilisearch count mismatches

### 2. Migrate to Saleor Bulk Mutations (MEDIUM PRIORITY)
- Replace direct ORM with `productVariantBulkCreate` (250/call)
- Ensures webhook emission for downstream sync
- Prevents validation bypass (fixes `discounted_price_amount` NULL issues)

### 3. Enhance Meilisearch Index Schema (HIGH PRIORITY)
```
Add filterable: conditions_available, finishes_available, mana_value, color_identity
Add searchable: keywords (preprocessed)
Add relevance boost: name > oracle_text > set_name
```

### 4. Implement Two-Tier Condition Multipliers (LOW PRIORITY)
```python
CONDITION_MULTIPLIERS = {
    "bulk": {"NM": 1.0, "LP": 0.85, "MP": 0.6, "HP": 0.3, "DMG": 0.1},  # <$2
    "singles": {"NM": 1.0, "LP": 0.92, "MP": 0.8, "HP": 0.55, "DMG": 0.3}  # >=$2
}
```

### 5. Define Explicit Sync Contracts (MEDIUM PRIORITY)
- Document write paths: Saleor → webhook → inventory-ops
- Add dead-letter queue for failed syncs
- Implement reconciliation audit reports

---

## Data Source Optimization

| Source | Current Use | Recommendation |
|--------|-------------|----------------|
| **Scryfall** | Primary catalog + USD pricing | Add `legalities`, `keywords`, `edhrec_rank` to import |
| **TCGPlayer** | SKU mapping only | Consider as pricing fallback for cards Scryfall lacks |
| **Cardmarket** | Not integrated | Add for EU channel if multi-region |
| **MTGJSON** | Sealed products only | Use for sealed-to-singles linking |

---

## Gap Analysis: Missing Capabilities

### High Priority
| Gap | Impact | Effort |
|-----|--------|--------|
| Delta sync for Meilisearch | Full reindex on every price update | Medium |
| `conditions_available` filter | Users can't filter by in-stock conditions | Low |
| Reconciliation mechanism | Silent data drift between systems | Medium |

### Medium Priority
| Gap | Impact | Effort |
|-----|--------|--------|
| Bulk mutation migration | Webhook blind spots, validation bypass | High |
| `mana_value` / `color_identity` filters | Poor deckbuilding search UX | Low |
| Foil-specific condition curves | Inaccurate foil pricing | Medium |

### Low Priority
| Gap | Impact | Effort |
|-----|--------|--------|
| `legalities` indexing | Format filtering unavailable | Low |
| Mana cost syntax search | Advanced search limited | High |
| Multi-source pricing (TCGPlayer fallback) | Some cards lack prices | Medium |

---

## Best Practices Alignment

| Practice | Status | Notes |
|----------|--------|-------|
| Idempotent imports | ❌ Missing | No checkpoint/resume mechanism |
| Change detection | ❌ Missing | Full replace model only |
| Transactional boundaries | ⚠️ Partial | Prisma has them, ORM scripts don't |
| Dead-letter queues | ❌ Missing | Failed syncs silently dropped |
| Audit trails | ✅ Present | CostLayerEvent is append-only |
| Webhook-driven sync | ⚠️ Partial | ORDER_FULFILLED works, variant sync manual |
| Search relevance tuning | ❌ Missing | All fields equal weight |
| Multi-channel support | ✅ Present | Per-channel pricing implemented |

---

## Conclusion

The MTG inventory generation system demonstrates **strong domain modeling** for secondary market card sales. The decision to use Meilisearch, maintain separate cost tracking, and implement condition×finish variant explosion are all **justified** given MTG's unique requirements.

The primary improvements needed are **operational robustness** (delta sync, reconciliation, checkpointing) rather than architectural changes. The 6/10 Saleor utilization score reflects intentional divergence from Saleor patterns where MTG requirements demanded it, not neglect.

**Next Steps:**
1. Implement `last_indexed_at` delta sync for Meilisearch
2. Add `conditions_available` and `finishes_available` to search filters
3. Create reconciliation job for Saleor/Meilisearch consistency
4. Document sync contracts between Saleor and inventory-ops

---

*Generated by PAI Council Debate - 4 agents, 3 rounds*
