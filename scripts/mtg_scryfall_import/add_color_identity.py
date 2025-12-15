"""
Django management command to add color identity attribute to existing MTG cards.

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/add_color_identity.py

Usage:
    python manage.py add_color_identity /path/to/all-cards.json
"""

import json
import sys
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from saleor.attribute import AttributeInputType, AttributeType
from saleor.attribute.models import (
    Attribute,
    AttributeProduct,
    AttributeValue,
    AssignedProductAttributeValue,
)
from saleor.product.models import Product, ProductType


# Color identity values with display names
COLOR_IDENTITY_VALUES = [
    ("W", "White"),
    ("U", "Blue"),
    ("B", "Black"),
    ("R", "Red"),
    ("G", "Green"),
]

BATCH_SIZE = 1000


class Command(BaseCommand):
    help = "Add color identity attribute to existing MTG cards"

    def add_arguments(self, parser):
        parser.add_argument("json_file", type=str, help="Path to Scryfall JSON file")
        parser.add_argument(
            "--batch-size",
            type=int,
            default=BATCH_SIZE,
            help=f"Batch size for bulk operations (default: {BATCH_SIZE})",
        )

    def handle(self, *args, **options):
        json_file = Path(options["json_file"])
        batch_size = options["batch_size"]

        if not json_file.exists():
            self.stderr.write(self.style.ERROR(f"File not found: {json_file}"))
            sys.exit(1)

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Add Color Identity to MTG Cards"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        # Get product type
        try:
            product_type = ProductType.objects.get(slug="mtg-card")
        except ProductType.DoesNotExist:
            self.stderr.write(self.style.ERROR("Product type 'mtg-card' not found"))
            sys.exit(1)

        # Create color identity attribute
        attribute = self.create_attribute(product_type)
        self.stdout.write(f"Attribute: {attribute.slug}")

        # Create attribute values
        attr_values = self.create_attribute_values(attribute)
        self.stdout.write(f"Created {len(attr_values)} attribute values")

        # Load JSON and build lookup
        self.stdout.write("Loading JSON file...")
        with open(json_file, "r") as f:
            cards = json.load(f)

        # Build Scryfall ID to color_identity mapping
        scryfall_to_colors = {}
        for card in cards:
            if card.get("lang") == "en":
                scryfall_id = card.get("id")
                color_identity = card.get("color_identity", [])
                if scryfall_id:
                    scryfall_to_colors[scryfall_id] = color_identity

        self.stdout.write(f"Loaded {len(scryfall_to_colors):,} English cards from JSON")

        # Get all products and their Scryfall IDs
        self.stdout.write("Fetching products...")

        # Get Scryfall ID attribute
        try:
            scryfall_attr = Attribute.objects.get(slug="mtg-scryfall-id")
        except Attribute.DoesNotExist:
            self.stderr.write(self.style.ERROR("Attribute 'mtg-scryfall-id' not found"))
            sys.exit(1)

        # Build product to scryfall_id mapping via attribute values
        product_scryfall_ids = {}
        attr_values_qs = AssignedProductAttributeValue.objects.filter(
            value__attribute=scryfall_attr
        ).select_related("value", "product")

        for assignment in attr_values_qs:
            scryfall_id = assignment.value.plain_text or assignment.value.name
            product_scryfall_ids[assignment.product_id] = scryfall_id

        self.stdout.write(f"Found {len(product_scryfall_ids):,} products with Scryfall IDs")

        # Update products with color identity
        self.update_products(
            product_scryfall_ids,
            scryfall_to_colors,
            attribute,
            attr_values,
            batch_size,
        )

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Color identity update complete!"))

    def create_attribute(self, product_type):
        """Create color identity attribute."""
        attr, created = Attribute.objects.get_or_create(
            slug="mtg-color-identity",
            defaults={
                "name": "Color Identity",
                "input_type": AttributeInputType.MULTISELECT,
                "type": AttributeType.PRODUCT_TYPE,
                "visible_in_storefront": True,
                "filterable_in_storefront": True,
                "filterable_in_dashboard": True,
                "storefront_search_position": 0,
                "available_in_grid": True,
            },
        )
        if created:
            self.stdout.write(f"Created attribute: {attr.slug}")
        else:
            self.stdout.write(f"Using existing attribute: {attr.slug}")

        # Assign to product type
        AttributeProduct.objects.get_or_create(
            attribute=attr,
            product_type=product_type,
        )

        return attr

    def create_attribute_values(self, attribute):
        """Create predefined color identity values."""
        attr_values = {}
        for code, name in COLOR_IDENTITY_VALUES:
            slug = f"mtg-color-{code.lower()}"
            attr_value, created = AttributeValue.objects.get_or_create(
                attribute=attribute,
                slug=slug,
                defaults={"name": name},
            )
            attr_values[code] = attr_value
            if created:
                self.stdout.write(f"  Created value: {name} ({code})")

        return attr_values

    def update_products(
        self, product_scryfall_ids, scryfall_to_colors, attribute, attr_values, batch_size
    ):
        """Update products with color identity values."""
        # Get existing assignments to avoid duplicates
        existing = set(
            AssignedProductAttributeValue.objects.filter(
                value__attribute=attribute
            ).values_list("product_id", "value_id")
        )
        self.stdout.write(f"Existing color identity assignments: {len(existing):,}")

        assignments_to_create = []
        products_updated = 0
        products_skipped = 0

        for product_id, scryfall_id in product_scryfall_ids.items():
            color_identity = scryfall_to_colors.get(scryfall_id, [])

            if not color_identity:
                # Colorless card - no assignment needed
                continue

            for color_code in color_identity:
                attr_value = attr_values.get(color_code)
                if not attr_value:
                    continue

                if (product_id, attr_value.id) in existing:
                    products_skipped += 1
                    continue

                assignments_to_create.append(
                    AssignedProductAttributeValue(
                        product_id=product_id,
                        value=attr_value,
                    )
                )
                existing.add((product_id, attr_value.id))

            products_updated += 1

            # Bulk create in batches
            if len(assignments_to_create) >= batch_size:
                with transaction.atomic():
                    AssignedProductAttributeValue.objects.bulk_create(
                        assignments_to_create, ignore_conflicts=True
                    )
                self.stdout.write(
                    f"  Created {len(assignments_to_create)} assignments "
                    f"({products_updated:,} products processed)"
                )
                assignments_to_create = []

        # Create remaining assignments
        if assignments_to_create:
            with transaction.atomic():
                AssignedProductAttributeValue.objects.bulk_create(
                    assignments_to_create, ignore_conflicts=True
                )
            self.stdout.write(f"  Created {len(assignments_to_create)} final assignments")

        self.stdout.write(f"Products updated: {products_updated:,}")
        self.stdout.write(f"Assignments skipped (already exist): {products_skipped:,}")
