"""
Django management command to create a test MTG sealed product.

Creates an Aetherdrift Play Booster Box to verify the schema setup.

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/create_test_sealed_product.py

Usage:
    python manage.py create_test_sealed_product
"""

from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify

from saleor.attribute.models import (
    Attribute,
    AttributeValue,
    AssignedProductAttributeValue,
)
from saleor.channel.models import Channel
from saleor.product.models import (
    Category,
    Product,
    ProductChannelListing,
    ProductType,
    ProductVariant,
    ProductVariantChannelListing,
)


class Command(BaseCommand):
    help = "Create a test MTG sealed product (Aetherdrift Play Booster Box)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--delete",
            action="store_true",
            help="Delete the test product if it exists",
        )

    def handle(self, *args, **options):
        delete_mode = options["delete"]
        test_slug = "aetherdrift-play-booster-box"

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("MTG Sealed Test Product"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        if delete_mode:
            deleted = Product.objects.filter(slug=test_slug).delete()
            self.stdout.write(f"Deleted: {deleted}")
            return

        # Check if product already exists
        if Product.objects.filter(slug=test_slug).exists():
            self.stdout.write(self.style.WARNING(f"Product already exists: {test_slug}"))
            self.stdout.write("Use --delete to remove it first")
            return

        # Get dependencies
        product_type = ProductType.objects.get(slug="mtg-sealed-product")
        category = Category.objects.get(slug="play-booster-boxes")
        channel = Channel.objects.get(slug="webstore")

        self.stdout.write(f"Product type: {product_type.name}")
        self.stdout.write(f"Category: {category.name}")
        self.stdout.write(f"Channel: {channel.name}")

        # Create the product
        product = Product.objects.create(
            name="Aetherdrift Play Booster Box",
            slug=test_slug,
            description={
                "blocks": [
                    {
                        "type": "paragraph",
                        "data": {
                            "text": "30 Play Booster packs from Aetherdrift. "
                            "Each pack contains 14 cards with 1-4 Rare/Mythic cards."
                        }
                    }
                ]
            },
            product_type=product_type,
            category=category,
        )
        self.stdout.write(self.style.SUCCESS(f"Created product: {product.name} (ID: {product.pk})"))

        # Create variant (required even for non-variant products)
        variant = ProductVariant.objects.create(
            product=product,
            sku="DFT-PLAY-BOX",
            name="Aetherdrift Play Booster Box",
            track_inventory=True,
        )
        self.stdout.write(f"  Created variant: {variant.sku}")

        # Create channel listing (product level)
        release_date = timezone.make_aware(
            timezone.datetime(2025, 2, 14, 0, 0, 0)
        )

        product_listing = ProductChannelListing.objects.create(
            product=product,
            channel=channel,
            is_published=True,
            visible_in_listings=True,
            available_for_purchase_at=release_date,  # Preorder until release
        )
        self.stdout.write(f"  Created product listing (available: {release_date.date()})")

        # Create variant channel listing (with price)
        price = Decimal("179.99")
        variant_listing = ProductVariantChannelListing.objects.create(
            variant=variant,
            channel=channel,
            price_amount=price,
            discounted_price_amount=price,  # Critical: must be set
            currency=channel.currency_code,
        )
        self.stdout.write(f"  Created variant listing (price: ${price})")

        # Assign attributes
        self._assign_attribute(product, "mtg-set-code", "dft", plain_text=True)
        self._assign_attribute(product, "mtg-set-name", "Aetherdrift", plain_text=True)
        self._assign_attribute(product, "mtg-sealed-type", "booster-box")
        self._assign_attribute(product, "mtg-sealed-subtype", "play")
        self._assign_attribute(product, "mtg-pack-count", "30", numeric=True)
        self._assign_attribute(product, "mtg-msrp", "$179.99", plain_text=True)
        self._assign_attribute(product, "mtg-tcgplayer-product-id", "508889", plain_text=True)
        self._assign_date_attribute(product, "mtg-released-at", date(2025, 2, 14))

        self.stdout.write(self.style.SUCCESS("\n" + "=" * 60))
        self.stdout.write(self.style.SUCCESS("Test product created successfully!"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"\nProduct ID: {product.pk}")
        self.stdout.write(f"Variant ID: {variant.pk}")
        self.stdout.write(f"SKU: {variant.sku}")
        self.stdout.write(f"Slug: {product.slug}")

    def _assign_attribute(self, product, attr_slug, value, plain_text=False, numeric=False):
        """Assign an attribute value to a product."""
        try:
            attr = Attribute.objects.get(slug=attr_slug)

            if plain_text:
                # Plain text attributes get unique values per product
                attr_value, _ = AttributeValue.objects.get_or_create(
                    attribute=attr,
                    slug=f"{attr_slug}-{product.pk}",
                    defaults={
                        "name": str(value)[:250],
                        "plain_text": str(value),
                    },
                )
            elif numeric:
                attr_value, _ = AttributeValue.objects.get_or_create(
                    attribute=attr,
                    slug=f"{attr_slug}-{product.pk}",
                    defaults={"name": str(value)},
                )
            else:
                # Dropdown attributes use predefined values
                value_slug = f"{attr_slug}-{value}"
                attr_value = AttributeValue.objects.get(attribute=attr, slug=value_slug)

            AssignedProductAttributeValue.objects.get_or_create(
                product=product,
                value=attr_value,
            )
            self.stdout.write(f"  Assigned: {attr.name} = {value}")

        except AttributeValue.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"  Missing value: {attr_slug}-{value}"))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"  Error assigning {attr_slug}: {e}"))

    def _assign_date_attribute(self, product, attr_slug, date_value):
        """Assign a date attribute value to a product."""
        try:
            attr = Attribute.objects.get(slug=attr_slug)
            attr_value, _ = AttributeValue.objects.get_or_create(
                attribute=attr,
                slug=f"{attr_slug}-{product.pk}",
                defaults={
                    "name": str(date_value),
                    "date_time": timezone.make_aware(
                        timezone.datetime.combine(date_value, timezone.datetime.min.time())
                    ),
                },
            )
            AssignedProductAttributeValue.objects.get_or_create(
                product=product,
                value=attr_value,
            )
            self.stdout.write(f"  Assigned: {attr.name} = {date_value}")
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"  Error assigning {attr_slug}: {e}"))
