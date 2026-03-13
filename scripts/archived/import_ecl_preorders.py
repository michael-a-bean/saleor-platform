#!/usr/bin/env python3
"""
Import Lorwyn Eclipsed (ECL) and Lorwyn Eclipsed Commander (ECC) as preorder items.

This script:
1. Imports ECL and ECC singles from downloaded Scryfall JSON
2. Imports ECL sealed products from MTGJSON
3. Creates ECC Commander deck products manually
4. Sets all products as preorders (available_for_purchase_at = release date)

Run from project root:
    python scripts/import_ecl_preorders.py [--dry-run]

Prerequisites:
    - Scryfall card data in docs/data/ecl/ecl-cards.json and ecc-cards.json
    - MTGJSON data in mtgjson-ecl.json (same directory)
    - Saleor API running
"""

import argparse
import json
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import requests

SALEOR_API = "http://localhost:8000/graphql/"
PROJECT_ROOT = Path(__file__).parent.parent
ECL_DATA_DIR = PROJECT_ROOT / "docs/data/ecl"
ECL_CARDS_FILE = ECL_DATA_DIR / "ecl-cards.json"
ECC_CARDS_FILE = ECL_DATA_DIR / "ecc-cards.json"
ECL_MTGJSON_FILE = ECL_DATA_DIR / "mtgjson-ecl.json"

# Release date for Lorwyn Eclipsed
RELEASE_DATE = "2026-01-23"
RELEASE_DATETIME = f"{RELEASE_DATE}T00:00:00+00:00"

# ECC Commander decks (manually defined since MTGJSON doesn't have them yet)
ECC_COMMANDER_DECKS = [
    {
        "name": "Lorwyn Eclipsed Commander Deck - Blight Curse",
        "category": "deck",
        "subtype": "commander",
        "description": "100-card Commander deck featuring Auntie Ool as the face commander. Harness the power of blight to overwhelm your opponents.",
        "msrp": "49.99",
    },
    {
        "name": "Lorwyn Eclipsed Commander Deck - Dance of the Elements",
        "category": "deck",
        "subtype": "commander",
        "description": "100-card Commander deck featuring Ashling as the face commander. Embrace the power of harmony with elemental forces.",
        "msrp": "49.99",
    },
    {
        "name": "Lorwyn Eclipsed Commander 2-Deck Bundle",
        "category": "multiple_decks",
        "subtype": "commander",
        "description": "Both Lorwyn Eclipsed Commander decks: Blight Curse and Dance of the Elements.",
        "msrp": "89.99",
    },
]


def get_auth_token() -> str:
    """Get authentication token from Saleor."""
    mutation = """
    mutation {
        tokenCreate(email: "admin@example.com", password: "admin") {
            token
            errors { message }
        }
    }
    """
    response = requests.post(SALEOR_API, json={"query": mutation})
    data = response.json()
    if data.get("data", {}).get("tokenCreate", {}).get("token"):
        return data["data"]["tokenCreate"]["token"]
    raise Exception(f"Failed to get token: {data}")


def graphql_request(query: str, variables: dict = None, token: str = None) -> dict:
    """Make a GraphQL request to Saleor."""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    response = requests.post(SALEOR_API, json=payload, headers=headers)
    return response.json()


def get_or_create_category(token: str, slug: str, name: str, parent_slug: str = None) -> str:
    """Get or create a category, returns category ID."""
    # First try to get existing
    query = """
    query GetCategory($slug: String!) {
        category(slug: $slug) { id }
    }
    """
    result = graphql_request(query, {"slug": slug}, token)
    if result.get("data", {}).get("category"):
        return result["data"]["category"]["id"]

    # Create new category
    parent_id = None
    if parent_slug:
        parent_result = graphql_request(query, {"slug": parent_slug}, token)
        if parent_result.get("data", {}).get("category"):
            parent_id = parent_result["data"]["category"]["id"]

    mutation = """
    mutation CreateCategory($input: CategoryInput!) {
        categoryCreate(input: $input) {
            category { id }
            errors { field message }
        }
    }
    """
    input_data = {"name": name, "slug": slug}
    if parent_id:
        input_data["parent"] = parent_id

    result = graphql_request(mutation, {"input": input_data}, token)
    if result.get("data", {}).get("categoryCreate", {}).get("category"):
        return result["data"]["categoryCreate"]["category"]["id"]
    raise Exception(f"Failed to create category {slug}: {result}")


