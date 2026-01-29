#!/usr/bin/env python3
"""
Bulk add products from one channel to another using batch mutations.

This is much faster than the single-variant approach because it:
1. Uses productVariantBulkUpdate to add all variants of a product in one call
2. Processes products in parallel using threading

Usage:
    python scripts/add-products-to-channel-bulk.py \
        --source-channel webstore \
        --target-channel singles-builder \
        --category "Q2F0ZWdvcnk6Mg==" \
        --workers 5
"""

import os
import sys
import argparse
import requests
import time
from typing import Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

SALEOR_API = os.environ.get("SALEOR_API_URL", "http://localhost:8000/graphql/")
SALEOR_ADMIN_EMAIL = os.environ.get("SALEOR_ADMIN_EMAIL")
SALEOR_ADMIN_PASSWORD = os.environ.get("SALEOR_ADMIN_PASSWORD")


class TokenManager:
    """Thread-safe token manager with auto-refresh."""

    def __init__(self):
        self.token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self._lock = threading.Lock()
        self._request_count = 0
        self._refresh_interval = 100

    def authenticate(self) -> bool:
        """Authenticate and get tokens."""
        mutation = """
        mutation TokenCreate($email: String!, $password: String!) {
            tokenCreate(email: $email, password: $password) {
                token
                refreshToken
                errors { message }
            }
        }
        """
        try:
            response = requests.post(
                SALEOR_API,
                json={
                    "query": mutation,
                    "variables": {
                        "email": SALEOR_ADMIN_EMAIL,
                        "password": SALEOR_ADMIN_PASSWORD
                    }
                },
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            data = response.json()
            result = data.get("data", {}).get("tokenCreate", {})
            self.token = result.get("token")
            self.refresh_token = result.get("refreshToken")
            self._request_count = 0
            return bool(self.token)
        except Exception as e:
            print(f"Auth error: {e}", file=sys.stderr)
            return False

    def refresh(self) -> bool:
        """Refresh token."""
        with self._lock:
            if not self.refresh_token:
                return self.authenticate()

            mutation = """
            mutation TokenRefresh($refreshToken: String!) {
                tokenRefresh(refreshToken: $refreshToken) {
                    token
                    errors { message }
                }
            }
            """
            try:
                response = requests.post(
                    SALEOR_API,
                    json={"query": mutation, "variables": {"refreshToken": self.refresh_token}},
                    headers={"Content-Type": "application/json"},
                    timeout=30
                )
                data = response.json()
                result = data.get("data", {}).get("tokenRefresh", {})
                if result and result.get("token"):
                    self.token = result["token"]
                    self._request_count = 0
                    return True
            except Exception:
                pass
            return self.authenticate()

    def get_headers(self) -> Dict[str, str]:
        """Get headers with token, refreshing if needed."""
        with self._lock:
            self._request_count += 1
            if self._request_count >= self._refresh_interval:
                self.refresh()
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}" if self.token else ""
        }


def get_channel_id(token_manager: TokenManager, channel_slug: str) -> Optional[str]:
    """Get channel ID from slug."""
    query = """
    query GetChannel($slug: String!) {
        channel(slug: $slug) { id name currencyCode }
    }
    """
    response = requests.post(
        SALEOR_API,
        json={"query": query, "variables": {"slug": channel_slug}},
        headers=token_manager.get_headers(),
        timeout=30
    )
    data = response.json()
    channel = data.get("data", {}).get("channel")
    if channel:
        print(f"Found channel: {channel['name']} ({channel_slug}) - {channel['currencyCode']}")
        return channel["id"]
    return None


def get_products_batch(
    token_manager: TokenManager,
    source_channel: str,
    category_id: str,
    after: Optional[str] = None,
    first: int = 100
) -> Dict[str, Any]:
    """Get products with variants."""
    query = """
    query GetProducts($channel: String!, $categoryId: ID!, $first: Int!, $after: String) {
        products(channel: $channel, filter: {categories: [$categoryId]}, first: $first, after: $after) {
            totalCount
            pageInfo { hasNextPage endCursor }
            edges {
                node {
                    id
                    name
                    variants { id }
                }
            }
        }
    }
    """
    response = requests.post(
        SALEOR_API,
        json={
            "query": query,
            "variables": {
                "channel": source_channel,
                "categoryId": category_id,
                "first": first,
                "after": after
            }
        },
        headers=token_manager.get_headers(),
        timeout=60
    )
    return response.json().get("data", {}).get("products", {})


def add_product_to_channel(token_manager: TokenManager, product_id: str, channel_id: str) -> bool:
    """Add product to channel."""
    mutation = """
    mutation AddProductToChannel($productId: ID!, $input: ProductChannelListingUpdateInput!) {
        productChannelListingUpdate(id: $productId, input: $input) {
            errors { message }
        }
    }
    """
    try:
        response = requests.post(
            SALEOR_API,
            json={
                "query": mutation,
                "variables": {
                    "productId": product_id,
                    "input": {
                        "updateChannels": [{
                            "channelId": channel_id,
                            "isPublished": True,
                            "isAvailableForPurchase": True,
                            "visibleInListings": True
                        }]
                    }
                }
            },
            headers=token_manager.get_headers(),
            timeout=30
        )
        data = response.json()
        if data.get("errors"):
            for err in data["errors"]:
                if "expired" in err.get("message", "").lower():
                    token_manager.refresh()
                    return add_product_to_channel(token_manager, product_id, channel_id)
        return True
    except Exception:
        return False


