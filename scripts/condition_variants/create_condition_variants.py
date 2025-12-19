"""
Django management command to create condition variants for MTG cards.

This script creates 5 condition variants (NM, LP, MP, HP, DMG) for each
MTG card product that currently has only 1 variant.

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/create_condition_variants.py

Usage:
    python manage.py create_condition_variants [--resume] [--limit N] [--batch-size N]
"""

import json
import sys
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from saleor.attribute import AttributeInputType, AttributeType
from saleor.attribute.models import (
    Attribute,
    AttributeValue,
    AttributeVariant,
    AssignedVariantAttribute,
    AssignedVariantAttributeValue,
)
from saleor.channel.models import Channel
from saleor.product.models import (
    Product,
    ProductType,
    ProductVariant,
    ProductVariantChannelListing,
)


# Condition definitions: (slug_suffix, name, price_multiplier)
# Price multiplier applied to NM price for each condition
CONDITIONS = [
    ("NM", "Near Mint", Decimal("1.00")),
    ("LP", "Lightly Played", Decimal("0.85")),
    ("MP", "Moderately Played", Decimal("0.70")),
    ("HP", "Heavily Played", Decimal("0.50")),
    ("DMG", "Damaged", Decimal("0.25")),
]

CONDITION_ATTRIBUTE_SLUG = "mtg-condition"
CONDITION_ATTRIBUTE_NAME = "Condition"
MTG_PRODUCT_TYPE_SLUG = "mtg-card"

PROGRESS_FILE = Path("/tmp/condition_variants_progress.json")
DEFAULT_BATCH_SIZE = 100