def get_product_type_id(token: str, slug: str) -> str:
    """Get product type ID by slug."""
    query = """
    query GetProductTypes($search: String!) {
        productTypes(first: 10, filter: {search: $search}) {
            edges {
                node { id slug }
            }
        }
    }
    """
    result = graphql_request(query, {"search": slug}, token)
    edges = result.get("data", {}).get("productTypes", {}).get("edges", [])
    for edge in edges:
        if edge["node"]["slug"] == slug:
            return edge["node"]["id"]
    raise Exception(f"Product type {slug} not found")


def get_channel_id(token: str, slug: str = "webstore") -> str:
    """Get channel ID by slug."""
    query = """
    query GetChannel($slug: String!) {
        channel(slug: $slug) { id }
    }
    """
    result = graphql_request(query, {"slug": slug}, token)
    if result.get("data", {}).get("channel"):
        return result["data"]["channel"]["id"]
    raise Exception(f"Channel {slug} not found")


def check_product_exists(token: str, slug: str, channel_slug: str = "webstore") -> bool:
    """Check if a product with this slug already exists."""
    query = """
    query CheckProduct($slug: String!, $channel: String!) {
        product(slug: $slug, channel: $channel) { id }
    }
    """
    result = graphql_request(query, {"slug": slug, "channel": channel_slug}, token)
    return result.get("data", {}).get("product") is not None


def slugify(text: str) -> str:
    """Convert text to slug."""
    import re
    slug = text.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug[:200]


def create_product_with_preorder(
    token: str,
    name: str,
    slug: str,
    description: str,
    product_type_id: str,
    category_id: str,
    channel_id: str,
    price: Decimal,
    sku: str,
    image_url: str = None,
    attributes: list = None,
) -> dict:
    """Create a product as a preorder item."""

    # Create product
    mutation = """
    mutation CreateProduct($input: ProductCreateInput!) {
        productCreate(input: $input) {
            product { id slug }
            errors { field message }
        }
    }
    """

    description_json = json.dumps({
        "blocks": [{"type": "paragraph", "data": {"text": description}}]
    })

    input_data = {
        "name": name[:250],
        "slug": slug,
        "description": description_json,
        "productType": product_type_id,
        "category": category_id,
    }

    if attributes:
        input_data["attributes"] = attributes

    result = graphql_request(mutation, {"input": input_data}, token)

    if result.get("data", {}).get("productCreate", {}).get("errors"):
        errors = result["data"]["productCreate"]["errors"]
        if any("unique" in str(e).lower() for e in errors):
            return {"skipped": True, "reason": "already exists"}
        raise Exception(f"Failed to create product: {errors}")

    product = result.get("data", {}).get("productCreate", {}).get("product")
    if not product:
        raise Exception(f"Failed to create product: {result}")

    product_id = product["id"]

    # Create channel listing with preorder date
    listing_mutation = """
    mutation CreateChannelListing($id: ID!, $input: [ProductChannelListingAddInput!]!) {
        productChannelListingUpdate(id: $id, input: {addChannels: $input}) {
            errors { field message }
        }
    }
    """
    listing_input = [{
        "channelId": channel_id,
        "isPublished": True,
        "visibleInListings": True,
        "availableForPurchaseAt": RELEASE_DATETIME,
    }]
    graphql_request(listing_mutation, {"id": product_id, "input": listing_input}, token)

    # Create variant
    variant_mutation = """
    mutation CreateVariant($input: ProductVariantCreateInput!) {
        productVariantCreate(input: $input) {
            productVariant { id }
            errors { field message }
        }
    }
    """
    variant_input = {
        "product": product_id,
        "sku": sku[:255],
        "name": name[:250],
        "trackInventory": False,
    }
    variant_result = graphql_request(variant_mutation, {"input": variant_input}, token)

    if variant_result.get("data", {}).get("productVariantCreate", {}).get("errors"):
        print(f"  Warning: variant errors: {variant_result['data']['productVariantCreate']['errors']}")

    variant = variant_result.get("data", {}).get("productVariantCreate", {}).get("productVariant")
    if variant:
        # Set variant price
        price_mutation = """
        mutation UpdateVariantPrice($id: ID!, $input: [ProductVariantChannelListingAddInput!]!) {
            productVariantChannelListingUpdate(id: $id, input: $input) {
                errors { field message }
            }
        }
        """
        price_input = [{
            "channelId": channel_id,
            "price": str(price),
        }]
        graphql_request(price_mutation, {"id": variant["id"], "input": price_input}, token)

    # Add image if provided
    if image_url:
        media_mutation = """
        mutation CreateMedia($productId: ID!, $mediaUrl: String!) {
            productMediaCreate(input: {product: $productId, mediaUrl: $mediaUrl}) {
                errors { field message }
            }
        }
        """
        graphql_request(media_mutation, {"productId": product_id, "mediaUrl": image_url}, token)

    return {"id": product_id, "slug": slug}


