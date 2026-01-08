"""
Django management command to set up MTG sealed product schema.

This script creates:
1. Category hierarchy (Magic: The Gathering / Sealed / subcategories)
2. Sealed-specific attributes (mtg-sealed-type, mtg-sealed-subtype, etc.)
3. mtg-sealed-product product type with assigned attributes

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/setup_sealed_schema.py

Usage:
    python manage.py setup_sealed_schema [--dry-run]
"""

from django.core.management.base import BaseCommand

from saleor.attribute import AttributeInputType, AttributeType
from saleor.attribute.models import Attribute, AttributeProduct, AttributeValue
from saleor.product import ProductTypeKind
from saleor.product.models import Category, ProductType


# =============================================================================
# SEALED CATEGORY HIERARCHY
# =============================================================================

# Categories under "Magic: The Gathering / Sealed /"
SEALED_CATEGORIES = [
    ("play-booster-boxes", "Play Booster Boxes", "Factory-sealed Play Booster boxes (30 packs)"),
    ("collector-booster-boxes", "Collector Booster Boxes", "Premium Collector Booster boxes (12 packs)"),
    ("draft-booster-boxes", "Draft Booster Boxes", "Legacy Draft Booster boxes (pre-2024 sets)"),
    ("set-booster-boxes", "Set Booster Boxes", "Legacy Set Booster boxes (pre-2024 sets)"),
    ("play-booster-packs", "Play Booster Packs", "Individual Play Booster packs"),
    ("collector-booster-packs", "Collector Booster Packs", "Individual Collector Booster packs"),
    ("jumpstart-boosters", "Jumpstart Boosters", "Jumpstart-format booster packs"),
    ("bundles", "Bundles", "Bundle products including Fat Packs and Gift Bundles"),
    ("commander-decks", "Commander Decks", "100-card Commander preconstructed decks"),
    ("challenger-decks", "Challenger Decks", "Standard-legal Challenger Decks"),
    ("starter-kits", "Starter Kits", "Learn-to-play starter products"),
    ("prerelease-kits", "Prerelease Kits", "Prerelease event kits"),
    ("secret-lair", "Secret Lair", "Secret Lair drop products"),
    ("premium-collections", "Premium Collections", "From the Vault, Spellbook, and other premium sets"),
]


# =============================================================================
# SEALED PRODUCT ATTRIBUTES
# =============================================================================

# Product-level attributes for sealed products
# (slug, name, input_type, visible_storefront, filterable, description)
SEALED_PRODUCT_ATTRIBUTES = [
    # Reuse existing attributes from mtg-card where sensible
    # These will be shared with singles
    ("mtg-set-code", "Set Code", AttributeInputType.PLAIN_TEXT, True, True),
    ("mtg-set-name", "Set Name", AttributeInputType.PLAIN_TEXT, True, True),
    ("mtg-released-at", "Release Date", AttributeInputType.DATE, True, True),

    # Sealed-specific attributes
    ("mtg-sealed-type", "Sealed Type", AttributeInputType.DROPDOWN, True, True),
    ("mtg-sealed-subtype", "Sealed Subtype", AttributeInputType.DROPDOWN, True, True),
    ("mtg-msrp", "MSRP", AttributeInputType.PLAIN_TEXT, False, False),
    ("mtg-pack-count", "Pack Count", AttributeInputType.NUMERIC, True, False),

    # External IDs for sync
    ("mtg-tcgplayer-product-id", "TCGPlayer Product ID", AttributeInputType.PLAIN_TEXT, False, False),
    ("mtg-scryfall-set-id", "Scryfall Set ID", AttributeInputType.PLAIN_TEXT, False, False),
    ("mtg-mtgjson-uuid", "MTGJSON UUID", AttributeInputType.PLAIN_TEXT, False, False),
]


# =============================================================================
# DROPDOWN VALUES
# =============================================================================

