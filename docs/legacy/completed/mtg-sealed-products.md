# MTG Sealed Products Plan

**Status: IN PROGRESS** - Phases 1, 2, 3, 4, 5 & 6 Complete (2026-01-08)

## Executive Summary

This plan defines how to represent Magic: The Gathering sealed products in Saleor, alongside the existing singles catalog. It establishes a category/collection structure that enables both **product-type browsing** (I want a booster box) and **set-based browsing** (I want Aetherdrift stuff) without duplicating products or confusing navigation.

---

## Research Sources

This plan was informed by:

| Source | What We Learned |
|--------|-----------------|
| [MTGJSON Sealed Product Model](https://mtgjson.com/data-models/sealed-product/) | Category/subtype taxonomy, contents structure |
| [WotC Product Guide](https://magic.wizards.com/en/product-guide) | Official product definitions and target audiences |
| [Scryfall Set Types](https://scryfall.com/docs/api/sets) | Set classification (expansion, commander, masters, etc.) |
| [TCGCSV](https://tcgcsv.com/) | Category → Group → Product hierarchy |
| [Draftsim Booster Guide](https://draftsim.com/mtg-booster-pack-types/) | 2025 product lineup and pricing |

---

## Product Taxonomy

### MTGJSON Subtype Values (Official Reference)

From [MTGJSON EnumValues](https://mtgjson.com/api/v5/EnumValues.json), sealed product subtypes include:

| Subtype | Description | Example Products |
|---------|-------------|------------------|
| `play` | Play Boosters (2024+) | Play Booster Box, Play Booster Pack |
| `draft` | Draft Boosters (pre-2024) | Draft Booster Box |
| `set` | Set Boosters (pre-2024) | Set Booster Box |
| `collector` | Collector Boosters | Collector Booster Box |
| `jumpstart` | Jumpstart products | Jumpstart Booster Box |
| `commander` | Commander precons | Commander Deck |
| `challenger` | Challenger Decks | Challenger Deck |
| `starter_deck` | Intro/starter products | Starter Kit |
| `fat_pack` | Bundles (legacy name) | Bundle |
| `gift_bundle` | Gift Bundles | Gift Bundle |
| `prerelease_kit` | Prerelease kits | Prerelease Pack |
| `secret_lair` | Secret Lair drops | Secret Lair: [name] |
| `from_the_vault` | FTV series | From the Vault: Angels |
| `spellbook` | Spellbook series | Signature Spellbook |
| `game_night` | Game Night boxes | Game Night |
| `two_player_starter` | 2-player starters | Arena Starter Kit |

### WotC 2025 Product Lineup

| Product Type | Contents | MSRP | Primary Use |
|--------------|----------|------|-------------|
| **Play Booster Pack** | 14 cards (1-4 R+) | $6.99 | Draft, casual opening |
| **Play Booster Box** | 30 packs (420 cards) | ~$180 | Draft events, collection |
| **Collector Booster Pack** | 15 cards (5-6 R+) | $37.99 | Premium collection |
| **Collector Booster Box** | 12 packs | ~$350 | Premium collection |
| **Bundle** | 9 Play Boosters + accessories | $69.99 | Gift, casual collection |
| **Gift Bundle** | Bundle + 1 Collector Booster | ~$80 | Gift |
| **Commander's Bundle** | 9 Play + 1 Collector + promos | $109.99 | Commander players |
| **Commander Deck** | 100-card precon + samples | $49.99 | Ready-to-play |
| **Starter Kit** | 2 learn-to-play decks | $19.99 | New players |
| **Jumpstart Booster** | 20-card themed pack | $5-7 | Quick play |

---

## Saleor Data Model

### Category Hierarchy (Flattened)

Categories handle the **primary navigation** by product type. Two levels max for simplicity:

```
Magic: The Gathering/
├── Singles/                          ← Existing (107k products)
│   └── (Set-based browsing via Collections)
│
└── Sealed/                           ← NEW
    ├── Play Booster Boxes/
    ├── Collector Booster Boxes/
    ├── Draft Booster Boxes/          (legacy sets pre-2024)
    ├── Set Booster Boxes/            (legacy sets pre-2024)
    ├── Play Booster Packs/
    ├── Collector Booster Packs/
    ├── Jumpstart Boosters/
    ├── Bundles/                      (all bundle types)
    ├── Commander Decks/
    ├── Challenger Decks/
    ├── Starter Kits/
    ├── Prerelease Kits/
    ├── Secret Lair/
    └── Premium Collections/          (FTV, Spellbook, etc.)
```

**Rationale:** Users know what they want (Play Booster Box, Commander Deck). Extra hierarchy adds clicks without value. Subtypes within categories are handled via product attributes for filtering.

### Collection Strategy

Collections enable **set-based browsing** that spans categories:

```
MTG Set Collections/
├── mtg-set-dft     → "Aetherdrift"           (Singles + Sealed)
├── mtg-set-fdn     → "Foundations"           (Singles + Sealed)
├── mtg-set-dsk     → "Duskmourn"             (Singles + Sealed)
├── mtg-set-blb     → "Bloomburrow"           (Singles + Sealed)
├── mtg-set-cmm     → "Commander Masters"     (Singles + Sealed)
└── ...

Promotional Collections/
├── promo-new-releases    → Products released in last 30 days
├── promo-preorder        → Upcoming products
├── promo-staff-picks     → Curated selections
└── promo-clearance       → Discounted inventory
```

**Collection Naming Convention:**
- Set collections: `mtg-set-{scryfall_set_code}`
- Promotional: `promo-{slug}`

### Product Type: `mtg-sealed-product`

Create a new product type with these attributes:

#### Product-Level Attributes

| Attribute Slug | Type | Purpose | Values |
|----------------|------|---------|--------|
| `mtg-set-code` | DROPDOWN | Links to set | 3-letter codes (dft, fdn, dsk) |
| `mtg-set-name` | PLAIN_TEXT | Display name | "Aetherdrift", "Foundations" |
| `mtg-sealed-type` | DROPDOWN | Product category | See below |
| `mtg-sealed-subtype` | DROPDOWN | Specific type | See below |
| `mtg-release-date` | DATE | Release date | ISO date |
| `mtg-msrp` | PLAIN_TEXT | Suggested retail | "$179.99" |
| `mtg-pack-count` | NUMERIC | Packs in box | 30, 12, etc. |
| `mtg-tcgplayer-product-id` | PLAIN_TEXT | TCGPlayer ID | Lookup/sync |
| `mtg-scryfall-set-id` | PLAIN_TEXT | Scryfall set UUID | Cross-reference |

#### Sealed Type Values

| Type | Description |
|------|-------------|
| `booster_box` | Factory-sealed box of boosters |
| `booster_pack` | Individual sealed booster pack |
| `bundle` | Bundle/Fat Pack product |
| `precon_deck` | Preconstructed deck |
| `starter` | Starter/intro product |
| `special` | Secret Lair, FTV, etc. |

#### Sealed Subtype Values

| Subtype | Parent Type | Notes |
|---------|-------------|-------|
| `play` | booster_box, booster_pack | Post-2024 standard |
| `collector` | booster_box, booster_pack | Premium product |
| `draft` | booster_box, booster_pack | Pre-2024 sets |
| `set` | booster_box, booster_pack | Pre-2024 sets |
| `jumpstart` | booster_pack | Jumpstart format |
| `commander` | precon_deck | Commander format |
| `challenger` | precon_deck | Standard format |
| `brawl` | precon_deck | Brawl format |
| `starter_kit` | starter | 2-player starter |
| `welcome` | starter | Welcome decks |
| `standard_bundle` | bundle | Regular bundle |
| `gift_bundle` | bundle | Bundle + Collector |
| `commander_bundle` | bundle | Commander variant |
| `prerelease` | special | Prerelease kit |
| `secret_lair` | special | Secret Lair drops |
| `ftv` | special | From the Vault |
| `spellbook` | special | Signature Spellbook |

#### Variant Attributes

Sealed products typically have **no variants** (unlike singles with condition/finish), but some may need:

| Attribute | Use Case |
|-----------|----------|
| `mtg-language` | Non-English sealed (Japanese Collector, etc.) |
| `mtg-sealed-edition` | First print vs reprint runs |

---

## Preorder Handling

Use Saleor's native `ProductChannelListing` fields for preorder management:

### Channel Listing Configuration

| Field | Value | Effect |
|-------|-------|--------|
| `availableForPurchaseAt` | Release date (e.g., `2025-02-14`) | Product visible but "Preorder" status |
| `isAvailableForPurchase` | Auto-computed by Saleor | `false` before date, `true` after |
| `visibleInListings` | `true` | Product appears in category/search |
| `isPublished` | `true` | Product page accessible |

### Behavior

1. **Before release date:** Product shows "Preorder" badge, can be purchased
2. **On release date:** Automatically transitions to normal "Add to Cart"
3. **No manual intervention needed** on release day

### Product Metadata for Shipping

```json
{
  "preorder_ship_policy": "ships_on_release",
  "expected_ship_date": "2025-02-14"
}
```

### Storefront Display Logic

```typescript
// In product card/detail components
const isPreorder = !product.availableForPurchase &&
                   product.availableForPurchaseAt &&
                   new Date(product.availableForPurchaseAt) > new Date();

// Button text
const buttonText = isPreorder ? "Preorder Now" : "Add to Cart";

// Badge
{isPreorder && <Badge>Preorder - Ships {formatDate(product.availableForPurchaseAt)}</Badge>}
```

### Fulfillment Integration

Orders containing preorder items should:
1. Be held from fulfillment until `availableForPurchaseAt` passes
2. Display "Awaiting Release" status in order management
3. Auto-release for picking on release date

---

## Storefront Routing

### URL Structure

```
/magic/                           → Magic landing page
/magic/singles/                   → Singles category (existing)
/magic/sealed/                    → Sealed landing page
/magic/sealed/booster-boxes/      → All booster boxes
/magic/sealed/booster-boxes/play/ → Play Booster Boxes only
/magic/sealed/bundles/            → All bundles
/magic/sealed/commander-decks/    → Commander precons

/magic/sets/                      → Set index (collection listing)
/magic/sets/aetherdrift/          → Set page (collection detail)
```

### Set Page Behavior

When viewing `/magic/sets/aetherdrift/`:

1. Query the `mtg-set-dft` collection
2. Display products grouped by category:
   - **Sealed Products** (from Sealed category)
   - **Singles** (from Singles category, with filters)
3. Show set-specific metadata (release date, set symbol, etc.)

### Filter Behavior by Context

| Context | Available Filters |
|---------|-------------------|
| `/magic/sealed/` | Set, Product Type, Price, In Stock |
| `/magic/sealed/booster-boxes/` | Set, Subtype (Play/Collector), Price |
| `/magic/sealed/commander-decks/` | Set, Deck Name, Price |
| `/magic/sets/aetherdrift/` | Category tabs (Singles/Sealed), then type-specific filters |

---

## Data Import Strategy

### Full MTGJSON Import

Import all sealed products from [MTGJSON AllPrintings.json](https://mtgjson.com/downloads/all-files/). Each set contains embedded `sealedProduct` arrays.

**Data Source:**
```bash
# Download AllPrintings (contains all sets with sealed products)
curl -O https://mtgjson.com/api/v5/AllPrintings.json.zip
unzip AllPrintings.json.zip
# ~2GB uncompressed, contains 700+ sets
```

**Estimated Scope:**
- ~700 sets total in MTGJSON
- ~500 sets with sealed products (some are promo/token-only)
- ~5-15 sealed products per set average
- **Total estimate: 3,000-5,000 sealed products**

### MTGJSON Sealed Product Structure

MTGJSON provides sealed product data per set. Example structure:

```json
{
  "sealedProduct": [
    {
      "category": "BOOSTER_BOX",
      "identifiers": {
        "tcgplayerProductId": "508889"
      },
      "name": "Aetherdrift Play Booster Box",
      "productSize": 30,
      "releaseDate": "2025-02-14",
      "subtype": "play",
      "uuid": "abc123..."
    }
  ]
}
```

**Import Script:** `scripts/mtg_sealed_import/import_sealed_products.py`

```python
# Full import from AllPrintings.json
import json

# Category mapping: MTGJSON category+subtype → Saleor category slug
CATEGORY_MAP = {
    ('BOOSTER_BOX', 'play'): 'play-booster-boxes',
    ('BOOSTER_BOX', 'collector'): 'collector-booster-boxes',
    ('BOOSTER_BOX', 'draft'): 'draft-booster-boxes',
    ('BOOSTER_BOX', 'set'): 'set-booster-boxes',
    ('BOOSTER_PACK', 'play'): 'play-booster-packs',
    ('BOOSTER_PACK', 'collector'): 'collector-booster-packs',
    ('BOOSTER_PACK', 'jumpstart'): 'jumpstart-boosters',
    ('BUNDLE', None): 'bundles',
    ('DECK', 'commander'): 'commander-decks',
    ('DECK', 'challenger'): 'challenger-decks',
    ('DECK', 'starter_deck'): 'starter-kits',
    ('OTHER', 'prerelease'): 'prerelease-kits',
    ('OTHER', 'secret_lair'): 'secret-lair',
    # ... etc
}

with open('AllPrintings.json') as f:
    all_sets = json.load(f)['data']

for set_code, set_data in all_sets.items():
    sealed_products = set_data.get('sealedProduct', [])
    if not sealed_products:
        continue

    # Ensure collection exists for this set
    collection = find_or_create_collection(
        slug=f'mtg-set-{set_code.lower()}',
        name=set_data['name'],
        metadata={
            'set_type': set_data.get('type'),
            'released_at': set_data.get('releaseDate'),
        }
    )

    for sealed in sealed_products:
        category_key = (sealed.get('category'), sealed.get('subtype'))
        category_slug = CATEGORY_MAP.get(category_key, 'premium-collections')

        product = create_saleor_product(
            name=sealed['name'],
            slug=f"{set_code.lower()}-{slugify(sealed['name'])}",
            product_type='mtg-sealed-product',
            category=category_slug,
            attributes={
                'mtg-set-code': set_code,
                'mtg-set-name': set_data['name'],
                'mtg-sealed-type': sealed.get('category', '').lower(),
                'mtg-sealed-subtype': sealed.get('subtype'),
                'mtg-release-date': sealed.get('releaseDate'),
                'mtg-pack-count': sealed.get('productSize'),
                'mtg-tcgplayer-product-id': sealed.get('identifiers', {}).get('tcgplayerProductId'),
                'mtg-mtgjson-uuid': sealed.get('uuid'),
            }
        )

        # Set preorder if future release
        if sealed.get('releaseDate'):
            release_date = parse_date(sealed['releaseDate'])
            if release_date > today():
                set_available_for_purchase_at(product, release_date)

        add_to_collection(product, collection)
```

### Product Images Strategy

**Primary Source:** [WPN Marketing Materials](https://wpn.wizards.com/en/marketing-materials)

WotC provides official product images via the Wizards Play Network for retailers. Each set release includes:

| Asset Type | Included Products |
|------------|-------------------|
| Product shots | Booster boxes, bundles, commander decks, collector boosters |
| Multiple angles | Front, back, angled views |
| Key art | Set artwork for banners/headers |
| Logos | Set logos, expansion symbols |

**Download Process:**

1. Visit [WPN Marketing Materials](https://wpn.wizards.com/en/marketing-materials)
2. Filter by set/product
3. Download ZIP containing product shots
4. Extract and rename to match our SKU convention

**File Organization:**

```
docs/images/mtg-sealed/
├── dft/                          # Aetherdrift
│   ├── dft-play-booster-box.png
│   ├── dft-collector-booster-box.png
│   ├── dft-bundle.png
│   └── dft-commander-*.png
├── fdn/                          # Foundations
│   └── ...
└── set-icons/                    # From Scryfall
    ├── dft.svg
    └── fdn.svg
```

**Import Script Enhancement:**

```python
def get_product_image_path(set_code: str, product_name: str) -> str | None:
    """Map MTGJSON product to local image file."""
    slug = slugify(product_name)
    base_path = f"docs/images/mtg-sealed/{set_code.lower()}"

    # Try exact match first
    for ext in ['png', 'jpg', 'webp']:
        path = f"{base_path}/{set_code.lower()}-{slug}.{ext}"
        if os.path.exists(path):
            return path

    # Fall back to set icon
    return f"docs/images/mtg-sealed/set-icons/{set_code.lower()}.svg"
```

**Fallback Chain:**

1. WPN product shot (if downloaded)
2. Scryfall set icon SVG
3. Generic placeholder by category

**Coverage Estimate:**

| Era | WPN Coverage | Fallback |
|-----|--------------|----------|
| 2020-present | Full product shots available | N/A |
| 2015-2019 | Partial (major sets) | Set icons |
| Pre-2015 | Minimal | Set icons |

**New Release Workflow:**

When a new set is announced:
1. Download WPN marketing kit (available at First Look)
2. Extract product shots to `docs/images/mtg-sealed/{set_code}/`
3. Run image import script to upload to Saleor media
4. Products created from MTGJSON auto-link to images

---

### Pricing Strategy

| Source | Use Case | Update Frequency |
|--------|----------|------------------|
| Manual entry | Launch pricing | As needed |
| TCGPlayer Market | Market-driven pricing | Daily |
| MSRP reference | Price anchoring | Per release |

**Note:** Sealed products have simpler pricing than singles (no condition matrix), but market prices fluctuate significantly for collector products.

---

## Collection Management

### Automatic Collection Assignment

When a sealed product is created with `mtg-set-code = dft`:
1. Find or create collection `mtg-set-dft`
2. Add product to collection
3. If collection is new, set metadata:
   - Name: "Aetherdrift"
   - Slug: `mtg-set-dft`
   - Description: From Scryfall set data

### Set Index Page Data

Query Scryfall for set metadata to display on set index:

```graphql
query SetIndexPage {
  collections(filter: { slugs: ["mtg-set-dft", "mtg-set-fdn", ...] }) {
    edges {
      node {
        slug
        name
        metadata {
          key
          value
        }
        products(first: 0) {
          totalCount
        }
      }
    }
  }
}
```

Set collection metadata:
- `scryfall_set_id`: UUID
- `set_type`: expansion, commander, masters, etc.
- `released_at`: ISO date
- `icon_svg_uri`: Set symbol URL

---

## Implementation Phases

### Phase 1: Schema Setup ✅ COMPLETE (2026-01-07)

1. Create `mtg-sealed-product` product type
2. Create sealed-specific attributes (see Product-Level Attributes table)
3. Create flattened category hierarchy under `Magic: The Gathering/Sealed/`
4. Test with one manually created product

**Deliverable:** Empty structure ready for import

**Implementation Notes:**
- Scripts: `scripts/mtg_sealed_import/setup_sealed_schema.py`, `create_test_product.py`
- Product type ID: 5 (`UHJvZHVjdFR5cGU6NQ==`)
- 10 attributes assigned (6 new sealed-specific + 4 reused from mtg-card)
- 14 sealed subcategories under `Magic: The Gathering/Sealed/`
- Test product: "Aetherdrift Play Booster Box" (ID: 106891, SKU: DFT-PLAY-BOX)

### Phase 2: Image Collection ✅ AUTOMATED (2026-01-07)

1. Download WPN marketing kits for sets 2020-present
2. Extract and organize into `docs/images/mtg-sealed/{set_code}/`
3. Download Scryfall set icons for all sets
4. Create naming convention mapping (MTGJSON name → image filename)

**Deliverable:** Image library for ~50 sets (2020-present)

**Implementation Notes:**
- WPN URL pattern: `https://media.wizards.com/{year}/wpn/marketing_materials/{set}/{set}_pds_en.zip`
- Scripts: `download_wpn_images.py`, `upload_sealed_images.py`
- **32 products with images** across 5 sets:
  - BLB (Bloomburrow): 7 images
  - FDN (Foundations): 7 images
  - MH3 (Modern Horizons 3): 6 images
  - SPM (Spider-Man): 6 images
  - DSK (Duskmourn): 6 images
- Auto-extracts front-view (`_01_01.png`) images
- Maps to Saleor categories: play-booster-box, collector-booster-box, bundle, etc.
- Some sets unavailable (404): MKM, DFT - may be available after release or different URL pattern

### Phase 3: Full MTGJSON Import ✅ COMPLETE (2026-01-07)

1. Download AllPrintings.json (~2GB)
2. Run import script with dry-run to validate mapping
3. Execute full import (estimated 3,000-5,000 products)
4. Auto-create set collections during import
5. Set `availableForPurchaseAt` for future releases
6. Link products to images (WPN shots or set icon fallback)

**Deliverable:** Complete sealed product catalog with images

**Implementation Notes:**
- Script: `scripts/mtg_sealed_import/import_sealed_products.py`
- **1,808 products imported** (plus 1 test = 1,809 total)
- **264 set collections created** (mtg-set-{code})
- Products categorized across 14 sealed categories
- Category breakdown: Secret Lair (807), Commander Decks (198), Draft Boxes (168), Bundles (145), etc.
- Images handled in Phase 2 via automated WPN download

### Phase 4: Collection Enrichment ✅ COMPLETE (2026-01-08)

1. Add Scryfall set metadata to collections (icons, set types)
2. Add existing singles to their respective set collections
3. Verify collection membership for both singles and sealed

**Deliverable:** Unified set-based browsing

**Implementation Notes:**
- Script: `scripts/mtg_sealed_import/link_singles_to_collections.py`
- **70,812 singles linked** to 250 set collections
- **72,620 total products** in collections (70,812 singles + 1,808 sealed)
- All 264 collections published to webstore channel
- Example: Bloomburrow collection has 404 products (397 singles + 7 sealed)

### Phase 5: Storefront Routes ✅ STRUCTURE COMPLETE (2026-01-08)

1. Create `/magic/sealed/` landing page with category grid
2. Create `/magic/sets/` index page (set list with icons)
3. Create `/magic/sets/[slug]/` detail page with Singles/Sealed tabs
4. Implement context-aware filtering
5. Add preorder badge logic using `availableForPurchaseAt`

**Deliverable:** Full sealed + set browsing experience

**Implementation Notes:**
- Created 3 new pages in `storefront/src/app/[channel]/(main)/magic/`:
  - `sealed/page.tsx` - Static category grid linking to 14 sealed categories
  - `sets/page.tsx` - A-Z index of 264 MTG set collections (uses SitemapDataDocument)
  - `sets/[slug]/page.tsx` - Set detail with All/Singles/Sealed tabs (uses ProductListByCollectionDocument)
- Uses existing GraphQL documents to avoid codegen issues
- NOTE: Pre-existing SinglesBuilder codegen issues prevent full build - unrelated to magic pages
- Routes: `/webstore/magic/sealed`, `/webstore/magic/sets`, `/webstore/magic/sets/{set-code}`

### Phase 6: Pricing Integration ✅ BASIC (2026-01-07)

1. Extend price-sync to support sealed products
2. Fetch TCGPlayer market prices for sealed (via product ID)
3. Implement pricing rules (MSRP reference, margin floors)
4. Handle collector product volatility (price change alerts)

**Deliverable:** Automated sealed pricing

**Implementation Notes:**
- Script: `scripts/mtg_sealed_import/sync_sealed_prices.py`
- 1,808 products priced using category-based defaults
- Default pricing: Play Boxes $119.99, Collector Boxes $249.99, Commander Decks $44.99, etc.
- TCGPlayer market price integration deferred (ID mismatch between MTGJSON and TCGCSV)
- Future: Integrate TCGCSV API for market-driven pricing

---

## Future Considerations

### Other Games

This same structure extends to other games:

```
Categories:
├── Magic: The Gathering/
│   ├── Singles/
│   └── Sealed/
├── Pokemon/
│   ├── Singles/
│   └── Sealed/
├── Board Games/
│   ├── Strategy/
│   ├── Party/
│   └── Family/
└── Supplies/
    ├── Card Sleeves/
    ├── Deck Boxes/
    └── Playmats/
```

Each game gets its own set collections:
- `pokemon-set-{code}`
- `fab-set-{code}` (Flesh and Blood)

### Inventory Considerations

Sealed products need different inventory logic than singles:
- No condition tracking (sealed is sealed)
- Reorder points based on release date proximity
- Allocation for preorders
- Case quantity tracking (6 boxes per case typical)

---

## Appendix: Reference Links

### Data Sources
- [MTGJSON Sealed Product Model](https://mtgjson.com/data-models/sealed-product/)
- [MTGJSON EnumValues](https://mtgjson.com/api/v5/EnumValues.json)
- [Scryfall Sets API](https://scryfall.com/docs/api/sets)
- [Scryfall Set Types](https://scryfall.com/docs/api/sets) - 24 distinct set types

### WotC Official
- [MTG Product Guide](https://magic.wizards.com/en/product-guide)
- [MTG Products Page](https://magic.wizards.com/en/products)

### Retailer Examples
- Card Kingdom sealed structure
- Star City Games sealed structure
- TCGPlayer sealed categories
