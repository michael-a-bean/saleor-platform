# Scryfall Attribute Sync Status

## Overview

Syncing Scryfall card attributes (oracle text, flavor text, keywords, etc.) to Saleor products.

## Current State (2026-01-03)

### What Was Done

1. **Created missing attributes in Saleor**:
   - mtg-oracle-text (RICH_TEXT)
   - mtg-flavor-text (RICH_TEXT)
   - mtg-keywords (PLAIN_TEXT)
   - mtg-colors (PLAIN_TEXT)
   - mtg-legalities (RICH_TEXT)
   - mtg-multiverse-ids (PLAIN_TEXT)
   - Plus 20+ other MTG attributes

2. **Assigned all 48 attributes to MTG Card product type**

3. **Created sync scripts**:
   - `scripts/sync-scryfall-attributes.py` - Individual API calls (slower, token expiry issues)
   - `scripts/bulk-sync-scryfall.py` - Bulk data download (faster, handles 48k+ products)

4. **Updated storefront components**:
   - `storefront/src/graphql/ProductDetails.graphql` - Fetches richText, plainText, inputType
   - `storefront/src/ui/components/MTGCardAttributes.tsx` - Parses EditorJS rich text format

5. **Test sync completed**: 100 products successfully updated

### Pending Work

- **Full bulk import**: 48,100 products with Scryfall IDs need attribute sync
- A background process was started (PID 42055) but user requested pause before checking progress

## Cached Data

Scryfall bulk data is already cached (521MB, valid for 24 hours from download):
```
/tmp/scryfall-cache/default_cards.json
```

This means the next sync run will skip the ~180MB download and start processing immediately.

## How to Resume

### Option 1: Run Bulk Import (Recommended)

```bash
# Run in foreground to monitor:
python3 scripts/bulk-sync-scryfall.py

# Or run in background:
nohup python3 scripts/bulk-sync-scryfall.py > /tmp/scryfall-sync.log 2>&1 &
tail -f /tmp/scryfall-sync.log
```

### Option 2: Run with Limit First

```bash
# Test with 500 products first
python3 scripts/bulk-sync-scryfall.py --limit 500

# Then run full import
python3 scripts/bulk-sync-scryfall.py
```

## Script Details

### bulk-sync-scryfall.py

- Downloads Scryfall bulk data (~180MB, 111k cards)
- Caches at `/tmp/scryfall-cache/default_cards.json` for 24 hours
- Auto-refreshes auth token every 4 minutes (token lifetime is 5 min)
- Batch updates products (default batch size: 50)

**Arguments**:
- `--dry-run`: Preview without making changes
- `--batch-size N`: Products per batch (default: 50)
- `--limit N`: Process only N products (0 = all)

### Attributes Being Synced

| Attribute | Input Type | Scryfall Field |
|-----------|------------|----------------|
| mtg-oracle-text | RICH_TEXT | oracle_text |
| mtg-flavor-text | RICH_TEXT | flavor_text |
| mtg-keywords | PLAIN_TEXT | keywords |
| mtg-colors | PLAIN_TEXT | colors |
| mtg-legalities | RICH_TEXT | legalities |
| mtg-layout | DROPDOWN | layout |
| mtg-frame | DROPDOWN | frame |
| mtg-border-color | DROPDOWN | border_color |
| mtg-set-type | DROPDOWN | set_type |
| mtg-released-at | DATE | released_at |
| mtg-lang | DROPDOWN | lang |
| mtg-is-foil | BOOLEAN | foil |
| mtg-is-nonfoil | BOOLEAN | nonfoil |
| mtg-is-oversized | BOOLEAN | oversized |
| mtg-is-textless | BOOLEAN | textless |
| mtg-is-variation | BOOLEAN | variation |
| mtg-is-story-spotlight | BOOLEAN | story_spotlight |
| mtg-in-booster | BOOLEAN | booster |
| mtg-illustration-id | PLAIN_TEXT | illustration_id |
| mtg-multiverse-ids | PLAIN_TEXT | multiverse_ids |
| mtg-edhrec-rank | NUMERIC | edhrec_rank |
| mtg-penny-rank | NUMERIC | penny_rank |
| mtg-image-uri | PLAIN_TEXT | image_uris.normal |
| mtg-art-crop-uri | PLAIN_TEXT | image_uris.art_crop |

## Technical Notes

### Saleor Attribute Input Types

Different input types require different GraphQL input fields:

| Input Type | GraphQL Field | Format |
|------------|---------------|--------|
| RICH_TEXT | `richText` | EditorJS JSON string |
| PLAIN_TEXT | `plainText` | String |
| BOOLEAN | `boolean` | Boolean |
| NUMERIC | `numeric` | String (number as string) |
| DATE | `date` | String (YYYY-MM-DD) |
| DROPDOWN | `values` | [String] |
| MULTISELECT | `values` | [String] |

### EditorJS Rich Text Format

```json
{
  "time": 0,
  "blocks": [
    {"type": "paragraph", "data": {"text": "Card text here"}}
  ],
  "version": "2.22.2"
}
```

### Token Handling

Saleor access tokens expire after 5 minutes. The bulk script refreshes tokens every 4 minutes to prevent expiry during long imports.
