"""
Bulk Price Sync Script for MTG Cards

This script populates initial prices for all MTG card variants from Scryfall bulk data.
It supports the new finish-aware variant structure:
- Non-Foil (NF): uses prices.usd
- Foil (F): uses prices.usd_foil
- Etched (E): uses prices.usd_etched

Prices are adjusted by condition multipliers:
- NM: 1.0
- LP: 0.9
- MP: 0.75
- HP: 0.5
- DMG: 0.25

Prerequisites:
- Scryfall bulk data file (all-cards.json or default-cards.json)
- Saleor API running (for variant lookup)
- inventory-ops database accessible

Usage:
    python bulk_price_sync.py scryfall.json --installation-id <id> [--channel-id <id>] [--dry-run] [--limit N]
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

import psycopg2
from psycopg2.extras import execute_batch
import requests

# Configuration
SALEOR_API_URL = os.getenv("SALEOR_API_URL", "http://localhost:8000/graphql/")
SALEOR_TOKEN = os.getenv("SALEOR_TOKEN", "")

# Condition multipliers (must match inventory-ops/price-sync)
CONDITION_MULTIPLIERS = {
    "NM": 1.0,
    "LP": 0.9,
    "MP": 0.75,
    "HP": 0.5,
    "DMG": 0.25,
}

# Finish to price key mapping
FINISH_PRICE_KEYS = {
    "NF": "usd",
    "F": "usd_foil",
    "E": "usd_etched",
}

PROGRESS_FILE = Path("/tmp/bulk_price_sync_progress.json")
DEFAULT_BATCH_SIZE = 500


def parse_sku(sku: str) -> Optional[dict]:
    """
    Parse a variant SKU to extract Scryfall ID, condition, and finish.
    SKU format: {scryfall-uuid}-{condition}-{finish}
    """
    import re
    match = re.match(r'^(.+)-(NM|LP|MP|HP|DMG)-(NF|F|E)$', sku)
    if not match:
        return None
    return {
        "scryfall_id": match.group(1),
        "condition": match.group(2),
        "finish": match.group(3),
    }


def get_mtg_product_type_id() -> Optional[str]:
    """Get the MTG card product type ID from Saleor."""
    query = """
    query {
      productTypes(first: 50) {
        edges {
          node {
            id
            slug
          }
        }
      }
    }
    """

    headers = {"Content-Type": "application/json"}
    if SALEOR_TOKEN:
        headers["Authorization"] = f"Bearer {SALEOR_TOKEN}"

    try:
        response = requests.post(
            SALEOR_API_URL,
            json={"query": query},
            headers=headers,
        )
        data = response.json()
        for edge in data.get("data", {}).get("productTypes", {}).get("edges", []):
            if edge["node"]["slug"] == "mtg-card":
                return edge["node"]["id"]
    except Exception as e:
        print(f"Error getting product type: {e}")
    return None


def load_scryfall_data(json_path: Path) -> dict:
    """Load Scryfall bulk data and index by ID."""
    print(f"Loading Scryfall data from {json_path}...")
    start = time.time()

    with open(json_path, 'r', encoding='utf-8') as f:
        cards = json.load(f)

    # Index by ID for fast lookup
    card_index = {}
    for card in cards:
        card_index[card['id']] = card

    elapsed = time.time() - start
    print(f"Loaded {len(card_index)} cards in {elapsed:.1f}s")
    return card_index


def get_saleor_variants(channel_slug: str = "default-channel", limit: int = 0, product_type_id: str = None) -> list:
    """
    Query Saleor GraphQL API for all MTG card variants.
    Returns list of (variant_id, sku, channel_id) tuples.
    """
    # First, get the product type ID if not provided
    if not product_type_id:
        product_type_id = get_mtg_product_type_id()
        if not product_type_id:
            print("Error: Could not find MTG product type")
            return [], None

    query = """
    query GetMTGVariants($first: Int!, $after: String, $channel: String!, $productTypeId: ID!) {
      products(
        first: $first
        after: $after
        filter: { productTypes: [$productTypeId] }
        channel: $channel
      ) {
        edges {
          node {
            id
            variants {
              id
              sku
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      channel(slug: $channel) {
        id
      }
    }
    """

    variants = []
    channel_id = None
    after = None
    page = 0
    batch_size = 100

    headers = {
        "Content-Type": "application/json",
    }
    if SALEOR_TOKEN:
        headers["Authorization"] = f"Bearer {SALEOR_TOKEN}"

    print(f"Fetching variants from Saleor (channel: {channel_slug})...")

    while True:
        page += 1
        response = requests.post(
            SALEOR_API_URL,
            json={
                "query": query,
                "variables": {
                    "first": batch_size,
                    "after": after,
                    "channel": channel_slug,
                    "productTypeId": product_type_id,
                }
            },
            headers=headers,
        )

        if response.status_code != 200:
            print(f"Error: {response.status_code} - {response.text}")
            break

        data = response.json()
        if "errors" in data:
            print(f"GraphQL errors: {data['errors']}")
            break

        products_data = data["data"]["products"]

        # Get channel ID on first request
        if channel_id is None and data["data"]["channel"]:
            channel_id = data["data"]["channel"]["id"]

        for edge in products_data["edges"]:
            product = edge["node"]
            for variant in product["variants"]:
                if variant["sku"]:
                    variants.append({
                        "variant_id": variant["id"],
                        "sku": variant["sku"],
                    })

        print(f"  Page {page}: {len(variants)} variants so far...")

        if not products_data["pageInfo"]["hasNextPage"]:
            break
        after = products_data["pageInfo"]["endCursor"]

        if limit and len(variants) >= limit:
            variants = variants[:limit]
            break

    print(f"Found {len(variants)} variants total")
    return variants, channel_id


def calculate_price(card: dict, finish: str, condition: str) -> Optional[Decimal]:
    """Calculate the price for a specific finish and condition."""
    price_key = FINISH_PRICE_KEYS.get(finish)
    if not price_key:
        return None

    prices = card.get("prices", {})
    raw_price = prices.get(price_key)

    if not raw_price:
        return None

    try:
        base_price = Decimal(raw_price)
    except:
        return None

    multiplier = Decimal(str(CONDITION_MULTIPLIERS.get(condition, 1.0)))
    final_price = base_price * multiplier

    # Round to 4 decimal places (matching schema)
    return final_price.quantize(Decimal("0.0001"))


def get_scryfall_uri(card: dict) -> str:
    """Get the Scryfall URI for a card."""
    return card.get("scryfall_uri", f"https://scryfall.com/card/{card.get('set', 'unknown')}/{card.get('collector_number', '0')}")


def save_progress(processed: int, skipped: int, errors: int, last_index: int):
    """Save progress to file for resume capability."""
    progress = {
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "last_index": last_index,
        "timestamp": datetime.now().isoformat(),
    }
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)


def load_progress() -> dict:
    """Load progress from file."""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"processed": 0, "skipped": 0, "errors": 0, "last_index": 0}


def main():
    parser = argparse.ArgumentParser(description="Bulk price sync from Scryfall data")
    parser.add_argument("scryfall_json", type=str, help="Path to Scryfall bulk JSON file")
    parser.add_argument("--installation-id", type=str, required=True, help="Saleor app installation ID")
    parser.add_argument("--channel-slug", type=str, default="default-channel", help="Saleor channel slug")
    parser.add_argument("--db-url", type=str,
                       default=os.getenv("INVENTORY_OPS_DB_URL", "postgresql://inventory:inventory@localhost:5433/inventory_ops"),
                       help="inventory-ops database URL")
    parser.add_argument("--resume", action="store_true", help="Resume from last progress")
    parser.add_argument("--limit", type=int, default=0, help="Limit variants to process")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Batch size for DB inserts")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    args = parser.parse_args()

    scryfall_path = Path(args.scryfall_json)
    if not scryfall_path.exists():
        print(f"Error: Scryfall file not found: {scryfall_path}")
        sys.exit(1)

    # Load Scryfall data
    card_index = load_scryfall_data(scryfall_path)

    # Get variants from Saleor
    variants, channel_id = get_saleor_variants(args.channel_slug, args.limit)

    if not variants:
        print("No variants found!")
        sys.exit(1)

    if not channel_id:
        print("Warning: Could not get channel ID, using placeholder")
        channel_id = "unknown"

    # Load progress if resuming
    progress = load_progress() if args.resume else {"processed": 0, "skipped": 0, "errors": 0, "last_index": 0}
    start_index = progress["last_index"] if args.resume else 0

    if args.resume and start_index > 0:
        print(f"Resuming from index {start_index}")
        variants = variants[start_index:]

    # Connect to database
    if not args.dry_run:
        try:
            conn = psycopg2.connect(args.db_url)
            cursor = conn.cursor()
        except Exception as e:
            print(f"Database connection failed: {e}")
            sys.exit(1)

    stats = {
        "processed": progress["processed"],
        "skipped": progress["skipped"],
        "errors": progress["errors"],
        "created": 0,
        "no_price": 0,
        "no_card": 0,
        "invalid_sku": 0,
    }

    batch = []
    batch_count = 0

    print(f"\nProcessing {len(variants)} variants...")
    start_time = time.time()

    try:
        for i, variant in enumerate(variants):
            sku = variant["sku"]
            variant_id = variant["variant_id"]

            # Parse SKU
            parsed = parse_sku(sku)
            if not parsed:
                stats["invalid_sku"] += 1
                continue

            scryfall_id = parsed["scryfall_id"]
            condition = parsed["condition"]
            finish = parsed["finish"]

            # Find card in Scryfall data
            card = card_index.get(scryfall_id)
            if not card:
                stats["no_card"] += 1
                continue

            # Calculate price
            price = calculate_price(card, finish, condition)
            if price is None:
                stats["no_price"] += 1
                continue

            # Calculate base price (NM price)
            base_price = calculate_price(card, finish, "NM")

            # Get source URL
            source_url = get_scryfall_uri(card)

            if args.dry_run:
                if stats["created"] < 5:
                    print(f"  Would create: {sku} -> ${price} ({finish}/{condition})")
                stats["created"] += 1
            else:
                # Add to batch
                batch.append((
                    args.installation_id,
                    variant_id,
                    channel_id,
                    sku,
                    finish,
                    condition,
                    price,
                    base_price,
                    "USD",
                    "scryfall",
                    source_url,
                ))

                if len(batch) >= args.batch_size:
                    # Insert batch
                    insert_query = """
                        INSERT INTO "SellPriceSnapshot" (
                            id, "installationId", "saleorVariantId", "saleorChannelId",
                            "variantSku", finish, condition,
                            "currentPrice", "basePrice", currency,
                            source, "sourceUrl", "snapshotAt"
                        ) VALUES (
                            gen_random_uuid(), %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, NOW()
                        )
                        ON CONFLICT DO NOTHING
                    """
                    execute_batch(cursor, insert_query, batch, page_size=args.batch_size)
                    conn.commit()
                    stats["created"] += len(batch)
                    batch = []
                    batch_count += 1

            stats["processed"] += 1

            # Progress update
            if stats["processed"] % 10000 == 0:
                elapsed = time.time() - start_time
                rate = stats["processed"] / elapsed if elapsed > 0 else 0
                print(f"  Processed: {stats['processed']}, Created: {stats['created']}, "
                      f"Rate: {rate:.1f}/s, Elapsed: {elapsed:.1f}s")
                if not args.dry_run:
                    save_progress(stats["processed"], stats["skipped"], stats["errors"],
                                 start_index + i + 1)

        # Insert remaining batch
        if batch and not args.dry_run:
            insert_query = """
                INSERT INTO "SellPriceSnapshot" (
                    id, "installationId", "saleorVariantId", "saleorChannelId",
                    "variantSku", finish, condition,
                    "currentPrice", "basePrice", currency,
                    source, "sourceUrl", "snapshotAt"
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, NOW()
                )
                ON CONFLICT DO NOTHING
            """
            execute_batch(cursor, insert_query, batch, page_size=len(batch))
            conn.commit()
            stats["created"] += len(batch)

    except KeyboardInterrupt:
        print("\nInterrupted! Saving progress...")
        if not args.dry_run:
            conn.commit()
            save_progress(stats["processed"], stats["skipped"], stats["errors"],
                         start_index + stats["processed"])
    finally:
        if not args.dry_run:
            cursor.close()
            conn.close()

    # Final stats
    elapsed = time.time() - start_time
    print("\n" + "=" * 50)
    print("BULK PRICE SYNC COMPLETE")
    print("=" * 50)
    print(f"Processed:   {stats['processed']}")
    print(f"Created:     {stats['created']}")
    print(f"No price:    {stats['no_price']}")
    print(f"No card:     {stats['no_card']}")
    print(f"Invalid SKU: {stats['invalid_sku']}")
    print(f"Duration:    {elapsed:.1f}s")
    print(f"Rate:        {stats['processed']/elapsed:.1f} variants/s" if elapsed > 0 else "")

    if args.dry_run:
        print("\n[DRY RUN - no changes made]")


if __name__ == "__main__":
    main()
