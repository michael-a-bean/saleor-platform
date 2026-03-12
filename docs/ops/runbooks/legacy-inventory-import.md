# Legacy Inventory Import: Shuffle & Cut → Saleor

Import existing inventory from Shuffle & Cut (S&C) legacy POS system into Saleor via the Collection Import feature in inventory-ops.

## Overview

```
S&C MySQL DB
    │
    ▼
┌──────────────────────────┐
│ legacy-inventory-extract │  SQL query via phpMyAdmin
│         .sql             │  → export as CSV
└──────────┬───────────────┘
           │  raw CSV (latin-1 encoded)
           ▼
┌──────────────────────────┐
│ legacy-inventory-        │  Python script (no deps)
│   transform.py           │  Maps set codes, conditions, foil
│                          │  Optional: --enrich with Scryfall
└──────────┬───────────────┘
           │  3 CSVs (one per warehouse)
           ▼
┌──────────────────────────┐
│ inventory-ops            │  Upload CSV via Dashboard
│ Collection Import        │  → match → review → post
└──────────────────────────┘
```

## Prerequisites

- Access to S&C MySQL database (`sncadmin_sacdata`) via phpMyAdmin or CLI
- Python 3.10+ (standard library only — no pip install needed)
- Saleor Dashboard access with inventory-ops app installed
- Warehouses created in Saleor matching your S&C locations

## Step 1: Extract from Shuffle & Cut

Run the SQL query in `scripts/legacy-inventory-extract.sql` against the S&C database.

**Via phpMyAdmin:**
1. Open phpMyAdmin → select `sncadmin_sacdata`
2. Go to SQL tab → paste contents of `scripts/legacy-inventory-extract.sql`
3. Execute → Export → CSV (with headers)
4. Save as `snc-export.csv`

**Via MySQL CLI:**
```bash
mysql -u root -p sncadmin_sacdata < scripts/legacy-inventory-extract.sql \
  | sed 's/\t/,/g' > snc-export.csv
```

### What the query does

Joins `card_prices → cards → card_edition → card_condition` to produce one row per card × condition × foil combination with stock counts per warehouse.

| Column | Source | Purpose |
|--------|--------|---------|
| `card_name` | `cards.name` | Card display name |
| `set_code` | `card_edition.edition_nick` | S&C internal set code (e.g., `EVT`, `!BLB`) |
| `collector_number` | `cards.cnumber` | Only ~14% populated |
| `bbid` | `cards.bbid` | BrainBurst ID = TCGPlayer product ID |
| `condition_nick` | `card_condition.condition_nick` | NM, LP, HP, etc. |
| `foil` | `card_prices.foil` | 0 or 1 |
| `stock` | `card_prices.stock` | Main warehouse qty |
| `stock_frank` | `card_prices.stock_frank` | Frank warehouse qty |
| `stock_rc` | `card_prices.stock_rc` | RC warehouse qty |
| `buy_price` | `card_prices.price_buy` | Last buy price (unit cost) |
| `card_id` | `cards.id` | S&C internal PK |

**Filter:** Only MTG cards (`game = 1`) with stock > 0 in any warehouse.

## Step 2: Transform to Saleor Format

```bash
python3 scripts/legacy-inventory-transform.py snc-export.csv output/ --enrich
```

### What it does

1. **Maps set codes** — S&C uses non-standard codes. The script handles:
   - Direct renames: `EVT` → `eve` (Eventide), `NMS` → `nem` (Nemesis)
   - Masterpiece series: `MPSKLD` → `mps` (Kaladesh Inventions)
   - Promo sets: `PRMJDG` → `pjgp` (Judge Promos)
   - Collector suffixes: `MH1CE` → `mh1` (foil etched → same set)
   - Presale prefix: `!BLB` → `blb` (strip `!`)
   - Box toppers: `LTCB` → `ltc`

2. **Maps foil** — `0`/`1` → `No`/`Yes`

3. **Maps condition** — Passes through (NM, LP, HP — same codes)

4. **Splits by warehouse** — Creates 3 CSVs: `stock_main.csv`, `stock_frank.csv`, `stock_rc.csv`

