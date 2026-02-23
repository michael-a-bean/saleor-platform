#!/usr/bin/env python3
# DEBUG: Immediate output to diagnose ECS logging issues
import sys
print("=== SYNC SCRIPT STARTING ===", flush=True)
print(f"Python: {sys.version}", flush=True)
"""
Sync MTG products from Saleor to Meilisearch for search functionality.

Usage:
    python scripts/sync-meilisearch.py [--full] [--channel CHANNEL]

Examples:
    # Set required environment variables first:
    export SALEOR_ADMIN_EMAIL='admin@example.com'
    export SALEOR_ADMIN_PASSWORD='your-password'

    # Sync webstore channel (main storefront)
    python scripts/sync-meilisearch.py --channel webstore

    # Full reindex of webstore (delete and recreate index)
    python scripts/sync-meilisearch.py --full --channel webstore

    # Sync singles-builder channel (default)
    python scripts/sync-meilisearch.py

Environment Variables:
    SALEOR_ADMIN_EMAIL     (required) Admin user email for API authentication
    SALEOR_ADMIN_PASSWORD  (required) Admin user password for API authentication

Options:
    --full      Full reindex (deletes and recreates index)
    --channel   Channel slug to sync (default: singles-builder)

Note: The script configures filterable attributes for storefront filters:
      set_code, set_name, rarity, in_stock, conditions_available,
      finishes_available, colors, type_line, min_price
"""

import requests
import json
import argparse
import sys
import time
import base64
import os
from datetime import datetime
from typing import Optional

# Admin credentials - MUST be set via environment variables
SALEOR_ADMIN_EMAIL = os.environ.get("SALEOR_ADMIN_EMAIL")
SALEOR_ADMIN_PASSWORD = os.environ.get("SALEOR_ADMIN_PASSWORD")


def decode_saleor_id(graphql_id: str) -> str:
    """Convert Saleor GraphQL ID to Meilisearch-compatible ID.

    Saleor IDs are base64 encoded like 'UHJvZHVjdDo2NDc0MA==' which decodes to 'Product:64740'.
    Meilisearch only allows alphanumeric, hyphens, and underscores.
    """
    try:
        # Decode base64 to get 'Product:64740' format
        decoded = base64.b64decode(graphql_id).decode('utf-8')
        # Replace colon with underscore: 'Product_64740'
        return decoded.replace(':', '_')
    except Exception:
        # Fallback: replace special chars
        return graphql_id.replace('=', '').replace('+', '-').replace('/', '_')

SALEOR_API = os.environ.get("SALEOR_API_URL", os.environ.get("SALEOR_API", "http://localhost:8000/graphql/"))
# Ensure URL ends with /graphql/
if not SALEOR_API.endswith("/graphql/"):
    SALEOR_API = SALEOR_API.rstrip("/") + "/graphql/"
MEILISEARCH_URL = os.environ.get("MEILISEARCH_URL", "http://localhost:7700")
MEILISEARCH_API_KEY = os.environ.get("MEILISEARCH_API_KEY")  # None is valid for local dev


def get_meilisearch_headers() -> dict:
    """Get headers for Meilisearch requests, including auth if API key is set."""
    headers = {"Content-Type": "application/json"}
    if MEILISEARCH_API_KEY:
        headers["Authorization"] = f"Bearer {MEILISEARCH_API_KEY}"
    return headers

def get_index_name(channel: str) -> str:
    """Get index name for a channel."""
    return f"{channel}-products"


class TokenManager:
    """Manages Saleor auth tokens with automatic refresh."""

    def __init__(self):
        self._token = None
        self._token_time = 0
        self._token_lifetime = 240  # Refresh every 4 minutes (tokens expire in 5)

    def get_token(self) -> str:
        """Get a valid token, refreshing if needed."""
        current_time = time.time()
        if self._token is None or (current_time - self._token_time) > self._token_lifetime:
            self._refresh_token()
        return self._token

    def _refresh_token(self):
        """Get a fresh token from Saleor.

        Requires SALEOR_ADMIN_EMAIL and SALEOR_ADMIN_PASSWORD environment variables.
        """
        if not SALEOR_ADMIN_EMAIL or not SALEOR_ADMIN_PASSWORD:
            raise Exception(
                "Missing Saleor admin credentials.\n"
                "Set environment variables:\n"
                "  export SALEOR_ADMIN_EMAIL='your-admin@email.com'\n"
                "  export SALEOR_ADMIN_PASSWORD='your-password'\n"
            )

        mutation = """
        mutation TokenCreate($email: String!, $password: String!) {
            tokenCreate(email: $email, password: $password) {
                token
                errors { message }
            }
        }
        """
        variables = {
            "email": SALEOR_ADMIN_EMAIL,
            "password": SALEOR_ADMIN_PASSWORD,
        }
        response = requests.post(SALEOR_API, json={"query": mutation, "variables": variables})
        data = response.json()
        if data.get("data", {}).get("tokenCreate", {}).get("token"):
            self._token = data["data"]["tokenCreate"]["token"]
            self._token_time = time.time()
            return
        raise Exception(f"Failed to get token: {data}")