# Values for mtg-sealed-type dropdown
SEALED_TYPE_VALUES = [
    ("booster-box", "Booster Box"),
    ("booster-pack", "Booster Pack"),
    ("bundle", "Bundle"),
    ("precon-deck", "Precon Deck"),
    ("starter", "Starter"),
    ("special", "Special"),
]

# Values for mtg-sealed-subtype dropdown
SEALED_SUBTYPE_VALUES = [
    # Booster types
    ("play", "Play"),
    ("collector", "Collector"),
    ("draft", "Draft"),
    ("set", "Set"),
    ("jumpstart", "Jumpstart"),
    # Deck types
    ("commander", "Commander"),
    ("challenger", "Challenger"),
    ("brawl", "Brawl"),
    # Starter types
    ("starter-kit", "Starter Kit"),
    ("welcome", "Welcome"),
    # Bundle types
    ("standard-bundle", "Standard Bundle"),
    ("gift-bundle", "Gift Bundle"),
    ("commander-bundle", "Commander Bundle"),
    # Special types
    ("prerelease", "Prerelease"),
    ("secret-lair", "Secret Lair"),
    ("ftv", "From the Vault"),
    ("spellbook", "Spellbook"),
]


class Command(BaseCommand):
    help = "Set up MTG sealed product schema (categories, attributes, product type)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("MTG Sealed Product Schema Setup"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made\n"))

        # Step 1: Create category hierarchy
        self.stdout.write(self.style.MIGRATE_HEADING("\n1. Creating category hierarchy..."))
        if dry_run:
            self.show_category_preview()
        else:
            sealed_parent = self.create_categories()

        # Step 2: Create attributes
        self.stdout.write(self.style.MIGRATE_HEADING("\n2. Creating sealed attributes..."))
        if dry_run:
            self.show_attribute_preview()
        else:
            attributes = self.create_attributes()

        # Step 3: Create product type
        self.stdout.write(self.style.MIGRATE_HEADING("\n3. Creating product type..."))
        if dry_run:
            self.stdout.write("  Would create: mtg-sealed-product")
        else:
            product_type = self.create_product_type(attributes)

        self.stdout.write(self.style.SUCCESS("\n" + "=" * 60))
        if dry_run:
            self.stdout.write(self.style.SUCCESS("DRY RUN COMPLETE"))
        else:
            self.stdout.write(self.style.SUCCESS("Schema setup complete!"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

    def show_category_preview(self):
        """Show what categories would be created."""
        self.stdout.write("  Magic: The Gathering/")
        self.stdout.write("    Sealed/")
        for slug, name, _ in SEALED_CATEGORIES:
            self.stdout.write(f"      {name}/ ({slug})")

    def show_attribute_preview(self):
        """Show what attributes would be created."""
        for slug, name, input_type, visible, filterable in SEALED_PRODUCT_ATTRIBUTES:
            type_name = input_type.name if hasattr(input_type, 'name') else str(input_type)
            self.stdout.write(f"  {name} ({slug}) - {type_name}")

    def create_categories(self):
        """Create the sealed product category hierarchy."""
        # Create or get parent: Magic: The Gathering
        mtg_parent, mtg_created = Category.objects.get_or_create(
            slug="magic-the-gathering",
            defaults={
                "name": "Magic: The Gathering",
                "description": {
                    "blocks": [
                        {
                            "type": "paragraph",
                            "data": {"text": "Magic: The Gathering trading cards and sealed products"},
                        }
                    ]
                },
            },
        )
        if mtg_created:
            self.stdout.write(self.style.SUCCESS(f"  Created: Magic: The Gathering"))
        else:
            self.stdout.write(f"  Exists: Magic: The Gathering (ID: {mtg_parent.pk})")

        # Create or get Sealed parent under MTG
        sealed_parent, sealed_created = Category.objects.get_or_create(
            slug="mtg-sealed",
            defaults={
                "name": "Sealed",
                "parent": mtg_parent,
                "description": {
                    "blocks": [
                        {
                            "type": "paragraph",
                            "data": {"text": "Factory-sealed Magic: The Gathering products"},
                        }
                    ]
                },
            },
        )
        if sealed_created:
            self.stdout.write(self.style.SUCCESS(f"  Created: Sealed (under Magic: The Gathering)"))
        else:
            self.stdout.write(f"  Exists: Sealed (ID: {sealed_parent.pk})")
            # Ensure parent is correct
            if sealed_parent.parent != mtg_parent:
                sealed_parent.parent = mtg_parent
                sealed_parent.save(update_fields=["parent"])
                self.stdout.write(f"    Updated parent to Magic: The Gathering")

        # Create sealed subcategories
        for slug, name, description in SEALED_CATEGORIES:
            cat, created = Category.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "parent": sealed_parent,
                    "description": {
                        "blocks": [
                            {
                                "type": "paragraph",
                                "data": {"text": description},
                            }
                        ]
                    },
                },
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"    Created: {name}"))
            else:
                self.stdout.write(f"    Exists: {name} (ID: {cat.pk})")
                # Ensure parent is correct
                if cat.parent != sealed_parent:
                    cat.parent = sealed_parent
                    cat.save(update_fields=["parent"])
                    self.stdout.write(f"      Updated parent to Sealed")

        return sealed_parent

    def create_attributes(self):
        """Create sealed product attributes."""
        attributes = {}

        for slug, name, input_type, visible, filterable in SEALED_PRODUCT_ATTRIBUTES:
            attr, created = Attribute.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "input_type": input_type,
                    "type": AttributeType.PRODUCT_TYPE,
                    "visible_in_storefront": visible,
                    "filterable_in_storefront": filterable,
                    "filterable_in_dashboard": True,
                    "storefront_search_position": 0,
                    "available_in_grid": filterable,
                },
            )

            if created:
                self.stdout.write(self.style.SUCCESS(f"  Created: {name} ({slug})"))
            else:
                self.stdout.write(f"  Exists: {name} ({slug})")

            attributes[slug] = attr

            # Create dropdown values for sealed-type and sealed-subtype
            if slug == "mtg-sealed-type" and created:
                self._create_dropdown_values(attr, SEALED_TYPE_VALUES)
            elif slug == "mtg-sealed-subtype" and created:
                self._create_dropdown_values(attr, SEALED_SUBTYPE_VALUES)

        return attributes

    def _create_dropdown_values(self, attr, values):
        """Create dropdown values for an attribute."""
        for value_slug, value_name in values:
            full_slug = f"{attr.slug}-{value_slug}"
            val, created = AttributeValue.objects.get_or_create(
                attribute=attr,
                slug=full_slug,
                defaults={"name": value_name},
            )
            if created:
                self.stdout.write(f"    Value: {value_name} ({full_slug})")

    def create_product_type(self, attributes):
        """Create the mtg-sealed-product product type."""
        product_type, created = ProductType.objects.get_or_create(
            slug="mtg-sealed-product",
            defaults={
                "name": "MTG Sealed Product",
                "has_variants": False,  # Sealed products typically don't have variants
                "is_shipping_required": True,
                "is_digital": False,
                "kind": ProductTypeKind.NORMAL,
            },
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f"  Created product type: mtg-sealed-product"))
        else:
            self.stdout.write(f"  Exists: mtg-sealed-product (ID: {product_type.pk})")

        # Assign attributes to product type
        assigned_count = 0
        for slug, attr in attributes.items():
            attr_product, ap_created = AttributeProduct.objects.get_or_create(
                attribute=attr,
                product_type=product_type,
            )
            if ap_created:
                assigned_count += 1

        if assigned_count > 0:
            self.stdout.write(f"  Assigned {assigned_count} attributes to product type")
        else:
            self.stdout.write(f"  All attributes already assigned")

        return product_type
