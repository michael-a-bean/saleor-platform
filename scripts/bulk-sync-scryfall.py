#!/usr/bin/env python3
"""
Bulk sync Scryfall attributes to Saleor products using Scryfall's bulk data API.

This is much faster than individual API calls - downloads all card data once,
then batch updates products.

Usage:
    python scripts/bulk-sync-scryfall.py [--dry-run] [--batch-size N]
"""

import requests
import json
import argparse
import sys
import time
from typing import Optional
from pathlib import Path

SALEOR_API = "http://localhost:8000/graphql/"
SCRYFALL_BULK_API = "https://api.scryfall.com/bulk-data"
CACHE_DIR = Path("/tmp/scryfall-cache")

# Attributes to sync from Scryfall
SCRYFALL_ATTRIBUTES = {
    "mtg-oracle-text": {"input_type": "RICH_TEXT", "field": "oracle_text"},
    "mtg-flavor-text": {"input_type": "RICH_TEXT", "field": "flavor_text"},
    "mtg-keywords": {"input_type": "PLAIN_TEXT", "field": "keywords"},
    "mtg-colors": {"input_type": "PLAIN_TEXT", "field": "colors"},
    "mtg-legalities": {"input_type": "RICH_TEXT", "field": "legalities"},
    "mtg-layout": {"input_type": "DROPDOWN", "field": "layout"},
    "mtg-frame": {"input_type": "DROPDOWN", "field": "frame"},
    "mtg-border-color": {"input_type": "DROPDOWN", "field": "border_color"},
    "mtg-set-type": {"input_type": "DROPDOWN", "field": "set_type"},
    "mtg-released-at": {"input_type": "DATE", "field": "released_at"},
    "mtg-lang": {"input_type": "DROPDOWN", "field": "lang"},
    "mtg-is-foil": {"input_type": "BOOLEAN", "field": "foil"},
    "mtg-is-nonfoil": {"input_type": "BOOLEAN", "field": "nonfoil"},
    "mtg-is-oversized": {"input_type": "BOOLEAN", "field": "oversized"},
    "mtg-is-textless": {"input_type": "BOOLEAN", "field": "textless"},
    "mtg-is-variation": {"input_type": "BOOLEAN", "field": "variation"},
    "mtg-is-story-spotlight": {"input_type": "BOOLEAN", "field": "story_spotlight"},
    "mtg-in-booster": {"input_type": "BOOLEAN", "field": "booster"},
    "mtg-illustration-id": {"input_type": "PLAIN_TEXT", "field": "illustration_id"},
    "mtg-multiverse-ids": {"input_type": "PLAIN_TEXT", "field": "multiverse_ids"},
    "mtg-edhrec-rank": {"input_type": "NUMERIC", "field": "edhrec_rank"},
    "mtg-penny-rank": {"input_type": "NUMERIC", "field": "penny_rank"},
    "mtg-image-uri": {"input_type": "PLAIN_TEXT", "field": "image_uris.normal"},
    "mtg-art-crop-uri": {"input_type": "PLAIN_TEXT", "field": "image_uris.art_crop"},
}


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