def get_auth_token() -> str:
    """Get authentication token from Saleor (legacy wrapper)."""
    manager = TokenManager()
    return manager.get_token()


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


def get_attribute_value(attributes: list, slug: str) -> Optional[str]:
    """Extract attribute value by slug."""
    for attr in attributes or []:
        if attr.get("attribute", {}).get("slug") == slug:
            values = attr.get("values", [])
            if values:
                return values[0].get("name")
    return None


def fetch_products(token: str, channel: str, after: str = None) -> dict:
    """Fetch products from Saleor with pagination."""
    query = """
    query FetchProducts($channel: String!, $after: String) {
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
    return graphql_request(query, {"channel": channel, "after": after}, token)


def transform_product(product: dict) -> dict:
    """Transform Saleor product to Meilisearch document."""
    attrs = product.get("attributes", [])

    # Extract MTG attributes
    set_name = get_attribute_value(attrs, "mtg-set-name") or ""
    set_code = get_attribute_value(attrs, "mtg-set-code") or ""
    collector_number = get_attribute_value(attrs, "mtg-collector-number") or ""
    rarity = get_attribute_value(attrs, "mtg-rarity") or ""
    colors = get_attribute_value(attrs, "mtg-colors") or ""
    mana_cost = get_attribute_value(attrs, "mtg-mana-cost") or ""
    type_line = get_attribute_value(attrs, "mtg-type-line") or ""
    oracle_text = get_attribute_value(attrs, "mtg-oracle-text") or ""
    # NEW: Council recommendations - additional filterable attributes
    mana_value_raw = get_attribute_value(attrs, "mtg-mana-value")
    mana_value = int(float(mana_value_raw)) if mana_value_raw else 0
    color_identity = get_attribute_value(attrs, "mtg-color-identity") or ""
    keywords = get_attribute_value(attrs, "mtg-keywords") or ""

    # Process variants
    variants = []
    min_price = None
    total_stock = 0
    conditions_available = set()
    finishes_available = set()

    for variant in product.get("variants", []):
        var_attrs = variant.get("attributes", [])
        condition = get_attribute_value(var_attrs, "mtg-condition")
        finish = get_attribute_value(var_attrs, "mtg-finish")

        # Fallback: parse variant name "Near Mint - Non-Foil" when attributes are empty
        if not condition or not finish:
            variant_name = variant.get("name", "")
            parts = variant_name.split(" - ", 1)
            if not condition:
                condition = parts[0].strip() if parts else "Near Mint"
            if not finish:
                finish = parts[1].strip() if len(parts) > 1 else "Non-Foil"
        stock = variant.get("quantityAvailable", 0) or 0
        price_data = variant.get("pricing", {}).get("price", {}).get("gross", {})
        price = price_data.get("amount")

        # Always track available conditions/finishes for filtering
        # (even if stock is 0, users may want to filter by condition)
        conditions_available.add(condition)
        finishes_available.add(finish)

        # Track min price from any variant with a price
        if price and (min_price is None or price < min_price):
            min_price = price

        if stock > 0:
            total_stock += stock

        variants.append({
            "id": decode_saleor_id(variant["id"]),
            "original_id": variant["id"],  # Keep original for cart operations
            "sku": variant.get("sku"),
            "condition": condition,
            "finish": finish,
            "stock": stock,
            "price": price,
        })

    # Build searchable name variants (for typo tolerance)
    name = product["name"]
    name_parts = name.lower().split()

    # Generate prefix tokens for abbreviation search (e.g., "verd" → "verdant")
    # Include all prefixes of 3+ characters for each word
    name_prefixes = []
    for word in name_parts:
        for i in range(3, len(word) + 1):
            name_prefixes.append(word[:i])

    return {
        "id": decode_saleor_id(product["id"]),
        "original_id": product["id"],  # Keep original for lookups
        "name": name,
        "name_lower": name.lower(),
        "name_parts": name_parts,
        "name_prefixes": name_prefixes,  # For abbreviation matching
        "slug": product["slug"],
        # Prefer external media URLs (e.g., Scryfall) over Saleor thumbnails
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
        # NEW: Council recommendations - additional filterable/searchable fields
        "mana_value": mana_value,  # CMC for deckbuilding queries like "3-drops"
        "color_identity": [c.strip() for c in color_identity.split(",") if c.strip()] if color_identity else [],
        "keywords": [k.strip() for k in keywords.split(",") if k.strip()] if keywords else [],
        # Combined searchable text for better matching
        "searchable": f"{name} {set_name} {set_code} {type_line}".lower(),
        # Delta sync tracking (Phase 2: Council recommendations)
        "last_indexed_at": datetime.utcnow().isoformat() + "Z",
        "saleor_updated_at": product.get("updatedAt"),
    }


def wait_for_task(task_uid: int, timeout: int = 60) -> bool:
    """Wait for a Meilisearch task to complete."""
    start = time.time()
    while time.time() - start < timeout:
        response = requests.get(f"{MEILISEARCH_URL}/tasks/{task_uid}", headers=get_meilisearch_headers())
        if response.status_code == 200:
            status = response.json().get("status")
            if status == "succeeded":
                return True
            elif status == "failed":
                print(f"  Task {task_uid} failed: {response.json().get('error')}")
                return False
        time.sleep(0.5)
    print(f"  Task {task_uid} timed out")
    return False


def setup_meilisearch_index(index_name: str, full_reindex: bool = False):
    """Create or update Meilisearch index with proper settings."""

    if full_reindex:
        # Delete existing index
        print(f"Deleting existing index '{index_name}'...")
        response = requests.delete(f"{MEILISEARCH_URL}/indexes/{index_name}", headers=get_meilisearch_headers())
        if response.status_code == 202:
            task_uid = response.json().get("taskUid")
            wait_for_task(task_uid)

    # Create index (will be ignored if already exists)
    print(f"Creating/updating index '{index_name}'...")
    response = requests.post(
        f"{MEILISEARCH_URL}/indexes",
        json={"uid": index_name, "primaryKey": "id"},
        headers=get_meilisearch_headers()
    )
    if response.status_code == 202:
        task_uid = response.json().get("taskUid")
        wait_for_task(task_uid)

    # Configure all settings in a single PATCH request (more efficient)
    # This applies all settings atomically and returns a single task to wait on
    print("Configuring index settings...")
    settings = {
        # Searchable attributes ordered by relevance (name > oracle_text > set_name)
        # Council recommendation: proper ranking for MTG card discovery
        "searchableAttributes": [
            "name",           # HIGHEST priority - exact card name matches
            "name_parts",
            "name_prefixes",  # For abbreviation matching (verd → verdant)
            "oracle_text",    # MEDIUM priority - rules text search
            "keywords",       # NEW: Flying, Trample, etc.
            "type_line",
            "set_name",       # LOWER priority
            "set_code",
            "searchable",
        ],
        "filterableAttributes": [
            # These must match what the storefront filter components use
            "set_code",
            "set_name",       # For set dropdown filter (required for faceting)
            "rarity",
            "in_stock",
            "conditions_available",
            "finishes_available",
            "colors",
            "type_line",      # For creature/instant/sorcery filtering
            "min_price",      # For price range filtering
            # NEW: Council recommendations
            "mana_value",     # CMC for "show me all 3-drops"
            "color_identity", # Commander players need this
            "keywords",       # Flying, Trample, etc.
        ],
        "sortableAttributes": [
            "name",
            "min_price",
            "set_name",
            "collector_number",
            "type_line",  # For sorting sealed (empty type_line) before singles
        ],
        "typoTolerance": {
            "enabled": True,
            "minWordSizeForTypos": {
                "oneTypo": 4,
                "twoTypos": 8
            }
        },
        "rankingRules": [
            "words",
            "typo",
            "proximity",
            "attribute",
            "sort",
            "exactness"
        ],
    }

    response = requests.patch(
        f"{MEILISEARCH_URL}/indexes/{index_name}/settings",
        json=settings,
        headers=get_meilisearch_headers()
    )

    if response.status_code == 202:
        task_uid = response.json().get("taskUid")
        print(f"  Settings task queued: {task_uid}")
        print("  Waiting for settings to apply (this may take a while for large indexes)...")
        if wait_for_task(task_uid, timeout=300):  # 5 min timeout for large indexes
            print("  Settings applied successfully!")
        else:
            print("  Warning: Settings task did not complete in time")
    else:
        print(f"  Error configuring settings: {response.text}")

    print("Index configured!")


def sync_to_meilisearch(index_name: str, documents: list):
    """Push documents to Meilisearch."""
    if not documents:
        print("No documents to sync")
        return

    # Meilisearch accepts batches up to ~100MB, we'll do 1000 docs at a time
    batch_size = 1000
    total_batches = (len(documents) + batch_size - 1) // batch_size

    for i in range(0, len(documents), batch_size):
        batch = documents[i:i + batch_size]
        batch_num = i // batch_size + 1
        print(f"  Uploading batch {batch_num}/{total_batches} ({len(batch)} documents)...")

        response = requests.post(
            f"{MEILISEARCH_URL}/indexes/{index_name}/documents",
            json=batch,
            headers=get_meilisearch_headers()
        )

        if response.status_code not in [200, 202]:
            print(f"  Error: {response.text}")
        else:
            task = response.json()
            print(f"  Task queued: {task.get('taskUid')}")


def main():
    parser = argparse.ArgumentParser(description="Sync MTG products to Meilisearch")
    parser.add_argument("--full", action="store_true", help="Full reindex")
    parser.add_argument("--channel", default="singles-builder", help="Channel slug")
    args = parser.parse_args()

    print("=" * 60)
    print("MTG Product Sync to Meilisearch")
    print("=" * 60)

    # Check Meilisearch is running
    try:
        health = requests.get(f"{MEILISEARCH_URL}/health", headers=get_meilisearch_headers())
        if health.status_code != 200:
            print("Error: Meilisearch is not healthy")
            sys.exit(1)
        print(f"Meilisearch is running at {MEILISEARCH_URL}")
    except requests.exceptions.ConnectionError:
        print(f"Error: Cannot connect to Meilisearch at {MEILISEARCH_URL}")
        print("Make sure Meilisearch is running: docker compose up -d meilisearch")
        sys.exit(1)

    # Get index name for this channel
    index_name = get_index_name(args.channel)
    print(f"Channel: {args.channel}")
    print(f"Index: {index_name}")

    # Setup index
    setup_meilisearch_index(index_name, full_reindex=args.full)

    # Use token manager for automatic refresh
    token_manager = TokenManager()
    print("\nAuthenticating with Saleor...")
    token_manager.get_token()  # Initial auth
    print("Authenticated!")

    # Fetch and upload products in batches
    print(f"\nFetching and syncing products from channel '{args.channel}'...")
    total_products = 0
    total_in_stock = 0
    after = None
    page = 0
    batch_buffer = []
    batch_size = 500  # Upload every 500 products

    while True:
        page += 1
        # Get fresh token for each request
        token = token_manager.get_token()
        result = fetch_products(token, args.channel, after)

        if "errors" in result:
            print(f"GraphQL Error: {result['errors']}")
            sys.exit(1)

        products_data = result.get("data", {}).get("products", {})
        edges = products_data.get("edges", [])

        # Transform and buffer
        for edge in edges:
            doc = transform_product(edge["node"])
            batch_buffer.append(doc)
            total_products += 1
            if doc["in_stock"]:
                total_in_stock += 1

        print(f"  Page {page}: fetched {len(edges)} products (total: {total_products})")

        # Upload when buffer is full
        if len(batch_buffer) >= batch_size:
            print(f"  Uploading {len(batch_buffer)} products to Meilisearch...")
            sync_to_meilisearch(index_name, batch_buffer)
            batch_buffer = []

        page_info = products_data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        after = page_info.get("endCursor")

    # Upload remaining products
    if batch_buffer:
        print(f"  Uploading final {len(batch_buffer)} products to Meilisearch...")
        sync_to_meilisearch(index_name, batch_buffer)

    print("\n" + "=" * 60)
    print("Sync complete!")
    print(f"Index: {index_name}")
    print(f"Total products: {total_products}")
    print(f"In stock: {total_in_stock}")
    print("=" * 60)


if __name__ == "__main__":
    main()
