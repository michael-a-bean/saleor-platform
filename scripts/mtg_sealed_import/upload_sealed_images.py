"""
Django management command to upload WPN images to Saleor sealed products.

This script:
1. Scans downloaded WPN image directories
2. Matches images to sealed products by set code and product type
3. Uploads images as ProductMedia

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/upload_sealed_images.py

Usage:
    python manage.py upload_sealed_images /path/to/images [--dry-run] [--set <code>]
"""

import os
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction

from saleor.attribute.models import AssignedProductAttributeValue, Attribute
from saleor.product.models import Category, Product, ProductMedia, ProductType


# Map WPN image folder names to Saleor category slugs
FOLDER_TO_CATEGORY = {
    "play-booster-box": "play-booster-boxes",
    "collector-booster-box": "collector-booster-boxes",
    "draft-booster-box": "draft-booster-boxes",
    "set-booster-box": "set-booster-boxes",
    "play-booster-pack": "play-booster-packs",
    "collector-booster-pack": "collector-booster-packs",
    "jumpstart-booster": "jumpstart-boosters",
    "jumpstart-box": "play-booster-boxes",  # Jumpstart boxes go with play boxes
    "bundle": "bundles",
    "prerelease-kit": "prerelease-kits",
    "starter-kit": "starter-kits",
    "commander-deck": "commander-decks",
}


class Command(BaseCommand):
    help = "Upload WPN images to MTG sealed products"

    def add_arguments(self, parser):
        parser.add_argument(
            "image_dir",
            type=str,
            help="Path to WPN images directory (containing set code folders)",
        )
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
            "--replace",
            action="store_true",
            help="Replace existing images",
        )

    def handle(self, *args, **options):
        image_dir = Path(options["image_dir"])
        dry_run = options["dry_run"]
        set_filter = options["set"].lower()
        replace = options["replace"]

        if not image_dir.exists():
            self.stderr.write(self.style.ERROR(f"Directory not found: {image_dir}"))
            return

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("WPN Image Upload to Saleor"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made\n"))

        # Get product type
        try:
            product_type = ProductType.objects.get(slug="mtg-sealed-product")
        except ProductType.DoesNotExist:
            self.stderr.write(self.style.ERROR("Product type 'mtg-sealed-product' not found"))
            return

        # Get set code attribute
        try:
            set_code_attr = Attribute.objects.get(slug="mtg-set-code")
        except Attribute.DoesNotExist:
            self.stderr.write(self.style.ERROR("Attribute 'mtg-set-code' not found"))
            return

        # Build category lookup
        categories = {}
        for folder, slug in FOLDER_TO_CATEGORY.items():
            try:
                categories[folder] = Category.objects.get(slug=slug)
            except Category.DoesNotExist:
                self.stdout.write(f"Warning: Category '{slug}' not found")

        self.stdout.write(f"Image directory: {image_dir}")
        self.stdout.write(f"Loaded {len(categories)} category mappings")

        stats = {
            "sets_processed": 0,
            "images_found": 0,
            "products_matched": 0,
            "images_uploaded": 0,
            "already_has_image": 0,
            "no_match": 0,
        }

        # Scan set directories
        for set_dir in sorted(image_dir.iterdir()):
            if not set_dir.is_dir():
                continue

            set_code = set_dir.name.lower()

            if set_filter and set_code != set_filter:
                continue

            self.stdout.write(f"\nProcessing set: {set_code.upper()}")
            stats["sets_processed"] += 1

            # Find products for this set
            products_by_category = self._get_products_for_set(
                set_code, product_type, set_code_attr, categories
            )

            # Scan product type subdirectories
            for type_dir in sorted(set_dir.iterdir()):
                if not type_dir.is_dir():
                    continue

                folder_name = type_dir.name
                category_slug = FOLDER_TO_CATEGORY.get(folder_name)

                if not category_slug:
                    if folder_name != "unknown":
                        self.stdout.write(f"  Skipping unknown folder: {folder_name}")
                    continue

                # Get products in this category
                products = products_by_category.get(category_slug, [])

                if not products:
                    self.stdout.write(f"  {folder_name}: No products found in category")
                    continue

                # Find images
                images = list(type_dir.glob("*.png"))
                if not images:
                    continue

                stats["images_found"] += len(images)

                # Use first image (front view) for product
                image_path = images[0]

                # Try to match to a product
                for product in products:
                    # Check if product already has an image
                    if not replace and product.media.exists():
                        stats["already_has_image"] += 1
                        continue

                    stats["products_matched"] += 1

                    if dry_run:
                        self.stdout.write(
                            f"  Would upload: {image_path.name} -> {product.name[:40]}"
                        )
                    else:
                        self._upload_image(product, image_path, replace)

                    stats["images_uploaded"] += 1
                    break  # One image per product type per set
                else:
                    stats["no_match"] += 1

        # Summary
        self.stdout.write(self.style.SUCCESS("\n" + "=" * 60))
        self.stdout.write(self.style.SUCCESS("Upload Complete"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"Sets processed:    {stats['sets_processed']}")
        self.stdout.write(f"Images found:      {stats['images_found']}")
        self.stdout.write(f"Products matched:  {stats['products_matched']}")
        self.stdout.write(f"Images uploaded:   {stats['images_uploaded']}")
        self.stdout.write(f"Already has image: {stats['already_has_image']}")
        self.stdout.write(f"No match:          {stats['no_match']}")

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[DRY RUN - no changes made]"))

    def _get_products_for_set(self, set_code, product_type, set_code_attr, categories):
        """Get all sealed products for a set, grouped by category."""
        # Find products with matching set code
        products = Product.objects.filter(
            product_type=product_type,
        ).select_related("category").prefetch_related("media")

        # Filter by set code attribute
        product_ids_with_set = AssignedProductAttributeValue.objects.filter(
            value__attribute=set_code_attr,
            value__plain_text__iexact=set_code,
        ).values_list("product_id", flat=True)

        products = products.filter(id__in=product_ids_with_set)

        # Group by category
        by_category = {}
        for product in products:
            if product.category:
                cat_slug = product.category.slug
                if cat_slug not in by_category:
                    by_category[cat_slug] = []
                by_category[cat_slug].append(product)

        return by_category

    def _upload_image(self, product, image_path, replace=False):
        """Upload an image to a product."""
        # Remove existing images if replacing
        if replace:
            product.media.all().delete()

        # Read image file
        with open(image_path, "rb") as f:
            image_content = f.read()

        # Create ProductMedia
        media = ProductMedia(
            product=product,
            alt=product.name[:250],
            type="IMAGE",
        )

        # Save image file
        filename = f"{product.slug}-{image_path.name}"
        media.image.save(filename, ContentFile(image_content), save=True)

        self.stdout.write(f"  Uploaded: {image_path.name} -> {product.name[:40]}")