def import_singles(token: str, cards: list, set_code: str, product_type_id: str, category_id: str, channel_id: str, dry_run: bool) -> dict:
    """Import singles from Scryfall card data."""
    stats = {"imported": 0, "skipped": 0, "errors": 0}

    for i, card in enumerate(cards):
        name = card.get("name", "Unknown Card")
        collector_num = card.get("collector_number", "0")
        scryfall_id = card.get("id", "")

        # Skip digital-only cards
        if card.get("digital", False):
            stats["skipped"] += 1
            continue

        # Build slug
        slug = slugify(f"{name}-{set_code}-{collector_num}")

        if dry_run:
            print(f"  Would import: {name} ({set_code} #{collector_num})")
            stats["imported"] += 1
            continue

        # Check if exists
        if check_product_exists(token, slug):
            stats["skipped"] += 1
            continue

        # Get price from Scryfall
        prices = card.get("prices", {})
        price = Decimal("0.00")
        if prices.get("usd"):
            try:
                price = Decimal(prices["usd"])
            except:
                pass

        # Build description
        oracle_text = card.get("oracle_text", "")
        type_line = card.get("type_line", "")
        description = f"{type_line}\n\n{oracle_text}" if oracle_text else type_line

        # Get image
        image_uris = card.get("image_uris", {})
        image_url = image_uris.get("normal") or image_uris.get("large")

        # Handle double-faced cards
        if not image_uris and card.get("card_faces"):
            faces = card["card_faces"]
            if faces and faces[0].get("image_uris"):
                image_url = faces[0]["image_uris"].get("normal")

        try:
            result = create_product_with_preorder(
                token=token,
                name=name,
                slug=slug,
                description=description,
                product_type_id=product_type_id,
                category_id=category_id,
                channel_id=channel_id,
                price=price,
                sku=scryfall_id,
                image_url=image_url,
            )

            if result.get("skipped"):
                stats["skipped"] += 1
            else:
                stats["imported"] += 1

            if (i + 1) % 50 == 0:
                print(f"  Progress: {i + 1}/{len(cards)} cards...")

        except Exception as e:
            print(f"  Error importing {name}: {e}")
            stats["errors"] += 1

    return stats


def import_sealed(token: str, sealed_products: list, set_code: str, set_name: str, product_type_id: str, channel_id: str, categories: dict, fallback_category_id: str, dry_run: bool) -> dict:
    """Import sealed products from MTGJSON data."""
    stats = {"imported": 0, "skipped": 0, "errors": 0}

    # Category mapping - maps to subcategory slug (uses fallback if not found)
    category_map = {
        ("booster_box", "play"): "play-booster-boxes",
        ("booster_box", "collector"): "collector-booster-boxes",
        ("booster_pack", "play"): "play-booster-packs",
        ("booster_pack", "collector"): "collector-booster-packs",
        ("bundle", "default"): "bundles",
        ("bundle", "fat_pack"): "bundles",
        ("deck", "commander"): "commander-decks",
        ("deck", "theme"): None,  # Skip theme decks
        ("multiple_decks", "commander"): "commander-decks",
        ("limited_aid_tool", "prerelease_kit"): "prerelease-kits",
    }

    for sealed in sealed_products:
        name = sealed.get("name", "Unknown Product")
        category = sealed.get("category", "unknown")
        subtype = sealed.get("subtype", "unknown")

        category_slug = category_map.get((category, subtype))
        if category_slug is None:  # Explicitly None means skip
            print(f"  Skipping: {name} ({category}/{subtype})")
            stats["skipped"] += 1
            continue

        slug = slugify(f"{set_code}-{name}")

        if dry_run:
            print(f"  Would import: {name} -> {category_slug}")
            stats["imported"] += 1
            continue

        print(f"  Checking: {name} (slug={slug})")
        if check_product_exists(token, slug):
            print(f"    -> Already exists, skipping")
            stats["skipped"] += 1
            continue

        # Use specific category if exists, otherwise fallback to mtg-sealed
        category_id = categories.get(category_slug) or fallback_category_id
        if not category_id:
            print(f"  Missing category: {category_slug}")
            stats["errors"] += 1
            continue

        # Get price (MSRP from identifiers or default)
        identifiers = sealed.get("identifiers", {})
        msrp = sealed.get("purchaseUrls", {}).get("tcgplayer", {}).get("price") or "0.00"

        # Default MSRPs by type
        default_msrp = {
            "booster_box-play": "259.99",
            "booster_box-collector": "319.99",
            "booster_pack-play": "5.99",
            "booster_pack-collector": "29.99",
            "bundle-default": "59.99",
            "limited_aid_tool-prerelease_kit": "39.99",
        }
        if msrp == "0.00":
            msrp = default_msrp.get(f"{category}-{subtype}", "0.00")

        price = Decimal(msrp)

        # Build description from contents
        contents = sealed.get("contents", {})
        sealed_items = contents.get("sealed", [])
        if sealed_items:
            desc_parts = ["Contains:"]
            for item in sealed_items:
                count = item.get("count", 1)
                item_name = item.get("name", "Item")
                desc_parts.append(f"- {count}x {item_name}")
            description = "\n".join(desc_parts)
        else:
            description = f"Factory sealed {set_name} product."

        # Generate SKU
        uuid = sealed.get("uuid", "")[:8]
        sku = f"{set_code.upper()}-{category[:4].upper()}-{uuid.upper()}"

        try:
            result = create_product_with_preorder(
                token=token,
                name=name,
                slug=slug,
                description=description,
                product_type_id=product_type_id,
                category_id=category_id,
                channel_id=channel_id,
                price=price,
                sku=sku,
            )

            if result.get("skipped"):
                stats["skipped"] += 1
            else:
                stats["imported"] += 1

        except Exception as e:
            print(f"  Error importing {name}: {e}")
            stats["errors"] += 1

    return stats


