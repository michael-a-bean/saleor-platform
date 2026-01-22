#!/usr/bin/env python3
"""
Chunked MTG import - splits large imports by set for reliability.

This script organizes the import by MTG set, allowing:
- Smaller, more manageable import chunks
- Independent checkpoint per set
- Ability to retry failed sets without reprocessing everything
- Parallel execution of multiple sets (future enhancement)

Usage:
    # List all sets in the JSON file
    python scripts/mtg_scryfall_import/chunked_import.py all-cards.json --list-sets

    # Import a specific set
    python scripts/mtg_scryfall_import/chunked_import.py all-cards.json --set MH3

    # Import multiple sets
    python scripts/mtg_scryfall_import/chunked_import.py all-cards.json --set MH3 --set MH2 --set DMU

    # Import all sets (sequentially)
    python scripts/mtg_scryfall_import/chunked_import.py all-cards.json --all

    # Import sets starting from a specific one (alphabetically)
    python scripts/mtg_scryfall_import/chunked_import.py all-cards.json --from-set MH3

    # Dry run
    python scripts/mtg_scryfall_import/chunked_import.py all-cards.json --set MH3 --dry-run

Environment Variables:
    SALEOR_API_URL: GraphQL endpoint (default: http://localhost:8000/graphql/)
    SALEOR_API_TOKEN: App token for authentication (REQUIRED)
    MTG_IMPORT_CHECKPOINT_DIR: Base directory for checkpoints (default: /tmp/mtg_import)
"""

import argparse
import json
import logging
import os
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DEFAULT_CHECKPOINT_BASE = os.getenv("MTG_IMPORT_CHECKPOINT_DIR", "/tmp/mtg_import")
IMPORT_SCRIPT = Path(__file__).parent / "import_graphql.py"


def load_cards(json_path: Path) -> list[dict]:
    """Load and filter cards from JSON file."""
    logger.info(f"Loading {json_path}...")
    with open(json_path) as f:
        all_cards = json.load(f)

    # Filter to English paper cards only
    cards = [
        c for c in all_cards
        if c.get("lang") == "en"
        and c.get("layout") not in ["art_series", "token", "double_faced_token", "emblem"]
        and not c.get("digital", False)
    ]

    logger.info(f"Loaded {len(cards):,} English paper cards")
    return cards


def group_by_set(cards: list[dict]) -> dict[str, list[dict]]:
    """Group cards by set code."""
    by_set = defaultdict(list)
    for card in cards:
        set_code = card.get("set", "unknown").upper()
        by_set[set_code].append(card)

    return dict(sorted(by_set.items()))


def get_set_checkpoint_dir(base_dir: str, set_code: str) -> Path:
    """Get checkpoint directory for a specific set."""
    checkpoint_dir = Path(base_dir) / f"set_{set_code}"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    return checkpoint_dir


def get_set_status(base_dir: str, set_code: str) -> dict:
    """Get import status for a set."""
    checkpoint_dir = get_set_checkpoint_dir(base_dir, set_code)
    progress_file = checkpoint_dir / "mtg_graphql_import_progress.json"

    if progress_file.exists():
        try:
            with open(progress_file) as f:
                return json.load(f)
        except Exception:
            pass

    return {"last_index": 0, "processed_ids": []}


def write_set_json(cards: list[dict], output_path: Path):
    """Write cards for a set to a temporary JSON file."""
    with open(output_path, "w") as f:
        json.dump(cards, f)