def download_bulk_data() -> dict:
    """Download Scryfall bulk data and return as dict keyed by scryfall_id."""
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / "default_cards.json"

    # Check if we have a recent cache (less than 24 hours old)
    if cache_file.exists():
        age_hours = (time.time() - cache_file.stat().st_mtime) / 3600
        if age_hours < 24:
            print(f"  Using cached bulk data ({age_hours:.1f} hours old)")
            with open(cache_file) as f:
                cards = json.load(f)
            return {card["id"]: card for card in cards}

    # Get the bulk data URL
    print("  Fetching bulk data info from Scryfall...")
    bulk_info = requests.get(SCRYFALL_BULK_API).json()

    # Find the "default_cards" dataset (includes all cards)
    default_cards = next(
        (d for d in bulk_info["data"] if d["type"] == "default_cards"),
        None
    )

    if not default_cards:
        raise Exception("Could not find default_cards bulk data")

    download_url = default_cards["download_uri"]
    print(f"  Downloading bulk data (~180MB)...")
    print(f"  URL: {download_url}")

    # Stream download to avoid memory issues
    response = requests.get(download_url, stream=True)
    total_size = int(response.headers.get('content-length', 0))

    downloaded = 0
    chunks = []
    for chunk in response.iter_content(chunk_size=1024*1024):  # 1MB chunks
        chunks.append(chunk)
        downloaded += len(chunk)
        if total_size:
            pct = (downloaded / total_size) * 100
            print(f"\r  Downloaded: {downloaded/(1024*1024):.1f}MB / {total_size/(1024*1024):.1f}MB ({pct:.1f}%)", end="")

    print()

    # Parse JSON
    print("  Parsing JSON...")
    data = b"".join(chunks)
    cards = json.loads(data)

    # Cache for future use
    print(f"  Caching {len(cards)} cards...")
    with open(cache_file, "w") as f:
        json.dump(cards, f)

    # Build lookup dict
    return {card["id"]: card for card in cards}


def get_all_products_with_scryfall_id(token: str) -> list:
    """Get all products that have a scryfall ID."""
    query = """
    query GetProducts($first: Int!, $after: String) {
        products(first: $first, after: $after, channel: "webstore") {
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                    name
                    attributes {
                        attribute {
                            slug
                        }
                        values {
                            name
                        }
                    }
                }
            }
        }
    }
    """

    all_products = []
    cursor = None
    page = 0

    while True:
        page += 1
        variables = {"first": 100}
        if cursor:
            variables["after"] = cursor

        result = graphql_request(query, variables, token)

        if "errors" in result:
            print(f"  Error fetching products: {result['errors']}")
            break

        products_data = result.get("data", {}).get("products", {})

        for edge in products_data.get("edges", []):
            node = edge["node"]
            attrs = {}
            for attr in node.get("attributes", []):
                slug = attr["attribute"]["slug"]
                values = [v["name"] for v in attr.get("values", [])]
                attrs[slug] = values[0] if values else None

            if attrs.get("mtg-scryfall-id"):
                all_products.append({
                    "id": node["id"],
                    "name": node["name"],
                    "scryfall_id": attrs["mtg-scryfall-id"],
                })

        print(f"\r  Fetched {len(all_products)} products (page {page})...", end="")

        page_info = products_data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    print()
    return all_products


def get_attribute_ids(token: str) -> dict:
    """Get attribute IDs for all MTG attributes."""
    query = """
    query {
        attributes(first: 100, filter: {search: "mtg"}) {
            edges {
                node {
                    id
                    slug
                }
            }
        }
    }
    """
    result = graphql_request(query, token=token)
    return {
        edge["node"]["slug"]: edge["node"]["id"]
        for edge in result.get("data", {}).get("attributes", {}).get("edges", [])
    }


def get_nested_value(obj: dict, path: str):
    """Get a nested value from a dict using dot notation."""
    keys = path.split(".")
    value = obj
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
        else:
            return None
    return value


def format_value(value, input_type: str) -> Optional[str]:
    """Format a value for Saleor attribute."""
    if value is None:
        return None

    if isinstance(value, bool):
        return "Yes" if value else "No"
    elif isinstance(value, list):
        if not value:
            return None
        return ", ".join(str(v) for v in value)
    elif isinstance(value, dict):
        # For legalities
        return "\n".join(f"{k}: {v}" for k, v in value.items() if v != "not_legal")
    elif isinstance(value, (int, float)):
        return str(value)
    else:
        return str(value)


def build_attribute_input(slug: str, config: dict, value: str, attr_id: str) -> dict:
    """Build the attribute input for Saleor mutation."""
    input_type = config["input_type"]
    attr_input = {"id": attr_id}

    if input_type == "RICH_TEXT":
        rich_text_json = json.dumps({
            "time": 0,
            "blocks": [{"type": "paragraph", "data": {"text": value}}],
            "version": "2.22.2"
        })
        attr_input["richText"] = rich_text_json
    elif input_type == "PLAIN_TEXT":
        attr_input["plainText"] = value
    elif input_type == "BOOLEAN":
        attr_input["boolean"] = value == "Yes"
    elif input_type == "NUMERIC":
        attr_input["numeric"] = value
    elif input_type == "DATE":
        attr_input["date"] = value
    else:
        attr_input["values"] = [value]

    return attr_input


