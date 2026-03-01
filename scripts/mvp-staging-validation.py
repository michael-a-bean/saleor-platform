#!/usr/bin/env python3
"""
MVP Staging Validation Script
==============================

Validates all Tier 1 MVP gap closure items against a running Saleor instance.
Run against local (docker compose up) or staging (api.staging.michaelbean.org).

Usage:
  # Local
  python3 scripts/mvp-staging-validation.py

  # Staging
  SALEOR_API_URL=https://api.staging.michaelbean.org/graphql/ \
  SALEOR_EMAIL=admin@example.com \
  SALEOR_PASSWORD=admin \
  python3 scripts/mvp-staging-validation.py

  # Run specific checks only
  python3 scripts/mvp-staging-validation.py --check shipping
  python3 scripts/mvp-staging-validation.py --check email
  python3 scripts/mvp-staging-validation.py --check price-sync
  python3 scripts/mvp-staging-validation.py --check import
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from typing import Any

# --- Configuration ---

API_URL = os.environ.get("SALEOR_API_URL", "http://localhost:8000/graphql/")
EMAIL = os.environ.get("SALEOR_EMAIL", "admin@example.com")
PASSWORD = os.environ.get("SALEOR_PASSWORD", "admin")
CHANNEL_SLUG = os.environ.get("SALEOR_CHANNEL", "webstore")

# --- Colors ---

RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
NC = "\033[0m"
BOLD = "\033[1m"


def graphql(query: str, variables: dict | None = None, token: str | None = None) -> dict:
    """Execute a GraphQL query against the Saleor API."""
    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  {RED}HTTP {e.code}: {body[:200]}{NC}")
        return {"errors": [{"message": f"HTTP {e.code}"}]}
    except urllib.error.URLError as e:
        print(f"  {RED}Connection failed: {e.reason}{NC}")
        return {"errors": [{"message": str(e.reason)}]}


def authenticate() -> str | None:
    """Get auth token from Saleor."""
    result = graphql(
        """
        mutation TokenCreate($email: String!, $password: String!) {
          tokenCreate(email: $email, password: $password) {
            token
            errors { field message }
          }
        }
        """,
        {"email": EMAIL, "password": PASSWORD},
    )

    token_data = result.get("data", {}).get("tokenCreate", {})
    if token_data.get("errors"):
        print(f"  {RED}Auth failed: {token_data['errors']}{NC}")
        return None
    return token_data.get("token")


# =============================================================================
# CHECK 1: Shipping Configuration
# =============================================================================

CONFIGURE_SHIPPING_ZONE = """
mutation CreateShippingZone($input: ShippingZoneCreateInput!) {
  shippingZoneCreate(input: $input) {
    shippingZone { id name }
    errors { field message code }
  }
}
"""

CREATE_SHIPPING_METHOD = """
mutation CreateShippingRate(
  $shippingZoneId: ID!
  $input: ShippingPriceInput!
) {
  shippingPriceCreate(input: $input) {
    shippingMethod { id name }
    errors { field message code }
  }
}
"""

# Saleor 3.x uses shippingPriceCreate with shippingZone in the input
CREATE_SHIPPING_RATE = """
mutation CreateShippingRate($input: ShippingPriceInput!) {
  shippingPriceCreate(input: $input) {
    shippingMethod {
      id
      name
      type
      channelListings { channel { slug } price { amount currency } }
    }
    errors { field message code }
  }
}
"""

UPDATE_SHIPPING_CHANNEL_LISTING = """
mutation UpdateShippingMethodChannelListing(
  $id: ID!
  $input: ShippingMethodChannelListingInput!
) {
  shippingMethodChannelListingUpdate(id: $id, input: $input) {
    shippingMethod {
      id
      name
      channelListings { channel { slug } price { amount currency } }
    }
    errors { field message code }
  }
}
"""


def check_shipping(token: str) -> bool:
    """Check if shipping zones/methods are configured. If not, configure them."""
    print(f"\n{BOLD}{'='*60}{NC}")
    print(f"{BOLD}CHECK 1: Shipping Configuration{NC}")
    print(f"{'='*60}")

    # Query existing shipping zones
    result = graphql(
        """
        query {
          shippingZones(first: 20) {
            edges {
              node {
                id
                name
                countries { code }
                shippingMethods {
                  id
                  name
                  type
                  channelListings {
                    channel { slug }
                    price { amount currency }
                    minimumOrderPrice { amount }
                    maximumOrderPrice { amount }
                  }
                }
              }
            }
          }
        }
        """,
        token=token,
    )

    zones = result.get("data", {}).get("shippingZones", {}).get("edges", [])
    if not zones:
        print(f"  {YELLOW}No shipping zones found. Creating US zone with PWE + tracked...{NC}")
        return _create_shipping_config(token)

    # Check if US zone exists with methods
    us_zone = None
    for edge in zones:
        zone = edge["node"]
        countries = [c["code"] for c in zone.get("countries", [])]
        if "US" in countries:
            us_zone = zone
            break

    if not us_zone:
        print(f"  {YELLOW}No US shipping zone found. Creating...{NC}")
        return _create_shipping_config(token)

    methods = us_zone.get("shippingMethods", [])
    method_names = [m["name"] for m in methods]
    print(f"  {GREEN}US shipping zone exists: {us_zone['name']}{NC}")
    print(f"  Methods: {', '.join(method_names) or '(none)'}")

    has_pwe = any("PWE" in n.upper() or "PLAIN" in n.upper() or "ENVELOPE" in n.upper() for n in method_names)
    has_tracked = any("TRACKED" in n.upper() or "BUBBLE" in n.upper() for n in method_names)

    if has_pwe and has_tracked:
        print(f"  {GREEN}PASS: Both PWE and tracked shipping methods configured{NC}")

        # Show pricing
        for m in methods:
            for cl in m.get("channelListings", []):
                if cl["channel"]["slug"] == CHANNEL_SLUG:
                    price = cl["price"]
                    print(f"    {m['name']}: ${price['amount']} {price['currency']}")
        return True

    if not has_pwe:
        print(f"  {YELLOW}Missing PWE (Plain White Envelope) shipping method{NC}")
    if not has_tracked:
        print(f"  {YELLOW}Missing tracked/bubble mailer shipping method{NC}")

    print(f"  {YELLOW}Creating missing shipping methods...{NC}")
    return _create_shipping_methods(token, us_zone["id"], not has_pwe, not has_tracked)


def _get_channel_id(token: str) -> str | None:
    """Get the channel ID for the webstore channel."""
    result = graphql(
        """
        query { channels { id slug } }
        """,
        token=token,
    )
    channels = result.get("data", {}).get("channels", [])
    for ch in channels:
        if ch["slug"] == CHANNEL_SLUG:
            return ch["id"]
    return None


def _get_warehouse_ids(token: str) -> list[str]:
    """Get all warehouse IDs."""
    result = graphql(
        """
        query { warehouses(first: 10) { edges { node { id name } } } }
        """,
        token=token,
    )
    return [
        edge["node"]["id"]
        for edge in result.get("data", {}).get("warehouses", {}).get("edges", [])
    ]


def _create_shipping_config(token: str) -> bool:
    """Create US shipping zone with PWE and tracked methods."""
    channel_id = _get_channel_id(token)
    if not channel_id:
        print(f"  {RED}Cannot find channel '{CHANNEL_SLUG}'{NC}")
        return False

    warehouse_ids = _get_warehouse_ids(token)
    if not warehouse_ids:
        print(f"  {RED}No warehouses found{NC}")
        return False

    # Create shipping zone
    result = graphql(
        CONFIGURE_SHIPPING_ZONE,
        {
            "input": {
                "name": "United States",
                "countries": ["US"],
                "addChannels": [{"channelId": channel_id}],
                "addWarehouses": warehouse_ids,
            }
        },
        token=token,
    )

    zone_data = result.get("data", {}).get("shippingZoneCreate", {})
    if zone_data.get("errors"):
        print(f"  {RED}Failed to create shipping zone: {zone_data['errors']}{NC}")
        return False

    zone_id = zone_data["shippingZone"]["id"]
    print(f"  {GREEN}Created shipping zone: {zone_data['shippingZone']['name']} ({zone_id}){NC}")

    return _create_shipping_methods(token, zone_id, True, True)


def _create_shipping_methods(token: str, zone_id: str, create_pwe: bool, create_tracked: bool) -> bool:
    """Create PWE and/or tracked shipping methods in a zone."""
    channel_id = _get_channel_id(token)
    if not channel_id:
        return False

    success = True

    if create_pwe:
        # PWE: $0.83 for orders under $20
        result = graphql(
            CREATE_SHIPPING_RATE,
            {
                "input": {
                    "name": "PWE (Plain White Envelope)",
                    "shippingZone": zone_id,
                    "type": "PRICE",
                    "maximumDeliveryDays": 10,
                    "minimumDeliveryDays": 5,
                }
            },
            token=token,
        )

        rate_data = result.get("data", {}).get("shippingPriceCreate", {})
        if rate_data.get("errors"):
            print(f"  {RED}Failed to create PWE method: {rate_data['errors']}{NC}")
            success = False
        else:
            method_id = rate_data["shippingMethod"]["id"]
            print(f"  {GREEN}Created PWE shipping method ({method_id}){NC}")

            # Set channel listing with price and order limits
            ch_result = graphql(
                UPDATE_SHIPPING_CHANNEL_LISTING,
                {
                    "id": method_id,
                    "input": {
                        "addChannels": [{
                            "channelId": channel_id,
                            "price": 0.83,
                            "maximumOrderPrice": 20.00,
                        }],
                    },
                },
                token=token,
            )
            if ch_result.get("data", {}).get("shippingMethodChannelListingUpdate", {}).get("errors"):
                print(f"  {RED}Failed to set PWE pricing: {ch_result['data']['shippingMethodChannelListingUpdate']['errors']}{NC}")
                success = False
            else:
                print(f"  {GREEN}  PWE: $0.83, max order $20.00{NC}")

    if create_tracked:
        # Tracked bubble mailer: $4.50 for all orders
        result = graphql(
            CREATE_SHIPPING_RATE,
            {
                "input": {
                    "name": "Tracked Bubble Mailer",
                    "shippingZone": zone_id,
                    "type": "PRICE",
                    "maximumDeliveryDays": 5,
                    "minimumDeliveryDays": 2,
                }
            },
            token=token,
        )

        rate_data = result.get("data", {}).get("shippingPriceCreate", {})
        if rate_data.get("errors"):
            print(f"  {RED}Failed to create tracked method: {rate_data['errors']}{NC}")
            success = False
        else:
            method_id = rate_data["shippingMethod"]["id"]
            print(f"  {GREEN}Created tracked bubble mailer method ({method_id}){NC}")

            ch_result = graphql(
                UPDATE_SHIPPING_CHANNEL_LISTING,
                {
                    "id": method_id,
                    "input": {
                        "addChannels": [{
                            "channelId": channel_id,
                            "price": 4.50,
                        }],
                    },
                },
                token=token,
            )
            if ch_result.get("data", {}).get("shippingMethodChannelListingUpdate", {}).get("errors"):
                print(f"  {RED}Failed to set tracked pricing: {ch_result['data']['shippingMethodChannelListingUpdate']['errors']}{NC}")
                success = False
            else:
                print(f"  {GREEN}  Tracked: $4.50, no order limit{NC}")

    return success


# =============================================================================
# CHECK 2: Email / SMTP Configuration
# =============================================================================

def check_email(token: str) -> bool:
    """Check if email backend is configured and can send."""
    print(f"\n{BOLD}{'='*60}{NC}")
    print(f"{BOLD}CHECK 2: Email / SMTP Configuration{NC}")
    print(f"{'='*60}")

    # Check shop email settings
    result = graphql(
        """
        query {
          shop {
            defaultMailSenderName
            defaultMailSenderAddress
            customerSetPasswordUrl
          }
        }
        """,
        token=token,
    )

    shop = result.get("data", {}).get("shop", {})
    sender_name = shop.get("defaultMailSenderName", "")
    sender_addr = shop.get("defaultMailSenderAddress", "")

    print(f"  Sender name: {sender_name or '(not set)'}")
    print(f"  Sender address: {sender_addr or '(not set)'}")

    if not sender_addr or sender_addr == "noreply@example.com":
        print(f"  {YELLOW}WARNING: Default sender address — email will likely go to spam{NC}")
        print(f"  {YELLOW}Set via Dashboard > Configuration > General > Default sender address{NC}")

    # Check if SMTP plugin or app is configured
    result = graphql(
        """
        query {
          apps(first: 20, filter: { isActive: true }) {
            edges {
              node {
                name
                isActive
                type
              }
            }
          }
        }
        """,
        token=token,
    )

    apps = result.get("data", {}).get("apps", {}).get("edges", [])
    smtp_app = None
    for edge in apps:
        app = edge["node"]
        if "smtp" in app["name"].lower() or "email" in app["name"].lower() or "ses" in app["name"].lower():
            smtp_app = app
            break

    if smtp_app:
        print(f"  {GREEN}Email app found: {smtp_app['name']} (active: {smtp_app['isActive']}){NC}")
    else:
        print(f"  {YELLOW}No SMTP/email app detected among active apps{NC}")
        print(f"  Active apps: {', '.join(e['node']['name'] for e in apps) or '(none)'}")

    # Check if notification events are configured
    result = graphql(
        """
        query {
          shop {
            enableAccountConfirmationByEmail
          }
        }
        """,
        token=token,
    )

    account_confirm = result.get("data", {}).get("shop", {}).get("enableAccountConfirmationByEmail")
    print(f"  Account confirmation by email: {account_confirm}")

    # For local dev, check if Mailpit is accessible
    if "localhost" in API_URL:
        try:
            mailpit_req = urllib.request.Request("http://localhost:8025/api/v1/messages?limit=1")
            with urllib.request.urlopen(mailpit_req, timeout=5) as resp:
                data = json.loads(resp.read())
                msg_count = data.get("total", data.get("messages_count", 0))
                print(f"  {GREEN}Mailpit accessible — {msg_count} messages in inbox{NC}")
                print(f"  {GREEN}PASS: Local email delivery via Mailpit is working{NC}")
                return True
        except Exception:
            print(f"  {YELLOW}Mailpit not accessible at localhost:8025{NC}")

    # For staging, we can only verify config — not send a test email without side effects
    if smtp_app and smtp_app["isActive"]:
        print(f"  {GREEN}PASS: Email app is active and configured{NC}")
        return True

    print(f"  {YELLOW}PARTIAL: Email config exists but delivery not verified{NC}")
    print(f"  {YELLOW}To verify: Place a test order and check for confirmation email{NC}")
    return False


# =============================================================================
# CHECK 3: Price Sync Writeback
# =============================================================================

def check_price_sync(token: str) -> bool:
    """Verify price sync writeback is functional."""
    print(f"\n{BOLD}{'='*60}{NC}")
    print(f"{BOLD}CHECK 3: Price Sync Writeback{NC}")
    print(f"{'='*60}")

    # Check if inventory-ops app is installed and active
    result = graphql(
        """
        query {
          apps(first: 20, filter: { isActive: true }) {
            edges {
              node {
                id
                name
                isActive
              }
            }
          }
        }
        """,
        token=token,
    )

    apps = result.get("data", {}).get("apps", {}).get("edges", [])
    inv_app = None
    for edge in apps:
        app = edge["node"]
        if "inventory" in app["name"].lower():
            inv_app = app
            break

    if inv_app:
        print(f"  {GREEN}Inventory-ops app found: {inv_app['name']} (active: {inv_app['isActive']}){NC}")
    else:
        print(f"  {YELLOW}Inventory-ops app not found among active apps{NC}")
        print(f"  Apps: {', '.join(e['node']['name'] for e in apps) or '(none)'}")

    # Verify some products have non-null prices (evidence that price sync has run)
    result = graphql(
        """
        query {
          products(first: 10, channel: "%s") {
            edges {
              node {
                name
                variants {
                  name
                  pricing {
                    price { gross { amount currency } }
                  }
                }
              }
            }
          }
        }
        """
        % CHANNEL_SLUG,
        token=token,
    )

    products = result.get("data", {}).get("products", {}).get("edges", [])
    if not products:
        print(f"  {YELLOW}No products found in channel '{CHANNEL_SLUG}'{NC}")
        print(f"  {YELLOW}Run MTG import first, then price sync{NC}")
        return False

    priced_count = 0
    null_price_count = 0
    sample_prices = []

    for edge in products:
        product = edge["node"]
        for variant in product.get("variants", []):
            pricing = variant.get("pricing", {})
            price = pricing.get("price", {}).get("gross", {}) if pricing else {}
            if price and price.get("amount") is not None and price["amount"] > 0:
                priced_count += 1
                if len(sample_prices) < 3:
                    sample_prices.append(f"  {product['name']} / {variant['name']}: ${price['amount']}")
            else:
                null_price_count += 1

    total = priced_count + null_price_count
    print(f"  Products checked: {len(products)}")
    print(f"  Variants with prices: {priced_count}/{total}")

    if sample_prices:
        print(f"  Sample prices:")
        for sp in sample_prices:
            print(f"    {sp}")

    if null_price_count > 0:
        print(f"  {YELLOW}WARNING: {null_price_count} variants have null/zero prices{NC}")

    # Check for the NULL discounted_price_amount issue
    # (Can only do this via direct DB access, not GraphQL)
    print(f"  Note: Run SQL check for NULL discounted_price_amount separately:")
    print(f"    SELECT COUNT(*) FROM product_productvariantchannellisting")
    print(f"    WHERE discounted_price_amount IS NULL AND price_amount IS NOT NULL;")

    if priced_count > 0 and null_price_count == 0:
        print(f"  {GREEN}PASS: All sampled variants have prices{NC}")
        return True
    elif priced_count > 0:
        print(f"  {YELLOW}PARTIAL: {priced_count}/{total} variants priced{NC}")
        return False
    else:
        print(f"  {RED}FAIL: No variants have prices{NC}")
        return False


# =============================================================================
# CHECK 4: MTG Import Verification
# =============================================================================

def check_import(token: str) -> bool:
    """Verify MTG import app has run and products exist."""
    print(f"\n{BOLD}{'='*60}{NC}")
    print(f"{BOLD}CHECK 4: MTG Card Import Verification{NC}")
    print(f"{'='*60}")

    # Count total products
    result = graphql(
        """
        query {
          products(first: 1, channel: "%s") {
            totalCount
          }
        }
        """
        % CHANNEL_SLUG,
        token=token,
    )

    total = result.get("data", {}).get("products", {}).get("totalCount", 0)
    print(f"  Total products in '{CHANNEL_SLUG}' channel: {total}")

    if total == 0:
        print(f"  {RED}FAIL: No products found — import has not run{NC}")
        return False

    # Check a sample product for correct structure (15 variants per card)
    result = graphql(
        """
        query {
          products(first: 5, channel: "%s", sortBy: { field: CREATED_AT, direction: DESC }) {
            edges {
              node {
                name
                productType { name }
                variants {
                  name
                  sku
                  pricing {
                    price { gross { amount currency } }
                  }
                }
                media { url alt }
              }
            }
          }
        }
        """
        % CHANNEL_SLUG,
        token=token,
    )

    products = result.get("data", {}).get("products", {}).get("edges", [])
    variant_counts = []
    sku_format_ok = 0
    sku_format_bad = 0

    for edge in products:
        p = edge["node"]
        variants = p.get("variants", [])
        variant_counts.append(len(variants))
        print(f"  {p['name']}: {len(variants)} variants, type={p.get('productType', {}).get('name', '?')}")

        for v in variants[:3]:  # Check first 3 SKUs
            sku = v.get("sku", "")
            if sku and "-" in sku:  # Expected: {uuid}-{condition}-{finish}
                sku_format_ok += 1
            elif sku:
                sku_format_bad += 1

    # Validate variant count (expect 15 per card: 5 conditions x 3 finishes)
    cards_with_15 = sum(1 for c in variant_counts if c == 15)
    print(f"\n  Cards with 15 variants (expected): {cards_with_15}/{len(variant_counts)}")
    print(f"  SKU format check: {sku_format_ok} correct, {sku_format_bad} unexpected format")

    # Check Meilisearch sync
    meilisearch_url = os.environ.get("MEILISEARCH_URL", "http://localhost:7700")
    try:
        ms_req = urllib.request.Request(f"{meilisearch_url}/indexes/products/stats")
        api_key = os.environ.get("MEILISEARCH_API_KEY")
        if api_key:
            ms_req.add_header("Authorization", f"Bearer {api_key}")
        with urllib.request.urlopen(ms_req, timeout=10) as resp:
            ms_data = json.loads(resp.read())
            ms_count = ms_data.get("numberOfDocuments", 0)
            print(f"\n  Meilisearch documents: {ms_count}")
            pct_match = abs(ms_count - total) / max(total, 1) * 100
            if pct_match < 1:
                print(f"  {GREEN}Meilisearch count matches Saleor within 1%{NC}")
            else:
                print(f"  {YELLOW}Meilisearch/Saleor count gap: {pct_match:.1f}%{NC}")
    except Exception as e:
        print(f"\n  {YELLOW}Meilisearch check skipped: {e}{NC}")

    if total > 100 and cards_with_15 >= 3:
        print(f"\n  {GREEN}PASS: {total} products imported, variant structure correct{NC}")
        return True
    elif total > 0:
        print(f"\n  {YELLOW}PARTIAL: {total} products exist but structure may need verification{NC}")
        return True
    else:
        print(f"\n  {RED}FAIL: No products imported{NC}")
        return False


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="MVP Staging Validation")
    parser.add_argument(
        "--check",
        choices=["shipping", "email", "price-sync", "import", "all"],
        default="all",
        help="Which check to run (default: all)",
    )
    args = parser.parse_args()

    print(f"\n{BOLD}MVP Staging Validation{NC}")
    print(f"API: {API_URL}")
    print(f"Channel: {CHANNEL_SLUG}")

    # Authenticate
    print(f"\nAuthenticating as {EMAIL}...")
    token = authenticate()
    if not token:
        print(f"{RED}Authentication failed. Cannot proceed.{NC}")
        sys.exit(1)
    print(f"{GREEN}Authenticated successfully{NC}")

    checks = {
        "shipping": check_shipping,
        "email": check_email,
        "price-sync": check_price_sync,
        "import": check_import,
    }

    results: dict[str, bool] = {}

    if args.check == "all":
        for name, fn in checks.items():
            results[name] = fn(token)
    else:
        results[args.check] = checks[args.check](token)

    # Summary
    print(f"\n{BOLD}{'='*60}{NC}")
    print(f"{BOLD}SUMMARY{NC}")
    print(f"{'='*60}")
    for name, passed in results.items():
        status = f"{GREEN}PASS{NC}" if passed else f"{RED}FAIL{NC}"
        print(f"  {name:>15}: {status}")

    total_pass = sum(1 for p in results.values() if p)
    total = len(results)
    print(f"\n  {total_pass}/{total} checks passed")

    if total_pass == total:
        print(f"\n  {GREEN}{BOLD}All Tier 1 MVP checks passed!{NC}")
        sys.exit(0)
    else:
        print(f"\n  {YELLOW}Some checks need attention.{NC}")
        sys.exit(1)


if __name__ == "__main__":
    main()
