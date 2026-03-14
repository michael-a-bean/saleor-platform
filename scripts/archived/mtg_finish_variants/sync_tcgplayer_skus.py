"""
Django management command to sync TCGPlayer SKU mappings from MTGJSON.

This script reads the TcgplayerSkus.json file from MTGJSON and assigns
the appropriate TCGPlayer SKU ID to each Saleor variant based on:
- Card UUID (Scryfall ID)
- Condition (NM, LP, MP, HP, DMG)
- Finish/Printing (Non-Foil, Foil, Etched)
- Language (English only for now)

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/sync_tcgplayer_skus.py

Usage:
    python manage.py sync_tcgplayer_skus /path/to/TcgplayerSkus.json [--resume]
"""

import json
import sys
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from saleor.attribute.models import (
    Attribute,
    AttributeValue,
    AttributeVariant,
    AssignedVariantAttribute,
    AssignedVariantAttributeValue,
)
from saleor.product.models import (
    ProductType,
    ProductVariant,
)


# Mapping from MTGJSON condition names to our codes
CONDITION_MAP = {
    "NEAR MINT": "NM",
    "LIGHTLY PLAYED": "LP",
    "MODERATELY PLAYED": "MP",
    "HEAVILY PLAYED": "HP",
    "DAMAGED": "DMG",
}

# Mapping from MTGJSON printing names to our finish codes
FINISH_MAP = {
    "NORMAL": "NF",
    "NON FOIL": "NF",
    "FOIL": "F",
    "ETCHED": "E",
}

TCG_SKU_ATTRIBUTE_SLUG = "mtg-tcgplayer-sku"
MTG_PRODUCT_TYPE_SLUG = "mtg-card"

PROGRESS_FILE = Path("/tmp/sync_tcgplayer_skus_progress.json")
DEFAULT_BATCH_SIZE = 500


