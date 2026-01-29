# MTG Catalog Representation Plan

**Status: COMPLETED** - Migration executed 2026-01-07

## Migration Results

| Metric | Value |
|--------|-------|
| **Total Variants** | 736,815 |
| Non-Foil Variants | 429,320 |
| Foil Variants | 301,770 |
| Etched Variants | 5,725 |
| Products Processed | 97,588 |
| New Variants Created | 248,875 |
| Errors | 0 |

### SKU Format
- Non-Foil: `{scryfall-uuid}-{condition}-NF`
- Foil: `{scryfall-uuid}-{condition}-F`
- Etched: `{scryfall-uuid}-{condition}-E`

### Known Issue
TCGPlayer SKU mapping (Step 4) showed 0 mappings because MTGJSON uses its own internal UUIDs, not Scryfall UUIDs. Future enhancement needed to cross-reference by card name + set.

## Quick Resume (if re-running needed)

```bash
# 1. Dry run to verify everything works
cd /home/michael/saleor-platform
./scripts/mtg_finish_variants/run_migration.sh --dry-run

# 2. Run the full migration (2-4 hours)
./scripts/mtg_finish_variants/run_migration.sh

# 3. If interrupted, resume from specific step
./scripts/mtg_finish_variants/run_migration.sh --step 3  # Resumes at step 3
```

### Files Created This Session

| File | Purpose |
|------|---------|
| `scripts/mtg_finish_variants/create_finish_attribute.py` | Creates mtg-finish attribute |
| `scripts/mtg_finish_variants/migrate_existing_variants.py` | Tags existing variants as Non-Foil |
| `scripts/mtg_finish_variants/create_finish_variants.py` | Creates Foil/Etched variants |
| `scripts/mtg_finish_variants/sync_tcgplayer_skus.py` | Syncs TCGPlayer SKU mappings |
| `scripts/mtg_finish_variants/run_migration.sh` | Orchestration script |
| `scripts/mtg_price_sync/bulk_price_sync.py` | Bulk price sync from Scryfall |
| `scripts/mtg_price_sync/run_bulk_sync.sh` | Price sync runner script |
| `docs/data/TcgplayerSkus.json` | MTGJSON SKU data (584MB) |
| `storefront/src/lib/filters/mtgConstants.ts` | Updated with finish/condition filters |

---

## Executive Summary

This plan outlines how to accurately represent Magic: The Gathering cards in Saleor with proper foil/finish variant support and TCGPlayer ID mapping for price synchronization.

## Problem Statement

Current state:
- ~107k MTG cards imported from Scryfall bulk data
- Foil/non-foil stored as **boolean product attributes** (not separate variants)
- TCGPlayer IDs stored as product-level attributes (not variant-specific)
- Condition variants (NM/LP/MP/HP/DMG) already implemented per card
- No link between TCGPlayer SKU IDs and Saleor variant SKUs

Required state:
- Cards with foil availability have separate foil/non-foil variants
- Each variant maps to a specific TCGPlayer product ID AND SKU ID
- Price sync can update variant-specific prices from TCGPlayer/Scryfall

---

## Data Source Analysis

### Scryfall API (Primary Card Data)

**Foil/Finish Fields:**
```json
{
  "finishes": ["nonfoil", "foil"],     // Array of available finishes
  "foil": true,                         // Boolean: has foil printing
  "nonfoil": true,                      // Boolean: has non-foil printing
  "tcgplayer_id": 12345,               // TCGPlayer product ID (standard)
  "tcgplayer_etched_id": 67890,        // TCGPlayer product ID (etched only)
  "prices": {
    "usd": "1.50",
    "usd_foil": "5.00",
    "usd_etched": "3.00"
  }
}
```

**Key Observations:**
- `finishes` array can contain: `"nonfoil"`, `"foil"`, `"etched"`, `"glossy"`
- Most cards have both foil and non-foil; some are foil-only or non-foil-only
- Etched foils (Collector Boosters) have separate `tcgplayer_etched_id`
- Bulk data updated every 12 hours; prices should not be trusted for transactions

### MTGJSON (Comprehensive Card Database)

