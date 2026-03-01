#!/usr/bin/env python3
"""
Pre-warm Saleor product thumbnails.

Queries all products via GraphQL and hits any un-generated thumbnail proxy URLs
to force Saleor to generate and cache them. After warming, GraphQL returns
direct CDN URLs instead of proxy URLs — eliminating the ~170ms 302 redirect.

Usage:
    # Warm all un-generated thumbnails
    python scripts/prewarm_thumbnails.py

    # Limit for testing
    python scripts/prewarm_thumbnails.py --limit 100

    # Dry run — show what would be warmed without hitting URLs
    python scripts/prewarm_thumbnails.py --dry-run

    # Custom concurrency (default 10)
    python scripts/prewarm_thumbnails.py --concurrency 20

    # Custom channel
    python scripts/prewarm_thumbnails.py --channel webstore

Prerequisites:
    - SALEOR_API_URL environment variable (or --api-url argument)
    - SALEOR_API_TOKEN environment variable (or --token argument)
    - Saleor API must be running
"""

import argparse
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# =============================================================================
# Configuration
# =============================================================================

DEFAULT_API_URL = os.getenv("SALEOR_API_URL", "http://localhost:8000/graphql/")
BATCH_SIZE = 100

# Thumbnail sizes used by the storefront (from GraphQL queries)
THUMBNAIL_SIZES = [128, 256, 1024]
THUMBNAIL_FORMAT = "WEBP"

# Proxy URL marker — if a thumbnail URL contains this, it hasn't been generated yet
PROXY_MARKER = "/thumbnail/"

# =============================================================================
# GraphQL Queries
# =============================================================================

PRODUCTS_WITH_THUMBNAILS_QUERY = """
query ProductThumbnails($after: String, $first: Int!, $channel: String!) {
  products(after: $after, first: $first, channel: $channel) {
    edges {
      node {
        id
        name
        media {
          id
          url
        }
        thumbnail128: thumbnail(size: 128, format: WEBP) { url }
        thumbnail256: thumbnail(size: 256, format: WEBP) { url }
        thumbnail1024: thumbnail(size: 1024, format: WEBP) { url }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}
"""


# =============================================================================
# Saleor Client
# =============================================================================


class SaleorClient:
    def __init__(self, api_url: str, token: str):
        self.api_url = api_url
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
        )
        retry = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
        self.session.mount("http://", HTTPAdapter(max_retries=retry))
        self.session.mount("https://", HTTPAdapter(max_retries=retry))

    def query(self, query: str, variables: dict) -> dict:
        response = self.session.post(
            self.api_url, json={"query": query, "variables": variables}, timeout=(30, 120)
        )
        response.raise_for_status()
        data = response.json()
        if "errors" in data:
            raise Exception(f"GraphQL errors: {data['errors']}")
        return data["data"]


# =============================================================================
# Thumbnail Warming
# =============================================================================


def collect_proxy_urls(client: SaleorClient, channel: str, limit: int | None = None) -> list[dict]:
    """Fetch all products and identify un-warmed thumbnail URLs."""
    proxy_urls = []
    cursor = None
    total_products = 0
    total_media = 0
    page = 0

    while True:
        page += 1
        batch_size = min(BATCH_SIZE, limit - total_products) if limit else BATCH_SIZE
        if batch_size <= 0:
            break

        data = client.query(
            PRODUCTS_WITH_THUMBNAILS_QUERY,
            {"after": cursor, "first": batch_size, "channel": channel},
        )

        products = data["products"]
        edges = products["edges"]
        page_info = products["pageInfo"]
        total_count = products["totalCount"]

        for edge in edges:
            node = edge["node"]
            total_products += 1

            if not node.get("media"):
                continue

            total_media += len(node["media"])

            # Check each thumbnail size
            for size_key, size_val in [
                ("thumbnail128", 128),
                ("thumbnail256", 256),
                ("thumbnail1024", 1024),
            ]:
                thumb = node.get(size_key)
                if thumb and thumb.get("url") and PROXY_MARKER in thumb["url"]:
                    proxy_urls.append(
                        {
                            "product_id": node["id"],
                            "product_name": node["name"][:40],
                            "size": size_val,
                            "url": thumb["url"],
                        }
                    )

        logger.info(
            f"Page {page}: scanned {total_products}/{total_count} products, "
            f"found {len(proxy_urls)} un-warmed thumbnails so far"
        )

        if not page_info["hasNextPage"]:
            break
        if limit and total_products >= limit:
            break
        cursor = page_info["endCursor"]

    logger.info(
        f"Scan complete: {total_products} products, {total_media} media items, "
        f"{len(proxy_urls)} thumbnails need warming"
    )
    return proxy_urls


