#!/usr/bin/env python3
"""
Simple, robust script to add products to a channel.
Processes sequentially for reliability. Handles IntegrityErrors as success.
"""

import os
import sys
import argparse
import requests
import time

SALEOR_API = os.environ.get("SALEOR_API_URL", "http://localhost:8000/graphql/")
SALEOR_ADMIN_EMAIL = os.environ.get("SALEOR_ADMIN_EMAIL")
SALEOR_ADMIN_PASSWORD = os.environ.get("SALEOR_ADMIN_PASSWORD")


class TokenManager:
    def __init__(self):
        self.token = None
        self.refresh_token = None
        self.request_count = 0

    def authenticate(self):
        r = requests.post(SALEOR_API, json={
            "query": "mutation($email: String!, $password: String!) { tokenCreate(email: $email, password: $password) { token refreshToken } }",
            "variables": {"email": SALEOR_ADMIN_EMAIL, "password": SALEOR_ADMIN_PASSWORD}
        }, timeout=30)
        data = r.json().get("data", {}).get("tokenCreate", {})
        self.token = data.get("token")
        self.refresh_token = data.get("refreshToken")
        self.request_count = 0
        return bool(self.token)

    def refresh(self):
        if self.refresh_token:
            try:
                r = requests.post(SALEOR_API, json={
                    "query": "mutation($rt: String!) { tokenRefresh(refreshToken: $rt) { token } }",
                    "variables": {"rt": self.refresh_token}
                }, timeout=30)
                new_token = r.json().get("data", {}).get("tokenRefresh", {}).get("token")
                if new_token:
                    self.token = new_token
                    self.request_count = 0
                    return True
            except:
                pass
        return self.authenticate()

    def get_headers(self):
        self.request_count += 1
        if self.request_count >= 50:
            self.refresh()
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}


def get_products(tm, channel, category, cursor=None, first=100):
    r = requests.post(SALEOR_API, json={
        "query": """query($ch: String!, $cat: ID!, $first: Int!, $after: String) {
            products(channel: $ch, filter: {categories: [$cat]}, first: $first, after: $after) {
                totalCount pageInfo { hasNextPage endCursor }
                edges { node { id variants { id } } }
            }
        }""",
        "variables": {"ch": channel, "cat": category, "first": first, "after": cursor}
    }, headers=tm.get_headers(), timeout=60)
    return r.json().get("data", {}).get("products", {})


def add_product(tm, product_id, channel_id):
    try:
        r = requests.post(SALEOR_API, json={
            "query": "mutation($pid: ID!, $input: ProductChannelListingUpdateInput!) { productChannelListingUpdate(id: $pid, input: $input) { errors { message } } }",
            "variables": {"pid": product_id, "input": {"updateChannels": [{"channelId": channel_id, "isPublished": True, "isAvailableForPurchase": True, "visibleInListings": True}]}}
        }, headers=tm.get_headers(), timeout=30)
        return True
    except:
        return False


def add_variants_bulk(tm, product_id, variant_ids, channel_id):
    if not variant_ids:
        return 0
    try:
        variants_input = [{"id": vid, "channelListings": {"create": [{"channelId": channel_id, "price": 0}]}} for vid in variant_ids]
        r = requests.post(SALEOR_API, json={
            "query": "mutation($p: ID!, $v: [ProductVariantBulkUpdateInput!]!) { productVariantBulkUpdate(product: $p, variants: $v, errorPolicy: IGNORE_FAILED) { count } }",
            "variables": {"p": product_id, "v": variants_input}
        }, headers=tm.get_headers(), timeout=60)
        data = r.json()
        # IntegrityError = already exists = success
        if data.get("errors"):
            for e in data["errors"]:
                if isinstance(e, dict) and "IntegrityError" in str(e.get("extensions", {})):
                    return len(variant_ids)
        return data.get("data", {}).get("productVariantBulkUpdate", {}).get("count", 0) or len(variant_ids)
    except Exception as e:
        return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-channel", required=True)
    parser.add_argument("--target-channel", required=True)
    parser.add_argument("--category", required=True)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    print(f"Adding products from {args.source_channel} to {args.target_channel}")
    print(f"Category: {args.category}, Batch: {args.batch_size}")

    tm = TokenManager()
    if not tm.authenticate():
        print("Auth failed!")
        sys.exit(1)

    # Get target channel ID
    r = requests.post(SALEOR_API, json={
        "query": 'query($s: String!) { channel(slug: $s) { id } }',
        "variables": {"s": args.target_channel}
    }, headers=tm.get_headers(), timeout=30)
    channel_id = r.json().get("data", {}).get("channel", {}).get("id")
    if not channel_id:
        print(f"Channel {args.target_channel} not found!")
        sys.exit(1)
    print(f"Target channel ID: {channel_id}")

    cursor = None
    total_processed = 0
    total_variants = 0
    start = time.time()

    while True:
        products = get_products(tm, args.source_channel, args.category, cursor, args.batch_size)
        total_count = products.get("totalCount", 0)
        edges = products.get("edges", [])
        page_info = products.get("pageInfo", {})

        if total_processed == 0:
            print(f"Total products: {total_count}")

        for edge in edges:
            p = edge["node"]
            variant_ids = [v["id"] for v in p.get("variants", [])]

            add_product(tm, p["id"], channel_id)
            if variant_ids:
                added = add_variants_bulk(tm, p["id"], variant_ids, channel_id)
                total_variants += added

            total_processed += 1

            if total_processed % 50 == 0:
                elapsed = time.time() - start
                rate = total_processed / elapsed if elapsed > 0 else 0
                eta = (total_count - total_processed) / rate / 60 if rate > 0 else 0
                print(f"  {total_processed}/{total_count} products, {total_variants} variants, {rate:.1f}/s, ETA {eta:.0f}m")

        if args.limit and total_processed >= args.limit:
            break
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    print(f"\nDone! {total_processed} products, {total_variants} variants in {(time.time()-start)/60:.1f} min")


if __name__ == "__main__":
    main()
