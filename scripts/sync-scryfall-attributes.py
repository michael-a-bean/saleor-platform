#!/usr/bin/env python3
"""
Sync Scryfall attributes to Saleor products.

This script:
1. Creates missing MTG attributes in Saleor
2. Fetches card data from Scryfall using scryfall_id
3. Updates products with oracle_text, flavor_text, and other missing fields

Usage:
    python scripts/sync-scryfall-attributes.py [--dry-run] [--limit N]
"""

import requests
import time
import argparse
import sys
import json
from typing import Optional

SALEOR_API = "http://localhost:8000/graphql/"
SCRYFALL_API = "https://api.scryfall.com"

# Attributes to create/sync from Scryfall
# Valid input types: DROPDOWN, MULTISELECT, FILE, REFERENCE, SINGLE_REFERENCE,
#                   NUMERIC, RICH_TEXT, PLAIN_TEXT, SWATCH, BOOLEAN, DATE, DATE_TIME
SCRYFALL_ATTRIBUTES = {
    # Text fields (use RICH_TEXT for multi-line content)
    "mtg-oracle-text": {"name": "Oracle Text", "input_type": "RICH_TEXT", "scryfall_field": "oracle_text"},
    "mtg-flavor-text": {"name": "Flavor Text", "input_type": "RICH_TEXT", "scryfall_field": "flavor_text"},
    "mtg-keywords": {"name": "Keywords", "input_type": "PLAIN_TEXT", "scryfall_field": "keywords"},

    # Metadata
    "mtg-colors": {"name": "Colors", "input_type": "PLAIN_TEXT", "scryfall_field": "colors"},
    "mtg-layout": {"name": "Layout", "input_type": "DROPDOWN", "scryfall_field": "layout"},
    "mtg-frame": {"name": "Frame", "input_type": "DROPDOWN", "scryfall_field": "frame"},
    "mtg-border-color": {"name": "Border Color", "input_type": "DROPDOWN", "scryfall_field": "border_color"},
    "mtg-set-type": {"name": "Set Type", "input_type": "DROPDOWN", "scryfall_field": "set_type"},
    "mtg-released-at": {"name": "Released At", "input_type": "DATE", "scryfall_field": "released_at"},
    "mtg-lang": {"name": "Language", "input_type": "DROPDOWN", "scryfall_field": "lang"},

    # Boolean flags
    "mtg-is-foil": {"name": "Foil Available", "input_type": "BOOLEAN", "scryfall_field": "foil"},
    "mtg-is-nonfoil": {"name": "Nonfoil Available", "input_type": "BOOLEAN", "scryfall_field": "nonfoil"},
    "mtg-is-oversized": {"name": "Oversized", "input_type": "BOOLEAN", "scryfall_field": "oversized"},
    "mtg-is-textless": {"name": "Textless", "input_type": "BOOLEAN", "scryfall_field": "textless"},
    "mtg-is-variation": {"name": "Variation", "input_type": "BOOLEAN", "scryfall_field": "variation"},
    "mtg-is-story-spotlight": {"name": "Story Spotlight", "input_type": "BOOLEAN", "scryfall_field": "story_spotlight"},
    "mtg-in-booster": {"name": "In Booster", "input_type": "BOOLEAN", "scryfall_field": "booster"},

    # IDs
    "mtg-illustration-id": {"name": "Illustration ID", "input_type": "PLAIN_TEXT", "scryfall_field": "illustration_id"},
    "mtg-multiverse-ids": {"name": "Multiverse IDs", "input_type": "PLAIN_TEXT", "scryfall_field": "multiverse_ids"},

    # Rankings
    "mtg-edhrec-rank": {"name": "EDHREC Rank", "input_type": "NUMERIC", "scryfall_field": "edhrec_rank"},
    "mtg-penny-rank": {"name": "Penny Rank", "input_type": "NUMERIC", "scryfall_field": "penny_rank"},

    # Legalities (stored as JSON-like string)
    "mtg-legalities": {"name": "Format Legalities", "input_type": "RICH_TEXT", "scryfall_field": "legalities"},

    # Image
    "mtg-image-uri": {"name": "Scryfall Image URI", "input_type": "PLAIN_TEXT", "scryfall_field": "image_uris.normal"},
    "mtg-art-crop-uri": {"name": "Art Crop URI", "input_type": "PLAIN_TEXT", "scryfall_field": "image_uris.art_crop"},
}


