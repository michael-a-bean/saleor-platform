#!/usr/bin/env python3
"""
Delete broken ProductMedia entries that have external_url but no actual files.

This script deletes existing ProductMedia so backfill_product_media.py can
recreate them with actual S3 uploads.

Usage:
    # Dry run to see what would be deleted
    python scripts/cleanup_broken_media.py --channel webstore --dry-run

    # Delete first 100 media entries
    python scripts/cleanup_broken_media.py --channel webstore --limit 100

    # Delete all broken media
    python scripts/cleanup_broken_media.py --channel webstore

Prerequisites:
    - SALEOR_API_URL environment variable
    - SALEOR_API_TOKEN environment variable (needs MANAGE_PRODUCTS permission)
"""

import argparse
import logging
import os
import sys
import time

import requests

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

DEFAULT_API_URL = os.getenv("SALEOR_API_URL", "http://localhost:8000/graphql/")
BATCH_SIZE = 100

# Query to get products with media
PRODUCTS_WITH_MEDIA_QUERY = """
query ProductsWithMedia($channel: String!, $first: Int!, $after: String) {
  products(first: $first, after: $after, channel: $channel) {
    totalCount
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        name
        media {
          id
        }
      }
    }
  }
}
"""

# Mutation to delete media
DELETE_MEDIA_MUTATION = """
mutation DeleteProductMedia($ids: [ID!]!) {
  productMediaBulkDelete(ids: $ids) {
    count
    errors {
      field
      message
      code
    }
  }
}
"""


class SaleorClient:
    def __init__(self, api_url: str, token: str):
        self.api_url = api_url
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })

    def execute(self, query: str, variables: dict = None) -> dict:
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        response = self.session.post(self.api_url, json=payload, timeout=(30, 120))
        response.raise_for_status()
        data = response.json()

        if "errors" in data:
            raise Exception(f"GraphQL errors: {data['errors']}")

        return data.get("data", {})


def get_media_ids(client: SaleorClient, channel: str, limit: int = 0) -> list[str]:
    """Get all ProductMedia IDs."""
    media_ids = []
    cursor = None
    total_scanned = 0

    while True:
        result = client.execute(PRODUCTS_WITH_MEDIA_QUERY, {
            "channel": channel,
            "first": BATCH_SIZE,
            "after": cursor,
        })

        data = result.get("products", {})
        total = data.get("totalCount", 0)

        for edge in data.get("edges", []):
            node = edge["node"]
            for media in node.get("media", []):
                media_ids.append(media["id"])

                if limit > 0 and len(media_ids) >= limit:
                    logger.info(f"Reached limit of {limit} media IDs")
                    return media_ids

        total_scanned += len(data.get("edges", []))

        page_info = data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break

        cursor = page_info.get("endCursor")

        if total_scanned % 1000 == 0:
            logger.info(f"Scanned {total_scanned}/{total} products, found {len(media_ids)} media IDs")

    return media_ids


def delete_media_batch(client: SaleorClient, media_ids: list[str], dry_run: bool) -> int:
    """Delete a batch of media IDs."""
    if dry_run:
        logger.info(f"[DRY RUN] Would delete {len(media_ids)} media entries")
        return len(media_ids)

    result = client.execute(DELETE_MEDIA_MUTATION, {"ids": media_ids})
    delete_result = result.get("productMediaBulkDelete", {})

    if delete_result.get("errors"):
        logger.warning(f"Delete errors: {delete_result['errors']}")
        return 0

    return delete_result.get("count", 0)


def main():
    parser = argparse.ArgumentParser(description="Delete broken ProductMedia entries")
    parser.add_argument("--api-url", default=DEFAULT_API_URL)
    parser.add_argument("--token", default=os.getenv("SALEOR_API_TOKEN", ""))
    parser.add_argument("--channel", required=True)
    parser.add_argument("--limit", type=int, default=0, help="Max media to delete (0 = all)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=50, help="Delete batch size")

    args = parser.parse_args()

    if not args.token:
        logger.error("SALEOR_API_TOKEN required")
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("ProductMedia Cleanup")
    logger.info("=" * 60)
    logger.info(f"API URL: {args.api_url}")
    logger.info(f"Channel: {args.channel}")
    logger.info(f"Limit: {args.limit or 'unlimited'}")
    logger.info(f"Dry run: {args.dry_run}")

    client = SaleorClient(args.api_url, args.token)

    logger.info("Fetching media IDs...")
    media_ids = get_media_ids(client, args.channel, args.limit)
    logger.info(f"Found {len(media_ids)} media entries to delete")

    if not media_ids:
        logger.info("Nothing to delete")
        return

    # Delete in batches
    total_deleted = 0
    for i in range(0, len(media_ids), args.batch_size):
        batch = media_ids[i:i + args.batch_size]
        deleted = delete_media_batch(client, batch, args.dry_run)
        total_deleted += deleted

        if not args.dry_run:
            logger.info(f"Deleted {total_deleted}/{len(media_ids)} media entries")
            time.sleep(0.1)  # Small delay between batches

    logger.info("=" * 60)
    logger.info("Summary")
    logger.info("=" * 60)
    logger.info(f"Total deleted: {total_deleted}")

    if not args.dry_run:
        logger.info("\nNext step: Run backfill_product_media.py to recreate media with S3 uploads")


if __name__ == "__main__":
    main()
