#!/usr/bin/env python3
"""
GraphQL-based MTG card import using Saleor bulk mutations.

This script creates products and variants using Saleor's GraphQL API instead of
direct Django ORM operations. Benefits:
- Emits webhooks for downstream sync (inventory-ops, Meilisearch)
- Proper validation (prevents discounted_price_amount NULL issue)
- Audit trail in Saleor admin
- Works remotely (doesn't require Django context)
- Automatic retry with exponential backoff
- Persistent checkpoint support for resume capability

Usage:
    # Full import (requires SALEOR_API_TOKEN - use App token for unattended operation)
    python scripts/mtg_scryfall_import/import_graphql.py all-cards.json --channel webstore

    # Limited import for testing
    python scripts/mtg_scryfall_import/import_graphql.py all-cards.json --limit 100 --dry-run

    # Resume from checkpoint
    python scripts/mtg_scryfall_import/import_graphql.py all-cards.json --resume

    # Use persistent checkpoint location
    python scripts/mtg_scryfall_import/import_graphql.py all-cards.json --checkpoint-dir /data/checkpoints

Prerequisites:
    - SALEOR_API_URL environment variable (or --api-url argument)
    - SALEOR_API_TOKEN environment variable (or --token argument)
      IMPORTANT: Use a Saleor App token (non-expiring) for unattended operation.
      User tokens expire after ~5 minutes and will cause failures.
    - Product type, category, and attributes must already exist
    - Variant attributes (mtg-condition, mtg-finish) must exist

Environment Variables:
    SALEOR_API_URL: GraphQL endpoint (default: http://localhost:8000/graphql/)
    SALEOR_API_TOKEN: Bearer token for authentication (use App token, not user token!)
    MTG_IMPORT_CHECKPOINT_DIR: Directory for checkpoint files (default: /tmp)

Creating a Saleor App Token (for unattended operation):
    1. Go to Saleor Dashboard > Configuration > Webhooks & Events > Apps
    2. Create a new App with permissions: MANAGE_PRODUCTS, MANAGE_PRODUCT_TYPES_AND_ATTRIBUTES
    3. Generate an API token - these do NOT expire
    4. Set: export SALEOR_API_TOKEN="your-app-token"
"""

import argparse
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional
from urllib3.util.retry import Retry

import requests
from requests.adapters import HTTPAdapter

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger(__name__)

# =============================================================================
# Configuration
# =============================================================================

DEFAULT_API_URL = os.getenv("SALEOR_API_URL", "http://localhost:8000/graphql/")
DEFAULT_CHANNEL = "webstore"
BATCH_SIZE = 25  # Reduced for stability - Saleor recommends smaller batches
DEFAULT_CHECKPOINT_DIR = os.getenv("MTG_IMPORT_CHECKPOINT_DIR", "/tmp")
VARIANT_WORKERS = 8  # Parallel workers for variant creation (tune based on API capacity)
PRODUCT_WORKERS = 5  # Parallel workers for product creation (tune based on API capacity)

# Retry configuration
MAX_RETRIES = 5
RETRY_BACKOFF_FACTOR = 2  # Exponential backoff: 2, 4, 8, 16, 32 seconds
RETRY_STATUS_CODES = [429, 500, 502, 503, 504]  # Retry on these HTTP codes
CONNECTION_TIMEOUT = 30  # seconds
READ_TIMEOUT = 120  # seconds for long-running mutations

# Condition multipliers for variant pricing
CONDITION_MULTIPLIERS = {
    "NM": Decimal("1.0"),
    "LP": Decimal("0.9"),
    "MP": Decimal("0.75"),
    "HP": Decimal("0.5"),
    "DMG": Decimal("0.25"),
}

# Finish types
FINISHES = ["nonfoil", "foil", "etched"]
CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"]

# =============================================================================
# GraphQL Queries and Mutations
# =============================================================================

FETCH_SETUP_QUERY = """
query FetchSetup($channelSlug: String!) {
  channels {
    id
    slug
  }
  productTypes(first: 10, filter: {slugs: ["mtg-card"]}) {
    edges {
      node {
        id
        slug
        productAttributes {
          id
          slug
          inputType
        }
        variantAttributes {
          id
          slug
          inputType
          choices(first: 100) {
            edges {
              node {
                id
                slug
                name
              }
            }
          }
        }
      }
    }
  }
  categories(first: 10, filter: {slugs: ["mtg-singles"]}) {
    edges {
      node {
        id
        slug
      }
    }
  }
  channel(slug: $channelSlug) {
    id
    slug
  }
}
"""

