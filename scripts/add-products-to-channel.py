#!/usr/bin/env python3
"""
Add products from one channel to another channel.

Usage:
    python scripts/add-products-to-channel.py \
        --source-channel webstore \
        --target-channel singles-builder \
        --category "Q2F0ZWdvcnk6Mg==" \
        --batch-size 100

Environment Variables:
    SALEOR_API_URL        Saleor GraphQL endpoint
    SALEOR_ADMIN_EMAIL    Admin email for authentication
    SALEOR_ADMIN_PASSWORD Admin password for authentication
"""

import os
import sys
import argparse
import requests
import time
from typing import Optional, List, Dict, Any

SALEOR_API = os.environ.get("SALEOR_API_URL", "http://localhost:8000/graphql/")
SALEOR_ADMIN_EMAIL = os.environ.get("SALEOR_ADMIN_EMAIL")
SALEOR_ADMIN_PASSWORD = os.environ.get("SALEOR_ADMIN_PASSWORD")


class TokenManager:
    """Manages authentication tokens with auto-refresh."""

    def __init__(self):
        self.token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self._request_count = 0
        self._refresh_interval = 50  # Refresh every N requests to avoid expiration

    def authenticate(self) -> bool:
        """Authenticate and get tokens."""
        if not SALEOR_ADMIN_EMAIL or not SALEOR_ADMIN_PASSWORD:
            print("Error: SALEOR_ADMIN_EMAIL and SALEOR_ADMIN_PASSWORD must be set")
            return False

        mutation = """
        mutation TokenCreate($email: String!, $password: String!) {
            tokenCreate(email: $email, password: $password) {
                token
                refreshToken
                errors {
                    field
                    message
                }
            }
        }
        """

        response = requests.post(
            SALEOR_API,
            json={
                "query": mutation,
                "variables": {
                    "email": SALEOR_ADMIN_EMAIL,
                    "password": SALEOR_ADMIN_PASSWORD
                }
            },
            headers={"Content-Type": "application/json"}
        )

        data = response.json()
        if "errors" in data:
            print(f"GraphQL errors: {data['errors']}")
            return False

        result = data.get("data", {}).get("tokenCreate", {})
        if result.get("errors"):
            print(f"Auth errors: {result['errors']}")
            return False

        self.token = result.get("token")
        self.refresh_token = result.get("refreshToken")
        self._request_count = 0
        return bool(self.token)

    def refresh(self) -> bool:
        """Refresh the access token using refresh token."""
        if not self.refresh_token:
            return self.authenticate()

        mutation = """
        mutation TokenRefresh($refreshToken: String!) {
            tokenRefresh(refreshToken: $refreshToken) {
                token
                errors {
                    field
                    message
                }
            }
        }
        """

        try:
            response = requests.post(
                SALEOR_API,
                json={
                    "query": mutation,
                    "variables": {
                        "refreshToken": self.refresh_token
                    }
                },
                headers={"Content-Type": "application/json"},
                timeout=30
            )

            data = response.json()
            result = data.get("data", {}).get("tokenRefresh", {})

            if result and result.get("token"):
                self.token = result["token"]
                self._request_count = 0
                return True
        except Exception as e:
            print(f"  Token refresh failed: {e}", file=sys.stderr)

        # Fall back to full re-authentication
        return self.authenticate()

    def ensure_valid_token(self):
        """Ensure token is valid, refreshing if needed."""
        self._request_count += 1
        if self._request_count >= self._refresh_interval:
            self.refresh()

    def get_headers(self) -> Dict[str, str]:
        """Get headers with auth token."""
        self.ensure_valid_token()
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers


def get_channel_id(token_manager: TokenManager, channel_slug: str) -> Optional[str]:
    """Get channel ID from slug."""
    query = """
    query GetChannel($slug: String!) {
        channel(slug: $slug) {
            id
            name
            slug
            currencyCode
        }
    }
    """

    response = requests.post(
        SALEOR_API,
        json={"query": query, "variables": {"slug": channel_slug}},
        headers=token_manager.get_headers()
    )

    data = response.json()
    channel = data.get("data", {}).get("channel")
    if channel:
        print(f"Found channel: {channel['name']} ({channel['slug']}) - {channel['currencyCode']}")
        return channel["id"]
    return None