def get_auth_token() -> str:
    """Get authentication token from Saleor."""
    mutation = """
    mutation {
        tokenCreate(email: "admin@example.com", password: "admin") {
            token
            errors { message }
        }
    }
    """
    response = requests.post(SALEOR_API, json={"query": mutation})
    data = response.json()
    if data.get("data", {}).get("tokenCreate", {}).get("token"):
        return data["data"]["tokenCreate"]["token"]
    raise Exception(f"Failed to get token: {data}")


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


def get_existing_attributes(token: str) -> dict:
    """Get existing MTG attributes from Saleor."""
    query = """
    query {
        attributes(first: 100, filter: {search: "mtg"}) {
            edges {
                node {
                    id
                    slug
                    name
                    inputType
                }
            }
        }
    }
    """
    result = graphql_request(query, token=token)
    attrs = {}
    for edge in result.get("data", {}).get("attributes", {}).get("edges", []):
        node = edge["node"]
        attrs[node["slug"]] = node
    return attrs


def create_attribute(slug: str, config: dict, token: str, dry_run: bool = False) -> Optional[str]:
    """Create a new attribute in Saleor."""
    mutation = """
    mutation CreateAttribute($input: AttributeCreateInput!) {
        attributeCreate(input: $input) {
            attribute {
                id
                slug
            }
            errors {
                field
                message
            }
        }
    }
    """

    input_type = config["input_type"]

    # Text-based types can't be filterable
    can_filter = input_type not in ["PLAIN_TEXT", "RICH_TEXT"]

    variables = {
        "input": {
            "slug": slug,
            "name": config["name"],
            "type": "PRODUCT_TYPE",
            "inputType": input_type,
            "filterableInStorefront": can_filter,
            "filterableInDashboard": can_filter,
            "availableInGrid": False,
            "visibleInStorefront": input_type not in ["MULTILINE", "PLAIN_TEXT"],  # Hide long text fields
            "storefrontSearchPosition": 0,
        }
    }

    if dry_run:
        print(f"  [DRY RUN] Would create attribute: {slug} ({config['name']})")
        return None

    result = graphql_request(mutation, variables, token)

    # Check for GraphQL errors at the top level
    if "errors" in result:
        print(f"  GraphQL error creating {slug}: {result['errors']}")
        return None

    data = result.get("data", {}).get("attributeCreate", {})
    errors = data.get("errors", [])
    if errors:
        print(f"  Error creating {slug}: {errors}")
        return None

    attr_id = data.get("attribute", {}).get("id")
    if not attr_id:
        print(f"  Warning: {slug} created but no ID returned. Full response: {result}")
        return None

    print(f"  Created attribute: {slug} ({config['name']}) -> {attr_id}")
    return attr_id


def get_product_type_id(token: str) -> str:
    """Get the MTG card product type ID."""
    query = """
    query {
        productTypes(first: 10, filter: {search: "card"}) {
            edges {
                node {
                    id
                    name
                }
            }
        }
    }
    """
    result = graphql_request(query, token=token)
    for edge in result.get("data", {}).get("productTypes", {}).get("edges", []):
        if "card" in edge["node"]["name"].lower():
            return edge["node"]["id"]
    return None


