#!/usr/bin/env python3
"""
Create a Saleor App with non-expiring API token for unattended MTG import operations.

This script creates a Saleor App with the necessary permissions for the import process.
App tokens do NOT expire (unlike user tokens which expire after ~5 minutes), making
them suitable for long-running unattended operations.

Usage:
    # Set admin credentials first
    export SALEOR_ADMIN_EMAIL='admin@example.com'
    export SALEOR_ADMIN_PASSWORD='your-password'

    # Create the app and get a token
    python scripts/mtg_scryfall_import/create_app_token.py

    # The script will output the token - save it securely!
    export SALEOR_API_TOKEN='the-output-token'

    # Then run the import
    python scripts/mtg_scryfall_import/import_graphql.py all-cards.json

Required Permissions (automatically requested):
    - MANAGE_PRODUCTS: Create/update products and variants
    - MANAGE_PRODUCT_TYPES_AND_ATTRIBUTES: Access product types and attributes
    - MANAGE_CHANNELS: Access channel information

Environment Variables:
    SALEOR_API_URL: GraphQL endpoint (default: http://localhost:8000/graphql/)
    SALEOR_ADMIN_EMAIL: Admin user email for initial authentication
    SALEOR_ADMIN_PASSWORD: Admin user password
"""

import os
import sys
import requests

SALEOR_API_URL = os.getenv("SALEOR_API_URL", "http://localhost:8000/graphql/")
ADMIN_EMAIL = os.getenv("SALEOR_ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("SALEOR_ADMIN_PASSWORD")

APP_NAME = "MTG Import Automation"

# Permissions needed for import
REQUIRED_PERMISSIONS = [
    "MANAGE_PRODUCTS",
    "MANAGE_PRODUCT_TYPES_AND_ATTRIBUTES",
    "MANAGE_CHANNELS",
]


def graphql_request(query: str, variables: dict = None, token: str = None) -> dict:
    """Make a GraphQL request."""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    response = requests.post(SALEOR_API_URL, json=payload, headers=headers)

    # Better error handling - show response body on error
    if not response.ok:
        print(f"HTTP Error {response.status_code}: {response.text[:500]}")
        response.raise_for_status()

    result = response.json()

    # Check for GraphQL-level errors
    if "errors" in result:
        print(f"GraphQL errors: {result['errors']}")

    return result


def get_admin_token() -> str:
    """Get an admin user token for initial setup."""
    mutation = """
    mutation TokenCreate($email: String!, $password: String!) {
        tokenCreate(email: $email, password: $password) {
            token
            errors {
                field
                message
            }
        }
    }
    """
    result = graphql_request(mutation, {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})

    data = result.get("data", {}).get("tokenCreate", {})
    if data.get("errors"):
        raise Exception(f"Authentication failed: {data['errors']}")

    token = data.get("token")
    if not token:
        raise Exception("No token returned from authentication")

    return token


def check_existing_app(token: str) -> tuple[str, str] | None:
    """Check if our app already exists, return (app_id, existing_token) if so."""
    query = """
    query Apps {
        apps(first: 100) {
            edges {
                node {
                    id
                    name
                    tokens {
                        id
                        name
                        authToken
                    }
                }
            }
        }
    }
    """
    result = graphql_request(query, token=token)

    apps = result.get("data", {}).get("apps", {}).get("edges", [])
    for edge in apps:
        app = edge["node"]
        if app["name"] == APP_NAME:
            # App exists - check for tokens
            tokens = app.get("tokens", [])
            if tokens:
                # Note: authToken is only shown once at creation,
                # so we can't retrieve it later
                return (app["id"], None)
            return (app["id"], None)

    return None


def create_app(token: str) -> str:
    """Create the import app and return its ID."""
    mutation = """
    mutation AppCreate($input: AppInput!) {
        appCreate(input: $input) {
            app {
                id
                name
            }
            authToken
            errors {
                field
                message
                code
            }
        }
    }
    """

    variables = {
        "input": {
            "name": APP_NAME,
            "permissions": REQUIRED_PERMISSIONS,
        }
    }

    result = graphql_request(mutation, variables, token=token)

    data = result.get("data", {}).get("appCreate", {})
    if data.get("errors"):
        raise Exception(f"Failed to create app: {data['errors']}")

    app = data.get("app")
    auth_token = data.get("authToken")

    if not app:
        raise Exception("No app returned from creation")

    return app["id"], auth_token


def create_app_token(app_id: str, token: str) -> str:
    """Create a new token for an existing app."""
    mutation = """
    mutation AppTokenCreate($input: AppTokenInput!) {
        appTokenCreate(input: $input) {
            authToken
            appToken {
                id
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

    variables = {
        "input": {
            "app": app_id,
            "name": "Import Token",
        }
    }

    result = graphql_request(mutation, variables, token=token)

    data = result.get("data", {}).get("appTokenCreate", {})
    if data.get("errors"):
        raise Exception(f"Failed to create token: {data['errors']}")

    auth_token = data.get("authToken")
    if not auth_token:
        raise Exception("No token returned from creation")

    return auth_token


def main():
    # Validate environment
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        print("ERROR: Missing admin credentials")
        print("Set environment variables:")
        print("  export SALEOR_ADMIN_EMAIL='your-admin@email.com'")
        print("  export SALEOR_ADMIN_PASSWORD='your-password'")
        sys.exit(1)

    print(f"Saleor API: {SALEOR_API_URL}")
    print(f"Admin email: {ADMIN_EMAIL}")
    print()

    # Get admin token
    print("1. Authenticating as admin...")
    try:
        admin_token = get_admin_token()
        print("   ✓ Authenticated successfully")
    except Exception as e:
        print(f"   ✗ Authentication failed: {e}")
        sys.exit(1)

    # Check for existing app
    print(f"\n2. Checking for existing '{APP_NAME}' app...")
    existing = check_existing_app(admin_token)

    if existing:
        app_id, _ = existing
        print(f"   ✓ Found existing app: {app_id}")
        print("\n3. Creating new token for existing app...")
        try:
            app_token = create_app_token(app_id, admin_token)
            print("   ✓ Token created successfully")
        except Exception as e:
            print(f"   ✗ Failed to create token: {e}")
            sys.exit(1)
    else:
        print("   → App not found, creating new app...")
        print(f"\n3. Creating '{APP_NAME}' app with permissions:")
        for perm in REQUIRED_PERMISSIONS:
            print(f"      - {perm}")

        try:
            app_id, app_token = create_app(admin_token)
            print(f"   ✓ App created: {app_id}")
        except Exception as e:
            print(f"   ✗ Failed to create app: {e}")
            sys.exit(1)

    # Output the token
    print("\n" + "=" * 60)
    print("SUCCESS! App token created.")
    print("=" * 60)
    print("\nIMPORTANT: Save this token securely - it cannot be retrieved later!")
    print("\nToken:")
    print("-" * 60)
    print(app_token)
    print("-" * 60)
    print("\nUsage:")
    print(f"  export SALEOR_API_TOKEN='{app_token}'")
    print("  python scripts/mtg_scryfall_import/import_graphql.py all-cards.json")
    print("\nThis token does NOT expire and is safe for unattended operations.")


if __name__ == "__main__":
    main()