def get_products_in_category(
    token_manager: TokenManager,
    source_channel: str,
    category_id: str,
    after: Optional[str] = None,
    first: int = 100
) -> Dict[str, Any]:
    """Fetch products from a category."""
    query = """
    query GetProducts($channel: String!, $categoryId: ID!, $first: Int!, $after: String) {
        products(
            channel: $channel
            filter: { categories: [$categoryId] }
            first: $first
            after: $after
        ) {
            totalCount
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                    name
                    variants {
                        id
                    }
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
        headers=token_manager.get_headers()
    )

    return response.json().get("data", {}).get("products", {})


def add_product_to_channel(
    token_manager: TokenManager,
    product_id: str,
    channel_id: str,
    currency: str = "USD"
) -> bool:
    """Add a product to a channel with default listing."""
    mutation = """
    mutation AddProductToChannel($productId: ID!, $input: ProductChannelListingUpdateInput!) {
        productChannelListingUpdate(id: $productId, input: $input) {
            product {
                id
            }
            errors {
                field
                message
                code
            }
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
                        "updateChannels": [
                            {
                                "channelId": channel_id,
                                "isPublished": True,
                                "isAvailableForPurchase": True,
                                "visibleInListings": True
                            }
                        ]
                    }
                }
            },
            headers=token_manager.get_headers(),
            timeout=30
        )

        if response.status_code != 200:
            print(f"  HTTP {response.status_code} for product {product_id}", file=sys.stderr)
            return False

        data = response.json()
        if data is None:
            print(f"  Empty response for product {product_id}", file=sys.stderr)
            return False

        # Check for GraphQL-level errors (like token expiration)
        if data.get("errors"):
            for err in data["errors"]:
                msg = err.get("message", "")
                if "expired" in msg.lower() or "signature" in msg.lower():
                    # Token expired - force refresh and retry once
                    token_manager.refresh()
                    return add_product_to_channel(token_manager, product_id, channel_id, currency)
                print(f"  GraphQL error: {msg}", file=sys.stderr)
            return False

        update_result = data.get("data", {}).get("productChannelListingUpdate")
        if update_result is None:
            return False

        errors = update_result.get("errors", [])
        if errors:
            # Ignore "already exists" type errors
            for err in errors:
                if "already" not in err.get("message", "").lower():
                    return False
        return True

    except requests.exceptions.Timeout:
        print(f"  Timeout for product {product_id}", file=sys.stderr)
        return False
    except requests.exceptions.RequestException as e:
        print(f"  Request error for product {product_id}: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"  Unexpected error for product {product_id}: {e}", file=sys.stderr)
        return False


def add_variant_to_channel(
    token_manager: TokenManager,
    variant_id: str,
    channel_id: str,
    price: float = 0.00,
    currency: str = "USD"
) -> bool:
    """Add a variant to a channel with pricing."""
    mutation = """
    mutation AddVariantToChannel($variantId: ID!, $input: [ProductVariantChannelListingAddInput!]!) {
        productVariantChannelListingUpdate(id: $variantId, input: $input) {
            variant {
                id
            }
            errors {
                field
                message
                code
            }
        }
    }
    """

    try:
        response = requests.post(
            SALEOR_API,
            json={
                "query": mutation,
                "variables": {
                    "variantId": variant_id,
                    "input": [
                        {
                            "channelId": channel_id,
                            "price": price,
                            "costPrice": price
                        }
                    ]
                }
            },
            headers=token_manager.get_headers(),
            timeout=30
        )

        if response.status_code != 200:
            print(f"  HTTP {response.status_code} for variant {variant_id}", file=sys.stderr)
            return False

        data = response.json()
        if data is None:
            print(f"  Empty response for variant {variant_id}", file=sys.stderr)
            return False

        # Check for GraphQL-level errors (like token expiration)
        if data.get("errors"):
            for err in data["errors"]:
                msg = err.get("message", "")
                if "expired" in msg.lower() or "signature" in msg.lower():
                    # Token expired - force refresh and retry once
                    token_manager.refresh()
                    return add_variant_to_channel(token_manager, variant_id, channel_id, price, currency)
                print(f"  GraphQL error: {msg}", file=sys.stderr)
            return False

        update_result = data.get("data", {}).get("productVariantChannelListingUpdate")
        if update_result is None:
            return False

        errors = update_result.get("errors", [])
        if errors:
            for err in errors:
                if "already" not in err.get("message", "").lower():
                    return False
        return True

    except requests.exceptions.Timeout:
        print(f"  Timeout for variant {variant_id}", file=sys.stderr)
        return False
    except requests.exceptions.RequestException as e:
        print(f"  Request error for variant {variant_id}: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"  Unexpected error for variant {variant_id}: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Add products to a channel")
    parser.add_argument("--source-channel", required=True, help="Source channel slug")
    parser.add_argument("--target-channel", required=True, help="Target channel slug")
    parser.add_argument("--category", required=True, help="Category ID to filter products")
    parser.add_argument("--batch-size", type=int, default=100, help="Products per batch")
    parser.add_argument("--limit", type=int, default=0, help="Max products (0=all)")
    parser.add_argument("--dry-run", action="store_true", help="Don't make changes")
    args = parser.parse_args()

    print("=" * 60)
    print("Add Products to Channel")
    print("=" * 60)
    print(f"API: {SALEOR_API}")
    print(f"Source channel: {args.source_channel}")
    print(f"Target channel: {args.target_channel}")
    print(f"Category: {args.category}")
    print(f"Batch size: {args.batch_size}")
    if args.dry_run:
        print("DRY RUN - no changes will be made")
    print()

    # Authenticate
    token_manager = TokenManager()
    print("Authenticating...")
    if not token_manager.authenticate():
        print("Authentication failed!")
        sys.exit(1)
    print("Authenticated!")

    # Get target channel ID
    print(f"\nLooking up target channel '{args.target_channel}'...")
    target_channel_id = get_channel_id(token_manager, args.target_channel)
    if not target_channel_id:
        print(f"Channel '{args.target_channel}' not found!")
        sys.exit(1)

    # Process products
    print(f"\nFetching products from category...")
    cursor = None
    total_processed = 0
    total_products_added = 0
    total_variants_added = 0

    while True:
        products_data = get_products_in_category(
            token_manager,
            args.source_channel,
            args.category,
            after=cursor,
            first=args.batch_size
        )

        total_count = products_data.get("totalCount", 0)
        edges = products_data.get("edges", [])
        page_info = products_data.get("pageInfo", {})

        if total_processed == 0:
            print(f"Total products in category: {total_count}")

        for edge in edges:
            product = edge["node"]
            product_id = product["id"]
            variants = product.get("variants", [])

            if not args.dry_run:
                # Add product to channel
                if add_product_to_channel(token_manager, product_id, target_channel_id):
                    total_products_added += 1

                # Add variants to channel
                for variant in variants:
                    if add_variant_to_channel(token_manager, variant["id"], target_channel_id):
                        total_variants_added += 1

            total_processed += 1

            if total_processed % 100 == 0:
                print(f"  Processed: {total_processed}/{total_count} ({total_products_added} products, {total_variants_added} variants added)")

            if args.limit > 0 and total_processed >= args.limit:
                print(f"\nReached limit of {args.limit} products")
                break

        if args.limit > 0 and total_processed >= args.limit:
            break

        if not page_info.get("hasNextPage"):
            break

        cursor = page_info.get("endCursor")
        time.sleep(0.1)  # Small delay between batches

    print()
    print("=" * 60)
    print("Complete!")
    print(f"Products processed: {total_processed}")
    print(f"Products added to channel: {total_products_added}")
    print(f"Variants added to channel: {total_variants_added}")
    print("=" * 60)


if __name__ == "__main__":
    main()
