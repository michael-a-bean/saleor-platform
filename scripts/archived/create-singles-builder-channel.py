#!/usr/bin/env python3
"""
Create the singles-builder channel in Saleor.

This script creates a new channel for the Singles Builder feature,
which allows staff to build carts of MTG singles for customers.

Usage:
    python scripts/create-singles-builder-channel.py

Requirements:
    - Saleor API must be running at http://localhost:8000/graphql/
    - Valid admin credentials (admin@example.com / admin)
"""

import requests
import json
import sys

SALEOR_API_URL = "http://localhost:8000/graphql/"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin"


def get_auth_token():
    """Get authentication token for admin user."""
    query = """
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
    response = requests.post(
        SALEOR_API_URL,
        json={
            "query": query,
            "variables": {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        },
    )
    data = response.json()

    if data.get("data", {}).get("tokenCreate", {}).get("errors"):
        print(f"Auth error: {data['data']['tokenCreate']['errors']}")
        sys.exit(1)

    return data["data"]["tokenCreate"]["token"]


def get_warehouse_id(token):
    """Get the default warehouse ID."""
    query = """
    query {
        warehouses(first: 1) {
            edges {
                node {
                    id
                    slug
                    name
                }
            }
        }
    }
    """
    response = requests.post(
        SALEOR_API_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"query": query},
    )
    data = response.json()
    warehouses = data.get("data", {}).get("warehouses", {}).get("edges", [])

    if not warehouses:
        print("No warehouses found!")
        sys.exit(1)

    warehouse = warehouses[0]["node"]
    print(f"Using warehouse: {warehouse['name']} ({warehouse['slug']})")
    return warehouse["id"]


def check_channel_exists(token, slug):
    """Check if channel already exists."""
    query = """
    query CheckChannel($slug: String!) {
        channel(slug: $slug) {
            id
            slug
            name
        }
    }
    """
    response = requests.post(
        SALEOR_API_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"query": query, "variables": {"slug": slug}},
    )
    data = response.json()
    return data.get("data", {}).get("channel")


def create_channel(token, warehouse_id):
    """Create the singles-builder channel."""
    mutation = """
    mutation CreateChannel($input: ChannelCreateInput!) {
        channelCreate(input: $input) {
            channel {
                id
                slug
                name
                currencyCode
                isActive
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
            "name": "Singles Builder",
            "slug": "singles-builder",
            "currencyCode": "USD",
            "defaultCountry": "US",
            "isActive": True,
            "addWarehouses": [warehouse_id],
            "orderSettings": {
                "automaticallyConfirmAllNewOrders": False,
                "allowUnpaidOrders": True,
            },
        }
    }

    response = requests.post(
        SALEOR_API_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"query": mutation, "variables": variables},
    )
    data = response.json()

    if data.get("data", {}).get("channelCreate", {}).get("errors"):
        errors = data["data"]["channelCreate"]["errors"]
        print(f"Channel creation errors: {json.dumps(errors, indent=2)}")
        sys.exit(1)

    return data["data"]["channelCreate"]["channel"]


def main():
    print("Creating singles-builder channel...")
    print("-" * 50)

    # Get auth token
    print("Authenticating...")
    token = get_auth_token()
    print("Authenticated successfully")

    # Check if channel already exists
    print("Checking if channel exists...")
    existing = check_channel_exists(token, "singles-builder")
    if existing:
        print(f"Channel already exists: {existing['name']} (ID: {existing['id']})")
        print("No action needed.")
        return

    # Get warehouse ID
    print("Getting warehouse...")
    warehouse_id = get_warehouse_id(token)

    # Create channel
    print("Creating channel...")
    channel = create_channel(token, warehouse_id)

    print("-" * 50)
    print("Channel created successfully!")
    print(f"  ID: {channel['id']}")
    print(f"  Slug: {channel['slug']}")
    print(f"  Name: {channel['name']}")
    print(f"  Currency: {channel['currencyCode']}")
    print(f"  Active: {channel['isActive']}")
    print("-" * 50)
    print("Next step: Run the SQL sync script to copy product listings:")
    print("  docker compose exec db psql -U saleor -d saleor -f /scripts/sync-singles-builder-listings.sql")


if __name__ == "__main__":
    main()
