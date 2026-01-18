#!/usr/bin/env python3
"""
Delta sync: Only sync products modified since last run.

Uses Saleor's updatedAt field and compares against Meilisearch last_indexed_at.
Much faster than full sync for incremental updates.

Usage:
    python scripts/meilisearch-delta-sync.py --channel webstore [--since 2024-01-01T00:00:00]

Examples:
    # Auto-detect last sync time and sync changes
    python scripts/meilisearch-delta-sync.py --channel webstore

    # Sync all changes since specific time
    python scripts/meilisearch-delta-sync.py --channel webstore --since 2026-01-17T00:00:00

    # Sync last 24 hours
    python scripts/meilisearch-delta-sync.py --channel webstore --hours 24

Environment Variables:
    SALEOR_ADMIN_EMAIL     (required) Admin user email for API authentication
    SALEOR_ADMIN_PASSWORD  (required) Admin user password for API authentication
"""

import requests
import argparse
import sys
import os
import time
import base64
from datetime import datetime, timedelta
from typing import Optional

SALEOR_API = os.environ.get("SALEOR_API_URL", "http://localhost:8000/graphql/")
MEILISEARCH_URL = os.environ.get("MEILISEARCH_URL", "http://localhost:7700")
SALEOR_ADMIN_EMAIL = os.environ.get("SALEOR_ADMIN_EMAIL")
SALEOR_ADMIN_PASSWORD = os.environ.get("SALEOR_ADMIN_PASSWORD")


def decode_saleor_id(graphql_id: str) -> str:
    """Convert Saleor GraphQL ID to Meilisearch-compatible ID."""
    try:
        decoded = base64.b64decode(graphql_id).decode('utf-8')
        return decoded.replace(':', '_')
    except Exception:
        return graphql_id.replace('=', '').replace('+', '-').replace('/', '_')


def get_auth_token() -> str:
    """Get authentication token from Saleor."""
    if not SALEOR_ADMIN_EMAIL or not SALEOR_ADMIN_PASSWORD:
        raise Exception(
            "Missing Saleor admin credentials.\n"
            "Set environment variables:\n"
            "  export SALEOR_ADMIN_EMAIL='your-admin@email.com'\n"
            "  export SALEOR_ADMIN_PASSWORD='your-password'"
        )

    mutation = """
    mutation TokenCreate($email: String!, $password: String!) {
        tokenCreate(email: $email, password: $password) {
            token
            errors { field message }
        }
    }
    """
    response = requests.post(
        SALEOR_API,
        json={
            "query": mutation,
            "variables": {"email": SALEOR_ADMIN_EMAIL, "password": SALEOR_ADMIN_PASSWORD}
        },
        headers={"Content-Type": "application/json"},
        timeout=30
    )
    data = response.json()
    token_data = data.get("data", {}).get("tokenCreate", {})

    if token_data.get("errors"):
        raise Exception(f"Auth failed: {token_data['errors']}")

    return token_data.get("token")