def add_variants_bulk(
    token_manager: TokenManager,
    product_id: str,
    variant_ids: List[str],
    channel_id: str
) -> int:
    """Add all variants of a product to channel in one bulk call."""
    if not variant_ids:
        return 0

    mutation = """
    mutation BulkUpdateVariants($product: ID!, $variants: [ProductVariantBulkUpdateInput!]!) {
        productVariantBulkUpdate(product: $product, variants: $variants, errorPolicy: IGNORE_FAILED) {
            count
            errors { message }
        }
    }
    """

    # Try to create channel listings - IntegrityError means already exists (success)
    variants_input = [
        {
            "id": vid,
            "channelListings": {
                "create": [{
                    "channelId": channel_id,
                    "price": 0
                }]
            }
        }
        for vid in variant_ids
    ]

    try:
        response = requests.post(
            SALEOR_API,
            json={
                "query": mutation,
                "variables": {
                    "product": product_id,
                    "variants": variants_input
                }
            },
            headers=token_manager.get_headers(),
            timeout=60
        )

        if response.status_code != 200:
            return 0

        try:
            data = response.json()
        except Exception:
            return 0

        if data is None:
            return 0

        # Handle errors
        if data.get("errors"):
            for err in data["errors"]:
                if not isinstance(err, dict):
                    continue
                msg = err.get("message", "")
                ext = err.get("extensions", {}) or {}
                code = ext.get("exception", {}).get("code", "") if isinstance(ext.get("exception"), dict) else ""

                # Token expired - refresh and retry
                if "expired" in msg.lower():
                    token_manager.refresh()
                    return add_variants_bulk(token_manager, product_id, variant_ids, channel_id)

                # IntegrityError means listing already exists - treat as success
                if code == "IntegrityError":
                    return len(variant_ids)  # All variants already have listings

        data_inner = data.get("data") or {}
        result = data_inner.get("productVariantBulkUpdate") or {}
        return result.get("count", 0) or len(variant_ids)  # If count is 0 but no errors, assume success
    except Exception as e:
        print(f"  Bulk update error for product {product_id}: {e}", file=sys.stderr)
        return 0


def process_product(
    token_manager: TokenManager,
    product: Dict[str, Any],
    channel_id: str
) -> tuple:
    """Process a single product - add it and all its variants to channel."""
    product_id = product["id"]
    variant_ids = [v["id"] for v in product.get("variants", [])]

    # Add product to channel
    product_added = add_product_to_channel(token_manager, product_id, channel_id)

    # Add all variants in one bulk call
    variants_added = add_variants_bulk(token_manager, product_id, variant_ids, channel_id)

    return (1 if product_added else 0, variants_added)


def main():
    parser = argparse.ArgumentParser(description="Bulk add products to channel")
    parser.add_argument("--source-channel", required=True)
    parser.add_argument("--target-channel", required=True)
    parser.add_argument("--category", required=True)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--workers", type=int, default=5, help="Parallel workers")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    print("=" * 60)
    print("Bulk Add Products to Channel")
    print("=" * 60)
    print(f"API: {SALEOR_API}")
    print(f"Source: {args.source_channel} -> Target: {args.target_channel}")
    print(f"Workers: {args.workers}")
    print()

    token_manager = TokenManager()
    print("Authenticating...")
    if not token_manager.authenticate():
        print("Authentication failed!")
        sys.exit(1)
    print("Authenticated!")

    print(f"\nLooking up target channel '{args.target_channel}'...")
    channel_id = get_channel_id(token_manager, args.target_channel)
    if not channel_id:
        print(f"Channel '{args.target_channel}' not found!")
        sys.exit(1)

    print("\nFetching and processing products...")
    cursor = None
    total_processed = 0
    total_products_added = 0
    total_variants_added = 0
    start_time = time.time()

    while True:
        products_data = get_products_batch(
            token_manager, args.source_channel, args.category,
            after=cursor, first=args.batch_size
        )

        total_count = products_data.get("totalCount", 0)
        edges = products_data.get("edges", [])
        page_info = products_data.get("pageInfo", {})

        if total_processed == 0:
            print(f"Total products in category: {total_count}")

        # Process batch in parallel
        products = [e["node"] for e in edges]

        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(process_product, token_manager, p, channel_id): p
                for p in products
            }

            for future in as_completed(futures):
                try:
                    prod_added, vars_added = future.result()
                    total_products_added += prod_added
                    total_variants_added += vars_added
                except Exception as e:
                    print(f"  Error: {e}", file=sys.stderr)

                total_processed += 1

        # Progress update
        elapsed = time.time() - start_time
        rate = total_processed / elapsed if elapsed > 0 else 0
        eta = (total_count - total_processed) / rate if rate > 0 else 0
        print(f"  {total_processed}/{total_count} ({total_products_added} products, {total_variants_added} variants) - {rate:.1f}/s, ETA: {eta/60:.1f}m")

        if args.limit > 0 and total_processed >= args.limit:
            break

        if not page_info.get("hasNextPage"):
            break

        cursor = page_info.get("endCursor")

    print()
    print("=" * 60)
    print(f"Complete! Processed {total_processed} products")
    print(f"Added: {total_products_added} products, {total_variants_added} variants")
    print(f"Time: {(time.time() - start_time)/60:.1f} minutes")


if __name__ == "__main__":
    main()
