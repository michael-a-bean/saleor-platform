#!/usr/bin/env python3
"""
Download Scryfall images and upload to Saleor.

This script downloads images from Scryfall and uploads them to Saleor's media
storage (S3) using the productMediaCreate mutation with file upload.

Usage:
    # Backfill all products without media
    python scripts/backfill_product_images.py --channel webstore

    # Limit for testing
    python scripts/backfill_product_images.py --channel webstore --limit 100

    # Dry run
    python scripts/backfill_product_images.py --channel webstore --dry-run

Prerequisites:
    - SALEOR_API_URL environment variable
    - SALEOR_API_TOKEN environment variable
    - Products must have externalReference set to Scryfall ID
"""

import argparse
import io
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from requests_toolbelt import MultipartEncoder

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
MAX_WORKERS = 5  # Parallel workers for image processing
SCRYFALL_RATE_LIMIT_MS = 100

# =============================================================================
# GraphQL
# =============================================================================

PRODUCTS_QUERY = """
query ProductsWithMedia($channel: String!, $first: Int!, $after: String) {
  products(first: $first, after: $after, channel: $channel) {
    totalCount
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        name
        slug
        externalReference
        media { id }
      }
    }
  }
}
"""

CREATE_MEDIA_MUTATION = """
mutation CreateProductMedia($productId: ID!, $image: Upload!, $alt: String) {
  productMediaCreate(input: { product: $productId, image: $image, alt: $alt }) {
    media { id url }
    errors { field message code }
  }
}
"""

# =============================================================================
# Clients
# =============================================================================

class SaleorClient:
    def __init__(self, api_url: str, token: str):
        self.api_url = api_url
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
        })

    def execute(self, query: str, variables: Optional[dict] = None) -> dict:
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        response = self.session.post(
            self.api_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=(30, 120),
        )
        response.raise_for_status()
        data = response.json()
        if "errors" in data:
            raise Exception(f"GraphQL errors: {data['errors']}")
        return data.get("data", {})

    def upload_image(self, product_id: str, image_data: bytes, filename: str, alt: str) -> bool:
        """Upload image using multipart form data."""
        operations = json.dumps({
            "query": CREATE_MEDIA_MUTATION,
            "variables": {
                "productId": product_id,
                "image": None,
                "alt": alt[:250] if alt else "",
            }
        })

        map_data = json.dumps({"0": ["variables.image"]})

        # Create multipart encoder
        m = MultipartEncoder(
            fields={
                "operations": operations,
                "map": map_data,
                "0": (filename, image_data, "image/jpeg"),
            }
        )

        try:
            response = self.session.post(
                self.api_url,
                data=m,
                headers={"Content-Type": m.content_type},
                timeout=(30, 120),
            )
            response.raise_for_status()
            data = response.json()

            if "errors" in data:
                logger.warning(f"Upload errors: {data['errors']}")
                return False

            result = data.get("data", {}).get("productMediaCreate", {})
            if result.get("errors"):
                logger.warning(f"Media create errors: {result['errors']}")
                return False

            return bool(result.get("media"))

        except Exception as e:
            logger.warning(f"Upload failed: {e}")
            return False


class ScryfallClient:
    def __init__(self):
        self.session = requests.Session()
        self.last_request = 0

    def _rate_limit(self):
        elapsed = (time.time() - self.last_request) * 1000
        if elapsed < SCRYFALL_RATE_LIMIT_MS:
            time.sleep((SCRYFALL_RATE_LIMIT_MS - elapsed) / 1000)
        self.last_request = time.time()

    def get_cards_bulk(self, scryfall_ids: list[str]) -> dict[str, dict]:
        """Fetch multiple cards using collection endpoint."""
        result = {}
        for i in range(0, len(scryfall_ids), 75):
            batch = scryfall_ids[i:i+75]
            self._rate_limit()
            try:
                response = self.session.post(
                    "https://api.scryfall.com/cards/collection",
                    json={"identifiers": [{"id": sid} for sid in batch]},
                    timeout=60,
                )
                response.raise_for_status()
                for card in response.json().get("data", []):
                    result[card["id"]] = card
            except Exception as e:
                logger.warning(f"Bulk fetch error: {e}")
        return result

    def download_image(self, url: str) -> Optional[bytes]:
        """Download image from URL."""
        self._rate_limit()
        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return response.content
        except Exception as e:
            logger.warning(f"Image download failed: {e}")
            return None

    @staticmethod
    def get_image_url(card: dict) -> Optional[str]:
        """Get best image URL from card."""
        uris = card.get("image_uris", {})
        url = uris.get("normal") or uris.get("large") or uris.get("small")
        if not url and card.get("card_faces"):
            faces = card["card_faces"]
            if faces and faces[0].get("image_uris"):
                url = faces[0]["image_uris"].get("normal")
        return url