**Identifiers Model:**
```json
{
  "tcgplayerProductId": "12345",
  "tcgplayerEtchedProductId": "67890",
  "scryfallId": "uuid-here",
  "cardKingdomId": "111",
  "cardKingdomFoilId": "222"
}
```

**TCGPlayer SKUs Model** (TcgplayerSkus.json):
```json
{
  "uuid-of-card": [
    {
      "skuId": "1234567",
      "productId": "12345",
      "condition": "Near Mint",
      "printing": "Normal",
      "finish": "Non-Foil",
      "language": "English"
    },
    {
      "skuId": "1234568",
      "productId": "12345",
      "condition": "Lightly Played",
      "printing": "Normal",
      "finish": "Foil",
      "language": "English"
    }
  ]
}
```

**Key Insight:** MTGJSON's `TcgplayerSkus.json` provides the exact mapping between:
- Card UUID (links to Scryfall ID)
- TCGPlayer Product ID
- TCGPlayer SKU ID (unique per condition + finish + language combination)

### TCGPlayer API (Pricing & Inventory)

**Pricing is per SKU:**
- Market prices vary by condition and finish
- Need SKU ID to get accurate pricing
- Rate limits apply; use bulk endpoints where possible

---

## Proposed Variant Structure

### Current Condition Variants (Keep As-Is)
```
Product: Lightning Bolt (ONE-123)
├── Variant: Lightning Bolt - Near Mint       (SKU: uuid-NM)
├── Variant: Lightning Bolt - Lightly Played  (SKU: uuid-LP)
├── Variant: Lightning Bolt - Moderately Played (SKU: uuid-MP)
├── Variant: Lightning Bolt - Heavily Played  (SKU: uuid-HP)
└── Variant: Lightning Bolt - Damaged         (SKU: uuid-DMG)
```

### Proposed: Add Finish Dimension

**Option A: Separate Product per Finish** (Rejected)
- Creates product explosion (2x-3x products)
- Breaks card identity (Lightning Bolt = 1 product conceptually)
- Makes inventory reports confusing

**Option B: Add Finish as Variant Attribute** (Recommended)
```
Product: Lightning Bolt (ONE-123)
├── Variant: LB - NM (Non-Foil)   [SKU: uuid-NM-NF, TCGPlayer SKU: 1234567]
├── Variant: LB - LP (Non-Foil)   [SKU: uuid-LP-NF, TCGPlayer SKU: 1234568]
├── Variant: LB - MP (Non-Foil)   [SKU: uuid-MP-NF, TCGPlayer SKU: 1234569]
├── Variant: LB - HP (Non-Foil)   [SKU: uuid-HP-NF, TCGPlayer SKU: 1234570]
├── Variant: LB - DMG (Non-Foil)  [SKU: uuid-DMG-NF, TCGPlayer SKU: 1234571]
├── Variant: LB - NM (Foil)       [SKU: uuid-NM-F, TCGPlayer SKU: 1234572]
├── Variant: LB - LP (Foil)       [SKU: uuid-LP-F, TCGPlayer SKU: 1234573]
├── Variant: LB - MP (Foil)       [SKU: uuid-MP-F, TCGPlayer SKU: 1234574]
├── Variant: LB - HP (Foil)       [SKU: uuid-HP-F, TCGPlayer SKU: 1234575]
└── Variant: LB - DMG (Foil)      [SKU: uuid-DMG-F, TCGPlayer SKU: 1234576]
```

For cards with etched variants, add:
```
├── Variant: LB - NM (Etched)     [SKU: uuid-NM-E, TCGPlayer SKU: 1234600]
└── ... (all conditions for etched)
```

### Variant Count Impact

| Card Type | Before | After (Finish) | Notes |
|-----------|--------|----------------|-------|
| Non-foil only | 5 | 5 | No change |
| Foil only | 5 | 5 | No change |
| Both finishes | 5 | 10 | 5 per finish |
| With etched | 5 | 15 | 5 per finish × 3 |

Estimate: ~70% of cards have both finishes = ~75k cards × 10 variants = 750k variants
(Current: ~535k variants for 107k cards × 5 conditions)

---

## Attribute Design

### New Variant Attribute: `mtg-finish`

