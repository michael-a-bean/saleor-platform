"""
Django management command to import MTG sealed products from MTGJSON AllPrintings.json.

This script imports sealed products from MTGJSON, creating products with:
- Proper category assignment based on MTGJSON category/subtype
- Set collection membership (auto-creates collections)
- Attribute values (set code, sealed type, subtype, etc.)
- Channel listings with pricing (defaults to $0, sync separately)

This file should be copied to the Saleor container at:
    /app/saleor/core/management/commands/import_sealed_products.py

Usage:
    python manage.py import_sealed_products /path/to/AllPrintings.json [--dry-run] [--limit N]
"""

import json
import sys
from collections import Counter
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
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
    Collection,
    CollectionProduct,
    Product,
    ProductChannelListing,
    ProductType,
    ProductVariant,
    ProductVariantChannelListing,
)


# =============================================================================
# CATEGORY MAPPING: MTGJSON (category, subtype) -> Saleor category slug
# =============================================================================

CATEGORY_MAP = {
    # Play Boosters (2024+)
    ("booster_box", "play"): "play-booster-boxes",
    ("booster_pack", "play"): "play-booster-packs",

    # Collector Boosters
    ("booster_box", "collector"): "collector-booster-boxes",
    ("booster_pack", "collector"): "collector-booster-packs",

    # Draft Boosters (pre-2024)
    ("booster_box", "draft"): "draft-booster-boxes",
    ("booster_pack", "draft"): None,  # Skip individual draft packs

    # Set Boosters (2020-2024)
    ("booster_box", "set"): "set-booster-boxes",
    ("booster_pack", "set"): None,  # Skip individual set packs

    # Jumpstart
    ("booster_pack", "jumpstart"): "jumpstart-boosters",
    ("booster_box", "jumpstart"): "play-booster-boxes",  # Jumpstart boxes go with play boxes

    # Bundles
    ("bundle", "fat_pack"): "bundles",
    ("bundle", "default"): "bundles",
    ("bundle", "gift_bundle"): "bundles",

    # Commander Decks
    ("deck", "commander"): "commander-decks",
    ("multiple_decks", "commander"): "commander-decks",  # Commander deck sets

    # Challenger Decks
    ("deck", "challenger"): "challenger-decks",

    # Starter Products
    ("deck", "starter_deck"): "starter-kits",
    ("deck", "two_player_starter"): "starter-kits",
    ("deck", "welcome"): "starter-kits",
    ("kit", "two_player_starter"): "starter-kits",
    ("kit", "starter_deck"): "starter-kits",

    # Prerelease Kits
    ("limited_aid_tool", "prerelease_kit"): "prerelease-kits",

    # Secret Lair
    ("box_set", "secret_lair"): "secret-lair",
    ("box_set", "secret_lair_bundle"): "secret-lair",

    # Premium Collections (FTV, Spellbook, etc.)
    ("box_set", "from_the_vault"): "premium-collections",
    ("box_set", "spellbook"): "premium-collections",
    ("box_set", "commander_collection"): "premium-collections",
    ("deck", "premium"): "premium-collections",

    # Game Night and similar
    ("box_set", "game_night"): "starter-kits",
    ("kit", "game_night"): "starter-kits",

    # Brawl Decks
    ("deck", "brawl"): "commander-decks",  # Brawl goes with Commander

    # Guild Kits
    ("box_set", "guild_kit"): "premium-collections",

    # Default/other mappings for remaining products
    ("booster_box", "default"): "draft-booster-boxes",  # Older boxes without subtype
    ("booster_box", "other"): "draft-booster-boxes",
    ("booster_box", "premium"): "collector-booster-boxes",

    # Multiple decks products
    ("multiple_decks", "two_player_starter"): "starter-kits",
    ("multiple_decks", "welcome"): "starter-kits",
    ("multiple_decks", "game_night"): "starter-kits",

    # Kit products
    ("kit", "guild_kit"): "premium-collections",
    ("kit", "default"): "starter-kits",

    # Deck variations
    ("deck", "game_night"): "starter-kits",
    ("deck", "default"): "starter-kits",

    # Limited aid tools
    ("limited_aid_tool", "starter_deck"): "starter-kits",
    ("limited_aid_tool", "default"): "prerelease-kits",
}