PRODUCT_BULK_CREATE = """
mutation ProductBulkCreate($products: [ProductBulkCreateInput!]!) {
  productBulkCreate(products: $products) {
    count
    results {
      product {
        id
        name
        slug
        externalReference
      }
      errors {
        path
        message
        code
      }
    }
    errors {
      path
      message
      code
    }
  }
}
"""

PRODUCT_VARIANT_BULK_CREATE = """
mutation ProductVariantBulkCreate($productId: ID!, $variants: [ProductVariantBulkCreateInput!]!) {
  productVariantBulkCreate(product: $productId, variants: $variants) {
    count
    results {
      productVariant {
        id
        sku
        name
      }
      errors {
        path
        message
        code
      }
    }
    errors {
      path
      message
      code
    }
  }
}
"""

# Single variant create - fallback for Saleor versions with buggy bulk mutation
PRODUCT_VARIANT_CREATE = """
mutation ProductVariantCreate($input: ProductVariantCreateInput!) {
  productVariantCreate(input: $input) {
    productVariant {
      id
      sku
      name
    }
    errors {
      field
      message
      code
    }
  }
}
"""

# Update variant channel listing (for setting prices)
PRODUCT_VARIANT_CHANNEL_LISTING_UPDATE = """
mutation ProductVariantChannelListingUpdate($id: ID!, $input: [ProductVariantChannelListingAddInput!]!) {
  productVariantChannelListingUpdate(id: $id, input: $input) {
    variant {
      id
      channelListings {
        channel { slug }
        price { amount }
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

CHECK_PRODUCT_EXISTS = """
query CheckProductExists($externalRef: String!) {
  product(externalReference: $externalRef) {
    id
    name
  }
}
"""

# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class SetupData:
    """Holds IDs needed for import."""
    channel_id: str
    product_type_id: str
    category_id: str
    attribute_map: dict[str, str]  # slug -> id (product attributes)
    attribute_types: dict[str, str] = field(default_factory=dict)  # slug -> inputType
    variant_attribute_map: dict[str, str] = field(default_factory=dict)  # slug -> id
    # Variant attribute choices: {attr_slug: {choice_slug: choice_id}}
    variant_attribute_choices: dict[str, dict[str, str]] = field(default_factory=dict)


@dataclass
class ImportStats:
    """Track import statistics."""
    products_created: int = 0
    products_skipped: int = 0
    products_failed: int = 0
    variants_created: int = 0
    variants_failed: int = 0
    start_time: float = 0.0

    def summary(self) -> str:
        elapsed = time.time() - self.start_time
        return (
            f"Products: {self.products_created} created, "
            f"{self.products_skipped} skipped, {self.products_failed} failed | "
            f"Variants: {self.variants_created} created, {self.variants_failed} failed | "
            f"Time: {elapsed:.1f}s"
        )


# =============================================================================
# GraphQL Client
# =============================================================================

class SaleorClient:
    """GraphQL client for Saleor API with retry logic and connection pooling."""

    def __init__(self, api_url: str, token: str):
        self.api_url = api_url
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })

        # Configure retry strategy with exponential backoff
        retry_strategy = Retry(
            total=MAX_RETRIES,
            backoff_factor=RETRY_BACKOFF_FACTOR,
            status_forcelist=RETRY_STATUS_CODES,
            allowed_methods=["POST"],  # GraphQL uses POST
            raise_on_status=False,  # We handle status ourselves
        )
        # Large pool for parallel workers: product_workers * variant_workers connections
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=100,
            pool_maxsize=100,
        )
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def execute(self, query: str, variables: Optional[dict] = None, retries: int = 3) -> dict:
        """Execute a GraphQL query/mutation with retry logic."""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        last_exception = None
        for attempt in range(retries):
            try:
                response = self.session.post(
                    self.api_url,
                    json=payload,
                    timeout=(CONNECTION_TIMEOUT, READ_TIMEOUT),
                )
                response.raise_for_status()

                data = response.json()
                if "errors" in data:
                    # Check if it's a retryable error
                    error_messages = [e.get("message", "") for e in data.get("errors", [])]
                    if any("timeout" in msg.lower() or "connection" in msg.lower() for msg in error_messages):
                        if attempt < retries - 1:
                            wait_time = RETRY_BACKOFF_FACTOR ** attempt
                            logger.warning(f"GraphQL error (attempt {attempt + 1}/{retries}), retrying in {wait_time}s: {error_messages}")
                            time.sleep(wait_time)
                            continue
                    raise Exception(f"GraphQL errors: {data['errors']}")

                return data.get("data", {})

            except requests.exceptions.ConnectionError as e:
                last_exception = e
                if attempt < retries - 1:
                    wait_time = RETRY_BACKOFF_FACTOR ** attempt
                    logger.warning(f"Connection error (attempt {attempt + 1}/{retries}), retrying in {wait_time}s: {e}")
                    time.sleep(wait_time)
                    continue
                raise

            except requests.exceptions.Timeout as e:
                last_exception = e
                if attempt < retries - 1:
                    wait_time = RETRY_BACKOFF_FACTOR ** attempt
                    logger.warning(f"Timeout (attempt {attempt + 1}/{retries}), retrying in {wait_time}s: {e}")
                    time.sleep(wait_time)
                    continue
                raise

            except requests.exceptions.HTTPError as e:
                # Don't retry 4xx errors (except 429 which is handled by retry strategy)
                if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                    raise
                last_exception = e
                if attempt < retries - 1:
                    wait_time = RETRY_BACKOFF_FACTOR ** attempt
                    logger.warning(f"HTTP error (attempt {attempt + 1}/{retries}), retrying in {wait_time}s: {e}")
                    time.sleep(wait_time)
                    continue
                raise

        # Should not reach here, but just in case
        if last_exception:
            raise last_exception
        raise Exception("Max retries exceeded")

    def fetch_setup(self, channel_slug: str) -> SetupData:
        """Fetch required IDs for import including variant attributes."""
        data = self.execute(FETCH_SETUP_QUERY, {"channelSlug": channel_slug})

        # Find channel
        channel = data.get("channel")
        if not channel:
            raise Exception(f"Channel '{channel_slug}' not found")

        # Find product type
        product_types = data.get("productTypes", {}).get("edges", [])
        product_type = None
        for edge in product_types:
            if edge["node"]["slug"] == "mtg-card":
                product_type = edge["node"]
                break

        if not product_type:
            raise Exception("Product type 'mtg-card' not found")

        # Find category
        categories = data.get("categories", {}).get("edges", [])
        category = None
        for edge in categories:
            if edge["node"]["slug"] == "mtg-singles":
                category = edge["node"]
                break

        if not category:
            raise Exception("Category 'mtg-singles' not found")

        # Build product attribute map and types
        attribute_map = {}
        attribute_types = {}
        for attr in product_type.get("productAttributes", []):
            attribute_map[attr["slug"]] = attr["id"]
            attribute_types[attr["slug"]] = attr.get("inputType", "PLAIN_TEXT")

        # Build variant attribute map and choices
        variant_attribute_map = {}
        variant_attribute_choices = {}
        for attr in product_type.get("variantAttributes", []):
            attr_slug = attr["slug"]
            variant_attribute_map[attr_slug] = attr["id"]

            # Build choices map for this attribute
            choices = {}
            for choice_edge in attr.get("choices", {}).get("edges", []):
                choice = choice_edge["node"]
                choices[choice["slug"]] = choice["id"]
            variant_attribute_choices[attr_slug] = choices

        # Validate required variant attributes exist
        required_variant_attrs = ["mtg-condition", "mtg-finish"]
        missing = [a for a in required_variant_attrs if a not in variant_attribute_map]
        if missing:
            logger.warning(f"Missing variant attributes (variants will be created without them): {missing}")
            logger.warning("Run scripts/mtg_finish_variants/create_finish_attribute.py to create them")

        return SetupData(
            channel_id=channel["id"],
            product_type_id=product_type["id"],
            category_id=category["id"],
            attribute_map=attribute_map,
            attribute_types=attribute_types,
            variant_attribute_map=variant_attribute_map,
            variant_attribute_choices=variant_attribute_choices,
        )

    def product_exists(self, external_ref: str) -> Optional[str]:
        """Check if product exists by external reference, return ID if exists."""
        try:
            data = self.execute(CHECK_PRODUCT_EXISTS, {"externalRef": external_ref})
            product = data.get("product")
            return product["id"] if product else None
        except Exception:
            return None


# =============================================================================
# Card Transformation
# =============================================================================

def transform_card_to_product(
    card: dict,
    setup: SetupData,
) -> dict:
    """Transform a Scryfall card to Saleor ProductBulkCreateInput."""

    scryfall_id = card.get("id", "")
    name = card.get("name", "Unknown Card")

    # Build slug from name and set
    set_code = card.get("set", "").lower()
    collector_num = card.get("collector_number", "")
    slug = f"{slugify(name)}-{set_code}-{collector_num}"[:255]

    # Build attributes
    attributes = []

    # Map Scryfall fields to Saleor attributes
    # Includes council-recommended attributes: color_identity, keywords, legalities, edhrec_rank
    field_mapping = [
        # Core identifiers
        ("id", "mtg-scryfall-id"),
        ("oracle_id", "mtg-oracle-id"),
        ("tcgplayer_id", "mtg-tcgplayer-id"),
        # Card properties
        ("rarity", "mtg-rarity"),
        ("type_line", "mtg-type-line"),
        ("mana_cost", "mtg-mana-cost"),
        ("cmc", "mtg-mana-value"),  # Council: HIGH priority
        ("set", "mtg-set-code"),
        ("set_name", "mtg-set-name"),
        ("artist", "mtg-artist"),
        ("collector_number", "mtg-collector-number"),
        ("power", "mtg-power"),
        ("toughness", "mtg-toughness"),
        # Council-recommended attributes
        ("edhrec_rank", "mtg-edhrec-rank"),  # Council: MEDIUM priority - Commander demand
    ]

    def make_attr_value(attr_slug: str, value: str) -> dict:
        """Create attribute value dict with correct format based on input type."""
        attr_type = setup.attribute_types.get(attr_slug, "PLAIN_TEXT")
        attr_id = setup.attribute_map[attr_slug]

        if attr_type == "PLAIN_TEXT":
            return {"id": attr_id, "plainText": value}
        else:
            # DROPDOWN, MULTISELECT, NUMERIC all use values
            return {"id": attr_id, "values": [value]}

    for scryfall_field, attr_slug in field_mapping:
        value = card.get(scryfall_field)
        if value is not None and attr_slug in setup.attribute_map:
            # Convert to string for text attributes
            str_value = str(value) if not isinstance(value, str) else value
            if str_value:  # Only add non-empty values
                attributes.append(make_attr_value(attr_slug, str_value))

    # Handle color_identity (array field) - Council: HIGH priority
    color_identity = card.get("color_identity", [])
    if color_identity and "mtg-color-identity" in setup.attribute_map:
        # For MULTISELECT, pass individual values
        attr_type = setup.attribute_types.get("mtg-color-identity", "MULTISELECT")
        if attr_type == "MULTISELECT":
            attributes.append({
                "id": setup.attribute_map["mtg-color-identity"],
                "values": color_identity,  # Pass array of colors
            })
        else:
            attributes.append(make_attr_value("mtg-color-identity", ",".join(color_identity)))

    # Handle keywords (array field) - Council: MEDIUM priority
    keywords = card.get("keywords", [])
    if keywords and "mtg-keywords" in setup.attribute_map:
        # Join keywords as comma-separated string for PLAIN_TEXT
        attributes.append(make_attr_value("mtg-keywords", ",".join(keywords)))

    # Handle legalities (dict field) - Council: MEDIUM priority (display-only recommended)
    legalities = card.get("legalities", {})
    if legalities and "mtg-legalities" in setup.attribute_map:
        # Format as "format:status" pairs, only include legal/restricted
        legal_formats = [
            f"{fmt}:{status}"
            for fmt, status in legalities.items()
            if status in ("legal", "restricted")
        ]
        if legal_formats:
            attributes.append(make_attr_value("mtg-legalities", ",".join(legal_formats)))

    # Build description from oracle text
    oracle_text = card.get("oracle_text", "")
    flavor_text = card.get("flavor_text", "")
    description_parts = []
    if oracle_text:
        description_parts.append(oracle_text)
    if flavor_text:
        description_parts.append(f"*{flavor_text}*")

    description_json = json.dumps({
        "blocks": [
            {"type": "paragraph", "data": {"text": part}}
            for part in description_parts
        ]
    }) if description_parts else None

    return {
        "productType": setup.product_type_id,
        "category": setup.category_id,
        "name": name,
        "slug": slug,
        "externalReference": scryfall_id,
        "description": description_json,
        "attributes": attributes,
        "channelListings": [{
            "channelId": setup.channel_id,
            "isPublished": True,
            "isAvailableForPurchase": True,
        }],
    }


def get_card_price(card: dict, finish: str) -> Optional[Decimal]:
    """Get the base price for a card in a specific finish."""
    prices = card.get("prices", {})

    price_keys = {
        "nonfoil": "usd",
        "foil": "usd_foil",
        "etched": "usd_etched",
    }

    key = price_keys.get(finish)
    if not key:
        return None

    price_str = prices.get(key)
    if not price_str:
        return None

    try:
        return Decimal(price_str)
    except Exception:
        return None


def transform_card_to_variants(
    card: dict,
    product_id: str,
    setup: SetupData,
) -> list[dict]:
    """Transform a Scryfall card to Saleor ProductVariantBulkCreateInput list.

    Creates variants for each condition × finish combination, with proper
    variant attributes (mtg-condition, mtg-finish) for filtering and search.
    """

    scryfall_id = card.get("id", "")
    finishes_available = card.get("finishes", ["nonfoil"])

    # Map condition codes to attribute value slugs (must match Saleor attribute choices)
    condition_slug_map = {
        "NM": "near-mint",
        "LP": "lightly-played",
        "MP": "moderately-played",
        "HP": "heavily-played",
        "DMG": "damaged",
    }

    # Map finish names to attribute value slugs (must match Saleor attribute choices)
    finish_slug_map = {
        "nonfoil": "nonfoil",
        "foil": "foil",
        "etched": "etched",
    }

    variants = []

    for finish in finishes_available:
        if finish not in FINISHES:
            continue

        base_price = get_card_price(card, finish)
        if base_price is None:
            continue  # Skip finishes without prices

        for condition in CONDITIONS:
            multiplier = CONDITION_MULTIPLIERS[condition]
            price = (base_price * multiplier).quantize(Decimal("0.01"))

            # Build SKU: scryfall_id-CONDITION-FINISH
            finish_code = {"nonfoil": "NF", "foil": "F", "etched": "E"}.get(finish, "NF")
            sku = f"{scryfall_id}-{condition}-{finish_code}"

            # Variant name
            name = f"{condition} - {finish.title()}"

            # Build variant attributes (condition, finish)
            variant_attributes = []

            # Add condition attribute if available
            condition_attr_id = setup.variant_attribute_map.get("mtg-condition")
            condition_choices = setup.variant_attribute_choices.get("mtg-condition", {})
            condition_choice_slug = condition_slug_map.get(condition)
            if condition_attr_id and condition_choice_slug:
                condition_choice_id = condition_choices.get(condition_choice_slug)
                if condition_choice_id:
                    variant_attributes.append({
                        "id": condition_attr_id,
                        "values": [condition_choice_id],
                    })

            # Add finish attribute if available
            finish_attr_id = setup.variant_attribute_map.get("mtg-finish")
            finish_choices = setup.variant_attribute_choices.get("mtg-finish", {})
            finish_choice_slug = finish_slug_map.get(finish)
            if finish_attr_id and finish_choice_slug:
                finish_choice_id = finish_choices.get(finish_choice_slug)
                if finish_choice_id:
                    variant_attributes.append({
                        "id": finish_attr_id,
                        "values": [finish_choice_id],
                    })

            variants.append({
                "sku": sku,
                "name": name,
                "trackInventory": True,
                "attributes": variant_attributes,
                "channelListings": [{
                    "channelId": setup.channel_id,
                    "price": float(price),  # Must be number, not string
                }],
                "stocks": [],  # No initial stock
            })

    return variants


def slugify(text: str) -> str:
    """Simple slugify function."""
    import re
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = text.strip('-')
    return text[:200]


# =============================================================================
# Checkpoint Management
# =============================================================================

def get_checkpoint_path(checkpoint_dir: str) -> Path:
    """Get the checkpoint file path."""
    return Path(checkpoint_dir) / "mtg_graphql_import_progress.json"


def load_progress(checkpoint_dir: str) -> dict:
    """Load progress from checkpoint file."""
    checkpoint_path = get_checkpoint_path(checkpoint_dir)
    if checkpoint_path.exists():
        try:
            with open(checkpoint_path) as f:
                progress = json.load(f)
                logger.info(f"Loaded checkpoint from {checkpoint_path}")
                logger.info(f"  Last index: {progress.get('last_index', 0)}")
                logger.info(f"  Processed IDs: {len(progress.get('processed_ids', []))}")
                return progress
        except Exception as e:
            logger.warning(f"Failed to load checkpoint: {e}")
    return {"last_index": 0, "processed_ids": []}


def save_progress(index: int, processed_ids: list[str], checkpoint_dir: str):
    """Save progress to checkpoint file."""
    checkpoint_path = get_checkpoint_path(checkpoint_dir)

    # Ensure directory exists
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

    checkpoint_data = {
        "last_index": index,
        "processed_ids": processed_ids[-1000:],  # Keep last 1000
        "timestamp": time.time(),
        "total_processed": len(processed_ids),
    }

    # Write atomically (write to temp file, then rename)
    temp_path = checkpoint_path.with_suffix(".tmp")
    try:
        with open(temp_path, "w") as f:
            json.dump(checkpoint_data, f)
        temp_path.rename(checkpoint_path)
    except Exception as e:
        logger.warning(f"Failed to save checkpoint: {e}")
        if temp_path.exists():
            temp_path.unlink()


# =============================================================================
# Import Logic
# =============================================================================


def create_variants_bulk(
    client: SaleorClient,
    product_id: str,
    variant_inputs: list[dict],
    verbose: bool = False,
) -> tuple[int, int, list[str]]:
    """Create variants using bulk mutation. Returns (created, failed, created_ids)."""
    if not variant_inputs:
        return 0, 0, []

    try:
        result = client.execute(PRODUCT_VARIANT_BULK_CREATE, {
            "productId": product_id,
            "variants": variant_inputs,
        })

        bulk_result = result.get("productVariantBulkCreate", {})
        results = bulk_result.get("results", [])
        top_errors = bulk_result.get("errors", [])

        if top_errors:
            if verbose:
                logger.warning(f"    Bulk variant errors: {top_errors}")
            return 0, len(variant_inputs), []

        created = 0
        failed = 0
        created_ids = []

        for r in results:
            if r.get("productVariant"):
                created += 1
                created_ids.append(r["productVariant"]["id"])
            else:
                failed += 1
                if verbose and r.get("errors"):
                    logger.debug(f"    Variant error: {r['errors']}")

        return created, failed, created_ids

    except Exception as e:
        if verbose:
            logger.warning(f"    Bulk create exception: {e}")
        return 0, len(variant_inputs), []


def create_single_variant(
    client: SaleorClient,
    product_id: str,
    var_input: dict,
    verbose: bool = False,
) -> tuple[bool, Optional[str], Optional[str]]:
    """Create a single variant with its channel listing. Returns (success, error_msg, variant_id)."""
    try:
        # Convert bulk format to single format
        single_input = {
            "product": product_id,
            "sku": var_input["sku"],
            "name": var_input["name"],
            "trackInventory": var_input.get("trackInventory", True),
            "attributes": var_input.get("attributes", []),
        }
        var_result = client.execute(PRODUCT_VARIANT_CREATE, {"input": single_input})
        variant_data = var_result.get("productVariantCreate", {}).get("productVariant")

        if not variant_data:
            errors = var_result.get("productVariantCreate", {}).get("errors", [])
            return False, f"Variant create failed: {errors}", None

        variant_id = variant_data["id"]
        return True, None, variant_id

    except Exception as e:
        return False, str(e), None


def update_variant_prices_bulk(
    client: SaleorClient,
    variant_ids: list[str],
    variant_inputs: list[dict],
    verbose: bool = False,
    max_workers: int = VARIANT_WORKERS,
) -> None:
    """Update channel listings for multiple variants in parallel."""
    if not variant_ids or not variant_inputs:
        return

    def update_single_price(variant_id: str, var_input: dict) -> bool:
        channel_listings = var_input.get("channelListings", [])
        if not channel_listings:
            return True
        try:
            listing_input = [
                {"channelId": cl["channelId"], "price": cl["price"]}
                for cl in channel_listings
            ]
            client.execute(
                PRODUCT_VARIANT_CHANNEL_LISTING_UPDATE,
                {"id": variant_id, "input": listing_input},
            )
            return True
        except Exception:
            return False

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(update_single_price, vid, vinput)
            for vid, vinput in zip(variant_ids, variant_inputs)
        ]
        # Wait for all to complete
        for f in as_completed(futures):
            try:
                f.result()
            except Exception:
                pass


def create_variants_with_fallback(
    client: SaleorClient,
    product_id: str,
    variant_inputs: list[dict],
    verbose: bool = False,
    max_workers: int = VARIANT_WORKERS,
) -> tuple[int, int]:
    """Create variants using bulk (fast) with fallback to single (reliable).

    Returns (created_count, failed_count).
    """
    if not variant_inputs:
        return 0, 0

    # Try bulk create first (1 API call for all variants)
    created, failed, variant_ids = create_variants_bulk(client, product_id, variant_inputs, verbose)

    if created > 0:
        # Bulk succeeded - now update prices in parallel
        # Match variant_ids to inputs by order (bulk create preserves order)
        update_variant_prices_bulk(client, variant_ids, variant_inputs[:len(variant_ids)], verbose, max_workers)
        return created, failed

    # Bulk failed completely - fall back to single creates with parallel execution
    if verbose:
        logger.info("    Bulk create failed, falling back to single creates")

    created = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(create_single_variant, client, product_id, var_input, verbose): var_input
            for var_input in variant_inputs
        }

        variant_results = []  # (variant_id, var_input) pairs for price updates
        for future in as_completed(futures):
            var_input = futures[future]
            try:
                success, error_msg, variant_id = future.result()
                if success and variant_id:
                    created += 1
                    variant_results.append((variant_id, var_input))
                else:
                    failed += 1
            except Exception:
                failed += 1

        # Update prices for successfully created variants
        if variant_results:
            update_variant_prices_bulk(
                client,
                [vr[0] for vr in variant_results],
                [vr[1] for vr in variant_results],
                verbose,
                max_workers,
            )

    return created, failed


@dataclass
class CardResult:
    """Result of processing a single card."""
    scryfall_id: str
    success: bool
    product_created: bool = False
    product_skipped: bool = False
    product_failed: bool = False
    variants_created: int = 0
    variants_failed: int = 0
    error: Optional[str] = None


def process_single_card(
    client: SaleorClient,
    card: dict,
    setup: SetupData,
    processed_ids: set,
    verbose: bool = False,
    variant_workers: int = VARIANT_WORKERS,
    skip_exists_check: bool = True,
) -> CardResult:
    """Process a single card: create product and variants.

    Args:
        skip_exists_check: If True, trust checkpoint and skip API exists check (faster).
    """
    scryfall_id = card.get("id", "")
    result = CardResult(scryfall_id=scryfall_id, success=False)

    try:
        # Skip if already in our processed set (from checkpoint)
        if scryfall_id in processed_ids:
            result.success = True
            result.product_skipped = True
            return result

        # Optionally check if product already exists via API (slower but safer)
        if not skip_exists_check:
            existing_id = client.product_exists(scryfall_id)
            if existing_id:
                result.success = True
                result.product_skipped = True
                return result

        # Transform card to product input
        product_input = transform_card_to_product(card, setup)

        # Create product
        api_result = client.execute(PRODUCT_BULK_CREATE, {"products": [product_input]})
        bulk_result = api_result.get("productBulkCreate", {})
        results = bulk_result.get("results", [])

        if results and results[0].get("product"):
            product = results[0]["product"]
            product_id = product["id"]
            result.product_created = True

            if verbose:
                logger.info(f"  Created: {product['name']}")

            # Create variants using bulk with fallback
            variant_inputs = transform_card_to_variants(card, product_id, setup)
            if variant_inputs:
                var_created, var_failed = create_variants_with_fallback(
                    client, product_id, variant_inputs, verbose, variant_workers
                )
                result.variants_created = var_created
                result.variants_failed = var_failed

            result.success = True
        else:
            errors = results[0].get("errors", []) if results else bulk_result.get("errors", [])
            # Check if it's a duplicate error (product already exists)
            error_str = str(errors)
            if "UNIQUE" in error_str or "unique" in error_str or "already exists" in error_str.lower():
                result.success = True
                result.product_skipped = True
            else:
                result.product_failed = True
                result.error = error_str
                if verbose:
                    logger.warning(f"  ERROR creating {product_input['name']}: {errors}")

    except Exception as e:
        result.product_failed = True
        result.error = str(e)
        if verbose:
            logger.warning(f"  EXCEPTION: {e}")

    return result


def import_cards(
    client: SaleorClient,
    cards: list[dict],
    setup: SetupData,
    stats: ImportStats,
    batch_size: int = BATCH_SIZE,
    dry_run: bool = False,
    resume: bool = False,
    verbose: bool = False,
    checkpoint_dir: str = DEFAULT_CHECKPOINT_DIR,
    variant_workers: int = VARIANT_WORKERS,
    product_workers: int = PRODUCT_WORKERS,
) -> None:
    """Import cards using GraphQL bulk mutations with parallel processing."""

    # Load progress if resuming
    progress = load_progress(checkpoint_dir) if resume else {"last_index": 0, "processed_ids": []}
    start_index = progress["last_index"]
    processed_ids = set(progress.get("processed_ids", []))

    total = len(cards)
    print(f"Importing {total - start_index} cards (starting from index {start_index})")
    print(f"Parallelization: {product_workers} product workers, {variant_workers} variant workers")

    for i in range(start_index, total, batch_size):
        batch = cards[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total + batch_size - 1) // batch_size

        print(f"\nBatch {batch_num}/{total_batches} (cards {i+1}-{min(i+batch_size, total)})")

        if dry_run:
            for card in batch:
                product_input = transform_card_to_product(card, setup)
                print(f"  [DRY RUN] Would create: {product_input['name']}")
                stats.products_created += 1
            continue

        # Process cards in parallel
        batch_processed_ids = []
        with ThreadPoolExecutor(max_workers=product_workers) as executor:
            futures = {
                executor.submit(
                    process_single_card, client, card, setup, processed_ids, verbose, variant_workers
                ): card
                for card in batch
            }

            for future in as_completed(futures):
                card = futures[future]
                try:
                    result = future.result()

                    if result.product_created:
                        stats.products_created += 1
                        batch_processed_ids.append(result.scryfall_id)
                    elif result.product_skipped:
                        stats.products_skipped += 1
                        batch_processed_ids.append(result.scryfall_id)
                    elif result.product_failed:
                        stats.products_failed += 1

                    stats.variants_created += result.variants_created
                    stats.variants_failed += result.variants_failed

                except Exception as e:
                    stats.products_failed += 1
                    if verbose:
                        logger.warning(f"  Future exception for {card.get('name', 'unknown')}: {e}")

        # Update processed IDs
        processed_ids.update(batch_processed_ids)

        # Save progress after each batch
        save_progress(i + len(batch), list(processed_ids), checkpoint_dir)

        # Print progress
        logger.info(f"Progress: {stats.summary()}")


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Import MTG cards from Scryfall JSON using Saleor GraphQL API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("json_file", type=str, help="Path to Scryfall JSON file")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Saleor GraphQL URL")
    parser.add_argument("--token", default=os.getenv("SALEOR_API_TOKEN", ""), help="API token (use App token for unattended operation)")
    parser.add_argument("--channel", default=DEFAULT_CHANNEL, help="Channel slug")
    parser.add_argument("--limit", type=int, default=0, help="Limit cards to import (0=all)")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help="Batch size (default: 25)")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually create anything")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--checkpoint-dir", default=DEFAULT_CHECKPOINT_DIR,
                       help=f"Directory for checkpoint files (default: {DEFAULT_CHECKPOINT_DIR})")
    parser.add_argument("--workers", type=int, default=VARIANT_WORKERS,
                       help=f"Parallel workers for variant creation (default: {VARIANT_WORKERS})")
    parser.add_argument("--product-workers", type=int, default=PRODUCT_WORKERS,
                       help=f"Parallel workers for product creation (default: {PRODUCT_WORKERS})")

    args = parser.parse_args()

    # Configure verbose logging
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Validate inputs
    json_path = Path(args.json_file)
    if not json_path.exists():
        logger.error(f"File not found: {json_path}")
        sys.exit(1)

    if not args.token and not args.dry_run:
        logger.error("API token required (set SALEOR_API_TOKEN or use --token)")
        logger.error("  IMPORTANT: Use a Saleor App token for unattended operation!")
        logger.error("  User tokens expire after ~5 minutes and will cause failures.")
        logger.error("  See docstring for instructions on creating an App token.")
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("MTG Scryfall Import (GraphQL)")
    logger.info("=" * 60)
    logger.info(f"Source: {json_path}")
    logger.info(f"API URL: {args.api_url}")
    logger.info(f"Channel: {args.channel}")
    logger.info(f"Batch size: {args.batch_size}")
    logger.info(f"Checkpoint dir: {args.checkpoint_dir}")
    logger.info(f"Product workers: {args.product_workers}")
    logger.info(f"Variant workers: {args.workers}")
    logger.info(f"Dry run: {args.dry_run}")
    logger.info(f"Resume: {args.resume}")

    # Initialize client
    client = SaleorClient(args.api_url, args.token)

    # Fetch setup data
    logger.info("Fetching setup data...")
    try:
        setup = client.fetch_setup(args.channel)
        logger.info(f"  Channel ID: {setup.channel_id}")
        logger.info(f"  Product Type ID: {setup.product_type_id}")
        logger.info(f"  Category ID: {setup.category_id}")
        logger.info(f"  Product Attributes: {len(setup.attribute_map)}")
        logger.info(f"  Variant Attributes: {len(setup.variant_attribute_map)}")
        if setup.variant_attribute_map:
            for attr_slug, attr_id in setup.variant_attribute_map.items():
                choices = setup.variant_attribute_choices.get(attr_slug, {})
                logger.info(f"    {attr_slug}: {len(choices)} choices")
    except Exception as e:
        logger.error(f"ERROR fetching setup: {e}")
        if not args.dry_run:
            sys.exit(1)
        # For dry run, create dummy setup
        setup = SetupData(
            channel_id="dummy",
            product_type_id="dummy",
            category_id="dummy",
            attribute_map={},
        )

    # Load cards
    logger.info(f"Loading {json_path}...")
    with open(json_path) as f:
        all_cards = json.load(f)

    logger.info(f"Total cards in file: {len(all_cards):,}")

    # Filter English paper cards (NO digital cards!)
    cards = [
        c for c in all_cards
        if c.get("lang") == "en"
        and c.get("layout") not in ["art_series", "token", "double_faced_token", "emblem"]
        and not c.get("digital", False)  # CRITICAL: Exclude digital-only cards
    ]
    logger.info(f"English paper cards (digital excluded): {len(cards):,}")

    # Apply limit
    if args.limit > 0:
        cards = cards[:args.limit]
        logger.info(f"Limited to: {len(cards):,}")

    # Initialize stats
    stats = ImportStats()
    stats.start_time = time.time()

    # Run import
    logger.info("-" * 60)
    import_cards(
        client=client,
        cards=cards,
        setup=setup,
        stats=stats,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
        resume=args.resume,
        verbose=args.verbose,
        checkpoint_dir=args.checkpoint_dir,
        variant_workers=args.workers,
        product_workers=args.product_workers,
    )

    # Final summary
    logger.info("=" * 60)
    logger.info("Import Complete")
    logger.info("=" * 60)
    logger.info(stats.summary())

    if args.dry_run:
        logger.info("[DRY RUN] No changes were made")


if __name__ == "__main__":
    main()
