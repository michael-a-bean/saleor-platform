"""
Django management command to migrate existing MTG variants to include finish attribute.

This script:
1. Updates all existing variant SKUs: {uuid}-{condition} -> {uuid}-{condition}-NF
2. Assigns mtg-finish = "Non-Foil" to existing variants
3. For foil-only cards, assigns mtg-finish = "Foil" instead

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/migrate_finish_variants.py

Usage:
    python manage.py migrate_finish_variants [--resume] [--limit N] [--batch-size N]
"""

import json
import sys
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from saleor.attribute.models import (
    Attribute,
    AttributeValue,
    AttributeVariant,
    AssignedVariantAttribute,
    AssignedVariantAttributeValue,
)
from saleor.product.models import (
    Product,
    ProductType,
    ProductVariant,
)


FINISH_ATTRIBUTE_SLUG = "mtg-finish"
SCRYFALL_ID_ATTRIBUTE_SLUG = "mtg-scryfall-id"
MTG_PRODUCT_TYPE_SLUG = "mtg-card"

PROGRESS_FILE = Path("/tmp/migrate_finish_progress.json")
DEFAULT_BATCH_SIZE = 200


class Command(BaseCommand):
    help = "Migrate existing MTG variants to include finish attribute"

    def add_arguments(self, parser):
        parser.add_argument(
            "scryfall_json",
            type=str,
            help="Path to Scryfall all-cards JSON file (for finish data)",
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
        self.stdout.write(self.style.SUCCESS("MTG Finish Migration"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"Scryfall JSON: {scryfall_json}")
        self.stdout.write(f"Resume: {resume}")
        self.stdout.write(f"Limit: {limit or 'None'}")
        self.stdout.write(f"Batch size: {batch_size}")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made"))

        # Load Scryfall data into lookup dict by ID
        self.stdout.write("Loading Scryfall JSON...")
        with open(scryfall_json) as f:
            cards = json.load(f)

        # Build lookup by scryfall ID -> finishes array
        self.scryfall_lookup = {}
        for card in cards:
            scryfall_id = card.get("id")
            if scryfall_id:
                self.scryfall_lookup[scryfall_id] = {
                    "finishes": card.get("finishes", ["nonfoil"]),
                    "foil": card.get("foil", False),
                    "nonfoil": card.get("nonfoil", True),
                }
        self.stdout.write(f"Loaded {len(self.scryfall_lookup):,} cards from Scryfall")

        # Get product type
        try:
            product_type = ProductType.objects.get(slug=MTG_PRODUCT_TYPE_SLUG)
        except ProductType.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"Product type not found: {MTG_PRODUCT_TYPE_SLUG}"))
            sys.exit(1)

        # Get finish attribute and values
        try:
            finish_attr = Attribute.objects.get(slug=FINISH_ATTRIBUTE_SLUG)
            attr_variant = AttributeVariant.objects.get(
                attribute=finish_attr,
                product_type=product_type,
            )
        except Attribute.DoesNotExist:
            self.stderr.write(
                self.style.ERROR(
                    f"Finish attribute not found. Run create_finish_attribute first!"
                )
            )
            sys.exit(1)
        except AttributeVariant.DoesNotExist:
            self.stderr.write(
                self.style.ERROR(
                    f"Finish attribute not assigned to product type!"
                )
            )
            sys.exit(1)

        # Get finish attribute values
        self.finish_values = {}
        for value in AttributeValue.objects.filter(attribute=finish_attr):
            # Extract code from slug (mtg-finish-nf -> NF)
            code = value.slug.replace("mtg-finish-", "").upper()
            self.finish_values[code] = value
        self.stdout.write(f"Finish values: {list(self.finish_values.keys())}")

        # Get Scryfall ID attribute for lookup
        try:
            self.scryfall_attr = Attribute.objects.get(slug=SCRYFALL_ID_ATTRIBUTE_SLUG)
        except Attribute.DoesNotExist:
            self.stderr.write(
                self.style.ERROR(f"Scryfall ID attribute not found!")
            )
            sys.exit(1)

        # Get products to process
        products = self.get_products_to_process(product_type, resume, limit)
        total = products.count()
        self.stdout.write(f"Products to process: {total:,}")

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No products need processing!"))
            return

        if dry_run:
            # Sample a few
            sample = list(products[:5])
            for p in sample:
                self.stdout.write(f"  Would process: {p.name}")
            self.stdout.write(f"  ... and {total - 5} more")
            return

        # Process products
        self.process_products(
            list(products),
            finish_attr,
            attr_variant,
            batch_size,
        )

        # Clear progress on completion
        if PROGRESS_FILE.exists():
            PROGRESS_FILE.unlink()

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Migration complete!"))

    def get_products_to_process(self, product_type, resume, limit):
        """Get products that need finish attribute migration."""
        queryset = Product.objects.filter(product_type=product_type).order_by("id")

        # Load progress if resuming
        if resume and PROGRESS_FILE.exists():
            with open(PROGRESS_FILE) as f:
                progress = json.load(f)
                last_product_id = progress.get("last_product_id", 0)
            queryset = queryset.filter(id__gt=last_product_id)
            self.stdout.write(f"Resuming after product ID: {last_product_id}")

        if limit > 0:
            queryset = queryset[:limit]

        return queryset

    def get_scryfall_id_for_variant(self, variant):
        """Extract Scryfall ID from variant SKU (the base UUID part)."""
        sku = variant.sku or ""
        # SKU format: {scryfall-uuid}-{condition} or just {scryfall-uuid}
        # UUID is 36 chars: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        if len(sku) >= 36:
            return sku[:36]
        return None

    def determine_finish_for_card(self, scryfall_id):
        """Determine the appropriate finish for a card based on Scryfall data."""
        card_info = self.scryfall_lookup.get(scryfall_id, {})
        finishes = card_info.get("finishes", ["nonfoil"])

        # If card is foil-only, return Foil
        if "foil" in finishes and "nonfoil" not in finishes:
            return "F"  # Foil

        # If card has etched but no nonfoil/foil, return Etched
        if "etched" in finishes and "nonfoil" not in finishes and "foil" not in finishes:
            return "E"  # Etched

        # Default to Non-Foil (most common case)
        return "NF"

    def process_products(self, products, finish_attr, attr_variant, batch_size):
        """Process products in batches."""
        total = len(products)
        processed = 0
        updated_variants = 0
        errors = 0

        for i in range(0, total, batch_size):
            batch = products[i : i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (total + batch_size - 1) // batch_size

            try:
                with transaction.atomic():
                    batch_updated = self.process_batch(
                        batch,
                        finish_attr,
                        attr_variant,
                    )
                    updated_variants += batch_updated
                    processed += len(batch)

                # Save progress
                if batch:
                    self.save_progress(batch[-1].id)

                self.stdout.write(
                    f"Batch {batch_num}/{total_batches}: "
                    f"Processed {len(batch)} products, "
                    f"updated {batch_updated} variants "
                    f"(Total: {processed:,}/{total:,})"
                )

            except Exception as e:
                errors += len(batch)
                self.stderr.write(self.style.ERROR(f"Batch {batch_num} failed: {e}"))
                if i > 0:
                    self.save_progress(products[i - 1].id)

        self.stdout.write(
            f"Processed: {processed:,}, Updated variants: {updated_variants:,}, Errors: {errors:,}"
        )

    def process_batch(self, products, finish_attr, attr_variant):
        """Process a batch of products."""
        updated_count = 0

        for product in products:
            variants = ProductVariant.objects.filter(product=product)

            for variant in variants:
                # Get Scryfall ID from SKU
                scryfall_id = self.get_scryfall_id_for_variant(variant)
                if not scryfall_id:
                    continue

                # Determine appropriate finish
                finish_code = self.determine_finish_for_card(scryfall_id)
                finish_value = self.finish_values.get(finish_code)
                if not finish_value:
                    continue

                # Update SKU to include finish suffix
                current_sku = variant.sku or ""

                # Check if already has finish suffix
                if current_sku.endswith(("-NF", "-F", "-E", "-G")):
                    continue  # Already migrated

                # Add finish suffix
                new_sku = f"{current_sku}-{finish_code}"[:255]
                variant.sku = new_sku
                variant.save(update_fields=["sku"])

                # Assign finish attribute to variant
                assigned_attr, _ = AssignedVariantAttribute.objects.get_or_create(
                    variant=variant,
                    assignment=attr_variant,
                )

                AssignedVariantAttributeValue.objects.get_or_create(
                    assignment=assigned_attr,
                    value=finish_value,
                    defaults={"variant": variant},
                )

                updated_count += 1

        return updated_count

    def save_progress(self, product_id):
        """Save progress to file."""
        with open(PROGRESS_FILE, "w") as f:
            json.dump({"last_product_id": product_id}, f)
