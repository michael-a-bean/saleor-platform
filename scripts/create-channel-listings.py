#!/usr/bin/env python3
"""
Create ProductChannelListing and ProductVariantChannelListing for ALL products
in a target Saleor channel, copying pricing from the webstore channel.

Idempotent: safe to re-run. Products already listed in the target channel are
skipped (Saleor upserts channel listings).

Usage:
    export SALEOR_ADMIN_EMAIL="admin@example.com"
    export SALEOR_ADMIN_PASSWORD="admin"

    python scripts/create-channel-listings.py frank-and-sons
    python scripts/create-channel-listings.py frank-and-sons --workers 10 --batch-size 100
    python scripts/create-channel-listings.py frank-and-sons --dry-run
    python scripts/create-channel-listings.py frank-and-sons --limit 500  # process first 500 only
"""

import os
import sys
import argparse
import requests
import time
import threading
from typing import Optional, Dict, Any, List, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

SALEOR_API = os.environ.get("SALEOR_API_URL", "http://localhost:8000/graphql/")
SALEOR_ADMIN_EMAIL = os.environ.get("SALEOR_ADMIN_EMAIL")
SALEOR_ADMIN_PASSWORD = os.environ.get("SALEOR_ADMIN_PASSWORD")

SOURCE_CHANNEL = "webstore"

# ---------------------------------------------------------------------------
# Queries & Mutations
# ---------------------------------------------------------------------------

QUERY_CHANNEL = """
query GetChannel($slug: String!) {
    channel(slug: $slug) { id name slug currencyCode }
}
"""

QUERY_PRODUCTS = """
query GetProducts($channel: String!, $first: Int!, $after: String) {
    products(channel: $channel, first: $first, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        edges {
            node {
                id
                name
                channelListings { channel { slug } }
                variants {
                    id
                    channelListings {
                        channel { slug }
                        price { amount }
                        costPrice { amount }
                    }
                }
            }
        }
    }
}
"""

MUTATION_PRODUCT_CHANNEL_LISTING = """
mutation ProductChannelListingUpdate($id: ID!, $input: ProductChannelListingUpdateInput!) {
    productChannelListingUpdate(id: $id, input: $input) {
        product { id }
        errors { field message code }
    }
}
"""

MUTATION_VARIANT_CHANNEL_LISTING = """
mutation ProductVariantChannelListingUpdate($id: ID!, $input: [ProductVariantChannelListingAddInput!]!) {
    productVariantChannelListingUpdate(id: $id, input: $input) {
        variant { id }
        errors { field message code }
    }
}
"""


# ---------------------------------------------------------------------------
# Token Manager (thread-safe, auto-refresh)
# ---------------------------------------------------------------------------

class TokenManager:
    def __init__(self):
        self.token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self._lock = threading.Lock()
        self._request_count = 0
        self._refresh_every = 80  # refresh before Saleor's 100-request window

    def authenticate(self) -> bool:
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
            resp = requests.post(
                SALEOR_API,
                json={"query": mutation, "variables": {
                    "email": SALEOR_ADMIN_EMAIL,
                    "password": SALEOR_ADMIN_PASSWORD
                }},
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            data = resp.json().get("data", {}).get("tokenCreate", {})
            if data.get("errors"):
                print(f"Auth errors: {data['errors']}", file=sys.stderr)
                return False
            self.token = data.get("token")
            self.refresh_token = data.get("refreshToken")
            self._request_count = 0
            return bool(self.token)
        except Exception as e:
            print(f"Auth exception: {e}", file=sys.stderr)
            return False

    def _refresh(self) -> bool:
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
            resp = requests.post(
                SALEOR_API,
                json={"query": mutation, "variables": {"refreshToken": self.refresh_token}},
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            result = resp.json().get("data", {}).get("tokenRefresh", {})
            if result and result.get("token"):
                self.token = result["token"]
                self._request_count = 0
                return True
        except Exception:
            pass
        return self.authenticate()

    def get_headers(self) -> Dict[str, str]:
        with self._lock:
            self._request_count += 1
            if self._request_count >= self._refresh_every:
                self._refresh()
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}" if self.token else ""
        }

    def force_refresh(self):
        with self._lock:
            self._refresh()


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def gql(token_manager: TokenManager, query: str, variables: dict,
        timeout: int = 60, retries: int = 2) -> dict:
    """Execute a GraphQL query with retry on auth errors."""
    for attempt in range(retries + 1):
        try:
            resp = requests.post(
                SALEOR_API,
                json={"query": query, "variables": variables},
                headers=token_manager.get_headers(),
                timeout=timeout
            )
            if resp.status_code != 200:
                if attempt < retries:
                    token_manager.force_refresh()
                    continue
                return {"errors": [{"message": f"HTTP {resp.status_code}"}]}

            data = resp.json()

            # Check for auth-related errors and retry
            top_errors = data.get("errors", [])
            if top_errors:
                is_auth_error = any(
                    "expired" in (e.get("message", "") or "").lower() or
                    "signature" in (e.get("message", "") or "").lower()
                    for e in top_errors if isinstance(e, dict)
                )
                if is_auth_error and attempt < retries:
                    token_manager.force_refresh()
                    continue

            return data
        except requests.exceptions.Timeout:
            if attempt < retries:
                time.sleep(1)
                continue
            return {"errors": [{"message": "Request timeout"}]}
        except Exception as e:
            return {"errors": [{"message": str(e)}]}
    return {"errors": [{"message": "Max retries exceeded"}]}