# Categories to skip entirely
SKIP_CATEGORIES = {
    "booster_case",      # Full cases, not retail
    "bundle_case",       # Full cases
    "limited_aid_case",  # Full cases
    "deck_box",          # Accessories
    "subset",            # Partial products
}

# Subtypes to skip (regardless of category)
SKIP_SUBTYPES = {
    "theme",           # Old theme decks, too many
    "intro",           # Old intro decks
    "duel",            # Duel decks (discontinued)
    "planeswalker",    # Planeswalker decks (discontinued)
    "tournament_deck", # Tournament packs
    "draft_set",       # Draft-specific products
    "event",           # Event decks
    "advanced",        # Old advanced products
    "land_station",    # Land station products
    "archenemy",       # Archenemy products
    "planechase",      # Planechase products
    "clash",           # Clash products
    "battle_pack",     # Battle packs
    "six-card",        # Six-card boosters
    "deck_builders_toolkit",  # Toolkit products
    "convention_exclusive",   # Convention products
    "championship",    # World Championship decks
    "sealed_set",      # Generic sealed sets
    "collectors_edition",  # Alpha/Beta collectors edition
    "promotional",     # Promo packs
    "topper",          # Box toppers
    "challenge",       # Challenge decks
}


class Command(BaseCommand):
    help = "Import MTG sealed products from MTGJSON AllPrintings.json"

    def __init__(self):
        super().__init__()
        self.stats = Counter()
        self.errors = []
        self.attributes = {}
        self.categories = {}
        self.collections = {}

    def add_arguments(self, parser):
        parser.add_argument("json_file", type=str, help="Path to AllPrintings.json")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be imported without making changes",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Limit number of products to import (0 = no limit)",
        )
        parser.add_argument(
            "--set",
            type=str,
            default="",
            help="Only import from specific set code (e.g., 'DFT')",
        )

    def handle(self, *args, **options):
        json_file = Path(options["json_file"])
        dry_run = options["dry_run"]
        limit = options["limit"]
        filter_set = options["set"].upper()

        if not json_file.exists():
            self.stderr.write(self.style.ERROR(f"File not found: {json_file}"))
            sys.exit(1)

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("MTG Sealed Products Import"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"Source: {json_file}")
        self.stdout.write(f"Dry run: {dry_run}")
        self.stdout.write(f"Limit: {limit or 'None'}")
        if filter_set:
            self.stdout.write(f"Set filter: {filter_set}")

        if dry_run:
            self.stdout.write(self.style.WARNING("\nDRY RUN - No changes will be made\n"))

        # Load dependencies
        if not dry_run:
            self.load_dependencies()

        # Load and process data
        self.stdout.write("\nLoading AllPrintings.json...")
        with open(json_file, "r") as f:
            all_data = json.load(f)

        sets_data = all_data.get("data", {})
        self.stdout.write(f"Loaded {len(sets_data)} sets")

        # Filter to specific set if requested
        if filter_set:
            if filter_set in sets_data:
                sets_data = {filter_set: sets_data[filter_set]}
            else:
                self.stderr.write(self.style.ERROR(f"Set '{filter_set}' not found"))
                sys.exit(1)

        # Process sets
        products_to_import = []

        for set_code, set_data in sets_data.items():
            sealed_products = set_data.get("sealedProduct", [])
            if not sealed_products:
                continue

            set_name = set_data.get("name", set_code)
            set_release = set_data.get("releaseDate")

            for sealed in sealed_products:
                result = self.should_import(sealed)
                if result is None:
                    continue

                category_slug = result
                products_to_import.append({
                    "sealed": sealed,
                    "set_code": set_code,
                    "set_name": set_name,
                    "set_release": set_release,
                    "category_slug": category_slug,
                })

                if limit and len(products_to_import) >= limit:
                    break

            if limit and len(products_to_import) >= limit:
                break

        self.stdout.write(f"\nProducts to import: {len(products_to_import)}")

        if dry_run:
            self.show_dry_run_summary(products_to_import)
        else:
            self.import_products(products_to_import)

        # Show stats
        self.stdout.write(self.style.SUCCESS("\n" + "=" * 60))
        self.stdout.write(self.style.SUCCESS("Import Statistics"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        for key, value in sorted(self.stats.items()):
            self.stdout.write(f"  {key}: {value}")

        if self.errors:
            self.stdout.write(self.style.ERROR(f"\nErrors ({len(self.errors)}):"))
            for error in self.errors[:10]:
                self.stdout.write(f"  - {error}")
            if len(self.errors) > 10:
                self.stdout.write(f"  ... and {len(self.errors) - 10} more")

    def should_import(self, sealed):
        """Check if a sealed product should be imported. Returns category slug or None."""
        category = sealed.get("category", "unknown")
        subtype = sealed.get("subtype", "unknown")

        # Skip by category
        if category in SKIP_CATEGORIES:
            self.stats["skipped_category"] += 1
            return None

        # Skip by subtype
        if subtype in SKIP_SUBTYPES:
            self.stats["skipped_subtype"] += 1
            return None

        # Look up mapping
        category_slug = CATEGORY_MAP.get((category, subtype))

        if category_slug is None:
            # Check for default category mappings (any subtype)
            for (cat, sub), slug in CATEGORY_MAP.items():
                if cat == category and sub == "default":
                    category_slug = slug
                    break

        if category_slug is None:
            self.stats[f"unmapped_{category}_{subtype}"] += 1
            return None

        self.stats["will_import"] += 1
        self.stats[f"category_{category_slug}"] += 1
        return category_slug

    def show_dry_run_summary(self, products):
        """Show what would be imported in dry run mode."""
        by_category = Counter()
        by_set = Counter()

        for p in products:
            by_category[p["category_slug"]] += 1
            by_set[p["set_code"]] += 1

        self.stdout.write("\nProducts by category:")
        for cat, count in by_category.most_common():
            self.stdout.write(f"  {cat}: {count}")

        self.stdout.write(f"\nProducts from {len(by_set)} different sets")
        self.stdout.write("\nSample products:")
        for p in products[:5]:
            self.stdout.write(f"  - {p['sealed']['name']} ({p['set_code']}) -> {p['category_slug']}")

    def load_dependencies(self):
        """Load product type, categories, attributes, and channel."""
        # Product type
        self.product_type = ProductType.objects.get(slug="mtg-sealed-product")
        self.stdout.write(f"Product type: {self.product_type.name}")

        # Channel
        self.channel = Channel.objects.get(slug="webstore")
        self.stdout.write(f"Channel: {self.channel.name}")

        # Load all sealed categories
        sealed_parent = Category.objects.get(slug="mtg-sealed")
        for cat in Category.objects.filter(parent=sealed_parent):
            self.categories[cat.slug] = cat
        self.stdout.write(f"Loaded {len(self.categories)} categories")

        # Load attributes
        attr_slugs = [
            "mtg-set-code", "mtg-set-name", "mtg-released-at",
            "mtg-sealed-type", "mtg-sealed-subtype",
            "mtg-pack-count", "mtg-msrp",
            "mtg-tcgplayer-product-id", "mtg-scryfall-set-id", "mtg-mtgjson-uuid",
        ]
        for slug in attr_slugs:
            try:
                self.attributes[slug] = Attribute.objects.get(slug=slug)
            except Attribute.DoesNotExist:
                self.stderr.write(f"Warning: Attribute {slug} not found")
        self.stdout.write(f"Loaded {len(self.attributes)} attributes")

    def import_products(self, products):
        """Import products in batches."""
        batch_size = 100
        total = len(products)

        for i in range(0, total, batch_size):
            batch = products[i:i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (total + batch_size - 1) // batch_size

            try:
                with transaction.atomic():
                    imported = self.import_batch(batch)
                    self.stats["imported"] += imported

                self.stdout.write(
                    f"Batch {batch_num}/{total_batches}: Imported {imported}/{len(batch)} products"
                )
            except Exception as e:
                self.errors.append(f"Batch {batch_num} failed: {e}")
                self.stats["batch_errors"] += 1

    def import_batch(self, batch):
        """Import a batch of products."""
        imported = 0

        for item in batch:
            try:
                if self.import_single_product(item):
                    imported += 1
            except Exception as e:
                self.errors.append(f"{item['sealed']['name']}: {e}")
                self.stats["product_errors"] += 1

        return imported

    def import_single_product(self, item):
        """Import a single sealed product."""
        sealed = item["sealed"]
        set_code = item["set_code"]
        set_name = item["set_name"]
        set_release = item["set_release"]
        category_slug = item["category_slug"]

        # Generate slug
        name = sealed.get("name", "Unknown Product")
        uuid = sealed.get("uuid", "")
        slug = self.make_slug(name, set_code, uuid)

        # Check if already exists
        if Product.objects.filter(slug=slug).exists():
            self.stats["already_exists"] += 1
            return False

        # Get category
        category = self.categories.get(category_slug)
        if not category:
            self.stats["missing_category"] += 1
            return False

        # Create product
        product = Product.objects.create(
            name=name[:250],
            slug=slug,
            description=self.build_description(sealed),
            product_type=self.product_type,
            category=category,
        )

        # Create variant
        sku = self.make_sku(set_code, sealed)
        variant = ProductVariant.objects.create(
            product=product,
            sku=sku[:255],
            name=name[:250],
            track_inventory=True,
        )

        # Create channel listings
        release_date = None
        if set_release:
            try:
                release_date = timezone.datetime.strptime(set_release, "%Y-%m-%d")
                release_date = timezone.make_aware(release_date)
            except ValueError:
                pass

        ProductChannelListing.objects.create(
            product=product,
            channel=self.channel,
            is_published=True,
            visible_in_listings=True,
            available_for_purchase_at=release_date,
        )

        price = Decimal("0.00")  # Will sync prices separately
        ProductVariantChannelListing.objects.create(
            variant=variant,
            channel=self.channel,
            price_amount=price,
            discounted_price_amount=price,
            currency=self.channel.currency_code,
        )

        # Assign attributes
        self.assign_attributes(product, sealed, set_code, set_name, set_release)

        # Add to set collection
        self.add_to_collection(product, set_code, set_name)

        return True

    def make_slug(self, name, set_code, uuid):
        """Generate unique product slug."""
        base = f"{set_code.lower()}-{slugify(name)}"[:190]
        slug = base

        # Ensure uniqueness using uuid suffix if needed
        counter = 0
        while Product.objects.filter(slug=slug).exists():
            counter += 1
            slug = f"{base}-{counter}"

        return slug

    def make_sku(self, set_code, sealed):
        """Generate SKU from sealed product data."""
        category = sealed.get("category", "sealed")
        subtype = sealed.get("subtype", "")
        uuid_short = sealed.get("uuid", "")[:8]

        # Create meaningful SKU
        cat_abbrev = {
            "booster_box": "BOX",
            "booster_pack": "PACK",
            "bundle": "BDL",
            "deck": "DECK",
            "box_set": "SET",
            "kit": "KIT",
            "limited_aid_tool": "KIT",
            "multiple_decks": "DECKS",
        }.get(category, "SEAL")

        sub_abbrev = {
            "play": "PLAY",
            "collector": "COLL",
            "draft": "DRF",
            "set": "SET",
            "commander": "CMD",
            "challenger": "CHL",
            "jumpstart": "JMP",
            "prerelease_kit": "PRE",
            "secret_lair": "SL",
            "fat_pack": "BDL",
            "gift_bundle": "GIFT",
        }.get(subtype, "")

        parts = [set_code.upper(), cat_abbrev]
        if sub_abbrev:
            parts.append(sub_abbrev)
        parts.append(uuid_short.upper())

        return "-".join(parts)

    def build_description(self, sealed):
        """Build product description from sealed data."""
        contents = sealed.get("contents", {})
        sealed_contents = contents.get("sealed", [])

        blocks = []

        # Add contents summary
        if sealed_contents:
            items = []
            for item in sealed_contents:
                count = item.get("count", 1)
                name = item.get("name", "Item")
                items.append(f"{count}x {name}")

            if items:
                blocks.append({
                    "type": "paragraph",
                    "data": {"text": "Contains: " + ", ".join(items)}
                })

        if not blocks:
            blocks.append({
                "type": "paragraph",
                "data": {"text": "Factory sealed Magic: The Gathering product."}
            })

        return {"blocks": blocks}

    def assign_attributes(self, product, sealed, set_code, set_name, set_release):
        """Assign attribute values to product."""
        identifiers = sealed.get("identifiers", {})

        # Set code
        self._assign_plain_text(product, "mtg-set-code", set_code.lower())

        # Set name
        self._assign_plain_text(product, "mtg-set-name", set_name)

        # Release date
        if set_release:
            self._assign_date(product, "mtg-released-at", set_release)

        # Sealed type (dropdown)
        category = sealed.get("category", "")
        type_map = {
            "booster_box": "booster-box",
            "booster_pack": "booster-pack",
            "bundle": "bundle",
            "deck": "precon-deck",
            "box_set": "special",
            "kit": "starter",
            "limited_aid_tool": "special",
            "multiple_decks": "precon-deck",
        }
        sealed_type = type_map.get(category)
        if sealed_type:
            self._assign_dropdown(product, "mtg-sealed-type", sealed_type)

        # Sealed subtype (dropdown)
        subtype = sealed.get("subtype", "")
        subtype_map = {
            "play": "play",
            "collector": "collector",
            "draft": "draft",
            "set": "set",
            "jumpstart": "jumpstart",
            "commander": "commander",
            "challenger": "challenger",
            "brawl": "brawl",
            "starter_deck": "starter-kit",
            "two_player_starter": "starter-kit",
            "welcome": "welcome",
            "fat_pack": "standard-bundle",
            "gift_bundle": "gift-bundle",
            "prerelease_kit": "prerelease",
            "secret_lair": "secret-lair",
            "from_the_vault": "ftv",
            "spellbook": "spellbook",
        }
        sealed_subtype = subtype_map.get(subtype)
        if sealed_subtype:
            self._assign_dropdown(product, "mtg-sealed-subtype", sealed_subtype)

        # Pack count
        contents = sealed.get("contents", {})
        sealed_items = contents.get("sealed", [])
        if sealed_items:
            total_count = sum(item.get("count", 0) for item in sealed_items)
            if total_count > 0:
                self._assign_plain_text(product, "mtg-pack-count", str(total_count))

        # TCGPlayer Product ID
        tcg_id = identifiers.get("tcgplayerProductId")
        if tcg_id:
            self._assign_plain_text(product, "mtg-tcgplayer-product-id", str(tcg_id))

        # MTGJSON UUID
        uuid = sealed.get("uuid")
        if uuid:
            self._assign_plain_text(product, "mtg-mtgjson-uuid", uuid)

    def _assign_plain_text(self, product, attr_slug, value):
        """Assign a plain text attribute value."""
        if attr_slug not in self.attributes or not value:
            return

        attr = self.attributes[attr_slug]
        attr_value, _ = AttributeValue.objects.get_or_create(
            attribute=attr,
            slug=f"{attr_slug}-{product.pk}",
            defaults={
                "name": str(value)[:250],
                "plain_text": str(value),
            },
        )
        AssignedProductAttributeValue.objects.get_or_create(
            product=product,
            value=attr_value,
        )

    def _assign_dropdown(self, product, attr_slug, value_key):
        """Assign a dropdown attribute value."""
        if attr_slug not in self.attributes:
            return

        attr = self.attributes[attr_slug]
        value_slug = f"{attr_slug}-{value_key}"

        try:
            attr_value = AttributeValue.objects.get(attribute=attr, slug=value_slug)
            AssignedProductAttributeValue.objects.get_or_create(
                product=product,
                value=attr_value,
            )
        except AttributeValue.DoesNotExist:
            pass  # Skip if value doesn't exist

    def _assign_date(self, product, attr_slug, date_str):
        """Assign a date attribute value."""
        if attr_slug not in self.attributes or not date_str:
            return

        try:
            attr = self.attributes[attr_slug]
            date_value = timezone.datetime.strptime(date_str, "%Y-%m-%d")
            date_value = timezone.make_aware(date_value)

            attr_value, _ = AttributeValue.objects.get_or_create(
                attribute=attr,
                slug=f"{attr_slug}-{product.pk}",
                defaults={
                    "name": date_str,
                    "date_time": date_value,
                },
            )
            AssignedProductAttributeValue.objects.get_or_create(
                product=product,
                value=attr_value,
            )
        except ValueError:
            pass

    def add_to_collection(self, product, set_code, set_name):
        """Add product to its set collection."""
        collection_slug = f"mtg-set-{set_code.lower()}"

        # Check cache first
        if collection_slug in self.collections:
            collection = self.collections[collection_slug]
        else:
            # Find or create collection
            collection, created = Collection.objects.get_or_create(
                slug=collection_slug,
                defaults={
                    "name": set_name,
                    "description": {
                        "blocks": [
                            {
                                "type": "paragraph",
                                "data": {"text": f"Products from {set_name}"}
                            }
                        ]
                    },
                },
            )
            self.collections[collection_slug] = collection

            if created:
                self.stats["collections_created"] += 1

        # Add to collection
        CollectionProduct.objects.get_or_create(
            collection=collection,
            product=product,
        )