def import_set(
    set_code: str,
    cards: list[dict],
    base_dir: str,
    api_url: str,
    token: str,
    channel: str,
    batch_size: int,
    dry_run: bool,
    verbose: bool,
) -> bool:
    """Import a single set using import_graphql.py."""
    checkpoint_dir = get_set_checkpoint_dir(base_dir, set_code)
    temp_json = checkpoint_dir / f"{set_code}_cards.json"

    logger.info(f"Importing set {set_code} ({len(cards):,} cards)")
    logger.info(f"  Checkpoint dir: {checkpoint_dir}")

    # Write cards to temp file
    write_set_json(cards, temp_json)

    # Build command
    cmd = [
        sys.executable,
        str(IMPORT_SCRIPT),
        str(temp_json),
        "--api-url", api_url,
        "--token", token,
        "--channel", channel,
        "--batch-size", str(batch_size),
        "--checkpoint-dir", str(checkpoint_dir),
        "--resume",  # Always resume for chunked imports
    ]

    if dry_run:
        cmd.append("--dry-run")
    if verbose:
        cmd.append("--verbose")

    # Run import
    try:
        result = subprocess.run(cmd, check=True)
        logger.info(f"  ✓ Set {set_code} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"  ✗ Set {set_code} failed with exit code {e.returncode}")
        return False
    except Exception as e:
        logger.error(f"  ✗ Set {set_code} failed: {e}")
        return False


def list_sets(cards_by_set: dict[str, list[dict]], base_dir: str):
    """List all sets with their card counts and import status."""
    print(f"\n{'Set':<8} {'Cards':>8} {'Imported':>10} {'Status':<12}")
    print("-" * 45)

    total_cards = 0
    total_imported = 0

    for set_code, cards in cards_by_set.items():
        status = get_set_status(base_dir, set_code)
        imported = len(status.get("processed_ids", []))
        total = len(cards)
        total_cards += total
        total_imported += imported

        if imported >= total:
            status_str = "✓ Complete"
        elif imported > 0:
            status_str = f"⋯ {imported}/{total}"
        else:
            status_str = "○ Not started"

        print(f"{set_code:<8} {total:>8,} {imported:>10,} {status_str:<12}")

    print("-" * 45)
    print(f"{'TOTAL':<8} {total_cards:>8,} {total_imported:>10,}")
    print(f"\nSets: {len(cards_by_set)}")


def main():
    parser = argparse.ArgumentParser(
        description="Chunked MTG import by set",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("json_file", type=str, help="Path to Scryfall JSON file")
    parser.add_argument("--list-sets", action="store_true", help="List all sets and exit")
    parser.add_argument("--set", action="append", dest="sets", metavar="CODE",
                       help="Import specific set(s) - can be repeated")
    parser.add_argument("--all", action="store_true", help="Import all sets sequentially")
    parser.add_argument("--from-set", metavar="CODE", help="Start from this set (alphabetically)")
    parser.add_argument("--api-url", default=os.getenv("SALEOR_API_URL", "http://localhost:8000/graphql/"),
                       help="Saleor GraphQL URL")
    parser.add_argument("--token", default=os.getenv("SALEOR_API_TOKEN", ""),
                       help="API token (use App token!)")
    parser.add_argument("--channel", default="webstore", help="Channel slug")
    parser.add_argument("--batch-size", type=int, default=25, help="Batch size")
    parser.add_argument("--checkpoint-base", default=DEFAULT_CHECKPOINT_BASE,
                       help="Base directory for checkpoints")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually create anything")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # Validate JSON file
    json_path = Path(args.json_file)
    if not json_path.exists():
        logger.error(f"File not found: {json_path}")
        sys.exit(1)

    # Load and group cards
    cards = load_cards(json_path)
    cards_by_set = group_by_set(cards)

    # List sets mode
    if args.list_sets:
        list_sets(cards_by_set, args.checkpoint_base)
        return

    # Validate token
    if not args.token and not args.dry_run:
        logger.error("API token required (set SALEOR_API_TOKEN or use --token)")
        sys.exit(1)

    # Determine which sets to import
    if args.sets:
        # Specific sets requested
        sets_to_import = []
        for code in args.sets:
            code_upper = code.upper()
            if code_upper in cards_by_set:
                sets_to_import.append(code_upper)
            else:
                logger.warning(f"Set '{code}' not found in JSON file")
    elif args.all:
        sets_to_import = list(cards_by_set.keys())
    elif args.from_set:
        from_set = args.from_set.upper()
        all_sets = list(cards_by_set.keys())
        try:
            start_idx = all_sets.index(from_set)
            sets_to_import = all_sets[start_idx:]
        except ValueError:
            logger.error(f"Set '{args.from_set}' not found")
            sys.exit(1)
    else:
        logger.error("Specify --set CODE, --all, or --from-set CODE")
        sys.exit(1)

    if not sets_to_import:
        logger.error("No sets to import")
        sys.exit(1)

    # Import sets
    logger.info(f"Importing {len(sets_to_import)} sets")
    logger.info(f"API URL: {args.api_url}")
    logger.info(f"Checkpoint base: {args.checkpoint_base}")

    successful = 0
    failed = 0

    for set_code in sets_to_import:
        set_cards = cards_by_set[set_code]

        success = import_set(
            set_code=set_code,
            cards=set_cards,
            base_dir=args.checkpoint_base,
            api_url=args.api_url,
            token=args.token,
            channel=args.channel,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            verbose=args.verbose,
        )

        if success:
            successful += 1
        else:
            failed += 1
            # Continue with other sets even if one fails

    # Summary
    logger.info("=" * 60)
    logger.info("Chunked Import Complete")
    logger.info("=" * 60)
    logger.info(f"Sets successful: {successful}")
    logger.info(f"Sets failed: {failed}")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