```python
FINISH_VALUES = [
    ("NF", "Non-Foil"),
    ("F", "Foil"),
    ("E", "Etched"),
    ("G", "Glossy"),  # Rare, Jumpstart: Historic Horizons
]
```

**Attribute Properties:**
- Type: `VARIANT` (AttributeVariant with variant_selection=True)
- Input Type: `DROPDOWN`
- Filterable in storefront: Yes
- Visible in storefront: Yes

### New Variant Attribute: `mtg-tcgplayer-sku`

```python
# Store TCGPlayer SKU ID per variant
# Input Type: PLAIN_TEXT
# Not filterable (lookup use only)
```

### Updated Product Attribute: `mtg-tcgplayer-product-id`

Keep as product-level attribute (base product ID), but add:
- `mtg-tcgplayer-etched-product-id` for etched variants (already exists)

---

## SKU Strategy

### Current SKU Format
```
{scryfall-uuid}-{condition}
Example: a1b2c3d4-e5f6-7890-abcd-1234567890ab-NM
```

### Proposed SKU Format
```
{scryfall-uuid}-{condition}-{finish}
Example: a1b2c3d4-e5f6-7890-abcd-1234567890ab-NM-NF
Example: a1b2c3d4-e5f6-7890-abcd-1234567890ab-LP-F
Example: a1b2c3d4-e5f6-7890-abcd-1234567890ab-NM-E (etched)
```

Finish codes:
- `NF` = Non-Foil
- `F` = Foil
- `E` = Etched
- `G` = Glossy

---

## Implementation Phases

### Phase 1: Schema & Attribute Setup

1. **Create finish attribute** (`mtg-finish`):
   - DROPDOWN type, variant-selection enabled
   - Values: Non-Foil, Foil, Etched, Glossy
   - Assign to `mtg-card` product type as variant attribute

2. **Create TCGPlayer SKU attribute** (`mtg-tcgplayer-sku`):
   - PLAIN_TEXT type, variant-level
   - Not filterable (internal use)

3. **Download MTGJSON data**:
   - `TcgplayerSkus.json` (~50MB) - SKU mappings
   - `AllIdentifiers.json` or use existing Scryfall bulk data

### Phase 2: Migrate Existing Variants

**Script: `add_finish_to_existing_variants.py`**

For each existing variant:
1. Parse current SKU: `{uuid}-{condition}`
2. Look up card in Scryfall data for `finishes` array
3. Determine if card is non-foil only, foil only, or both
4. If non-foil only:
   - Update SKU: `{uuid}-{condition}-NF`
   - Assign `mtg-finish` = "Non-Foil"
   - Look up TCGPlayer SKU from MTGJSON mapping
5. If both finishes exist:
   - Update existing variant as non-foil
   - Create new foil variant with foil pricing

**Batch processing:**
- Process in batches of 100-500 products
- Progress tracking with resume capability
- Estimated runtime: 2-4 hours for full catalog

### Phase 3: Create Foil Variants

**Script: `create_finish_variants.py`** (similar to `create_condition_variants.py`)

For products where `finishes` includes both "foil" and "nonfoil":
1. For each existing (non-foil) variant:
   - Create corresponding foil variant
   - SKU: `{uuid}-{condition}-F`
   - Name: `{product_name} - {condition} (Foil)`
   - Price: Use Scryfall `usd_foil` or apply multiplier

2. Look up TCGPlayer SKU IDs from MTGJSON:
   - Match by: productId + condition + finish + language
   - Store in `mtg-tcgplayer-sku` attribute

### Phase 4: TCGPlayer SKU Mapping Table

**Create mapping table** (in inventory-ops Prisma schema):

```prisma
model TcgplayerSkuMapping {
  id             String @id @default(uuid())
  installationId String

  saleorVariantId String @unique

  tcgplayerProductId String
  tcgplayerSkuId     String

  condition String  // "Near Mint", "Lightly Played", etc.
  finish    String  // "Non-Foil", "Foil", "Etched"
  language  String  @default("English")

  lastSyncedAt DateTime?

  @@index([tcgplayerProductId])
  @@index([tcgplayerSkuId])
}
```

### Phase 5: Price Sync Integration

Update `price-sync` module to:

