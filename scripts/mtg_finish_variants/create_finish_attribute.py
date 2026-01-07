"""
Django management command to create the mtg-finish variant attribute.

This script creates the finish attribute (Non-Foil, Foil, Etched, Glossy)
and assigns it to the mtg-card product type as a variant-selection attribute.

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/create_finish_attribute.py

Usage:
    python manage.py create_finish_attribute
"""

import sys

from django.core.management.base import BaseCommand

from saleor.attribute import AttributeInputType, AttributeType
from saleor.attribute.models import (
    Attribute,
    AttributeValue,
    AttributeVariant,
)
from saleor.product.models import ProductType


# Finish definitions: (code, display_name, sku_suffix)
FINISH_VALUES = [
    ("NF", "Non-Foil", "NF"),
    ("F", "Foil", "F"),
    ("E", "Etched", "E"),
    ("G", "Glossy", "G"),
]

FINISH_ATTRIBUTE_SLUG = "mtg-finish"
FINISH_ATTRIBUTE_NAME = "Finish"
MTG_PRODUCT_TYPE_SLUG = "mtg-card"


class Command(BaseCommand):
    help = "Create the mtg-finish variant attribute for MTG cards"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("MTG Finish Attribute Setup"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made"))

        # Get MTG Card product type
        try:
            product_type = ProductType.objects.get(slug=MTG_PRODUCT_TYPE_SLUG)
            self.stdout.write(f"Found product type: {product_type.name} (ID: {product_type.id})")
        except ProductType.DoesNotExist:
            self.stderr.write(
                self.style.ERROR(f"Product type '{MTG_PRODUCT_TYPE_SLUG}' not found!")
            )
            sys.exit(1)

        # Create or get the finish attribute
        if dry_run:
            self.stdout.write(f"Would create attribute: {FINISH_ATTRIBUTE_SLUG}")
            for code, name, _ in FINISH_VALUES:
                self.stdout.write(f"  Would create value: {name} (code: {code})")
            return

        attr, created = Attribute.objects.get_or_create(
            slug=FINISH_ATTRIBUTE_SLUG,
            defaults={
                "name": FINISH_ATTRIBUTE_NAME,
                "input_type": AttributeInputType.DROPDOWN,
                "type": AttributeType.PRODUCT_TYPE,
                "visible_in_storefront": True,
                "filterable_in_storefront": True,
                "filterable_in_dashboard": True,
                "storefront_search_position": 2,  # After condition
                "available_in_grid": True,
            },
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created finish attribute: {attr.slug}"))
        else:
            self.stdout.write(f"Using existing finish attribute: {attr.slug}")

        # Create attribute values
        for code, name, sku_suffix in FINISH_VALUES:
            value_slug = f"mtg-finish-{code.lower()}"
            value, val_created = AttributeValue.objects.get_or_create(
                attribute=attr,
                slug=value_slug,
                defaults={"name": name},
            )
            if val_created:
                self.stdout.write(f"  Created value: {name} ({value_slug})")
            else:
                self.stdout.write(f"  Existing value: {name} ({value_slug})")

        # Assign to product type as VARIANT attribute with variant_selection=True
        attr_variant, av_created = AttributeVariant.objects.get_or_create(
            attribute=attr,
            product_type=product_type,
            defaults={"variant_selection": True},
        )

        # Ensure variant_selection is True
        if not attr_variant.variant_selection:
            attr_variant.variant_selection = True
            attr_variant.save(update_fields=["variant_selection"])
            self.stdout.write("Enabled variant_selection for finish attribute")

        if av_created:
            self.stdout.write(
                self.style.SUCCESS(f"Assigned finish attribute to product type as variant selector")
            )
        else:
            self.stdout.write("Finish attribute already assigned to product type")

        # Also create the TCGPlayer SKU attribute for storing SKU IDs
        tcg_sku_attr, tcg_created = Attribute.objects.get_or_create(
            slug="mtg-tcgplayer-sku",
            defaults={
                "name": "TCGPlayer SKU",
                "input_type": AttributeInputType.PLAIN_TEXT,
                "type": AttributeType.PRODUCT_TYPE,
                "visible_in_storefront": False,
                "filterable_in_storefront": False,
                "filterable_in_dashboard": False,
                "storefront_search_position": 0,
                "available_in_grid": False,
            },
        )

        if tcg_created:
            self.stdout.write(self.style.SUCCESS(f"Created TCGPlayer SKU attribute"))

            # Assign to product type as variant attribute
            AttributeVariant.objects.get_or_create(
                attribute=tcg_sku_attr,
                product_type=product_type,
                defaults={"variant_selection": False},
            )
            self.stdout.write("Assigned TCGPlayer SKU attribute to product type")
        else:
            self.stdout.write("TCGPlayer SKU attribute already exists")

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Finish attribute setup complete!"))