# =============================================================================
# Main Logic
# =============================================================================

def get_products_without_media(client: SaleorClient, channel: str, limit: int = 0) -> list[dict]:
    """Get products without media."""
    products = []
    cursor = None
    total_scanned = 0

    while True:
        result = client.execute(PRODUCTS_QUERY, {
            "channel": channel,
            "first": BATCH_SIZE,
            "after": cursor,
        })

        data = result.get("products", {})
        total = data.get("totalCount", 0)

        for edge in data.get("edges", []):
            node = edge["node"]
            total_scanned += 1
            if not node.get("media"):
                products.append(node)

        page_info = data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break

        cursor = page_info.get("endCursor")

        if limit > 0 and len(products) >= limit:
            products = products[:limit]
            break

        if total_scanned % 1000 == 0:
            logger.info(f"Scanned {total_scanned}/{total}, found {len(products)} without media")

    return products


def process_product(
    saleor: SaleorClient,
    scryfall: ScryfallClient,
    product: dict,
    card: dict,
    dry_run: bool,
) -> bool:
    """Process single product: download image and upload."""
    image_url = scryfall.get_image_url(card)
    if not image_url:
        return False

    if dry_run:
        logger.info(f"[DRY RUN] Would upload: {product['name']}")
        return True

    # Download image
    image_data = scryfall.download_image(image_url)
    if not image_data:
        return False

    # Generate filename from scryfall ID
    scryfall_id = product["externalReference"]
    filename = f"{scryfall_id}.jpg"

    # Upload to Saleor
    return saleor.upload_image(product["id"], image_data, filename, product["name"])


def backfill_images(
    saleor: SaleorClient,
    scryfall: ScryfallClient,
    products: list[dict],
    dry_run: bool,
    max_workers: int,
) -> tuple[int, int, int]:
    """Backfill images for products."""
    success = 0
    failed = 0
    skipped = 0

    # Filter valid products
    valid = [p for p in products if p.get("externalReference") and len(p["externalReference"]) == 36]
    if not valid:
        return 0, 0, len(products)

    logger.info(f"Fetching Scryfall data for {len(valid)} products...")
    scryfall_ids = [p["externalReference"] for p in valid]
    cards = scryfall.get_cards_bulk(scryfall_ids)
    logger.info(f"Retrieved {len(cards)} cards from Scryfall")

    # Process products
    for i, product in enumerate(valid):
        scryfall_id = product["externalReference"]
        card = cards.get(scryfall_id)

        if not card:
            skipped += 1
            continue

        if process_product(saleor, scryfall, product, card, dry_run):
            success += 1
        else:
            failed += 1

        if (i + 1) % 50 == 0:
            logger.info(f"Progress: {i+1}/{len(valid)} | Success: {success}, Failed: {failed}, Skipped: {skipped}")

    return success, failed, skipped


def main():
    parser = argparse.ArgumentParser(description="Backfill product images from Scryfall")
    parser.add_argument("--api-url", default=DEFAULT_API_URL)
    parser.add_argument("--token", default=os.getenv("SALEOR_API_TOKEN", ""))
    parser.add_argument("--channel", required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=MAX_WORKERS)
    parser.add_argument("-v", "--verbose", action="store_true")

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if not args.token and not args.dry_run:
        logger.error("API token required")
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("Product Image Backfill (Download & Upload)")
    logger.info("=" * 60)
    logger.info(f"API: {args.api_url}")
    logger.info(f"Channel: {args.channel}")
    logger.info(f"Limit: {args.limit or 'unlimited'}")
    logger.info(f"Dry run: {args.dry_run}")

    saleor = SaleorClient(args.api_url, args.token)
    scryfall = ScryfallClient()

    logger.info("Fetching products without media...")
    products = get_products_without_media(saleor, args.channel, args.limit)
    logger.info(f"Found {len(products)} products without media")

    if not products:
        logger.info("Nothing to do")
        return

    logger.info("Starting image backfill...")
    success, failed, skipped = backfill_images(saleor, scryfall, products, args.dry_run, args.workers)

    logger.info("=" * 60)
    logger.info("Summary")
    logger.info("=" * 60)
    logger.info(f"Success: {success}")
    logger.info(f"Failed: {failed}")
    logger.info(f"Skipped: {skipped}")


if __name__ == "__main__":
    main()
