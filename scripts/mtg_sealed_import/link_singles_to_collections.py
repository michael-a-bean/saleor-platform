"""
Django management command to link MTG singles to their set collections.

This script:
1. Finds all singles with set code attributes
2. Matches them to existing mtg-set-{code} collections
3. Adds products to collections (skips if already a member)

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/link_singles_to_collections.py

Usage:
    python manage.py link_singles_to_collections [--dry-run] [--set <code>]
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from saleor.attribute.models import AssignedProductAttributeValue, Attribute
from saleor.product.models import (
    Collection,
    CollectionProduct,
    Product,
    ProductType,
)


class Command(BaseCommand):
    help = "Link MTG singles to their set collections"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )
        parser.add_argument(
            "--set",
            type=str,
            default="",
            help="Only process specific set code",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=1000,
            help="Batch size for bulk operations",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        set_filter = options["set"].lower()
        batch_size = options["batch_size"]

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Link MTG Singles to Set Collections"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made\n"))

        # Get product type
        try:
            mtg_card_type = ProductType.objects.get(slug="mtg-card")
        except ProductType.DoesNotExist:
            self.stderr.write(self.style.ERROR("Product type 'mtg-card' not found"))
            return

        # Get set code attribute
        try:
            set_code_attr = Attribute.objects.get(slug="mtg-set-code")
        except Attribute.DoesNotExist:
            self.stderr.write(self.style.ERROR("Attribute 'mtg-set-code' not found"))
            return

        # Build collection lookup
        collections = {}
        collection_qs = Collection.objects.filter(slug__startswith="mtg-set-")
        if set_filter:
            collection_qs = collection_qs.filter(slug=f"mtg-set-{set_filter}")

        for collection in collection_qs:
            set_code = collection.slug.replace("mtg-set-", "")
            collections[set_code] = collection

        self.stdout.write(f"Found {len(collections)} set collections")

        if not collections:
            self.stdout.write(self.style.WARNING("No collections found"))
            return

        # Get existing collection memberships to avoid duplicates
        existing_memberships = set()
        for cp in CollectionProduct.objects.filter(
            collection__in=collections.values()
        ).values_list("collection_id", "product_id"):
            existing_memberships.add(cp)

        self.stdout.write(f"Existing memberships: {len(existing_memberships)}")

        # Get singles with set codes matching our collections
        set_codes = list(collections.keys())

        # Find products with matching set codes
        product_ids_by_set = {}
        assignments = AssignedProductAttributeValue.objects.filter(
            value__attribute=set_code_attr,
            product__product_type=mtg_card_type,
        ).select_related("value", "product")

        for assignment in assignments:
            set_code = assignment.value.plain_text.lower() if assignment.value.plain_text else ""
            if set_code in collections:
                if set_code not in product_ids_by_set:
                    product_ids_by_set[set_code] = []
                product_ids_by_set[set_code].append(assignment.product_id)

        total_singles = sum(len(ids) for ids in product_ids_by_set.values())
        self.stdout.write(f"Singles to process: {total_singles}")

        stats = {
            "sets_processed": 0,
            "singles_found": 0,
            "already_linked": 0,
            "newly_linked": 0,
        }

        # Process each set
        to_create = []

        for set_code, product_ids in sorted(product_ids_by_set.items()):
            collection = collections[set_code]
            stats["sets_processed"] += 1
            stats["singles_found"] += len(product_ids)

            new_links = 0
            for product_id in product_ids:
                if (collection.id, product_id) in existing_memberships:
                    stats["already_linked"] += 1
                    continue

                to_create.append(
                    CollectionProduct(
                        collection=collection,
                        product_id=product_id,
                    )
                )
                new_links += 1
                stats["newly_linked"] += 1

            if new_links > 0 and stats["sets_processed"] <= 20:
                self.stdout.write(f"  {set_code.upper()}: {new_links} new links")

            # Batch create
            if len(to_create) >= batch_size:
                if not dry_run:
                    CollectionProduct.objects.bulk_create(
                        to_create, ignore_conflicts=True
                    )
                to_create = []

        # Final batch
        if to_create and not dry_run:
            CollectionProduct.objects.bulk_create(to_create, ignore_conflicts=True)

        # Summary
        self.stdout.write(self.style.SUCCESS("\n" + "=" * 60))
        self.stdout.write(self.style.SUCCESS("Link Complete"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"Sets processed:  {stats['sets_processed']}")
        self.stdout.write(f"Singles found:   {stats['singles_found']}")
        self.stdout.write(f"Already linked:  {stats['already_linked']}")
        self.stdout.write(f"Newly linked:    {stats['newly_linked']}")

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[DRY RUN - no changes made]"))