def warm_thumbnail(url: str, session: requests.Session) -> tuple[str, bool, str]:
    """Hit a proxy URL to trigger thumbnail generation. Returns (url, success, detail)."""
    try:
        response = session.get(url, timeout=(10, 60), allow_redirects=True)
        if response.status_code == 200:
            return (url, True, f"warmed ({len(response.content)} bytes)")
        else:
            return (url, False, f"HTTP {response.status_code}")
    except requests.Timeout:
        return (url, False, "timeout")
    except requests.RequestException as e:
        return (url, False, str(e))


def warm_thumbnails(proxy_urls: list[dict], concurrency: int, dry_run: bool) -> dict:
    """Warm all proxy URLs with controlled concurrency."""
    stats = {"total": len(proxy_urls), "warmed": 0, "skipped": 0, "failed": 0}

    if not proxy_urls:
        logger.info("No thumbnails need warming — all are already generated!")
        return stats

    if dry_run:
        logger.info(f"DRY RUN: would warm {len(proxy_urls)} thumbnails")
        for entry in proxy_urls[:20]:
            logger.info(f"  Would warm: {entry['product_name']} size={entry['size']}")
        if len(proxy_urls) > 20:
            logger.info(f"  ... and {len(proxy_urls) - 20} more")
        stats["skipped"] = len(proxy_urls)
        return stats

    # Session for warming (no auth needed — thumbnail endpoint is public)
    session = requests.Session()
    retry = Retry(total=2, backoff_factor=0.5, status_forcelist=[502, 503, 504])
    session.mount("http://", HTTPAdapter(max_retries=retry))
    session.mount("https://", HTTPAdapter(max_retries=retry))

    start_time = time.time()
    completed = 0

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {
            pool.submit(warm_thumbnail, entry["url"], session): entry
            for entry in proxy_urls
        }

        for future in as_completed(futures):
            entry = futures[future]
            url, success, detail = future.result()
            completed += 1

            if success:
                stats["warmed"] += 1
            else:
                stats["failed"] += 1
                logger.warning(
                    f"Failed: {entry['product_name']} size={entry['size']} — {detail}"
                )

            # Progress every 100 items or 10%
            if completed % 100 == 0 or completed == len(proxy_urls):
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                remaining = (len(proxy_urls) - completed) / rate if rate > 0 else 0
                logger.info(
                    f"Progress: {completed}/{len(proxy_urls)} "
                    f"({stats['warmed']} warmed, {stats['failed']} failed) "
                    f"[{rate:.0f}/s, ~{remaining:.0f}s remaining]"
                )

    elapsed = time.time() - start_time
    logger.info(
        f"Warming complete in {elapsed:.1f}s: "
        f"{stats['warmed']} warmed, {stats['failed']} failed, "
        f"{stats['skipped']} skipped"
    )
    return stats


# =============================================================================
# Main
# =============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Pre-warm Saleor product thumbnails to eliminate 302 redirect latency."
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API_URL,
        help=f"Saleor GraphQL API URL (default: {DEFAULT_API_URL})",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("SALEOR_API_TOKEN"),
        help="Saleor API token (default: SALEOR_API_TOKEN env var)",
    )
    parser.add_argument(
        "--channel",
        default="webstore",
        help="Saleor channel slug (default: webstore)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=10,
        help="Number of concurrent warming requests (default: 10)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of products to scan (for testing)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be warmed without actually doing it",
    )
    args = parser.parse_args()

    if not args.token:
        logger.error("No API token provided. Set SALEOR_API_TOKEN or use --token.")
        sys.exit(1)

    logger.info("=== Saleor Thumbnail Pre-Warmer ===")
    logger.info(f"API URL: {args.api_url}")
    logger.info(f"Channel: {args.channel}")
    logger.info(f"Concurrency: {args.concurrency}")
    logger.info(f"Sizes: {THUMBNAIL_SIZES} format={THUMBNAIL_FORMAT}")
    if args.limit:
        logger.info(f"Limit: {args.limit} products")
    if args.dry_run:
        logger.info("Mode: DRY RUN")

    client = SaleorClient(args.api_url, args.token)

    # Phase 1: Scan for un-warmed thumbnails
    logger.info("Phase 1: Scanning for un-warmed thumbnails...")
    proxy_urls = collect_proxy_urls(client, args.channel, args.limit)

    # Phase 2: Warm them
    logger.info("Phase 2: Warming thumbnails...")
    stats = warm_thumbnails(proxy_urls, args.concurrency, args.dry_run)

    # Summary
    logger.info("=== Summary ===")
    logger.info(f"Total thumbnails needing warmth: {stats['total']}")
    logger.info(f"Successfully warmed: {stats['warmed']}")
    logger.info(f"Failed: {stats['failed']}")
    logger.info(f"Skipped (dry-run): {stats['skipped']}")

    if stats["failed"] > 0:
        logger.warning(f"{stats['failed']} thumbnails failed — re-run to retry.")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