def import_ecc_commander_decks(token: str, product_type_id: str, channel_id: str, category_id: str, dry_run: bool) -> dict:
    """Import ECC Commander decks (manually defined)."""
    stats = {"imported": 0, "skipped": 0, "errors": 0}

    for deck in ECC_COMMANDER_DECKS:
        name = deck["name"]
        slug = slugify(name)

        if dry_run:
            print(f"  Would import: {name}")
            stats["imported"] += 1
            continue

        if check_product_exists(token, slug):
            stats["skipped"] += 1
            continue

        price = Decimal(deck.get("msrp", "49.99"))
        sku = f"ECC-CMD-{slugify(name.split('-')[-1].strip())[:8].upper()}"

        try:
            result = create_product_with_preorder(
                token=token,
                name=name,
                slug=slug,
                description=deck["description"],
                product_type_id=product_type_id,
                category_id=category_id,
                channel_id=channel_id,
                price=price,
                sku=sku,
            )

            if result.get("skipped"):
                stats["skipped"] += 1
            else:
                stats["imported"] += 1

        except Exception as e:
            print(f"  Error importing {name}: {e}")
            stats["errors"] += 1

    return stats


def main():
    parser = argparse.ArgumentParser(description="Import Lorwyn Eclipsed as preorders")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be imported")
    parser.add_argument("--singles-only", action="store_true", help="Only import singles")
    parser.add_argument("--sealed-only", action="store_true", help="Only import sealed")
    args = parser.parse_args()

    print("=" * 60)
    print("Lorwyn Eclipsed Preorder Import")
    print("=" * 60)
    print(f"Release Date: {RELEASE_DATE}")
    print(f"Dry Run: {args.dry_run}")
    print()

    # Verify data files exist
    if not ECL_CARDS_FILE.exists():
        print(f"Error: ECL cards file not found: {ECL_CARDS_FILE}")
        sys.exit(1)
    if not ECC_CARDS_FILE.exists():
        print(f"Error: ECC cards file not found: {ECC_CARDS_FILE}")
        sys.exit(1)

    # Load card data
    print("Loading card data...")
    with open(ECL_CARDS_FILE) as f:
        ecl_cards = json.load(f)
    print(f"  ECL: {len(ecl_cards)} cards")

    with open(ECC_CARDS_FILE) as f:
        ecc_cards = json.load(f)
    print(f"  ECC: {len(ecc_cards)} cards")

    # Load sealed data
    ecl_sealed = []
    if ECL_MTGJSON_FILE.exists():
        with open(ECL_MTGJSON_FILE) as f:
            mtgjson_data = json.load(f)
            ecl_sealed = mtgjson_data.get("data", {}).get("sealedProduct", [])
        print(f"  ECL Sealed: {len(ecl_sealed)} products")

    print()

    # Get auth token
    if not args.dry_run:
        print("Authenticating...")
        token = get_auth_token()
        print("  Authenticated")

        # Get IDs
        print("Getting product types and categories...")
        card_product_type_id = get_product_type_id(token, "mtg-card")
        sealed_product_type_id = get_product_type_id(token, "mtg-sealed-product")
        channel_id = get_channel_id(token, "webstore")

        # Get category IDs
        categories = {}
        category_slugs = [
            "play-booster-boxes", "collector-booster-boxes",
            "play-booster-packs", "collector-booster-packs",
            "bundles", "commander-decks", "prerelease-kits",
        ]
        for slug in category_slugs:
            query = """
            query GetCategory($slug: String!) {
                category(slug: $slug) { id }
            }
            """
            result = graphql_request(query, {"slug": slug}, token)
            if result.get("data", {}).get("category"):
                categories[slug] = result["data"]["category"]["id"]

        # Get singles category
        singles_category_id = None
        result = graphql_request("""
            query { category(slug: "mtg-cards") { id } }
        """, token=token)
        if result.get("data", {}).get("category"):
            singles_category_id = result["data"]["category"]["id"]

        # Get sealed fallback category
        sealed_category_id = None
        result = graphql_request("""
            query { category(slug: "mtg-sealed") { id } }
        """, token=token)
        if result.get("data", {}).get("category"):
            sealed_category_id = result["data"]["category"]["id"]

        print(f"  Found {len(categories)} sealed subcategories")
        print(f"  Using mtg-sealed as fallback: {bool(sealed_category_id)}")
    else:
        token = None
        card_product_type_id = "DRY_RUN"
        sealed_product_type_id = "DRY_RUN"
        channel_id = "DRY_RUN"
        categories = {slug: "DRY_RUN" for slug in ["play-booster-boxes", "collector-booster-boxes", "bundles", "commander-decks", "prerelease-kits"]}
        singles_category_id = "DRY_RUN"
        sealed_category_id = "DRY_RUN"

    print()

    # Import singles
    if not args.sealed_only:
        print("=" * 40)
        print("Importing ECL Singles...")
        print("=" * 40)
        ecl_stats = import_singles(
            token, ecl_cards, "ecl", card_product_type_id, singles_category_id, channel_id, args.dry_run
        )
        print(f"ECL Singles: Imported={ecl_stats['imported']}, Skipped={ecl_stats['skipped']}, Errors={ecl_stats['errors']}")

        print()
        print("=" * 40)
        print("Importing ECC Singles...")
        print("=" * 40)
        ecc_stats = import_singles(
            token, ecc_cards, "ecc", card_product_type_id, singles_category_id, channel_id, args.dry_run
        )
        print(f"ECC Singles: Imported={ecc_stats['imported']}, Skipped={ecc_stats['skipped']}, Errors={ecc_stats['errors']}")

    # Import sealed
    if not args.singles_only:
        print()
        print("=" * 40)
        print("Importing ECL Sealed Products...")
        print("=" * 40)
        if ecl_sealed:
            sealed_stats = import_sealed(
                token, ecl_sealed, "ecl", "Lorwyn Eclipsed",
                sealed_product_type_id, channel_id, categories, sealed_category_id, args.dry_run
            )
            print(f"ECL Sealed: Imported={sealed_stats['imported']}, Skipped={sealed_stats['skipped']}, Errors={sealed_stats['errors']}")
        else:
            print("  No sealed data available")

        print()
        print("=" * 40)
        print("Importing ECC Commander Decks...")
        print("=" * 40)
        cmd_category_id = categories.get("commander-decks") or sealed_category_id
        if cmd_category_id:
            cmd_stats = import_ecc_commander_decks(
                token, sealed_product_type_id, channel_id, cmd_category_id, args.dry_run
            )
            print(f"ECC Commander: Imported={cmd_stats['imported']}, Skipped={cmd_stats['skipped']}, Errors={cmd_stats['errors']}")
        else:
            print("  No category available for commander decks")

    print()
    print("=" * 60)
    print("Import Complete!")
    print("=" * 60)
    print(f"\nAll products set as PREORDER (available {RELEASE_DATE})")
    print("\nNext steps:")
    print("  1. Run sync-meilisearch.py to update search index")
    print("  2. Verify products in Saleor dashboard")
    print("  3. Set accurate pricing when available")


if __name__ == "__main__":
    main()
