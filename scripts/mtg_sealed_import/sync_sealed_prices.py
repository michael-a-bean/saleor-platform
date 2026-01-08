"""
Django management command to sync prices for MTG sealed products.

Strategy:
1. Use MSRP attribute value if available
2. Fall back to category-based default pricing
3. Update Saleor variant channel listings directly

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/sync_sealed_prices.py

Usage:
    python manage.py sync_sealed_prices [--dry-run] [--category <slug>]
"""

import re
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from saleor.attribute.models import (
    AssignedProductAttributeValue,
    Attribute,
)
from saleor.channel.models import Channel
from saleor.product.models import (
    Category,
    Product,
    ProductType,
    ProductVariantChannelListing,
)


# Default pricing by category (if no MSRP available)
# Based on typical market prices
CATEGORY_DEFAULT_PRICES = {
    "play-booster-boxes": Decimal("119.99"),      # Play Booster Box
    "collector-booster-boxes": Decimal("249.99"), # Collector Booster Box
    "draft-booster-boxes": Decimal("99.99"),      # Draft Booster Box (older)
    "set-booster-boxes": Decimal("109.99"),       # Set Booster Box (discontinued)
    "play-booster-packs": Decimal("4.99"),        # Play Booster Pack
    "collector-booster-packs": Decimal("24.99"),  # Collector Booster Pack
    "jumpstart-boosters": Decimal("5.99"),        # Jumpstart Pack
    "bundles": Decimal("49.99"),                  # Bundle/Fat Pack
    "commander-decks": Decimal("44.99"),          # Commander Deck
    "challenger-decks": Decimal("29.99"),         # Challenger Deck
    "starter-kits": Decimal("14.99"),             # Starter Kit
    "prerelease-kits": Decimal("29.99"),          # Prerelease Kit
    "secret-lair": Decimal("39.99"),              # Secret Lair (varies widely)
    "premium-collections": Decimal("49.99"),      # FTV, Spellbook, etc.
}


class Command(BaseCommand):
    help = "Sync prices for MTG sealed products using MSRP or category defaults"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )
        parser.add_argument(
            "--category",
            type=str,
            default="",
            help="Only update products in specific category (slug)",
        )
        parser.add_argument(
            "--channel",
            type=str,
            default="webstore",
            help="Channel slug to update prices for",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        category_filter = options["category"]
        channel_slug = options["channel"]

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("MTG Sealed Products Price Sync"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made\n"))

        # Get dependencies
        try:
            product_type = ProductType.objects.get(slug="mtg-sealed-product")
            channel = Channel.objects.get(slug=channel_slug)
        except ProductType.DoesNotExist:
            self.stderr.write(self.style.ERROR("Product type 'mtg-sealed-product' not found"))
            return
        except Channel.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"Channel '{channel_slug}' not found"))
            return

        self.stdout.write(f"Product type: {product_type.name}")
        self.stdout.write(f"Channel: {channel.name}")

        # Get MSRP attribute
        try:
            msrp_attr = Attribute.objects.get(slug="mtg-msrp")
        except Attribute.DoesNotExist:
            msrp_attr = None
            self.stdout.write("MSRP attribute not found, using category defaults only")

        # Build category lookup
        categories = {}
        for cat in Category.objects.filter(slug__in=CATEGORY_DEFAULT_PRICES.keys()):
            categories[cat.id] = cat.slug

        # Query products
        products = Product.objects.filter(product_type=product_type)
        if category_filter:
            products = products.filter(category__slug=category_filter)
        products = products.select_related("category").prefetch_related("variants")

        self.stdout.write(f"Products to process: {products.count()}")

        stats = {
            "processed": 0,
            "msrp_used": 0,
            "default_used": 0,
            "no_variant": 0,
            "no_listing": 0,
            "updated": 0,
            "skipped_zero": 0,
        }

        for product in products:
            stats["processed"] += 1

            # Get price: try MSRP first, then category default
            price = None

            # Try MSRP
            if msrp_attr:
                msrp_value = self._get_msrp_value(product, msrp_attr)
                if msrp_value:
                    price = self._parse_price(msrp_value)
                    if price and price > 0:
                        stats["msrp_used"] += 1

            # Fall back to category default
            if price is None or price <= 0:
                category_slug = categories.get(product.category_id)
                if category_slug:
                    price = CATEGORY_DEFAULT_PRICES.get(category_slug)
                    if price:
                        stats["default_used"] += 1

            if price is None or price <= 0:
                stats["skipped_zero"] += 1
                continue

            # Get variant
            variant = product.variants.first()
            if not variant:
                stats["no_variant"] += 1
                continue

            # Update variant channel listing
            try:
                listing = ProductVariantChannelListing.objects.get(
                    variant=variant,
                    channel=channel,
                )
            except ProductVariantChannelListing.DoesNotExist:
                stats["no_listing"] += 1
                continue

            # Check if update needed
            if listing.price_amount == price and listing.discounted_price_amount == price:
                continue

            if dry_run:
                if stats["updated"] < 10:
                    self.stdout.write(
                        f"  Would update: {product.name[:50]} -> ${price}"
                    )
            else:
                listing.price_amount = price
                listing.discounted_price_amount = price
                listing.save(update_fields=["price_amount", "discounted_price_amount"])

            stats["updated"] += 1

            if stats["processed"] % 500 == 0:
                self.stdout.write(f"  Processed {stats['processed']}...")

        # Summary
        self.stdout.write(self.style.SUCCESS("\n" + "=" * 60))
        self.stdout.write(self.style.SUCCESS("Price Sync Complete"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"Processed:      {stats['processed']}")
        self.stdout.write(f"Updated:        {stats['updated']}")
        self.stdout.write(f"MSRP used:      {stats['msrp_used']}")
        self.stdout.write(f"Default used:   {stats['default_used']}")
        self.stdout.write(f"Skipped (zero): {stats['skipped_zero']}")
        self.stdout.write(f"No variant:     {stats['no_variant']}")
        self.stdout.write(f"No listing:     {stats['no_listing']}")

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[DRY RUN - no changes made]"))

    def _get_msrp_value(self, product, msrp_attr):
        """Get MSRP attribute value for a product."""
        try:
            assignment = AssignedProductAttributeValue.objects.get(
                product=product,
                value__attribute=msrp_attr,
            )
            return assignment.value.plain_text
        except AssignedProductAttributeValue.DoesNotExist:
            return None

    def _parse_price(self, price_str):
        """Parse a price string like '$179.99' into a Decimal."""
        if not price_str:
            return None

        # Remove currency symbols and whitespace
        cleaned = re.sub(r'[^\d.]', '', str(price_str))

        try:
            return Decimal(cleaned)
        except:
            return None
