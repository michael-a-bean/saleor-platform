"""
Django management command to create foil and etched variants for MTG cards.

This script creates additional variants for cards that support multiple finishes:
- For cards with "foil" in finishes: creates 5 foil variants (one per condition)
- For cards with "etched" in finishes: creates 5 etched variants (one per condition)

Prerequisites:
- create_finish_attribute.py must have been run
- migrate_existing_variants.py must have been run (existing variants tagged as Non-Foil)

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/create_finish_variants.py

Usage:
    python manage.py create_finish_variants scryfall.json [--resume] [--limit N]
"""

import json
import sys
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

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


# Condition definitions (must match what's in the database)
CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"]

# Finish types to create (in addition to Non-Foil which already exists)
FINISHES_TO_CREATE = [
    ("F", "Foil", "foil"),       # (code, name, scryfall_finish_value)
    ("E", "Etched", "etched"),
]

FINISH_ATTRIBUTE_SLUG = "mtg-finish"
CONDITION_ATTRIBUTE_SLUG = "mtg-condition"
MTG_PRODUCT_TYPE_SLUG = "mtg-card"

PROGRESS_FILE = Path("/tmp/create_finish_variants_progress.json")
DEFAULT_BATCH_SIZE = 100


class Command(BaseCommand):
    help = "Create foil and etched variants for MTG cards"

    def add_arguments(self, parser):
        parser.add_argument(
            "scryfall_json",
            type=str,
            help="Path to Scryfall all-cards JSON file",
        )
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
        scryfall_json = Path(options["scryfall_json"])
        resume = options["resume"]
        limit = options["limit"]
        batch_size = options["batch_size"]
        dry_run = options["dry_run"]

        if not scryfall_json.exists():
            self.stderr.write(self.style.ERROR(f"File not found: {scryfall_json}"))
            sys.exit(1)

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("MTG Finish Variant Creation"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"Scryfall JSON: {scryfall_json}")
        self.stdout.write(f"Resume: {resume}")
        self.stdout.write(f"Limit: {limit or 'None'}")
        self.stdout.write(f"Batch size: {batch_size}")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made"))

        # Load Scryfall data
        self.stdout.write("Loading Scryfall JSON...")
        with open(scryfall_json) as f:
            cards = json.load(f)

        # Build lookup by scryfall ID -> card data
        self.scryfall_lookup = {}
        for card in cards:
            scryfall_id = card.get("id")
            if scryfall_id:
                self.scryfall_lookup[scryfall_id] = {
                    "finishes": card.get("finishes", ["nonfoil"]),
                    "name": card.get("name", "Unknown"),
                    "prices": card.get("prices", {}),
                }
        self.stdout.write(f"Loaded {len(self.scryfall_lookup):,} cards")

        # Get product type and channel
        try:
            product_type = ProductType.objects.get(slug=MTG_PRODUCT_TYPE_SLUG)
            channel = Channel.objects.get(slug="webstore")
        except ProductType.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"Product type not found"))
            sys.exit(1)
        except Channel.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"Channel 'webstore' not found"))
            sys.exit(1)

        # Get attributes
        try:
            finish_attr = Attribute.objects.get(slug=FINISH_ATTRIBUTE_SLUG)
            finish_attr_variant = AttributeVariant.objects.get(
                attribute=finish_attr, product_type=product_type
            )
            condition_attr = Attribute.objects.get(slug=CONDITION_ATTRIBUTE_SLUG)
            condition_attr_variant = AttributeVariant.objects.get(
                attribute=condition_attr, product_type=product_type
            )
        except (Attribute.DoesNotExist, AttributeVariant.DoesNotExist) as e:
            self.stderr.write(self.style.ERROR(f"Required attribute not found: {e}"))
            sys.exit(1)

        # Get attribute values
        self.finish_values = {
            v.slug.replace("mtg-finish-", "").upper(): v
            for v in AttributeValue.objects.filter(attribute=finish_attr)
        }
        self.condition_values = {
            v.slug.replace("mtg-condition-", "").upper(): v
            for v in AttributeValue.objects.filter(attribute=condition_attr)
        }

        self.stdout.write(f"Finish values: {list(self.finish_values.keys())}")
        self.stdout.write(f"Condition values: {list(self.condition_values.keys())}")

        # Store for use in processing
        self.finish_attr_variant = finish_attr_variant
        self.condition_attr_variant = condition_attr_variant
        self.channel = channel

        # Get products to process (those with existing variants)
        products = self.get_products_to_process(product_type, resume, limit)
        total = products.count()
        self.stdout.write(f"Products to process: {total:,}")

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No products to process!"))
            return

        if dry_run:
            # Count what would be created
            foil_count = 0
            etched_count = 0
            for p in products[:100]:
                variants = p.variants.all()
                if not variants:
                    continue
                first_variant = variants[0]
                scryfall_id = self.get_scryfall_id_from_sku(first_variant.sku)
                if not scryfall_id:
                    continue
                card = self.scryfall_lookup.get(scryfall_id, {})
                finishes = card.get("finishes", [])
                if "foil" in finishes:
                    foil_count += 5  # 5 conditions
                if "etched" in finishes:
                    etched_count += 5

            self.stdout.write(f"Sample (first 100): Would create ~{foil_count} foil, ~{etched_count} etched variants")
            self.stdout.write(f"Estimated total: ~{foil_count * total // 100} foil, ~{etched_count * total // 100} etched variants")
            return

        # Process products
        self.process_products(list(products), batch_size)

        # Clear progress
        if PROGRESS_FILE.exists():
            PROGRESS_FILE.unlink()

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Finish variant creation complete!"))

    def get_products_to_process(self, product_type, resume, limit):
        """Get products that need additional finish variants."""
        queryset = Product.objects.filter(product_type=product_type).order_by("id")

        if resume and PROGRESS_FILE.exists():
            with open(PROGRESS_FILE) as f:
                progress = json.load(f)
                last_id = progress.get("last_product_id", 0)
            queryset = queryset.filter(id__gt=last_id)
            self.stdout.write(f"Resuming after product ID: {last_id}")

        if limit > 0:
            queryset = queryset[:limit]

        return queryset.prefetch_related("variants", "variants__channel_listings")

    def get_scryfall_id_from_sku(self, sku):
        """Extract Scryfall UUID from SKU."""
        if not sku or len(sku) < 36:
            return None
        return sku[:36]

    def process_products(self, products, batch_size):
        """Process products in batches."""
        total = len(products)
        processed = 0
        created_variants = 0
        errors = 0

        for i in range(0, total, batch_size):
            batch = products[i : i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (total + batch_size - 1) // batch_size

            try:
                with transaction.atomic():
                    batch_created = self.process_batch(batch)
                    created_variants += batch_created
                    processed += len(batch)

                if batch:
                    self.save_progress(batch[-1].id)

                self.stdout.write(
                    f"Batch {batch_num}/{total_batches}: "
                    f"Processed {len(batch)} products, "
                    f"created {batch_created} variants "
                    f"(Total: {processed:,}/{total:,}, Variants: {created_variants:,})"
                )

            except Exception as e:
                errors += len(batch)
                self.stderr.write(self.style.ERROR(f"Batch {batch_num} failed: {e}"))
                import traceback
                traceback.print_exc()
                if i > 0:
                    self.save_progress(products[i - 1].id)

        self.stdout.write(
            f"Processed: {processed:,}, Created variants: {created_variants:,}, Errors: {errors:,}"
        )

    def process_batch(self, products):
        """Process a batch of products."""
        created_count = 0

        for product in products:
            variants = list(product.variants.all())
            if not variants:
                continue

            # Get Scryfall ID from first variant
            first_variant = variants[0]
            scryfall_id = self.get_scryfall_id_from_sku(first_variant.sku)
            if not scryfall_id:
                continue

            # Get card data
            card = self.scryfall_lookup.get(scryfall_id, {})
            finishes = card.get("finishes", [])

            # For each finish type we want to create
            for finish_code, finish_name, scryfall_finish in FINISHES_TO_CREATE:
                if scryfall_finish not in finishes:
                    continue  # Card doesn't have this finish

                finish_value = self.finish_values.get(finish_code)
                if not finish_value:
                    continue

                # Create variants for each condition
                for condition_code in CONDITIONS:
                    condition_value = self.condition_values.get(condition_code)
                    if not condition_value:
                        continue

                    # Build new SKU
                    new_sku = f"{scryfall_id}-{condition_code}-{finish_code}"[:255]

                    # Check if already exists
                    if ProductVariant.objects.filter(sku=new_sku).exists():
                        continue

                    # Find existing non-foil variant of same condition for reference price
                    nf_sku = f"{scryfall_id}-{condition_code}-NF"
                    nf_variant = ProductVariant.objects.filter(sku=nf_sku).first()
                    reference_price = Decimal("0.00")
                    if nf_variant:
                        nf_listing = nf_variant.channel_listings.filter(
                            channel=self.channel
                        ).first()
                        if nf_listing and nf_listing.price_amount:
                            reference_price = nf_listing.price_amount

                    # Create variant
                    variant_name = f"{product.name} - {condition_value.name} ({finish_name})"[:250]
                    new_variant = ProductVariant.objects.create(
                        product=product,
                        sku=new_sku,
                        name=variant_name,
                        track_inventory=True,
                    )

                    # Create channel listing with $0.00 price (will be updated by price sync)
                    ProductVariantChannelListing.objects.create(
                        variant=new_variant,
                        channel=self.channel,
                        price_amount=Decimal("0.00"),
                        discounted_price_amount=Decimal("0.00"),
                        currency=self.channel.currency_code,
                    )

                    # Assign finish attribute
                    finish_assigned = AssignedVariantAttribute.objects.create(
                        variant=new_variant,
                        assignment=self.finish_attr_variant,
                    )
                    AssignedVariantAttributeValue.objects.create(
                        assignment=finish_assigned,
                        value=finish_value,
                        variant=new_variant,
                    )

                    # Assign condition attribute
                    condition_assigned = AssignedVariantAttribute.objects.create(
                        variant=new_variant,
                        assignment=self.condition_attr_variant,
                    )
                    AssignedVariantAttributeValue.objects.create(
                        assignment=condition_assigned,
                        value=condition_value,
                        variant=new_variant,
                    )

                    created_count += 1

        return created_count

    def save_progress(self, product_id):
        """Save progress to file."""
        with open(PROGRESS_FILE, "w") as f:
            json.dump({"last_product_id": product_id}, f)
