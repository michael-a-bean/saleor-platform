#!/usr/bin/env python3
"""
Backfill product media from Scryfall image URLs.

This script finds products without media and adds their Scryfall image URLs
using the productMediaCreate mutation.

Usage:
    # Backfill all products without media
    python scripts/backfill_product_media.py --channel webstore

    # Limit for testing
    python scripts/backfill_product_media.py --channel webstore --limit 100

    # Dry run to see what would be updated
    python scripts/backfill_product_media.py --channel webstore --dry-run

Prerequisites:
    - SALEOR_API_URL environment variable (or --api-url argument)
    - SALEOR_API_TOKEN environment variable (or --token argument)
    - Products must have externalReference set to Scryfall ID
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

# =============================================================================
# Configuration
# =============================================================================

DEFAULT_API_URL = os.getenv("SALEOR_API_URL", "http://localhost:8000/graphql/")
BATCH_SIZE = 100
MAX_WORKERS = 10
SCRYFALL_RATE_LIMIT_MS = 100  # Scryfall asks for 100ms between requests

# Retry configuration
MAX_RETRIES = 3
RETRY_BACKOFF_FACTOR = 2

# =============================================================================
# GraphQL Queries and Mutations
# =============================================================================

# Get products with their media status
PRODUCTS_QUERY = """
query ProductsWithMedia($channel: String!, $first: Int!, $after: String) {
  products(
    first: $first
    after: $after
    channel: $channel
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
        slug
        externalReference
        media {
          id
        }
      }
    }
  }
}
"""

# Create media from URL
CREATE_MEDIA_MUTATION = """
mutation CreateProductMedia($productId: ID!, $mediaUrl: String!, $alt: String) {
  productMediaCreate(input: {
    product: $productId
    mediaUrl: $mediaUrl
    alt: $alt
  }) {
    media {
      id
      url
    }
    errors {
      field
      message
      code
    }
  }
}
"""

# Update media metadata with original URL
UPDATE_MEDIA_METADATA = """
mutation UpdateMediaMetadata($id: ID!, $input: [MetadataInput!]!) {
  updateMetadata(id: $id, input: $input) {
    item {
      ... on ProductMedia {
        id
        metadata {
          key
          value
        }
      }
    }
    errors {
      field
      message
      code
    }
  }
}
"""

# =============================================================================
# GraphQL Client
# =============================================================================

class SaleorClient:
    """GraphQL client for Saleor API."""

    def __init__(self, api_url: str, token: str):
        self.api_url = api_url
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })

        retry_strategy = Retry(
            total=MAX_RETRIES,
            backoff_factor=RETRY_BACKOFF_FACTOR,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy, pool_maxsize=20)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def execute(self, query: str, variables: Optional[dict] = None) -> dict:
        """Execute a GraphQL query/mutation."""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        response = self.session.post(self.api_url, json=payload, timeout=(30, 120))
        response.raise_for_status()

        data = response.json()
        if "errors" in data:
            raise Exception(f"GraphQL errors: {data['errors']}")

        return data.get("data", {})


# =============================================================================
# Scryfall API
# =============================================================================

class ScryfallClient:
    """Client for Scryfall API with rate limiting."""

    def __init__(self):
        self.session = requests.Session()
        self.last_request_time = 0

    def _rate_limit(self):
        """Respect Scryfall rate limits."""
        elapsed = (time.time() - self.last_request_time) * 1000
        if elapsed < SCRYFALL_RATE_LIMIT_MS:
            time.sleep((SCRYFALL_RATE_LIMIT_MS - elapsed) / 1000)
        self.last_request_time = time.time()

    def get_card(self, scryfall_id: str) -> Optional[dict]:
        """Get card data from Scryfall by ID."""
        self._rate_limit()
        try:
            response = self.session.get(
                f"https://api.scryfall.com/cards/{scryfall_id}",
                timeout=30,
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.warning(f"Failed to fetch Scryfall card {scryfall_id}: {e}")
            return None

    def get_image_url(self, card: dict) -> Optional[str]:
        """Extract best image URL from card data."""
        # Try normal image_uris first
        image_uris = card.get("image_uris", {})
        image_url = image_uris.get("normal") or image_uris.get("large") or image_uris.get("small")

        # Handle double-faced cards
        if not image_url and card.get("card_faces"):
            faces = card["card_faces"]
            if faces and faces[0].get("image_uris"):
                face_uris = faces[0]["image_uris"]
                image_url = face_uris.get("normal") or face_uris.get("large")

        return image_url


# =============================================================================
# Bulk Card Fetching (faster than individual requests)
# =============================================================================

def fetch_cards_bulk(scryfall_ids: list[str], scryfall_client: ScryfallClient) -> dict[str, dict]:
    """Fetch multiple cards from Scryfall using collection endpoint."""
    # Scryfall collection endpoint accepts up to 75 IDs at once
    result = {}

    for i in range(0, len(scryfall_ids), 75):
        batch = scryfall_ids[i:i+75]
        scryfall_client._rate_limit()

        try:
            response = scryfall_client.session.post(
                "https://api.scryfall.com/cards/collection",
                json={"identifiers": [{"id": sid} for sid in batch]},
                timeout=60,
            )
            response.raise_for_status()
            data = response.json()

            for card in data.get("data", []):
                result[card["id"]] = card

        except Exception as e:
            logger.warning(f"Bulk fetch failed for batch starting at {i}: {e}")
            # Fall back to individual fetches for this batch
            for sid in batch:
                card = scryfall_client.get_card(sid)
                if card:
                    result[sid] = card

    return result


# =============================================================================
# Main Logic
# =============================================================================

def get_products_without_media(
    client: SaleorClient,
    channel: str,
    limit: int = 0,
) -> list[dict]:
    """Get all products without media (filters client-side)."""
    products = []
    cursor = None
    total_scanned = 0

    while True:
        result = client.execute(PRODUCTS_QUERY, {
            "channel": channel,
            "first": BATCH_SIZE,
            "after": cursor,
        })

        products_data = result.get("products", {})
        edges = products_data.get("edges", [])
        total_count = products_data.get("totalCount", 0)

        for edge in edges:
            node = edge["node"]
            total_scanned += 1
            # Filter for products without media
            if not node.get("media"):
                products.append(node)

        page_info = products_data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break

        cursor = page_info.get("endCursor")

        # Check if we've hit the limit
        if limit > 0 and len(products) >= limit:
            products = products[:limit]
            break

        logger.info(f"Scanned {total_scanned}/{total_count} products, found {len(products)} without media...")

    return products


def create_media(
    client: SaleorClient,
    product_id: str,
    media_url: str,
    alt: str,
) -> bool:
    """Create media for a product and store original URL in metadata."""
    try:
        result = client.execute(CREATE_MEDIA_MUTATION, {
            "productId": product_id,
            "mediaUrl": media_url,
            "alt": alt,
        })

        errors = result.get("productMediaCreate", {}).get("errors", [])
        if errors:
            logger.warning(f"Media create errors for {product_id}: {errors}")
            return False

        # Get the created media ID and store original URL in metadata
        media_data = result.get("productMediaCreate", {}).get("media")
        if media_data:
            media_id = media_data["id"]
            try:
                client.execute(UPDATE_MEDIA_METADATA, {
                    "id": media_id,
                    "input": [{"key": "original_url", "value": media_url}],
                })
            except Exception as e:
                logger.warning(f"Failed to set metadata for media {media_id}: {e}")
                # Don't fail the whole operation if metadata fails

        return True
    except Exception as e:
        logger.warning(f"Failed to create media for {product_id}: {e}")
        return False


def backfill_media(
    saleor_client: SaleorClient,
    scryfall_client: ScryfallClient,
    products: list[dict],
    dry_run: bool = False,
) -> tuple[int, int, int]:
    """Backfill media for products. Returns (success, failed, skipped)."""
    success = 0
    failed = 0
    skipped = 0

    # Filter products with valid Scryfall IDs
    products_with_ids = [
        p for p in products
        if p.get("externalReference") and len(p["externalReference"]) == 36
    ]

    if not products_with_ids:
        logger.info("No products with valid Scryfall IDs found")
        return 0, 0, len(products)

    logger.info(f"Fetching Scryfall data for {len(products_with_ids)} products...")

    # Bulk fetch card data from Scryfall
    scryfall_ids = [p["externalReference"] for p in products_with_ids]
    cards_data = fetch_cards_bulk(scryfall_ids, scryfall_client)

    logger.info(f"Retrieved {len(cards_data)} cards from Scryfall")

    # Process each product
    for i, product in enumerate(products_with_ids):
        scryfall_id = product["externalReference"]
        card = cards_data.get(scryfall_id)

        if not card:
            skipped += 1
            continue

        image_url = scryfall_client.get_image_url(card)
        if not image_url:
            skipped += 1
            continue

        if dry_run:
            logger.info(f"[DRY RUN] Would add media to: {product['name']}")
            logger.info(f"  URL: {image_url}")
            success += 1
            continue

        if create_media(saleor_client, product["id"], image_url, product["name"][:250]):
            success += 1
        else:
            failed += 1

        # Progress update every 100 products
        if (i + 1) % 100 == 0:
            logger.info(f"Progress: {i + 1}/{len(products_with_ids)} - Success: {success}, Failed: {failed}, Skipped: {skipped}")

    return success, failed, skipped


def main():
    parser = argparse.ArgumentParser(
        description="Backfill product media from Scryfall",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Saleor GraphQL URL")
    parser.add_argument("--token", default=os.getenv("SALEOR_API_TOKEN", ""), help="API token")
    parser.add_argument("--channel", required=True, help="Channel slug")
    parser.add_argument("--limit", type=int, default=0, help="Limit products to process (0=all)")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually create media")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if not args.token and not args.dry_run:
        logger.error("API token required (set SALEOR_API_TOKEN or use --token)")
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("Product Media Backfill")
    logger.info("=" * 60)
    logger.info(f"API URL: {args.api_url}")
    logger.info(f"Channel: {args.channel}")
    logger.info(f"Limit: {args.limit if args.limit > 0 else 'unlimited'}")
    logger.info(f"Dry run: {args.dry_run}")

    # Initialize clients
    saleor_client = SaleorClient(args.api_url, args.token)
    scryfall_client = ScryfallClient()

    # Get products without media
    logger.info("Fetching products without media...")
    products = get_products_without_media(saleor_client, args.channel, args.limit)
    logger.info(f"Found {len(products)} products without media")

    if not products:
        logger.info("No products to process")
        return

    # Backfill media
    logger.info("Starting media backfill...")
    success, failed, skipped = backfill_media(
        saleor_client,
        scryfall_client,
        products,
        args.dry_run,
    )

    # Summary
    logger.info("=" * 60)
    logger.info("Summary")
    logger.info("=" * 60)
    logger.info(f"Success: {success}")
    logger.info(f"Failed: {failed}")
    logger.info(f"Skipped: {skipped}")

    if args.dry_run:
        logger.info("[DRY RUN] No changes were made")


if __name__ == "__main__":
    main()