def update_products_batch(products: list, cards_by_id: dict, attr_id_map: dict, token: str, dry_run: bool) -> int:
    """Update a batch of products."""
    updated = 0

    for product in products:
        scryfall_id = product["scryfall_id"]
        card = cards_by_id.get(scryfall_id)

        if not card:
            continue

        # Build attribute updates
        attr_updates = []
        for slug, config in SCRYFALL_ATTRIBUTES.items():
            if slug not in attr_id_map:
                continue

            value = get_nested_value(card, config["field"])
            formatted = format_value(value, config["input_type"])

            if formatted:
                attr_input = build_attribute_input(slug, config, formatted, attr_id_map[slug])
                attr_updates.append(attr_input)

        if not attr_updates:
            continue

        if dry_run:
            updated += 1
            continue

        # Update product
        mutation = """
        mutation UpdateProduct($id: ID!, $input: ProductInput!) {
            productUpdate(id: $id, input: $input) {
                errors { field message }
            }
        }
        """

        result = graphql_request(mutation, {
            "id": product["id"],
            "input": {"attributes": attr_updates}
        }, token)

        if result.get("data", {}).get("productUpdate", {}).get("errors"):
            print(f"\n  Error updating {product['name']}: {result['data']['productUpdate']['errors']}")
        else:
            updated += 1

    return updated


def main():
    parser = argparse.ArgumentParser(description="Bulk sync Scryfall attributes to Saleor")
    parser.add_argument("--dry-run", action="store_true", help="Don't make any changes")
    parser.add_argument("--batch-size", type=int, default=50, help="Products per batch (default: 50)")
    parser.add_argument("--limit", type=int, default=0, help="Limit total products (0 = all)")
    args = parser.parse_args()

    print("=== Bulk Scryfall Attribute Sync ===")
    print()

    # Step 1: Download bulk data
    print("Step 1: Download Scryfall bulk data")
    cards_by_id = download_bulk_data()
    print(f"  Loaded {len(cards_by_id)} cards")
    print()

    # Step 2: Get auth token
    print("Step 2: Authenticate with Saleor")
    token = get_auth_token()
    token_time = time.time()
    print("  Authenticated successfully")
    print()

    # Step 3: Get attribute IDs
    print("Step 3: Get attribute IDs")
    attr_id_map = get_attribute_ids(token)
    print(f"  Found {len(attr_id_map)} MTG attributes")
    print()

    # Step 4: Get all products with scryfall IDs
    print("Step 4: Fetch products with Scryfall IDs")
    products = get_all_products_with_scryfall_id(token)
    print(f"  Found {len(products)} products with Scryfall IDs")
    print()

    if args.limit > 0:
        products = products[:args.limit]
        print(f"  Limited to {len(products)} products")

    # Step 5: Update products in batches
    print("Step 5: Update products")
    print(f"  Batch size: {args.batch_size}")
    print(f"  Dry run: {args.dry_run}")
    print()

    total_updated = 0
    total_processed = 0

    for i in range(0, len(products), args.batch_size):
        batch = products[i:i + args.batch_size]
        total_processed += len(batch)

        # Refresh token if needed (every 4 minutes to be safe)
        if time.time() - token_time > 240:
            print("\n  Refreshing auth token...")
            token = get_auth_token()
            token_time = time.time()

        updated = update_products_batch(batch, cards_by_id, attr_id_map, token, args.dry_run)
        total_updated += updated

        pct = (total_processed / len(products)) * 100
        print(f"\r  Progress: {total_processed}/{len(products)} ({pct:.1f}%) - Updated: {total_updated}", end="")

    print()
    print()
    print(f"Done! Updated {total_updated} of {total_processed} products")


if __name__ == "__main__":
    main()