class Command(BaseCommand):
    help = "Sync TCGPlayer SKU mappings from MTGJSON TcgplayerSkus.json"

    def add_arguments(self, parser):
        parser.add_argument(
            "skus_json",
            type=str,
            help="Path to MTGJSON TcgplayerSkus.json file",
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
            help="Limit number of cards to process (0 = no limit)",
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
        skus_json = Path(options["skus_json"])
        resume = options["resume"]
        limit = options["limit"]
        batch_size = options["batch_size"]
        dry_run = options["dry_run"]

        if not skus_json.exists():
            self.stderr.write(self.style.ERROR(f"File not found: {skus_json}"))
            sys.exit(1)

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("TCGPlayer SKU Sync"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"SKUs JSON: {skus_json}")
        self.stdout.write(f"Resume: {resume}")
        self.stdout.write(f"Limit: {limit or 'None'}")
        self.stdout.write(f"Batch size: {batch_size}")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made"))

        # Get product type
        try:
            product_type = ProductType.objects.get(slug=MTG_PRODUCT_TYPE_SLUG)
        except ProductType.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"Product type not found"))
            sys.exit(1)

        # Get or create TCGPlayer SKU attribute
        try:
            tcg_sku_attr = Attribute.objects.get(slug=TCG_SKU_ATTRIBUTE_SLUG)
            tcg_sku_attr_variant = AttributeVariant.objects.get(
                attribute=tcg_sku_attr, product_type=product_type
            )
        except Attribute.DoesNotExist:
            self.stderr.write(
                self.style.ERROR(f"TCGPlayer SKU attribute not found. Run create_finish_attribute first!")
            )
            sys.exit(1)
        except AttributeVariant.DoesNotExist:
            # Create it
            tcg_sku_attr_variant, _ = AttributeVariant.objects.get_or_create(
                attribute=tcg_sku_attr,
                product_type=product_type,
                defaults={"variant_selection": False},
            )

        self.tcg_sku_attr = tcg_sku_attr
        self.tcg_sku_attr_variant = tcg_sku_attr_variant

        # Load SKUs JSON
        self.stdout.write("Loading TcgplayerSkus.json (this may take a moment)...")
        with open(skus_json) as f:
            sku_data = json.load(f)

        # Get the data section
        skus_by_uuid = sku_data.get("data", {})
        total_cards = len(skus_by_uuid)
        self.stdout.write(f"Loaded SKU data for {total_cards:,} cards")

        # Get resume position
        start_index = 0
        if resume and PROGRESS_FILE.exists():
            with open(PROGRESS_FILE) as f:
                progress = json.load(f)
                start_index = progress.get("last_index", 0)
            self.stdout.write(f"Resuming from index: {start_index}")

        # Convert to list for processing
        uuid_list = list(skus_by_uuid.keys())

        if limit > 0:
            uuid_list = uuid_list[:start_index + limit]

        cards_to_process = uuid_list[start_index:]
        self.stdout.write(f"Cards to process: {len(cards_to_process):,}")

        if dry_run:
            # Sample
            sample_count = min(5, len(cards_to_process))
            for uuid in cards_to_process[:sample_count]:
                skus = skus_by_uuid[uuid]
                english_skus = [s for s in skus if s.get("language") == "ENGLISH"]
                self.stdout.write(f"  {uuid}: {len(english_skus)} English SKUs")
            return

        # Process in batches
        self.process_cards(
            cards_to_process,
            skus_by_uuid,
            batch_size,
            start_index,
        )

        if PROGRESS_FILE.exists():
            PROGRESS_FILE.unlink()

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("TCGPlayer SKU sync complete!"))

    def process_cards(self, uuids, skus_by_uuid, batch_size, start_offset):
        """Process cards in batches."""
        total = len(uuids)
        processed = 0
        mapped = 0
        not_found = 0
        errors = 0

        for i in range(0, total, batch_size):
            batch_uuids = uuids[i : i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (total + batch_size - 1) // batch_size

            try:
                with transaction.atomic():
                    batch_mapped, batch_not_found = self.process_batch(
                        batch_uuids, skus_by_uuid
                    )
                    mapped += batch_mapped
                    not_found += batch_not_found
                    processed += len(batch_uuids)

                # Save progress
                self.save_progress(start_offset + i + len(batch_uuids))

                self.stdout.write(
                    f"Batch {batch_num}/{total_batches}: "
                    f"Mapped {batch_mapped}, Not found {batch_not_found} "
                    f"(Total: {processed:,}/{total:,})"
                )

            except Exception as e:
                errors += len(batch_uuids)
                self.stderr.write(self.style.ERROR(f"Batch {batch_num} failed: {e}"))
                import traceback
                traceback.print_exc()
                self.save_progress(start_offset + i)

        self.stdout.write(
            f"Processed: {processed:,}, Mapped: {mapped:,}, "
            f"Not found: {not_found:,}, Errors: {errors:,}"
        )

    def process_batch(self, uuids, skus_by_uuid):
        """Process a batch of card UUIDs."""
        mapped_count = 0
        not_found_count = 0

        for uuid in uuids:
            sku_entries = skus_by_uuid.get(uuid, [])

            # Filter to English only
            english_skus = [
                s for s in sku_entries
                if s.get("language") == "ENGLISH"
            ]

            if not english_skus:
                continue

            # Build lookup: (condition_code, finish_code) -> sku_id
            sku_lookup = {}
            for sku_entry in english_skus:
                condition = sku_entry.get("condition", "").upper()
                printing = sku_entry.get("printing", "").upper()
                sku_id = sku_entry.get("skuId")
                product_id = sku_entry.get("productId")

                condition_code = CONDITION_MAP.get(condition)
                finish_code = FINISH_MAP.get(printing)

                if condition_code and finish_code and sku_id:
                    sku_lookup[(condition_code, finish_code)] = {
                        "skuId": str(sku_id),
                        "productId": str(product_id),
                    }

            # Find variants for this UUID
            # SKU format: {uuid}-{condition}-{finish}
            variants = ProductVariant.objects.filter(sku__startswith=uuid)

            for variant in variants:
                sku = variant.sku or ""
                parts = sku.split("-")

                # Expected format: uuid-condition-finish (uuid is 36 chars with 4 dashes)
                # So total parts: 5 (uuid parts) + 1 (condition) + 1 (finish) = 7
                # Or if SKU is full uuid: parts after position 4
                if len(parts) < 7:
                    continue

                condition_code = parts[5] if len(parts) > 5 else None
                finish_code = parts[6] if len(parts) > 6 else None

                if not condition_code or not finish_code:
                    continue

                # Look up TCGPlayer SKU
                sku_info = sku_lookup.get((condition_code, finish_code))
                if not sku_info:
                    not_found_count += 1
                    continue

                tcg_sku_id = sku_info["skuId"]

                # Create or update the attribute value assignment
                # First, get or create the attribute value for this SKU
                value_slug = f"tcg-sku-{tcg_sku_id}"[:255]

                attr_value, _ = AttributeValue.objects.get_or_create(
                    attribute=self.tcg_sku_attr,
                    slug=value_slug,
                    defaults={
                        "name": tcg_sku_id,
                        "plain_text": tcg_sku_id,
                    },
                )

                # Assign to variant
                assigned_attr, _ = AssignedVariantAttribute.objects.get_or_create(
                    variant=variant,
                    assignment=self.tcg_sku_attr_variant,
                )

                # Check if already has a value
                existing = AssignedVariantAttributeValue.objects.filter(
                    assignment=assigned_attr
                ).first()

                if existing:
                    if existing.value != attr_value:
                        existing.value = attr_value
                        existing.save(update_fields=["value"])
                else:
                    AssignedVariantAttributeValue.objects.create(
                        assignment=assigned_attr,
                        value=attr_value,
                        variant=variant,
                    )

                mapped_count += 1

        return mapped_count, not_found_count

    def save_progress(self, index):
        """Save progress to file."""
        with open(PROGRESS_FILE, "w") as f:
            json.dump({"last_index": index}, f)
