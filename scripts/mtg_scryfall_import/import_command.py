"""
Django management command to import MTG cards from Scryfall JSON.

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/import_mtg_cards.py

Usage:
    python manage.py import_mtg_cards /path/to/all-cards.json [--resume] [--limit N]
"""

import json
import re
import sys
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from saleor.attribute import AttributeInputType, AttributeType
from saleor.attribute.models import (
    Attribute,
    AttributeProduct,
    AttributeValue,
    AssignedProductAttributeValue,
)
from saleor.channel.models import Channel
from saleor.product import ProductTypeKind
from saleor.product.models import (
    Category,
    Product,
    ProductChannelListing,
    ProductMedia,
    ProductType,
    ProductVariant,
    ProductVariantChannelListing,
)


# Attribute definitions: (scryfall_field, name, slug, input_type)
ATTRIBUTE_DEFS = [
    # IDs for external integrations
    ("id", "Scryfall ID", "mtg-scryfall-id", AttributeInputType.PLAIN_TEXT),
    ("oracle_id", "Oracle ID", "mtg-oracle-id", AttributeInputType.PLAIN_TEXT),
    ("tcgplayer_id", "TCGPlayer ID", "mtg-tcgplayer-id", AttributeInputType.PLAIN_TEXT),
    ("tcgplayer_etched_id", "TCGPlayer Etched ID", "mtg-tcgplayer-etched-id", AttributeInputType.PLAIN_TEXT),
    ("cardmarket_id", "Cardmarket ID", "mtg-cardmarket-id", AttributeInputType.PLAIN_TEXT),
    ("mtgo_id", "MTGO ID", "mtg-mtgo-id", AttributeInputType.PLAIN_TEXT),
    ("arena_id", "Arena ID", "mtg-arena-id", AttributeInputType.PLAIN_TEXT),
    # Card properties
    ("rarity", "Rarity", "mtg-rarity", AttributeInputType.DROPDOWN),
    ("type_line", "Type Line", "mtg-type-line", AttributeInputType.PLAIN_TEXT),
    ("mana_cost", "Mana Cost", "mtg-mana-cost", AttributeInputType.PLAIN_TEXT),
    ("cmc", "Mana Value", "mtg-mana-value", AttributeInputType.NUMERIC),
    ("set", "Set Code", "mtg-set-code", AttributeInputType.PLAIN_TEXT),
    ("set_name", "Set Name", "mtg-set-name", AttributeInputType.PLAIN_TEXT),
    ("artist", "Artist", "mtg-artist", AttributeInputType.PLAIN_TEXT),
    ("collector_number", "Collector #", "mtg-collector-number", AttributeInputType.PLAIN_TEXT),
    ("power", "Power", "mtg-power", AttributeInputType.PLAIN_TEXT),
    ("toughness", "Toughness", "mtg-toughness", AttributeInputType.PLAIN_TEXT),
    ("loyalty", "Loyalty", "mtg-loyalty", AttributeInputType.PLAIN_TEXT),
    # Boolean flags
    ("reserved", "Reserved List", "mtg-reserved", AttributeInputType.BOOLEAN),
    ("reprint", "Is Reprint", "mtg-is-reprint", AttributeInputType.BOOLEAN),
    ("promo", "Is Promo", "mtg-is-promo", AttributeInputType.BOOLEAN),
    ("full_art", "Is Full Art", "mtg-is-full-art", AttributeInputType.BOOLEAN),
    ("digital", "Is Digital Only", "mtg-is-digital", AttributeInputType.BOOLEAN),
]

RARITY_VALUES = ["common", "uncommon", "rare", "mythic", "special", "bonus"]

PROGRESS_FILE = Path("/tmp/mtg_import_progress.json")
BATCH_SIZE = 500