def get_last_sync_time(index_name: str) -> Optional[str]:
    """Get the most recent last_indexed_at from Meilisearch."""
    try:
        response = requests.post(
            f"{MEILISEARCH_URL}/indexes/{index_name}/search",
            json={
                "q": "",
                "limit": 1,
                "sort": ["last_indexed_at:desc"],
                "attributesToRetrieve": ["last_indexed_at"]
            },
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            hits = data.get("hits", [])
            if hits and hits[0].get("last_indexed_at"):
                return hits[0]["last_indexed_at"]
    except Exception as e:
        print(f"Warning: Could not get last sync time: {e}")
    return None


def get_attribute_value(attributes: list, slug: str) -> Optional[str]:
    """Extract attribute value by slug."""
    for attr in attributes or []:
        if attr.get("attribute", {}).get("slug") == slug:
            values = attr.get("values", [])
            if values:
                return values[0].get("name")
    return None


def fetch_modified_products(token: str, channel: str, since: str) -> list:
    """Fetch products modified since timestamp."""
    query = """
    query($channel: String!, $after: String) {
        products(
            first: 100
            after: $after
            channel: $channel
            filter: { isPublished: true }
        ) {
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                    name
                    slug
                    updatedAt
                    thumbnail { url }
                    media { url alt }
                    attributes {
                        attribute { slug }
                        values { name slug }
                    }
                    variants {
                        id
                        sku
                        name
                        quantityAvailable
                        attributes {
                            attribute { slug }
                            values { name slug }
                        }
                        pricing {
                            price {
                                gross { amount currency }
                            }
                        }
                    }
                }
            }
        }
    }
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    modified_products = []
    after = None
    page = 0
    since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))

    print(f"Fetching products modified since {since}...")

    while True:
        page += 1
        response = requests.post(
            SALEOR_API,
            json={"query": query, "variables": {"channel": channel, "after": after}},
            headers=headers,
            timeout=60
        )
        data = response.json()

        if "errors" in data:
            print(f"GraphQL errors: {data['errors']}")
            break

        products_data = data.get("data", {}).get("products", {})

        for edge in products_data.get("edges", []):
            product = edge["node"]
            updated_at = product.get("updatedAt")

            if updated_at:
                try:
                    product_dt = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                    if product_dt >= since_dt:
                        modified_products.append(product)
                except ValueError:
                    # If we can't parse the date, include it to be safe
                    modified_products.append(product)

        if page % 10 == 0:
            print(f"  Page {page}: found {len(modified_products)} modified products")

        if not products_data.get("pageInfo", {}).get("hasNextPage"):
            break
        after = products_data["pageInfo"]["endCursor"]

    return modified_products


def transform_product(product: dict) -> dict:
    """Transform Saleor product to Meilisearch document (same as sync-meilisearch.py)."""
    attrs = product.get("attributes", [])

    set_name = get_attribute_value(attrs, "mtg-set-name") or ""
    set_code = get_attribute_value(attrs, "mtg-set-code") or ""
    collector_number = get_attribute_value(attrs, "mtg-collector-number") or ""
    rarity = get_attribute_value(attrs, "mtg-rarity") or ""
    colors = get_attribute_value(attrs, "mtg-colors") or ""
    mana_cost = get_attribute_value(attrs, "mtg-mana-cost") or ""
    type_line = get_attribute_value(attrs, "mtg-type-line") or ""
    oracle_text = get_attribute_value(attrs, "mtg-oracle-text") or ""
    mana_value_raw = get_attribute_value(attrs, "mtg-mana-value")
    mana_value = int(float(mana_value_raw)) if mana_value_raw else 0
    color_identity = get_attribute_value(attrs, "mtg-color-identity") or ""
    keywords = get_attribute_value(attrs, "mtg-keywords") or ""

    variants = []
    min_price = None
    total_stock = 0
    conditions_available = set()
    finishes_available = set()

    for variant in product.get("variants", []):
        var_attrs = variant.get("attributes", [])
        condition = get_attribute_value(var_attrs, "mtg-condition") or "Near Mint"
        finish = get_attribute_value(var_attrs, "mtg-finish") or "Non-Foil"
        stock = variant.get("quantityAvailable", 0) or 0
        price_data = variant.get("pricing", {}).get("price", {}).get("gross", {})
        price = price_data.get("amount")

        conditions_available.add(condition)
        finishes_available.add(finish)

        if price and (min_price is None or price < min_price):
            min_price = price

        if stock > 0:
            total_stock += stock

        variants.append({
            "id": decode_saleor_id(variant["id"]),
            "original_id": variant["id"],
            "sku": variant.get("sku"),
            "condition": condition,
            "finish": finish,
            "stock": stock,
            "price": price,
        })

    name = product["name"]
    name_parts = name.lower().split()
    name_prefixes = []
    for word in name_parts:
        for i in range(3, len(word) + 1):
            name_prefixes.append(word[:i])

    return {
        "id": decode_saleor_id(product["id"]),
        "original_id": product["id"],
        "name": name,
        "name_lower": name.lower(),
        "name_parts": name_parts,
        "name_prefixes": name_prefixes,
        "slug": product["slug"],
        "thumbnail": (product.get("media") or [{}])[0].get("url") or (product.get("thumbnail") or {}).get("url"),
        "set_name": set_name,
        "set_code": set_code.upper() if set_code else "",
        "collector_number": collector_number,
        "rarity": rarity.lower() if rarity else "",
        "colors": colors,
        "mana_cost": mana_cost,
        "type_line": type_line,
        "oracle_text": oracle_text,
        "min_price": min_price,
        "total_stock": total_stock,
        "in_stock": total_stock > 0,
        "conditions_available": list(conditions_available),
        "finishes_available": list(finishes_available),
        "variants": variants,
        "mana_value": mana_value,
        "color_identity": [c.strip() for c in color_identity.split(",") if c.strip()] if color_identity else [],
        "keywords": [k.strip() for k in keywords.split(",") if k.strip()] if keywords else [],
        "searchable": f"{name} {set_name} {set_code} {type_line}".lower(),
        "last_indexed_at": datetime.utcnow().isoformat() + "Z",
        "saleor_updated_at": product.get("updatedAt"),
    }


def upload_to_meilisearch(documents: list, index_name: str) -> bool:
    """Upload documents to Meilisearch."""
    if not documents:
        return True

    print(f"Uploading {len(documents)} documents to Meilisearch...")

    response = requests.post(
        f"{MEILISEARCH_URL}/indexes/{index_name}/documents",
        json=documents,
        headers={"Content-Type": "application/json"},
        timeout=120
    )

    if response.status_code == 202:
        task_uid = response.json().get("taskUid")
        print(f"  Task queued: {task_uid}")

        # Wait for task completion
        start = time.time()
        while time.time() - start < 120:
            task_response = requests.get(f"{MEILISEARCH_URL}/tasks/{task_uid}")
            if task_response.status_code == 200:
                status = task_response.json().get("status")
                if status == "succeeded":
                    print("  Task completed successfully")
                    return True
                elif status == "failed":
                    print(f"  Task failed: {task_response.json().get('error')}")
                    return False
            time.sleep(0.5)
        print("  Task timed out")
        return False
    else:
        print(f"  Upload failed: {response.status_code} - {response.text}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Delta sync products to Meilisearch")
    parser.add_argument("--channel", default="webstore", help="Channel slug")
    parser.add_argument("--since", help="ISO timestamp, defaults to last sync time")
    parser.add_argument("--hours", type=int, help="Sync products modified in last N hours")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be synced without syncing")
    args = parser.parse_args()

    index_name = f"{args.channel}-products"

    print("=" * 60)
    print(f"Delta Sync: {args.channel}")
    print("=" * 60)
    print()

    # Determine the 'since' timestamp
    if args.hours:
        since = (datetime.utcnow() - timedelta(hours=args.hours)).isoformat() + "Z"
    elif args.since:
        since = args.since
    else:
        since = get_last_sync_time(index_name)
        if not since:
            # Default to 24 hours ago
            since = (datetime.utcnow() - timedelta(hours=24)).isoformat() + "Z"
            print(f"No last sync time found, defaulting to last 24 hours")

    print(f"Syncing products modified since: {since}")
    print()

    # Get auth token
    try:
        token = get_auth_token()
    except Exception as e:
        print(f"Authentication failed: {e}")
        sys.exit(1)

    # Fetch modified products
    modified = fetch_modified_products(token, args.channel, since)
    print()
    print(f"Found {len(modified)} modified products")

    if not modified:
        print("No products to sync")
        sys.exit(0)

    if args.dry_run:
        print()
        print("DRY RUN - Would sync these products:")
        for p in modified[:10]:
            print(f"  - {p['name']} (updated: {p.get('updatedAt')})")
        if len(modified) > 10:
            print(f"  ... and {len(modified) - 10} more")
        sys.exit(0)

    # Transform products
    print()
    print("Transforming products...")
    documents = [transform_product(p) for p in modified]

    # Upload to Meilisearch
    success = upload_to_meilisearch(documents, index_name)

    print()
    print("=" * 60)
    if success:
        print(f"✅ Delta sync complete: {len(documents)} products updated")
    else:
        print("❌ Delta sync failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