5. **Scryfall enrichment** (`--enrich` flag) — Downloads ~80 MB Scryfall bulk data (cached 7 days) and fills in missing `collector_number` and `tcgplayer_id` fields. This dramatically improves match rates in Collection Import.

### Output CSV format

Each output CSV has these columns, matching the Collection Import expected format:

| Column | Example | Notes |
|--------|---------|-------|
| `card_name` | `Lightning Bolt` | Display name from S&C |
| `set_code` | `m11` | Scryfall set code (lowercase) |
| `collector_number` | `153` | Filled by enrichment if missing |
| `tcgplayer_id` | `35868` | From S&C `bbid` or enrichment |
| `condition` | `NM` | NM, LP, MP, HP, DMG |
| `foil` | `No` | Yes or No |
| `quantity` | `4` | Stock count |
| `unit_cost` | `0.15` | Last buy price from S&C |

### Enrichment stats

The script prints coverage stats after running:
```
── Matching identifier coverage ──
With TCGPlayer ID:    45,231 (78.3%)
With collector #:     52,108 (90.2%)
With either (Tier 3/4): 53,890 (93.3%)

── Enrichment results ──
Collector # filled:   43,210
TCGPlayer ID filled:  12,345
No Scryfall match:    3,891
```

Cards without either identifier will fall back to name+set matching (Tier 1/2) in Collection Import, which is less reliable.

### Options

| Flag | Purpose |
|------|---------|
| `--enrich` | Download Scryfall data to fill missing identifiers (recommended) |
| `--cache-dir DIR` | Where to cache the ~80 MB Scryfall download (default: output dir) |

### Unmapped sets

The script reports any S&C set codes it can't map. These are typically:
- Promo sets with no clear Scryfall equivalent (`PRMOTH`, `PRMAPC`)
- Very old or obscure sets
- The `OLD` placeholder set

Cards in unmapped sets are skipped. Review the list and add mappings to the `RENAMES`/`PROMOS`/`SPECIAL` dicts if needed.

## Step 3: Upload via Collection Import

1. Open Saleor Dashboard → inventory-ops app → Collection Imports → New Import
2. Select the target **warehouse** (Main, Frank, or RC)
3. Select **costing method**:
   - `SPREAD_TOTAL` — Enter total lot cost, spread evenly across items
   - `PER_LINE` — Use the `unit_cost` from the CSV (the S&C buy price)
4. Upload the corresponding `stock_*.csv` file
5. Click **Create**

### Review matches

Collection Import uses a tiered matching system:

| Tier | Match Method | Confidence |
|------|-------------|------------|
| 1 | `card_name` + `set_code` (exact) | Medium |
| 2 | `card_name` + `set_code` (fuzzy via Meilisearch) | Lower |
| 3 | `tcgplayer_id` (exact) | High |
| 4 | `collector_number` + `set_code` (exact) | High |

The `--enrich` flag improves Tier 3/4 coverage from ~14% to ~93%.

After matching:
- Review the match results on the import detail page
- Unmatched lines can be manually resolved or skipped
- Click **Post Import** to create stock entries and cost layer events

### Post-import verification

After posting, verify in the Dashboard:
- Products → filter by warehouse → confirm stock quantities
- inventory-ops → Reports → check cost layer events were created
- Storefront → confirm products with stock show as available

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `UnicodeDecodeError` | S&C exports in latin-1, not UTF-8 | Script handles this (opens with `encoding="latin1"`) |
| Many unmapped sets | New/promo sets not in mapping tables | Add to `RENAMES`/`PROMOS`/`SPECIAL` in transform script |
| Low match rate | Missing collector numbers and TCGPlayer IDs | Use `--enrich` flag |
| Overflow skipped | Stock value > 100,000 (uint32 protection) | Review source data for corrupt values |
| Cancel/Post/Reverse buttons don't work | Browser dialogs blocked in Dashboard iframe | Fixed in PR #61 — uses modal dialogs now |

## File Locations

| File | Purpose |
|------|---------|
| `scripts/legacy-inventory-extract.sql` | S&C MySQL extraction query |
| `scripts/legacy-inventory-transform.py` | CSV transformation + Scryfall enrichment |
| `saleor-apps/apps/inventory-ops/` | Collection Import feature (upload + match + post) |
