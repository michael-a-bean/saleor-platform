# MTG Card Catalog Rules

## Catalog Overview

- **106,872 cards** imported from Scryfall
- **Product Type**: "MTG Card" with 23 custom attributes
- **Category**: "MTG Cards"
- **Channel**: "webstore"
- **Default pricing**: $0.00 USD

## MTG Attributes

Card characteristics: `mana_cost`, `mana_value`, `colors`, `color_identity`, `type_line`, `power`, `toughness`

Rarity & Set: `rarity`, `set_name`, `set_code`

Card features: `oracle_text`, `flavor_text`, `keywords`, `artist`

Collectibility: `reserved_list`, `promo`, `full_art`, `collector_number`

External IDs: `scryfall_id`, `scryfall_uri`

## After Catalog Changes

Always update the search index:
```bash
docker compose exec api python manage.py update_search_indexes
```

## Import Scripts

Located in `scripts/mtg_scryfall_import/`:
- `import_command.py` - Django management command
- `run_import.sh` - Orchestration script

## Implemented Features

Advanced filtering is fully implemented in the storefront:

- Filter by rarity, colors, card type, set, mana value, price range
- Boolean filters: reserved list, promo, full art
- Desktop sidebar + mobile modal UI (slide-in drawer)
- URL-based shareable filters
- 9 filter types total

See `storefront/src/lib/filters/` for implementation.
