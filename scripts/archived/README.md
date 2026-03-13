# Archived Scripts

These scripts were archived on 2026-03-13 after a comprehensive audit.
They are one-time migrations, completed setup tasks, or superseded utilities.
Kept here for git history reference — do not run without reviewing first.

## Contents

| Script | Original Purpose | Why Archived |
|--------|-----------------|--------------|
| `mtg_price_sync/` | Scryfall price sync via direct DB writes | Superseded by inventory-ops price-sync cron |
| `mtg_finish_variants/` | One-time migration: add finish variants (Foil/Etched/NF) | Migration completed 2025 |
| `condition_variants/` | One-time migration: add condition variants (NM/LP/MP/HP/DMG) | Migration completed 2025 |
| `import_ecl_preorders.py` | One-time ECL/ECC preorder import | ECL released Jan 2026 |
| `legacy-inventory-extract.sql` | S&C legacy inventory extraction | Migration complete |
| `legacy-inventory-transform.py` | S&C legacy inventory transformation | Migration complete |
| `create-singles-builder-channel.py` | Create singles-builder sales channel | Channel exists |
| `create-store-categories.py` | Create Board Games/Supplies/Miniatures categories | Categories exist |
| `create-legal-pages.py` | Create Privacy/Terms/Returns CMS pages | Pages exist |
| `delete-digital-cards.sh` | Remove MTG digital-only cards | Cleanup completed |
| `delete-digital-cards.sql` | SQL version of digital card cleanup | Cleanup completed |
| `fix-stripe-config.sh` | Shell-based Stripe DynamoDB config | Superseded by JS variants |
| `sync-singles-builder-listings.sql` | Copy channel listings to singles-builder | One-time SQL, already run |

## Deleted Scripts (not archived, in git history only)

| Script | Superseded By |
|--------|--------------|
| `meilisearch-delta-sync.py` | Inventory-ops webhook-driven real-time sync |
| `sync-scryfall-attributes.py` | `bulk-sync-scryfall.py` (bulk download approach) |
| `add-products-to-channel-simple.py` | `create-channel-listings.py` |
| `create-featured-collection.sh` | Hard-coded staging IDs, unusable |
| `create-legal-pages.sh` | `create-legal-pages.py` (archived above) |
| `setup-stripe-config.js` | `fix-stripe-config.js` (correct App ID) |
| `backfill_product_images.py` | `backfill_product_media.py` (external URL approach) |
| `cleanup_broken_media.py` | One-time nuclear cleanup, dangerous |
| `mtg_scryfall_import/import_command.py` | Inventory-ops import pipeline (GraphQL) |
| `mtg_scryfall_import/run_import.sh` | Wrapper for deleted ORM import |