class Command(BaseCommand):
    help = "Import MTG cards from Scryfall JSON file"

    def add_arguments(self, parser):
        parser.add_argument("json_file", type=str, help="Path to Scryfall JSON file")
        parser.add_argument(
            "--resume",
            action="store_true",
            help="Resume from last saved progress",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Limit number of cards to import (0 = no limit)",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=BATCH_SIZE,
            help=f"Batch size for bulk operations (default: {BATCH_SIZE})",
        )

    def handle(self, *args, **options):
        json_file = Path(options["json_file"])
        resume = options["resume"]
        limit = options["limit"]
        batch_size = options["batch_size"]

        if not json_file.exists():
            self.stderr.write(self.style.ERROR(f"File not found: {json_file}"))
            sys.exit(1)

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("MTG Scryfall Import"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"Source: {json_file}")
        self.stdout.write(f"Resume: {resume}")
        self.stdout.write(f"Limit: {limit or 'None'}")
        self.stdout.write(f"Batch size: {batch_size}")

        # Get or create channel
        channel = self.get_or_create_channel()
        self.stdout.write(f"Channel: {channel.slug}")

        # Create product type, category, and attributes
        product_type = self.create_product_type()
        category = self.create_category()
        attributes = self.create_attributes(product_type)
        self.stdout.write(f"Product type: {product_type.slug}")
        self.stdout.write(f"Category: {category.slug}")
        self.stdout.write(f"Attributes: {len(attributes)}")

        # Load progress if resuming
        start_index = 0
        if resume and PROGRESS_FILE.exists():
            with open(PROGRESS_FILE) as f:
                progress = json.load(f)
                start_index = progress.get("last_index", 0)
            self.stdout.write(f"Resuming from index: {start_index}")

        # Import cards
        self.stdout.write(self.style.SUCCESS("-" * 60))
        self.stdout.write("Loading JSON file...")

        with open(json_file, "r") as f:
            cards = json.load(f)

        total_cards = len(cards)
        self.stdout.write(f"Total cards in file: {total_cards:,}")

        # Filter English cards
        english_cards = [c for c in cards if c.get("lang") == "en"]
        self.stdout.write(f"English cards: {len(english_cards):,}")

        # Apply limit
        if limit > 0:
            english_cards = english_cards[:limit]
            self.stdout.write(f"Limited to: {len(english_cards):,}")

        # Skip already processed
        cards_to_process = english_cards[start_index:]
        self.stdout.write(f"Cards to process: {len(cards_to_process):,}")

        self.import_cards(
            cards_to_process,
            product_type,
            category,
            attributes,
            channel,
            batch_size,
            start_index,
        )

        # Clear progress file on completion
        if PROGRESS_FILE.exists():
            PROGRESS_FILE.unlink()

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Import complete!"))

    def get_or_create_channel(self):
        """Get or create the default channel."""
        channel, created = Channel.objects.get_or_create(
            slug="webstore",
            defaults={
                "name": "Webstore",
                "currency_code": "USD",
                "is_active": True,
            },
        )
        if created:
            self.stdout.write(f"Created channel: {channel.slug}")
        return channel

    def create_product_type(self):
        """Create MTG Card product type."""
        product_type, created = ProductType.objects.get_or_create(
            slug="mtg-card",
            defaults={
                "name": "MTG Card",
                "has_variants": True,
                "is_shipping_required": True,
                "is_digital": False,
                "kind": ProductTypeKind.NORMAL,
            },
        )
        if created:
            self.stdout.write(f"Created product type: {product_type.slug}")
        return product_type

    def create_category(self):
        """Create MTG Cards category."""
        category, created = Category.objects.get_or_create(
            slug="mtg-cards",
            defaults={
                "name": "MTG Cards",
                "description": {
                    "blocks": [
                        {
                            "type": "paragraph",
                            "data": {"text": "Magic: The Gathering trading cards"},
                        }
                    ]
                },
            },
        )
        if created:
            self.stdout.write(f"Created category: {category.slug}")
        return category

    def create_attributes(self, product_type):
        """Create attributes and assign to product type."""
        attributes = {}

        for scryfall_field, name, slug, input_type in ATTRIBUTE_DEFS:
            attr, created = Attribute.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "input_type": input_type,
                    "type": AttributeType.PRODUCT_TYPE,
                    "visible_in_storefront": True,
                    "filterable_in_storefront": input_type in (AttributeInputType.DROPDOWN, AttributeInputType.BOOLEAN),
                    "filterable_in_dashboard": True,
                    "storefront_search_position": 0,
                    "available_in_grid": input_type in (AttributeInputType.DROPDOWN, AttributeInputType.BOOLEAN),
                },
            )

            # Create predefined values for rarity dropdown
            if slug == "mtg-rarity" and created:
                for rarity in RARITY_VALUES:
                    AttributeValue.objects.get_or_create(
                        attribute=attr,
                        slug=f"mtg-rarity-{rarity}",
                        defaults={"name": rarity.capitalize()},
                    )

            # Assign to product type
            AttributeProduct.objects.get_or_create(
                attribute=attr,
                product_type=product_type,
            )

            attributes[scryfall_field] = attr

        return attributes

    def import_cards(
        self, cards, product_type, category, attributes, channel, batch_size, start_index
    ):
        """Import cards in batches."""
        total = len(cards)
        imported = 0
        errors = 0

        for i in range(0, total, batch_size):
            batch = cards[i : i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (total + batch_size - 1) // batch_size

            try:
                with transaction.atomic():
                    batch_imported = self.import_batch(
                        batch, product_type, category, attributes, channel
                    )
                    imported += batch_imported

                # Save progress
                self.save_progress(start_index + i + len(batch))

                self.stdout.write(
                    f"Batch {batch_num}/{total_batches}: "
                    f"Imported {batch_imported}/{len(batch)} cards "
                    f"(Total: {imported:,})"
                )

            except Exception as e:
                errors += len(batch)
                self.stderr.write(
                    self.style.ERROR(f"Batch {batch_num} failed: {e}")
                )
                # Save progress even on error
                self.save_progress(start_index + i)

        self.stdout.write(f"Imported: {imported:,}, Errors: {errors:,}")

    def import_batch(self, cards, product_type, category, attributes, channel):
        """Import a batch of cards."""
        products_to_create = []
        card_data_map = {}  # Map slug to card data for post-processing

        for card in cards:
            try:
                slug = self.make_slug(card)

                # Skip if product already exists
                if Product.objects.filter(slug=slug).exists():
                    continue

                # Build description in EditorJS format
                blocks = []
                if card.get("type_line"):
                    blocks.append({
                        "type": "paragraph",
                        "data": {"text": card["type_line"]}
                    })
                if card.get("oracle_text"):
                    blocks.append({
                        "type": "paragraph",
                        "data": {"text": card["oracle_text"]}
                    })
                description = {"blocks": blocks} if blocks else {"blocks": []}

                product = Product(
                    name=card.get("name", "Unknown Card")[:250],
                    slug=slug,
                    description=description,
                    product_type=product_type,
                    category=category,
                )
                products_to_create.append(product)
                card_data_map[slug] = card

            except Exception as e:
                self.stderr.write(f"Error preparing card {card.get('name')}: {e}")

        if not products_to_create:
            return 0

        # Bulk create products
        Product.objects.bulk_create(products_to_create, ignore_conflicts=True)

        # Refresh to get IDs
        created_products = Product.objects.filter(
            slug__in=[p.slug for p in products_to_create]
        )

        # Create related objects
        variants = []
        channel_listings = []
        variant_listings = []
        media_objects = []
        attr_assignments = []

        for product in created_products:
            card = card_data_map.get(product.slug)
            if not card:
                continue

            # Create variant
            variant = ProductVariant(
                product=product,
                sku=card.get("id", "")[:255],
                name=product.name,
                track_inventory=False,
            )
            variants.append(variant)

            # Create channel listing
            channel_listing = ProductChannelListing(
                product=product,
                channel=channel,
                is_published=True,
                visible_in_listings=True,
                available_for_purchase_at=timezone.now(),
            )
            channel_listings.append(channel_listing)

            # Create media from image URL
            image_uris = card.get("image_uris", {})
            image_url = image_uris.get("normal") or image_uris.get("large")
            if image_url:
                media = ProductMedia(
                    product=product,
                    external_url=image_url,
                    alt=product.name[:250],
                    type="IMAGE",
                )
                media_objects.append(media)

        # Bulk create variants
        ProductVariant.objects.bulk_create(variants, ignore_conflicts=True)

        # Get created variants for pricing
        created_variants = ProductVariant.objects.filter(
            product__in=created_products
        ).select_related("product")

        # Create variant channel listings with prices
        for variant in created_variants:
            card = card_data_map.get(variant.product.slug)
            if not card:
                continue

            price = Decimal("0.00")
            prices = card.get("prices", {})
            if prices.get("usd"):
                try:
                    price = Decimal(prices["usd"])
                except:
                    pass

            variant_listing = ProductVariantChannelListing(
                variant=variant,
                channel=channel,
                price_amount=price,
                discounted_price_amount=price,  # Required for pricing calculations
                currency=channel.currency_code,
            )
            variant_listings.append(variant_listing)

        # Bulk create related objects
        ProductChannelListing.objects.bulk_create(
            channel_listings, ignore_conflicts=True
        )
        ProductVariantChannelListing.objects.bulk_create(
            variant_listings, ignore_conflicts=True
        )
        ProductMedia.objects.bulk_create(media_objects, ignore_conflicts=True)

        # Assign attributes (more complex, do individually for now)
        self.assign_attributes(created_products, card_data_map, attributes)

        return len(created_products)

    def assign_attributes(self, products, card_data_map, attributes):
        """Assign attribute values to products."""
        for product in products:
            card = card_data_map.get(product.slug)
            if not card:
                continue

            for scryfall_field, attr in attributes.items():
                value = card.get(scryfall_field)
                if value is None or value == "":
                    continue

                try:
                    # Handle different attribute types
                    if attr.input_type == AttributeInputType.DROPDOWN:
                        # Find or create attribute value
                        attr_value, _ = AttributeValue.objects.get_or_create(
                            attribute=attr,
                            slug=slugify(f"{attr.slug}-{value}")[:255],
                            defaults={"name": str(value).capitalize()[:250]},
                        )
                        AssignedProductAttributeValue.objects.get_or_create(
                            product=product,
                            value=attr_value,
                        )

                    elif attr.input_type == AttributeInputType.BOOLEAN:
                        attr_value, _ = AttributeValue.objects.get_or_create(
                            attribute=attr,
                            boolean=bool(value),
                            defaults={
                                "name": "Yes" if value else "No",
                                "slug": f"{attr.slug}-{'yes' if value else 'no'}",
                            },
                        )
                        AssignedProductAttributeValue.objects.get_or_create(
                            product=product,
                            value=attr_value,
                        )

                    elif attr.input_type == AttributeInputType.PLAIN_TEXT:
                        attr_value, _ = AttributeValue.objects.get_or_create(
                            attribute=attr,
                            slug=slugify(f"{attr.slug}-{product.pk}")[:255],
                            defaults={
                                "name": str(value)[:250],
                                "plain_text": str(value),
                            },
                        )
                        AssignedProductAttributeValue.objects.get_or_create(
                            product=product,
                            value=attr_value,
                        )

                    elif attr.input_type == AttributeInputType.NUMERIC:
                        attr_value, _ = AttributeValue.objects.get_or_create(
                            attribute=attr,
                            slug=slugify(f"{attr.slug}-{product.pk}")[:255],
                            defaults={
                                "name": str(value),
                            },
                        )
                        AssignedProductAttributeValue.objects.get_or_create(
                            product=product,
                            value=attr_value,
                        )

                except Exception as e:
                    # Log but continue
                    pass

    def make_slug(self, card):
        """Create unique slug from card data."""
        name = card.get("name", "unknown")
        set_code = card.get("set", "xxx")
        collector_num = card.get("collector_number", "0")

        # Handle double-faced cards
        name = name.split(" // ")[0]

        base = f"{name}-{set_code}-{collector_num}"
        slug = slugify(base)[:200]

        # Ensure uniqueness by appending scryfall ID if needed
        if not slug:
            slug = card.get("id", "unknown")[:200]

        return slug

    def save_progress(self, index):
        """Save progress to file."""
        with open(PROGRESS_FILE, "w") as f:
            json.dump({"last_index": index}, f)