1. **Support finish-aware pricing**:
   - Query TCGPlayer API by SKU for accurate market prices
   - Fall back to Scryfall bulk data for estimates

2. **Bulk sync workflow**:
   ```
   Download Scryfall bulk data →
   Match variants by SKU →
   Extract finish-specific prices (usd, usd_foil, usd_etched) →
   Create PendingPriceUpdate records →
   Apply after approval
   ```

3. **TCGPlayer API integration** (future):
   - Authenticate with client's API key
   - Fetch live market prices by SKU
   - Compare against Scryfall for anomaly detection

### Phase 6: MTGJSON Sync Script

**Script: `sync_mtgjson_skus.py`**

1. Download `TcgplayerSkus.json` from MTGJSON
2. For each card UUID in file:
   - Find matching Saleor product by Scryfall ID attribute
   - For each SKU entry:
     - Map condition to Saleor condition code (NM/LP/MP/HP/DMG)
     - Map finish to Saleor finish code (NF/F/E/G)
     - Find or create variant
     - Store TCGPlayer SKU ID

---

## Data Flow Diagrams

### Initial Import Flow
```
Scryfall Bulk Data
        ↓
[import_mtg_cards.py] → Products + Base Variants (condition only)
        ↓
[create_condition_variants.py] → 5 condition variants per product
        ↓
[add_finish_to_existing_variants.py] → Tag existing as Non-Foil
        ↓
[create_finish_variants.py] → Create Foil variants where applicable
        ↓
[sync_mtgjson_skus.py] → Add TCGPlayer SKU mappings
```

### Price Sync Flow
```
Trigger: Manual or Scheduled Job
        ↓
Download Scryfall all-cards.json
        ↓
For each card in bulk data:
  - Find Saleor product by Scryfall ID
  - For each variant:
    - Match finish (NF/F/E) to price key (usd/usd_foil/usd_etched)
    - Apply condition multiplier (NM=1.0, LP=0.85, etc.)
    - Create PendingPriceUpdate if changed
        ↓
Generate PriceSyncReport
        ↓
Admin reviews anomalies
        ↓
Apply approved prices to SellPriceSnapshot
```

### TCGPlayer Direct Sync Flow (Future)
```
Trigger: Variant lookup or scheduled batch
        ↓
Look up TcgplayerSkuMapping for variant
        ↓
Call TCGPlayer Pricing API with SKU
        ↓
Store market price in PendingPriceUpdate
        ↓
(Same approval flow as Scryfall sync)
```

---

## Files to Create/Modify

### New Scripts
| File | Purpose |
|------|---------|
| `scripts/mtg_finish_variants/create_finish_attribute.py` | Create mtg-finish attribute |
| `scripts/mtg_finish_variants/migrate_existing_variants.py` | Tag existing as Non-Foil |
| `scripts/mtg_finish_variants/create_foil_variants.py` | Create Foil variants |
| `scripts/mtg_finish_variants/sync_mtgjson_skus.py` | Load TCGPlayer SKU mappings |
| `scripts/mtg_finish_variants/run_migration.sh` | Orchestration script |

### Modified Files
| File | Changes |
|------|---------|
| `saleor-apps/apps/inventory-ops/prisma/schema.prisma` | Add TcgplayerSkuMapping model |
| `saleor-apps/apps/inventory-ops/src/modules/price-sync/` | Finish-aware pricing |
| `storefront/src/lib/filters/mtgConstants.ts` | Add finish filter options |

### Data Downloads Required
| File | Source | Size | Purpose |
|------|--------|------|---------|
| `all-cards.json` | Scryfall | 2.3GB | Card data with finishes |
| `TcgplayerSkus.json` | MTGJSON | ~50MB | SKU mappings |

---

## Rollback Strategy

1. **Before migration**: Backup all ProductVariant, AssignedVariantAttribute tables
2. **SKU change reversibility**: Old SKU format can be reconstructed from new format
3. **Variant deletion**: Foil variants can be bulk-deleted if migration fails

---

## Success Criteria

- [ ] Every variant has a `mtg-finish` attribute assigned
- [ ] Foil variants exist for all cards with `foil: true` in Scryfall
- [ ] TCGPlayer SKU IDs stored for majority of variants (>90% coverage)
- [ ] Price sync correctly applies finish-specific prices
- [ ] Storefront can filter by finish type
- [ ] POS/Singles Builder can select variants by finish