def get_channel_info(token_manager: TokenManager, slug: str) -> Optional[dict]:
    data = gql(token_manager, QUERY_CHANNEL, {"slug": slug})
    return (data.get("data") or {}).get("channel")


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def product_already_listed(product: dict, target_slug: str) -> bool:
    """Check if product already has a listing in the target channel."""
    for listing in product.get("channelListings", []):
        if listing.get("channel", {}).get("slug") == target_slug:
            return True
    return False


def get_webstore_price(variant: dict) -> Tuple[Optional[float], Optional[float]]:
    """Extract price and costPrice from the webstore channel listing."""
    for listing in variant.get("channelListings", []):
        if listing.get("channel", {}).get("slug") == SOURCE_CHANNEL:
            price = listing.get("price", {}).get("amount") if listing.get("price") else None
            cost = listing.get("costPrice", {}).get("amount") if listing.get("costPrice") else None
            return (price, cost)
    return (None, None)


def process_product(
    token_manager: TokenManager,
    product: dict,
    target_channel_id: str,
    target_slug: str,
    dry_run: bool = False
) -> dict:
    """
    Process one product:
    1. Create ProductChannelListing for the target channel
    2. Create ProductVariantChannelListing for each variant, copying webstore price

    Returns stats dict.
    """
    product_id = product["id"]
    product_name = product.get("name", "?")
    stats = {"product_added": False, "variants_added": 0, "variants_skipped": 0, "errors": []}

    # --- Step 1: Product channel listing ---
    if not dry_run:
        resp = gql(token_manager, MUTATION_PRODUCT_CHANNEL_LISTING, {
            "id": product_id,
            "input": {
                "updateChannels": [{
                    "channelId": target_channel_id,
                    "isPublished": True,
                    "isAvailableForPurchase": True,
                    "visibleInListings": True,
                }]
            }
        })
        mutation_errors = (resp.get("data") or {}).get("productChannelListingUpdate", {}).get("errors", [])
        if mutation_errors:
            stats["errors"].append(f"Product {product_id}: {mutation_errors}")
            return stats

    stats["product_added"] = True

    # --- Step 2: Variant channel listings ---
    variants = product.get("variants", [])
    for variant in variants:
        variant_id = variant["id"]
        price, cost_price = get_webstore_price(variant)

        if price is None:
            # No webstore price — skip, don't create a broken listing
            stats["variants_skipped"] += 1
            continue

        listing_input: Dict[str, Any] = {
            "channelId": target_channel_id,
            "price": price,
        }
        if cost_price is not None:
            listing_input["costPrice"] = cost_price

        if not dry_run:
            resp = gql(token_manager, MUTATION_VARIANT_CHANNEL_LISTING, {
                "id": variant_id,
                "input": [listing_input]
            })
            mutation_errors = (
                (resp.get("data") or {})
                .get("productVariantChannelListingUpdate", {})
                .get("errors", [])
            )
            if mutation_errors:
                # "already exists" type errors are fine (idempotent)
                real_errors = [e for e in mutation_errors if "unique" not in (e.get("message") or "").lower()]
                if real_errors:
                    stats["errors"].append(f"Variant {variant_id}: {real_errors}")
                    continue

        stats["variants_added"] += 1

    return stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Create channel listings for all products in a target Saleor channel, "
                    "copying pricing from webstore."
    )
    parser.add_argument("target_channel", help="Target channel slug (e.g. frank-and-sons)")
    parser.add_argument("--workers", type=int, default=10, help="Concurrent workers (default: 10)")
    parser.add_argument("--batch-size", type=int, default=100, help="Products per page (default: 100)")
    parser.add_argument("--limit", type=int, default=0, help="Stop after N products (0 = all)")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually mutate; just log what would happen")
    parser.add_argument("--skip-existing", action="store_true", default=True,
                        help="Skip products already listed in target channel (default: True)")
    parser.add_argument("--no-skip-existing", action="store_false", dest="skip_existing",
                        help="Re-process products already listed (updates prices)")
    args = parser.parse_args()

    if not SALEOR_ADMIN_EMAIL or not SALEOR_ADMIN_PASSWORD:
        print("ERROR: Set SALEOR_ADMIN_EMAIL and SALEOR_ADMIN_PASSWORD environment variables.",
              file=sys.stderr)
        sys.exit(1)

    print("=" * 70)
    print("Create Channel Listings")
    print("=" * 70)
    print(f"  API:            {SALEOR_API}")
    print(f"  Source channel:  {SOURCE_CHANNEL}")
    print(f"  Target channel:  {args.target_channel}")
    print(f"  Workers:         {args.workers}")
    print(f"  Batch size:      {args.batch_size}")
    print(f"  Limit:           {args.limit or 'all'}")
    print(f"  Dry run:         {args.dry_run}")
    print(f"  Skip existing:   {args.skip_existing}")
    print()

    # --- Authenticate ---
    token_manager = TokenManager()
    print("Authenticating...", end=" ")
    if not token_manager.authenticate():
        print("FAILED")
        sys.exit(1)
    print("OK")

    # --- Resolve target channel ---
    print(f"Resolving target channel '{args.target_channel}'...", end=" ")
    target_channel = get_channel_info(token_manager, args.target_channel)
    if not target_channel:
        print("NOT FOUND")
        sys.exit(1)
    target_channel_id = target_channel["id"]
    print(f"OK  ({target_channel['name']}, {target_channel['currencyCode']})")

    # --- Resolve source channel ---
    print(f"Resolving source channel '{SOURCE_CHANNEL}'...", end=" ")
    source_channel = get_channel_info(token_manager, SOURCE_CHANNEL)
    if not source_channel:
        print("NOT FOUND")
        sys.exit(1)
    print(f"OK  ({source_channel['name']}, {source_channel['currencyCode']})")

    if source_channel["currencyCode"] != target_channel["currencyCode"]:
        print(f"\nWARNING: Currency mismatch! Source={source_channel['currencyCode']}, "
              f"Target={target_channel['currencyCode']}")
        print("Prices will be copied as-is. Make sure this is intended.")

    print()

    # --- Paginate through all products ---
    cursor = None
    total_processed = 0
    total_skipped = 0
    total_products_added = 0
    total_variants_added = 0
    total_variants_skipped = 0
    total_errors = 0
    start_time = time.time()
    total_count = None

    while True:
        # Fetch a page of products from the source channel
        resp = gql(token_manager, QUERY_PRODUCTS, {
            "channel": SOURCE_CHANNEL,
            "first": args.batch_size,
            "after": cursor
        }, timeout=120)

        products_data = (resp.get("data") or {}).get("products")
        if not products_data:
            print(f"ERROR: Failed to fetch products. Response: {resp}", file=sys.stderr)
            sys.exit(1)

        if total_count is None:
            total_count = products_data.get("totalCount", 0)
            print(f"Total products in '{SOURCE_CHANNEL}': {total_count}")
            print()

        edges = products_data.get("edges", [])
        page_info = products_data.get("pageInfo", {})

        if not edges:
            break

        # Filter out already-listed products if requested
        products_to_process = []
        for edge in edges:
            product = edge["node"]
            if args.skip_existing and product_already_listed(product, args.target_channel):
                total_skipped += 1
                continue
            products_to_process.append(product)

        # Process batch concurrently
        if products_to_process:
            with ThreadPoolExecutor(max_workers=args.workers) as executor:
                futures = {
                    executor.submit(
                        process_product,
                        token_manager, p, target_channel_id, args.target_channel, args.dry_run
                    ): p
                    for p in products_to_process
                }

                for future in as_completed(futures):
                    product = futures[future]
                    try:
                        stats = future.result()
                        if stats["product_added"]:
                            total_products_added += 1
                        total_variants_added += stats["variants_added"]
                        total_variants_skipped += stats["variants_skipped"]
                        if stats["errors"]:
                            total_errors += len(stats["errors"])
                            for err in stats["errors"]:
                                print(f"  ERROR: {err}", file=sys.stderr)
                    except Exception as e:
                        total_errors += 1
                        print(f"  EXCEPTION on {product.get('name', '?')}: {e}", file=sys.stderr)

        total_processed += len(edges)

        # Progress logging every batch
        elapsed = time.time() - start_time
        rate = total_processed / elapsed if elapsed > 0 else 0
        remaining = (total_count - total_processed) if total_count else 0
        eta_min = (remaining / rate / 60) if rate > 0 else 0
        print(
            f"  [{total_processed:>6}/{total_count}]  "
            f"added={total_products_added}  skipped={total_skipped}  "
            f"variants={total_variants_added}  errors={total_errors}  "
            f"{rate:.1f} prod/s  ETA {eta_min:.1f}m"
        )

        # Check limit
        if args.limit > 0 and total_processed >= args.limit:
            print(f"\nLimit of {args.limit} reached, stopping.")
            break

        # Next page
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    # --- Summary ---
    elapsed = time.time() - start_time
    print()
    print("=" * 70)
    print("DONE")
    print("=" * 70)
    print(f"  Products processed:   {total_processed}")
    print(f"  Products added:       {total_products_added}")
    print(f"  Products skipped:     {total_skipped} (already in target channel)")
    print(f"  Variants added:       {total_variants_added}")
    print(f"  Variants skipped:     {total_variants_skipped} (no webstore price)")
    print(f"  Errors:               {total_errors}")
    print(f"  Time:                 {elapsed/60:.1f} minutes ({elapsed:.0f}s)")
    print(f"  Rate:                 {total_processed/elapsed:.1f} products/s" if elapsed > 0 else "")

    if total_errors > 0:
        print(f"\nWARNING: {total_errors} errors occurred. Re-run the script to retry (idempotent).")
        sys.exit(2)


if __name__ == "__main__":
    main()