def assign_attribute_to_product_type(attr_id: str, product_type_id: str, token: str, dry_run: bool = False) -> bool:
    """Assign attribute to product type."""
    mutation = """
    mutation AssignAttribute($productTypeId: ID!, $operations: [ProductAttributeAssignInput!]!) {
        productAttributeAssign(productTypeId: $productTypeId, operations: $operations) {
            errors {
                field
                message
            }
        }
    }
    """

    variables = {
        "productTypeId": product_type_id,
        "operations": [{"id": attr_id, "type": "PRODUCT"}]
    }

    if dry_run:
        return True

    result = graphql_request(mutation, variables, token)
    errors = result.get("data", {}).get("productAttributeAssign", {}).get("errors", [])
    if errors:
        print(f"    Error assigning attribute: {errors}")
    return len(errors) == 0


def get_products_with_scryfall_id(token: str, limit: int = 100, after: str = None) -> tuple:
    """Get products that have a scryfall ID."""
    query = """
    query GetProducts($first: Int!, $after: String) {
        products(first: $first, after: $after, channel: "webstore") {
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                    name
                    attributes {
                        attribute {
                            slug
                        }
                        values {
                            name
                        }
                    }
                }
            }
        }
    }
    """

    variables = {"first": limit}
    if after:
        variables["after"] = after

    result = graphql_request(query, variables, token)
    products_data = result.get("data", {}).get("products", {})

    products = []
    for edge in products_data.get("edges", []):
        node = edge["node"]
        attrs = {}
        for attr in node.get("attributes", []):
            slug = attr["attribute"]["slug"]
            values = [v["name"] for v in attr.get("values", [])]
            attrs[slug] = values[0] if values else None

        if attrs.get("mtg-scryfall-id"):
            products.append({
                "id": node["id"],
                "name": node["name"],
                "scryfall_id": attrs["mtg-scryfall-id"],
                "existing_attrs": attrs
            })

    page_info = products_data.get("pageInfo", {})
    return products, page_info.get("hasNextPage", False), page_info.get("endCursor")


def fetch_scryfall_card(scryfall_id: str) -> Optional[dict]:
    """Fetch card data from Scryfall."""
    try:
        response = requests.get(f"{SCRYFALL_API}/cards/{scryfall_id}")
        if response.status_code == 200:
            return response.json()
        print(f"  Scryfall returned {response.status_code} for {scryfall_id}")
        return None
    except Exception as e:
        print(f"  Error fetching from Scryfall: {e}")
        return None


def get_nested_value(obj: dict, path: str):
    """Get a nested value from a dict using dot notation."""
    keys = path.split(".")
    value = obj
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
        else:
            return None
    return value


def format_attribute_value(value, input_type: str) -> Optional[str]:
    """Format a value for Saleor attribute."""
    if value is None:
        return None

    if isinstance(value, bool):
        return "Yes" if value else "No"
    elif isinstance(value, list):
        if not value:
            return None
        return ", ".join(str(v) for v in value)
    elif isinstance(value, dict):
        # For legalities, format as "format: status" pairs
        return "\n".join(f"{k}: {v}" for k, v in value.items() if v != "not_legal")
    elif isinstance(value, (int, float)):
        return str(value)
    else:
        return str(value)


def update_product_attributes(product_id: str, attributes: list, token: str, dry_run: bool = False) -> bool:
    """Update product attributes."""
    mutation = """
    mutation UpdateProduct($id: ID!, $input: ProductInput!) {
        productUpdate(id: $id, input: $input) {
            errors {
                field
                message
            }
        }
    }
    """

    variables = {
        "id": product_id,
        "input": {
            "attributes": attributes
        }
    }

    if dry_run:
        return True

    result = graphql_request(mutation, variables, token)
    errors = result.get("data", {}).get("productUpdate", {}).get("errors", [])
    if errors:
        print(f"  Error updating product: {errors}")
        return False
    return True


