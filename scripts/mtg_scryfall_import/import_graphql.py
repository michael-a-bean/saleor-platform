#!/usr/bin/env python3
"""
GraphQL-based MTG card import using Saleor bulk mutations.

This script creates products and variants using Saleor's GraphQL API instead of
direct Django ORM operations. Benefits:
- Emits webhooks for downstream sync (inventory-ops, Meilisearch)
- Proper validation (prevents discounted_price_amount NULL issue)
- Audit trail in Saleor admin
- Works remotely (doesn't require Django context)

Usage:
    # Full import
    python scripts/mtg_scryfall_import/import_graphql.py all-cards.json --channel webstore

    # Limited import for testing
    python scripts/mtg_scryfall_import/import_graphql.py all-cards.json --limit 100 --dry-run

    # Resume from checkpoint
    python scripts/mtg_scryfall_import/import_graphql.py all-cards.json --resume

Prerequisites:
    - SALEOR_API_URL environment variable (or --api-url argument)
    - SALEOR_API_TOKEN environment variable (or --token argument)
    - Product type, category, and attributes must already exist

Environment Variables:
    SALEOR_API_URL: GraphQL endpoint (default: http://localhost:8000/graphql/)
    SALEOR_API_TOKEN: Bearer token for authentication
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional

import requests

# =============================================================================
# Configuration
# =============================================================================

DEFAULT_API_URL = os.getenv("SALEOR_API_URL", "http://localhost:8000/graphql/")
DEFAULT_CHANNEL = "webstore"
BATCH_SIZE = 50  # Saleor recommends smaller batches for bulk mutations
PROGRESS_FILE = Path("/tmp/mtg_graphql_import_progress.json")

# Condition multipliers for variant pricing
CONDITION_MULTIPLIERS = {
    "NM": Decimal("1.0"),
    "LP": Decimal("0.9"),
    "MP": Decimal("0.75"),
    "HP": Decimal("0.5"),
    "DMG": Decimal("0.25"),
}

# Finish types
FINISHES = ["nonfoil", "foil", "etched"]
CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"]

# =============================================================================
# GraphQL Queries and Mutations
# =============================================================================

FETCH_SETUP_QUERY = """
query FetchSetup($channelSlug: String!) {
  channels {
    id
    slug
  }
  productTypes(first: 10, filter: {slugs: ["mtg-single-card"]}) {
    edges {
      node {
        id
        slug
        productAttributes {
          id
          slug
        }
      }
    }
  }
  categories(first: 10, filter: {slugs: ["mtg-singles"]}) {
    edges {
      node {
        id
        slug
      }
    }
  }
  channel(slug: $channelSlug) {
    id
    slug
  }
}
"""

PRODUCT_BULK_CREATE = """
mutation ProductBulkCreate($products: [ProductBulkCreateInput!]!) {
  productBulkCreate(products: $products) {
    count
    results {
      product {
        id
        name
        slug
        externalReference
      }
      errors {
        path
        message
        code
      }
    }
    errors {
      path
      message
      code
    }
  }
}
"""

PRODUCT_VARIANT_BULK_CREATE = """
mutation ProductVariantBulkCreate($productId: ID!, $variants: [ProductVariantBulkCreateInput!]!) {
  productVariantBulkCreate(product: $productId, variants: $variants) {
    count
    results {
      productVariant {
        id
        sku
        name
      }
      errors {
        path
        message
        code
      }
    }
    errors {
      path
      message
      code
    }
  }
}
"""

CHECK_PRODUCT_EXISTS = """
query CheckProductExists($externalRef: String!) {
  product(externalReference: $externalRef) {
    id
    name
  }
}
"""

# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class SetupData:
    """Holds IDs needed for import."""
    channel_id: str
    product_type_id: str
    category_id: str
    attribute_map: dict[str, str]  # slug -> id


@dataclass
class ImportStats:
    """Track import statistics."""
    products_created: int = 0
    products_skipped: int = 0
    products_failed: int = 0
    variants_created: int = 0
    variants_failed: int = 0
    start_time: float = 0.0

    def summary(self) -> str:
        elapsed = time.time() - self.start_time
        return (
            f"Products: {self.products_created} created, "
            f"{self.products_skipped} skipped, {self.products_failed} failed | "
            f"Variants: {self.variants_created} created, {self.variants_failed} failed | "
            f"Time: {elapsed:.1f}s"
        )


# =============================================================================
# GraphQL Client
# =============================================================================

class SaleorClient:
    """Simple GraphQL client for Saleor API."""

    def __init__(self, api_url: str, token: str):
        self.api_url = api_url
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })

    def execute(self, query: str, variables: Optional[dict] = None) -> dict:
        """Execute a GraphQL query/mutation."""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        response = self.session.post(self.api_url, json=payload)
        response.raise_for_status()

        data = response.json()
        if "errors" in data:
            raise Exception(f"GraphQL errors: {data['errors']}")

        return data.get("data", {})

    def fetch_setup(self, channel_slug: str) -> SetupData:
        """Fetch required IDs for import."""
        data = self.execute(FETCH_SETUP_QUERY, {"channelSlug": channel_slug})

        # Find channel
        channel = data.get("channel")
        if not channel:
            raise Exception(f"Channel '{channel_slug}' not found")

        # Find product type
        product_types = data.get("productTypes", {}).get("edges", [])
        product_type = None
        for edge in product_types:
            if edge["node"]["slug"] == "mtg-single-card":
                product_type = edge["node"]
                break

        if not product_type:
            raise Exception("Product type 'mtg-single-card' not found")

        # Find category
        categories = data.get("categories", {}).get("edges", [])
        category = None
        for edge in categories:
            if edge["node"]["slug"] == "mtg-singles":
                category = edge["node"]
                break

        if not category:
            raise Exception("Category 'mtg-singles' not found")

        # Build attribute map
        attribute_map = {}
        for attr in product_type.get("productAttributes", []):
            attribute_map[attr["slug"]] = attr["id"]

        return SetupData(
            channel_id=channel["id"],
            product_type_id=product_type["id"],
            category_id=category["id"],
            attribute_map=attribute_map,
        )

    def product_exists(self, external_ref: str) -> Optional[str]:
        """Check if product exists by external reference, return ID if exists."""
        try:
            data = self.execute(CHECK_PRODUCT_EXISTS, {"externalRef": external_ref})
            product = data.get("product")
            return product["id"] if product else None
        except Exception:
            return None


# =============================================================================
# Card Transformation
# =============================================================================

def transform_card_to_product(
    card: dict,
    setup: SetupData,
) -> dict:
    """Transform a Scryfall card to Saleor ProductBulkCreateInput."""

    scryfall_id = card.get("id", "")
    name = card.get("name", "Unknown Card")

    # Build slug from name and set
    set_code = card.get("set", "").lower()
    collector_num = card.get("collector_number", "")
    slug = f"{slugify(name)}-{set_code}-{collector_num}"[:255]

    # Build attributes
    attributes = []

    # Map Scryfall fields to Saleor attributes
    field_mapping = [
        ("id", "mtg-scryfall-id"),
        ("oracle_id", "mtg-oracle-id"),
        ("tcgplayer_id", "mtg-tcgplayer-id"),
        ("rarity", "mtg-rarity"),
        ("type_line", "mtg-type-line"),
        ("mana_cost", "mtg-mana-cost"),
        ("cmc", "mtg-mana-value"),
        ("set", "mtg-set-code"),
        ("set_name", "mtg-set-name"),
        ("artist", "mtg-artist"),
        ("collector_number", "mtg-collector-number"),
        ("power", "mtg-power"),
        ("toughness", "mtg-toughness"),
    ]

    for scryfall_field, attr_slug in field_mapping:
        value = card.get(scryfall_field)
        if value is not None and attr_slug in setup.attribute_map:
            # Convert to string for text attributes
            str_value = str(value) if not isinstance(value, str) else value
            if str_value:  # Only add non-empty values
                attributes.append({
                    "id": setup.attribute_map[attr_slug],
                    "values": [str_value],
                })

    # Build description from oracle text
    oracle_text = card.get("oracle_text", "")
    flavor_text = card.get("flavor_text", "")
    description_parts = []
    if oracle_text:
        description_parts.append(oracle_text)
    if flavor_text:
        description_parts.append(f"*{flavor_text}*")

    description_json = json.dumps({
        "blocks": [
            {"type": "paragraph", "data": {"text": part}}
            for part in description_parts
        ]
    }) if description_parts else None

    return {
        "productType": setup.product_type_id,
        "category": setup.category_id,
        "name": name,
        "slug": slug,
        "externalReference": scryfall_id,
        "description": description_json,
        "attributes": attributes,
        "channelListings": [{
            "channelId": setup.channel_id,
            "isPublished": True,
            "isAvailableForPurchase": True,
        }],
    }


def get_card_price(card: dict, finish: str) -> Optional[Decimal]:
    """Get the base price for a card in a specific finish."""
    prices = card.get("prices", {})

    price_keys = {
        "nonfoil": "usd",
        "foil": "usd_foil",
        "etched": "usd_etched",
    }

    key = price_keys.get(finish)
    if not key:
        return None

    price_str = prices.get(key)
    if not price_str:
        return None

    try:
        return Decimal(price_str)
    except Exception:
        return None


def transform_card_to_variants(
    card: dict,
    product_id: str,
    setup: SetupData,
) -> list[dict]:
    """Transform a Scryfall card to Saleor ProductVariantBulkCreateInput list."""

    scryfall_id = card.get("id", "")
    finishes_available = card.get("finishes", ["nonfoil"])

    variants = []

    for finish in finishes_available:
        if finish not in FINISHES:
            continue

        base_price = get_card_price(card, finish)
        if base_price is None:
            continue  # Skip finishes without prices

        for condition in CONDITIONS:
            multiplier = CONDITION_MULTIPLIERS[condition]
            price = (base_price * multiplier).quantize(Decimal("0.01"))

            # Build SKU: scryfall_id-CONDITION-FINISH
            finish_code = {"nonfoil": "NF", "foil": "F", "etched": "E"}.get(finish, "NF")
            sku = f"{scryfall_id}-{condition}-{finish_code}"

            # Variant name
            name = f"{condition} - {finish.title()}"

            variants.append({
                "sku": sku,
                "name": name,
                "trackInventory": True,
                "channelListings": [{
                    "channelId": setup.channel_id,
                    "price": str(price),
                }],
                "stocks": [],  # No initial stock
            })

    return variants


def slugify(text: str) -> str:
    """Simple slugify function."""
    import re
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = text.strip('-')
    return text[:200]


# =============================================================================
# Import Logic
# =============================================================================

def load_progress() -> dict:
    """Load progress from checkpoint file."""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"last_index": 0, "processed_ids": []}


def save_progress(index: int, processed_ids: list[str]):
    """Save progress to checkpoint file."""
    with open(PROGRESS_FILE, "w") as f:
        json.dump({
            "last_index": index,
            "processed_ids": processed_ids[-1000:],  # Keep last 1000
            "timestamp": time.time(),
        }, f)


def import_cards(
    client: SaleorClient,
    cards: list[dict],
    setup: SetupData,
    stats: ImportStats,
    batch_size: int = BATCH_SIZE,
    dry_run: bool = False,
    resume: bool = False,
    verbose: bool = False,
) -> None:
    """Import cards using GraphQL bulk mutations."""

    # Load progress if resuming
    progress = load_progress() if resume else {"last_index": 0, "processed_ids": []}
    start_index = progress["last_index"]
    processed_ids = set(progress.get("processed_ids", []))

    total = len(cards)
    print(f"Importing {total - start_index} cards (starting from index {start_index})")

    for i in range(start_index, total, batch_size):
        batch = cards[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total + batch_size - 1) // batch_size

        print(f"\nBatch {batch_num}/{total_batches} (cards {i+1}-{min(i+batch_size, total)})")

        # Process each card in the batch
        for card in batch:
            scryfall_id = card.get("id", "")

            # Skip if already processed
            if scryfall_id in processed_ids:
                stats.products_skipped += 1
                continue

            # Check if product already exists
            existing_id = client.product_exists(scryfall_id)
            if existing_id:
                if verbose:
                    print(f"  Skipping {card.get('name')} (already exists)")
                stats.products_skipped += 1
                processed_ids.add(scryfall_id)
                continue

            # Transform card to product input
            product_input = transform_card_to_product(card, setup)

            if dry_run:
                print(f"  [DRY RUN] Would create: {product_input['name']}")
                stats.products_created += 1
                continue

            try:
                # Create product
                result = client.execute(PRODUCT_BULK_CREATE, {
                    "products": [product_input]
                })

                bulk_result = result.get("productBulkCreate", {})
                results = bulk_result.get("results", [])

                if results and results[0].get("product"):
                    product = results[0]["product"]
                    product_id = product["id"]
                    stats.products_created += 1

                    if verbose:
                        print(f"  Created: {product['name']} ({product_id})")

                    # Create variants
                    variant_inputs = transform_card_to_variants(card, product_id, setup)
                    if variant_inputs:
                        var_result = client.execute(PRODUCT_VARIANT_BULK_CREATE, {
                            "productId": product_id,
                            "variants": variant_inputs,
                        })

                        var_bulk = var_result.get("productVariantBulkCreate", {})
                        var_count = var_bulk.get("count", 0)
                        stats.variants_created += var_count

                        if verbose:
                            print(f"    Created {var_count} variants")

                    processed_ids.add(scryfall_id)

                else:
                    errors = results[0].get("errors", []) if results else bulk_result.get("errors", [])
                    print(f"  ERROR creating {product_input['name']}: {errors}")
                    stats.products_failed += 1

            except Exception as e:
                print(f"  EXCEPTION creating {product_input.get('name', 'unknown')}: {e}")
                stats.products_failed += 1

        # Save progress after each batch
        save_progress(i + len(batch), list(processed_ids))

        # Print progress
        print(f"  Progress: {stats.summary()}")

        # Small delay to avoid rate limiting
        time.sleep(0.5)


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Import MTG cards from Scryfall JSON using Saleor GraphQL API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("json_file", type=str, help="Path to Scryfall JSON file")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Saleor GraphQL URL")
    parser.add_argument("--token", default=os.getenv("SALEOR_API_TOKEN", ""), help="API token")
    parser.add_argument("--channel", default=DEFAULT_CHANNEL, help="Channel slug")
    parser.add_argument("--limit", type=int, default=0, help="Limit cards to import (0=all)")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help="Batch size")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually create anything")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # Validate inputs
    json_path = Path(args.json_file)
    if not json_path.exists():
        print(f"ERROR: File not found: {json_path}")
        sys.exit(1)

    if not args.token and not args.dry_run:
        print("ERROR: API token required (set SALEOR_API_TOKEN or use --token)")
        print("  Get a token from Saleor Dashboard > Configuration > Access Tokens")
        sys.exit(1)

    print("=" * 60)
    print("MTG Scryfall Import (GraphQL)")
    print("=" * 60)
    print(f"Source: {json_path}")
    print(f"API URL: {args.api_url}")
    print(f"Channel: {args.channel}")
    print(f"Batch size: {args.batch_size}")
    print(f"Dry run: {args.dry_run}")
    print(f"Resume: {args.resume}")

    # Initialize client
    client = SaleorClient(args.api_url, args.token)

    # Fetch setup data
    print("\nFetching setup data...")
    try:
        setup = client.fetch_setup(args.channel)
        print(f"  Channel ID: {setup.channel_id}")
        print(f"  Product Type ID: {setup.product_type_id}")
        print(f"  Category ID: {setup.category_id}")
        print(f"  Attributes: {len(setup.attribute_map)}")
    except Exception as e:
        print(f"ERROR fetching setup: {e}")
        if not args.dry_run:
            sys.exit(1)
        # For dry run, create dummy setup
        setup = SetupData(
            channel_id="dummy",
            product_type_id="dummy",
            category_id="dummy",
            attribute_map={},
        )

    # Load cards
    print(f"\nLoading {json_path}...")
    with open(json_path) as f:
        all_cards = json.load(f)

    print(f"Total cards in file: {len(all_cards):,}")

    # Filter English paper cards
    cards = [
        c for c in all_cards
        if c.get("lang") == "en"
        and c.get("layout") not in ["art_series", "token", "double_faced_token", "emblem"]
        and not c.get("digital", False)
    ]
    print(f"English paper cards: {len(cards):,}")

    # Apply limit
    if args.limit > 0:
        cards = cards[:args.limit]
        print(f"Limited to: {len(cards):,}")

    # Initialize stats
    stats = ImportStats()
    stats.start_time = time.time()

    # Run import
    print("\n" + "-" * 60)
    import_cards(
        client=client,
        cards=cards,
        setup=setup,
        stats=stats,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
        resume=args.resume,
        verbose=args.verbose,
    )

    # Final summary
    print("\n" + "=" * 60)
    print("Import Complete")
    print("=" * 60)
    print(stats.summary())

    if args.dry_run:
        print("\n[DRY RUN] No changes were made")


if __name__ == "__main__":
    main()