---

## Client Decisions (2026-01-06)

| Question | Decision |
|----------|----------|
| Variant count (~750k) | **Approved** - proceed with all foil variants |
| Etched foils | **Include** - create etched variants for applicable cards |
| TCGPlayer API | **Scryfall only** for now, add TCGPlayer integration later |
| Initial foil pricing | **Leave at $0.00** - update via price sync after migration |

---

## Implementation Order

### Step 1: Download Required Data Files
```bash
# Scryfall bulk data (already have)
# MTGJSON TcgplayerSkus.json
curl -O https://mtgjson.com/api/v5/TcgplayerSkus.json.zip
unzip TcgplayerSkus.json.zip
```

### Step 2: Create Finish Attribute
Run `create_finish_attribute.py` to:
- Create `mtg-finish` attribute with values: Non-Foil, Foil, Etched, Glossy
- Assign to `mtg-card` product type as variant-selection attribute

### Step 3: Migrate Existing Variants to Non-Foil
Run `migrate_existing_variants.py` to:
- Update all existing variant SKUs: `{uuid}-{condition}` → `{uuid}-{condition}-NF`
- Assign `mtg-finish` = "Non-Foil" to all existing variants
- Cards that are foil-only get `mtg-finish` = "Foil" instead

### Step 4: Create Foil/Etched Variants
Run `create_finish_variants.py` to:
- For cards with `finishes` including "foil": create 5 foil variants
- For cards with `finishes` including "etched": create 5 etched variants
- Initial price: $0.00 (will update via price sync)

### Step 5: Load TCGPlayer SKU Mappings
Run `sync_mtgjson_skus.py` to:
- Parse TcgplayerSkus.json
- Match each SKU to Saleor variant by condition+finish
- Store `mtg-tcgplayer-sku` attribute on variants

### Step 6: Price Sync Run - COMPLETED

**Status:** Executed 2026-01-07. 674,445 prices created at 7,025 variants/sec.

#### Implementation Summary

The price sync module supports finish-aware pricing:

| Component | Changes |
|-----------|---------|
| Schema (`SellPriceSnapshot`) | Added `variantSku`, `finish`, `condition`, `basePrice` fields |
| Cron job (`price-sync/route.ts`) | SKU parser, finish-aware price selection, condition multipliers |

**Price Selection by Finish:**
- Non-Foil (NF) → `prices.usd`
- Foil (F) → `prices.usd_foil`
- Etched (E) → `prices.usd_etched`

**Condition Multipliers:** NM=1.0, LP=0.9, MP=0.75, HP=0.5, DMG=0.25

#### Running on a New Machine

**Prerequisites:**
- Python 3 with `psycopg2-binary` and `requests` packages
- Docker containers running (api, inventory-ops-db)
- Network access to Scryfall API

**Setup:**

```bash
# Install Python dependencies
pip3 install psycopg2-binary requests

# The script auto-downloads Scryfall data to docs/data/
# (~500MB, refreshed if older than 24 hours)
```

**Execution:**

```bash
# 1. Get installation ID from inventory-ops database
docker compose exec inventory-ops-db psql -U inventory inventory_ops \
  -c 'SELECT id FROM "AppInstallation" LIMIT 1;'

# 2. Dry run (verify setup)
INSTALLATION_ID=<id> ./scripts/mtg_price_sync/run_bulk_sync.sh --dry-run --limit 1000

# 3. Full sync (~2 min for 736k variants)
INSTALLATION_ID=<id> ./scripts/mtg_price_sync/run_bulk_sync.sh

# 4. Resume if interrupted
INSTALLATION_ID=<id> ./scripts/mtg_price_sync/run_bulk_sync.sh --resume
```

**What the sync does:**
1. Downloads Scryfall bulk data (cached in `docs/data/`)
2. Queries Saleor GraphQL for all MTG variants
3. Parses SKU to extract Scryfall ID, condition, finish
4. Matches variants to Scryfall cards by UUID
5. Applies finish-specific prices with condition multipliers
6. Creates `SellPriceSnapshot` records in inventory-ops database
