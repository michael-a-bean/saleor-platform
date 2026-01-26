#!/usr/bin/env python3
"""
Reconciliation job to detect Saleor/Meilisearch count mismatches.
Run daily or after sync failures.

Usage:
    python scripts/meilisearch-reconcile.py --channel webstore [--fix]

Examples:
    # Check for mismatches (dry run)
    python scripts/meilisearch-reconcile.py --channel webstore

    # Check and fix any mismatches
    python scripts/meilisearch-reconcile.py --channel webstore --fix

Environment Variables:
    SALEOR_ADMIN_EMAIL     (required for --fix) Admin user email
    SALEOR_ADMIN_PASSWORD  (required for --fix) Admin user password
"""

import requests
import argparse
import sys
import os
import json

SALEOR_API = os.environ.get("SALEOR_API_URL", "http://localhost:8000/graphql/")
MEILISEARCH_URL = os.environ.get("MEILISEARCH_URL", "http://localhost:7700")
MEILISEARCH_API_KEY = os.environ.get("MEILISEARCH_API_KEY")  # None is valid for local dev


def get_meilisearch_headers() -> dict:
    """Get headers for Meilisearch requests, including auth if API key is set."""
    headers = {"Content-Type": "application/json"}
    if MEILISEARCH_API_KEY:
        headers["Authorization"] = f"Bearer {MEILISEARCH_API_KEY}"
    return headers


def get_saleor_count(channel: str) -> int:
    """Get published product count from Saleor."""
    query = """
    query($channel: String!) {
        products(first: 1, channel: $channel, filter: {isPublished: true}) {
            totalCount
        }
    }
    """
    try:
        response = requests.post(
            SALEOR_API,
            json={"query": query, "variables": {"channel": channel}},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        data = response.json()
        return data.get("data", {}).get("products", {}).get("totalCount", 0)
    except Exception as e:
        print(f"Error fetching Saleor count: {e}")
        return -1


def get_meilisearch_count(index_name: str) -> int:
    """Get document count from Meilisearch."""
    try:
        response = requests.get(f"{MEILISEARCH_URL}/indexes/{index_name}/stats", headers=get_meilisearch_headers(), timeout=10)
        if response.status_code == 200:
            return response.json().get("numberOfDocuments", 0)
        elif response.status_code == 404:
            print(f"Index '{index_name}' does not exist")
            return 0
        else:
            print(f"Error fetching Meilisearch stats: {response.status_code}")
            return -1
    except Exception as e:
        print(f"Error connecting to Meilisearch: {e}")
        return -1


def get_saleor_product_ids(channel: str, token: str = None) -> set:
    """Fetch all product IDs from Saleor (for detailed comparison)."""
    query = """
    query($channel: String!, $after: String) {
        products(first: 100, after: $after, channel: $channel, filter: {isPublished: true}) {
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                }
            }
        }
    }
    """
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    all_ids = set()
    after = None
    page = 0

    print("Fetching Saleor product IDs...")
    while True:
        page += 1
        response = requests.post(
            SALEOR_API,
            json={"query": query, "variables": {"channel": channel, "after": after}},
            headers=headers,
            timeout=60
        )
        data = response.json()
        products_data = data.get("data", {}).get("products", {})

        for edge in products_data.get("edges", []):
            all_ids.add(edge["node"]["id"])

        if page % 10 == 0:
            print(f"  Page {page}: {len(all_ids)} products so far")

        if not products_data.get("pageInfo", {}).get("hasNextPage"):
            break
        after = products_data["pageInfo"]["endCursor"]

    return all_ids


def get_meilisearch_ids(index_name: str) -> set:
    """Fetch all document IDs from Meilisearch."""
    all_ids = set()
    offset = 0
    limit = 1000

    print("Fetching Meilisearch document IDs...")
    while True:
        response = requests.post(
            f"{MEILISEARCH_URL}/indexes/{index_name}/search",
            json={
                "q": "",
                "limit": limit,
                "offset": offset,
                "attributesToRetrieve": ["original_id"]
            },
            headers=get_meilisearch_headers(),
            timeout=30
        )
        if response.status_code != 200:
            break

        data = response.json()
        hits = data.get("hits", [])

        if not hits:
            break

        for hit in hits:
            # Use original_id which contains the Saleor GraphQL ID
            original_id = hit.get("original_id")
            if original_id:
                all_ids.add(original_id)

        if len(hits) < limit:
            break

        offset += limit
        if offset % 10000 == 0:
            print(f"  Offset {offset}: {len(all_ids)} documents so far")

    return all_ids


def compare_ids(saleor_ids: set, meili_ids: set) -> tuple:
    """Compare IDs between systems."""
    missing_in_meili = saleor_ids - meili_ids
    extra_in_meili = meili_ids - saleor_ids
    return missing_in_meili, extra_in_meili


def main():
    parser = argparse.ArgumentParser(description="Reconcile Saleor and Meilisearch product counts")
    parser.add_argument("--channel", required=True, help="Channel slug to check")
    parser.add_argument("--fix", action="store_true", help="Sync missing documents (requires running full sync)")
    parser.add_argument("--detailed", action="store_true", help="Compare individual product IDs (slower)")
    args = parser.parse_args()

    index_name = f"{args.channel}-products"

    print("=" * 60)
    print(f"Reconciliation Report: {args.channel}")
    print("=" * 60)
    print()

    # Get counts
    saleor_count = get_saleor_count(args.channel)
    meili_count = get_meilisearch_count(index_name)

    print(f"Saleor products:     {saleor_count:,}")
    print(f"Meilisearch docs:    {meili_count:,}")
    print()

    if saleor_count < 0 or meili_count < 0:
        print("ERROR: Could not retrieve counts from one or both systems")
        sys.exit(1)

    diff = abs(saleor_count - meili_count)
    if diff == 0:
        print("✅ Counts match perfectly!")
        if not args.detailed:
            sys.exit(0)

    if diff > 0:
        print(f"⚠️  MISMATCH: {diff:,} documents differ")
        if saleor_count > meili_count:
            print(f"   → {diff:,} products in Saleor but not in Meilisearch")
        else:
            print(f"   → {diff:,} documents in Meilisearch but not in Saleor")
        print()

    # Detailed comparison if requested
    if args.detailed:
        print("-" * 60)
        print("Detailed ID comparison (this may take a while)...")
        print()

        saleor_ids = get_saleor_product_ids(args.channel)
        meili_ids = get_meilisearch_ids(index_name)

        missing_in_meili, extra_in_meili = compare_ids(saleor_ids, meili_ids)

        print()
        print(f"Products missing from Meilisearch: {len(missing_in_meili):,}")
        print(f"Extra documents in Meilisearch:    {len(extra_in_meili):,}")

        if missing_in_meili and len(missing_in_meili) <= 10:
            print("\nMissing product IDs:")
            for pid in list(missing_in_meili)[:10]:
                print(f"  - {pid}")

        if extra_in_meili and len(extra_in_meili) <= 10:
            print("\nExtra document IDs:")
            for pid in list(extra_in_meili)[:10]:
                print(f"  - {pid}")

    # Fix suggestion
    if args.fix and diff > 0:
        print()
        print("-" * 60)
        print("To fix the mismatch, run a full sync:")
        print(f"  python scripts/sync-meilisearch.py --channel {args.channel}")
        print()
        print("Or for a full reindex (recommended if extra documents exist):")
        print(f"  python scripts/sync-meilisearch.py --full --channel {args.channel}")

    print()
    print("=" * 60)

    sys.exit(0 if diff == 0 else 1)


if __name__ == "__main__":
    main()