class Command(BaseCommand):
    help = "Create condition variants (NM/LP/MP/HP/DMG) for MTG card products"

    def add_arguments(self, parser):
        parser.add_argument(
            "--resume",
            action="store_true",
            help="Resume from last saved progress",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Limit number of products to process (0 = no limit)",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=DEFAULT_BATCH_SIZE,
            help=f"Batch size for processing (default: {DEFAULT_BATCH_SIZE})",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )

    def handle(self, *args, **options):
        resume = options["resume"]
        limit = options["limit"]
        batch_size = options["batch_size"]
        dry_run = options["dry_run"]

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("MTG Condition Variants Migration"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"Resume: {resume}")
        self.stdout.write(f"Limit: {limit or 'None'}")
        self.stdout.write(f"Batch size: {batch_size}")
        self.stdout.write(f"Dry run: {dry_run}")

        # Get MTG Card product type
        try:
            product_type = ProductType.objects.get(slug=MTG_PRODUCT_TYPE_SLUG)
            self.stdout.write(f"Product type: {product_type.name} (ID: {product_type.id})")
        except ProductType.DoesNotExist:
            self.stderr.write(
                self.style.ERROR(f"Product type '{MTG_PRODUCT_TYPE_SLUG}' not found!")
            )
            sys.exit(1)

        # Get channel
        try:
            channel = Channel.objects.get(slug="webstore")
            self.stdout.write(f"Channel: {channel.slug}")
        except Channel.DoesNotExist:
            self.stderr.write(self.style.ERROR("Channel 'webstore' not found!"))
            sys.exit(1)

        # Create condition attribute
        result = self.create_condition_attribute(product_type, dry_run)
        if not result:
            sys.exit(1)
        condition_attr, attr_variant = result

        # Get condition attribute values
        condition_values = self.get_condition_values(condition_attr)
        self.stdout.write(f"Condition values: {list(condition_values.keys())}")

        # Find products needing variants
        products = self.get_products_needing_variants(product_type, resume, limit)
        total_products = products.count()
        self.stdout.write(f"Products to process: {total_products:,}")

        if total_products == 0:
            self.stdout.write(self.style.SUCCESS("No products need processing!"))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made"))
            self.stdout.write(f"Would create {total_products * 4:,} new variants")
            self.stdout.write(
                f"(4 additional variants per product: LP, MP, HP, DMG)"
            )
            return

        # Process products
        self.process_products(
            products,
            condition_attr,
            attr_variant,
            condition_values,
            channel,
            batch_size,
        )

        # Clear progress file on completion
        if PROGRESS_FILE.exists():
            PROGRESS_FILE.unlink()

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Migration complete!"))

    def create_condition_attribute(self, product_type, dry_run=False):
        """Create or get the Condition variant attribute."""
        attr, created = Attribute.objects.get_or_create(
            slug=CONDITION_ATTRIBUTE_SLUG,
            defaults={
                "name": CONDITION_ATTRIBUTE_NAME,
                "input_type": AttributeInputType.DROPDOWN,
                "type": AttributeType.PRODUCT_TYPE,
                "visible_in_storefront": True,
                "filterable_in_storefront": True,
                "filterable_in_dashboard": True,
                "storefront_search_position": 1,
                "available_in_grid": True,
            },
        )

        if created:
            self.stdout.write(f"Created condition attribute: {attr.slug}")
            # Create attribute values
            for slug_suffix, name, _ in CONDITIONS:
                AttributeValue.objects.create(
                    attribute=attr,
                    slug=f"mtg-condition-{slug_suffix.lower()}",
                    name=name,
                )
                self.stdout.write(f"  Created value: {name}")
        else:
            self.stdout.write(f"Using existing condition attribute: {attr.slug}")

        # Assign to product type as VARIANT attribute with variant_selection=True
        attr_variant, av_created = AttributeVariant.objects.get_or_create(
            attribute=attr,
            product_type=product_type,
            defaults={"variant_selection": True},
        )

        # Ensure variant_selection is True (for variant selector UI)
        if not attr_variant.variant_selection:
            attr_variant.variant_selection = True
            attr_variant.save(update_fields=["variant_selection"])
            self.stdout.write("Enabled variant_selection for condition attribute")

        if av_created:
            self.stdout.write(
                f"Assigned condition attribute to product type as variant attribute"
            )
        else:
            self.stdout.write(
                f"Condition attribute already assigned to product type"
            )

        # Return both attribute and the AttributeVariant link
        return attr, attr_variant

    def get_condition_values(self, condition_attr):
        """Get condition attribute values as a dict."""
        values = {}
        for value in AttributeValue.objects.filter(attribute=condition_attr):
            # Extract condition code from slug (e.g., "mtg-condition-nm" -> "NM")
            code = value.slug.replace("mtg-condition-", "").upper()
            values[code] = value
        return values

    def get_products_needing_variants(self, product_type, resume, limit):
        """Get products that have only 1 variant (need condition variants added)."""
        # Start with products of the MTG Card type
        queryset = Product.objects.filter(product_type=product_type)

        # Annotate with variant count and filter to those with only 1
        queryset = queryset.annotate(variant_count=Count("variants")).filter(
            variant_count=1
        )

        # Order by ID for consistent processing
        queryset = queryset.order_by("id")

        # Load progress if resuming
        if resume and PROGRESS_FILE.exists():
            with open(PROGRESS_FILE) as f:
                progress = json.load(f)
                last_product_id = progress.get("last_product_id", 0)
            queryset = queryset.filter(id__gt=last_product_id)
            self.stdout.write(f"Resuming after product ID: {last_product_id}")

        # Apply limit
        if limit > 0:
            queryset = queryset[:limit]

        return queryset

    def process_products(
        self, products, condition_attr, attr_variant, condition_values, channel, batch_size
    ):
        """Process products in batches, creating condition variants."""
        total = products.count()
        processed = 0
        created_variants = 0
        errors = 0

        # Convert to list for batching (with prefetch)
        products_list = list(
            products.prefetch_related(
                "variants",
                "variants__channel_listings",
            )
        )

        for i in range(0, len(products_list), batch_size):
            batch = products_list[i : i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (len(products_list) + batch_size - 1) // batch_size

            try:
                with transaction.atomic():
                    batch_created = self.process_batch(
                        batch,
                        condition_attr,
                        attr_variant,
                        condition_values,
                        channel,
                    )
                    created_variants += batch_created
                    processed += len(batch)

                # Save progress
                if batch:
                    self.save_progress(batch[-1].id)

                self.stdout.write(
                    f"Batch {batch_num}/{total_batches}: "
                    f"Processed {len(batch)} products, "
                    f"created {batch_created} variants "
                    f"(Total: {processed:,}/{total:,})"
                )

            except Exception as e:
                errors += len(batch)
                self.stderr.write(
                    self.style.ERROR(f"Batch {batch_num} failed: {e}")
                )
                # Save progress even on error (at start of failed batch)
                if i > 0:
                    self.save_progress(products_list[i - 1].id)

        self.stdout.write(
            f"Processed: {processed:,}, "
            f"Created variants: {created_variants:,}, "
            f"Errors: {errors:,}"
        )

    def assign_condition_to_variant(self, variant, attr_variant, condition_value):
        """Assign condition attribute value to a variant using proper Saleor structure."""
        # Create or get the AssignedVariantAttribute (links variant to attribute type)
        assigned_attr, _ = AssignedVariantAttribute.objects.get_or_create(
            variant=variant,
            assignment=attr_variant,
        )

        # Create the AssignedVariantAttributeValue (links to specific value)
        AssignedVariantAttributeValue.objects.get_or_create(
            assignment=assigned_attr,
            value=condition_value,
            defaults={"variant": variant},
        )

    def process_batch(self, products, condition_attr, attr_variant, condition_values, channel):
        """Process a batch of products, creating their condition variants."""
        new_variants = []
        created_count = 0

        for product in products:
            # Get the existing variant (should be exactly 1)
            existing_variants = list(product.variants.all())
            if len(existing_variants) != 1:
                continue

            original_variant = existing_variants[0]
            original_sku = original_variant.sku

            # Get original price from channel listing
            original_price = Decimal("0.00")
            original_listing = original_variant.channel_listings.filter(
                channel=channel
            ).first()
            if original_listing and original_listing.price_amount:
                original_price = original_listing.price_amount

            # Update original variant: set condition to NM, update SKU
            if not original_sku.endswith("-NM"):
                original_variant.sku = f"{original_sku}-NM"[:255]
                original_variant.name = f"{product.name} - Near Mint"[:250]
                original_variant.save(update_fields=["sku", "name"])

                # Assign NM condition attribute to original variant
                nm_value = condition_values.get("NM")
                if nm_value:
                    self.assign_condition_to_variant(original_variant, attr_variant, nm_value)

            # Create additional variants for LP, MP, HP, DMG
            for condition_code, condition_name, price_mult in CONDITIONS:
                if condition_code == "NM":
                    continue  # Skip NM, already handled

                new_sku = f"{original_sku}-{condition_code}"[:255]

                # Skip if variant already exists
                if ProductVariant.objects.filter(sku=new_sku).exists():
                    continue

                # Create new variant
                new_variant = ProductVariant(
                    product=product,
                    sku=new_sku,
                    name=f"{product.name} - {condition_name}"[:250],
                    track_inventory=True,
                )
                new_variants.append(new_variant)
                created_count += 1

        # Bulk create variants
        if new_variants:
            ProductVariant.objects.bulk_create(new_variants, ignore_conflicts=True)

            # Refresh to get IDs and create listings/attributes
            for variant in new_variants:
                # Refresh from DB to get ID
                try:
                    db_variant = ProductVariant.objects.get(sku=variant.sku)
                except ProductVariant.DoesNotExist:
                    continue

                # Extract condition code from SKU
                condition_code = variant.sku.split("-")[-1]
                condition_value = condition_values.get(condition_code)

                # Get price multiplier
                price_mult = Decimal("1.00")
                for code, name, mult in CONDITIONS:
                    if code == condition_code:
                        price_mult = mult
                        break

                # Find original price for this product
                original_price = Decimal("0.00")
                original_variant = ProductVariant.objects.filter(
                    product=db_variant.product,
                    sku__endswith="-NM",
                ).first()
                if original_variant:
                    original_listing = ProductVariantChannelListing.objects.filter(
                        variant=original_variant,
                        channel=channel,
                    ).first()
                    if original_listing and original_listing.price_amount:
                        original_price = original_listing.price_amount

                # Calculate condition price
                condition_price = (original_price * price_mult).quantize(
                    Decimal("0.01")
                )

                # Create channel listing
                ProductVariantChannelListing.objects.get_or_create(
                    variant=db_variant,
                    channel=channel,
                    defaults={
                        "price_amount": condition_price,
                        "discounted_price_amount": condition_price,
                        "currency": channel.currency_code,
                    },
                )

                # Assign condition attribute
                if condition_value:
                    self.assign_condition_to_variant(db_variant, attr_variant, condition_value)

        return created_count

    def save_progress(self, product_id):
        """Save progress to file."""
        with open(PROGRESS_FILE, "w") as f:
            json.dump({"last_product_id": product_id}, f)