def main():
    parser = argparse.ArgumentParser(description="Sync Scryfall attributes to Saleor")
    parser.add_argument("--dry-run", action="store_true", help="Don't make any changes")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of products to process (0 = all)")
    parser.add_argument("--skip-create", action="store_true", help="Skip creating attributes")
    parser.add_argument("--skip-sync", action="store_true", help="Skip syncing product data")
    args = parser.parse_args()

    print("=== Scryfall Attribute Sync ===")
    print()

    # Get auth token
    print("Authenticating...")
    try:
        token = get_auth_token()
        print("  Authenticated successfully")
    except Exception as e:
        print(f"  Failed to authenticate: {e}")
        sys.exit(1)

    # Get existing attributes
    print()
    print("Checking existing attributes...")
    existing_attrs = get_existing_attributes(token)
    print(f"  Found {len(existing_attrs)} existing MTG attributes")

    # Get product type
    product_type_id = get_product_type_id(token)
    if not product_type_id:
        print("  Warning: Could not find MTG card product type")
    else:
        print(f"  Product type ID: {product_type_id}")

    # Create missing attributes
    if not args.skip_create:
        print()
        print("Creating missing attributes...")
        created_count = 0
        for slug, config in SCRYFALL_ATTRIBUTES.items():
            if slug not in existing_attrs:
                attr_id = create_attribute(slug, config, token, args.dry_run)
                if attr_id and product_type_id:
                    assign_attribute_to_product_type(attr_id, product_type_id, token, args.dry_run)
                created_count += 1
            else:
                print(f"  Attribute exists: {slug}")

        print(f"  Created {created_count} new attributes")

    # Refresh attribute list
    existing_attrs = get_existing_attributes(token)
    attr_id_map = {slug: node["id"] for slug, node in existing_attrs.items()}

    # Sync product data
    if not args.skip_sync:
        print()
        print("Syncing product data from Scryfall...")

        processed = 0
        updated = 0
        cursor = None

        while True:
            products, has_next, cursor = get_products_with_scryfall_id(token, limit=50, after=cursor)

            for product in products:
                if args.limit > 0 and processed >= args.limit:
                    break

                processed += 1
                scryfall_id = product["scryfall_id"]

                print(f"  [{processed}] {product['name'][:40]}...")

                # Fetch from Scryfall
                card_data = fetch_scryfall_card(scryfall_id)
                if not card_data:
                    continue

                # Respect Scryfall rate limit (100ms between requests)
                time.sleep(0.1)

                # Build attribute updates
                attr_updates = []
                for slug, config in SCRYFALL_ATTRIBUTES.items():
                    if slug not in attr_id_map:
                        continue

                    scryfall_field = config["scryfall_field"]
                    value = get_nested_value(card_data, scryfall_field)
                    formatted = format_attribute_value(value, config["input_type"])

                    if formatted:
                        input_type = config["input_type"]
                        attr_update = {"id": attr_id_map[slug]}

                        # Use the correct input field for each attribute type
                        if input_type == "RICH_TEXT":
                            # Rich text needs JSON format with blocks
                            rich_text_json = json.dumps({
                                "time": 0,
                                "blocks": [{"type": "paragraph", "data": {"text": formatted}}],
                                "version": "2.22.2"
                            })
                            attr_update["richText"] = rich_text_json
                        elif input_type == "PLAIN_TEXT":
                            attr_update["plainText"] = formatted
                        elif input_type == "BOOLEAN":
                            attr_update["boolean"] = formatted == "Yes"
                        elif input_type == "NUMERIC":
                            attr_update["numeric"] = formatted
                        elif input_type == "DATE":
                            attr_update["date"] = formatted
                        elif input_type in ["DROPDOWN", "MULTISELECT"]:
                            attr_update["values"] = [formatted]
                        else:
                            attr_update["values"] = [formatted]

                        attr_updates.append(attr_update)

                if attr_updates:
                    if args.dry_run:
                        print(f"    [DRY RUN] Would update {len(attr_updates)} attributes")
                    else:
                        if update_product_attributes(product["id"], attr_updates, token, args.dry_run):
                            updated += 1
                            print(f"    Updated {len(attr_updates)} attributes")

            if not has_next or (args.limit > 0 and processed >= args.limit):
                break

        print()
        print(f"Processed {processed} products, updated {updated}")

    print()
    print("Done!")


if __name__ == "__main__":
    main()
