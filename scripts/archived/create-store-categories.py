#!/usr/bin/env python3
"""
Create store categories for Board Games, Supplies, and Miniatures.

Usage:
    python scripts/create-store-categories.py [--dry-run]

This creates the category structure expected by the storefront pages.
"""

import requests
import argparse
import sys

SALEOR_API = "http://localhost:8000/graphql/"

# Category definitions matching storefront pages
CATEGORIES = {
    "board-games": {
        "name": "Board Games",
        "description": "Strategy games, party games, family games, and more tabletop entertainment.",
        "children": [
            {"name": "Strategy Games", "slug": "strategy-games", "description": "Deep strategy and euro-style games"},
            {"name": "Party Games", "slug": "party-games", "description": "Fun games for groups and gatherings"},
            {"name": "Family Games", "slug": "family-games", "description": "Games for all ages and skill levels"},
            {"name": "Cooperative Games", "slug": "cooperative-games", "description": "Work together to win"},
            {"name": "Card Games", "slug": "card-games", "description": "Non-collectible card games"},
            {"name": "RPG & Adventure", "slug": "rpg-adventure", "description": "Role-playing and adventure games"},
        ]
    },
    "supplies": {
        "name": "Gaming Supplies",
        "slug": "supplies",
        "description": "Card sleeves, deck boxes, playmats, dice, and more gaming accessories.",
        "children": [
            {"name": "Card Sleeves", "slug": "card-sleeves", "description": "Protective sleeves for trading cards"},
            {"name": "Deck Boxes", "slug": "deck-boxes", "description": "Storage and carrying cases for decks"},
            {"name": "Playmats", "slug": "playmats", "description": "Gaming surface mats and accessories"},
            {"name": "Binders", "slug": "binders", "description": "Card storage binders and pages"},
            {"name": "Dice & Counters", "slug": "dice-counters", "description": "Dice sets, life counters, and tokens"},
            {"name": "Card Storage", "slug": "card-storage", "description": "Bulk card storage boxes and solutions"},
            {"name": "Hobby Supplies", "slug": "hobby-supplies", "description": "Paints, brushes, basing, and modeling supplies"},
        ]
    },
    "miniatures": {
        "name": "Miniatures",
        "description": "Miniature wargames and models - Warhammer 40K, Age of Sigmar, Star Wars Legion, and more.",
        "children": [
            {"name": "Warhammer 40K", "slug": "warhammer-40k", "description": "Warhammer 40,000 miniatures and games"},
            {"name": "Warhammer AoS", "slug": "warhammer-aos", "description": "Age of Sigmar miniatures and games"},
            {"name": "Star Wars Legion", "slug": "star-wars-legion", "description": "Star Wars Legion miniatures"},
            {"name": "Other Wargames", "slug": "other-wargames", "description": "Other miniature wargames and systems"},
        ]
    },
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
    token = data.get("data", {}).get("tokenCreate", {}).get("token")
    if not token:
        print(f"Failed to authenticate: {data}")
        sys.exit(1)
    return token


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


def check_category_exists(slug: str, token: str) -> dict | None:
    """Check if a category with the given slug exists."""
    query = """
    query CheckCategory($slug: String!) {
        category(slug: $slug) {
            id
            name
            slug
        }
    }
    """
    result = graphql_request(query, {"slug": slug}, token)
    return result.get("data", {}).get("category")


def create_category(name: str, slug: str, description: str, parent_id: str = None, token: str = None) -> dict | None:
    """Create a category in Saleor."""
    import json

    mutation = """
    mutation CreateCategory($input: CategoryInput!, $parent: ID) {
        categoryCreate(input: $input, parent: $parent) {
            category {
                id
                name
                slug
            }
            errors {
                field
                message
            }
        }
    }
    """

    # Description must be a JSON string (EditorJS format)
    description_json = json.dumps({"blocks": [{"type": "paragraph", "data": {"text": description}}]}) if description else None

    variables = {
        "input": {
            "name": name,
            "slug": slug,
            "description": description_json,
        },
        "parent": parent_id,
    }

    result = graphql_request(mutation, variables, token)

    if "errors" in result:
        print(f"  GraphQL Error: {result['errors']}")
        return None

    data = result.get("data", {}).get("categoryCreate", {})
    errors = data.get("errors", [])

    if errors:
        print(f"  Error creating '{name}': {errors}")
        return None

    return data.get("category")


def main():
    parser = argparse.ArgumentParser(description="Create store categories in Saleor")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created without making changes")
    args = parser.parse_args()

    print("=" * 60)
    print("Store Category Setup")
    print("=" * 60)

    if args.dry_run:
        print("\n[DRY RUN MODE - No changes will be made]\n")
        for parent_slug, parent_data in CATEGORIES.items():
            slug = parent_data.get("slug", parent_slug)
            print(f"\nParent: {parent_data['name']} (slug: {slug})")
            for child in parent_data["children"]:
                print(f"  - {child['name']} (slug: {child['slug']})")
        print("\nRun without --dry-run to create these categories.")
        return

    # Authenticate
    print("\nAuthenticating...")
    token = get_auth_token()
    print("Authenticated!")

    created_count = 0
    skipped_count = 0

    for parent_slug, parent_data in CATEGORIES.items():
        parent_actual_slug = parent_data.get("slug", parent_slug)
        print(f"\n[{parent_data['name']}]")

        # Check if parent exists
        existing_parent = check_category_exists(parent_actual_slug, token)
        if existing_parent:
            print(f"  Parent exists: {existing_parent['name']} (id: {existing_parent['id']})")
            parent_id = existing_parent["id"]
            skipped_count += 1
        else:
            # Create parent category
            parent = create_category(
                name=parent_data["name"],
                slug=parent_actual_slug,
                description=parent_data.get("description", ""),
                token=token
            )
            if parent:
                print(f"  Created parent: {parent['name']} (id: {parent['id']})")
                parent_id = parent["id"]
                created_count += 1
            else:
                print(f"  Failed to create parent category, skipping children")
                continue

        # Create child categories
        for child in parent_data["children"]:
            existing_child = check_category_exists(child["slug"], token)
            if existing_child:
                print(f"    Exists: {child['name']} (slug: {child['slug']})")
                skipped_count += 1
            else:
                result = create_category(
                    name=child["name"],
                    slug=child["slug"],
                    description=child.get("description", ""),
                    parent_id=parent_id,
                    token=token
                )
                if result:
                    print(f"    Created: {child['name']} (slug: {child['slug']})")
                    created_count += 1
                else:
                    print(f"    Failed: {child['name']}")

    print("\n" + "=" * 60)
    print(f"Done! Created: {created_count}, Skipped (existing): {skipped_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
