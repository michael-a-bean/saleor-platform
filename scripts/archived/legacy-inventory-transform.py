#!/usr/bin/env python3
"""
Transform legacy SNC inventory CSV → Saleor collection import format.

Usage:
  python3 scripts/legacy-inventory-transform.py <input.csv> <output_dir>

  Options:
    --enrich    Download Scryfall bulk data and fill in missing collector_number
                and tcgplayer_id fields (recommended, ~80MB one-time download)
    --cache-dir Path to cache Scryfall bulk data (default: output_dir)

Produces 3 CSVs (one per warehouse):
  - stock_main.csv
  - stock_frank.csv
  - stock_rc.csv

Each CSV is ready to upload via inventory-ops Collection Import.
"""

import csv
import gzip
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path


# ── Set code mapping: legacy → Scryfall ──────────────────────────────

# Known renames where legacy code ≠ Scryfall code
RENAMES = {
    "EVT": "eve",    # Eventide
    "NMS": "nem",    # Nemesis
    "PO2": "p02",    # Portal Second Age
    "CON": "con",    # Conflux (same but noting it)
}

# Masterpiece series → Scryfall codes
MASTERPIECES = {
    "MPSKLD": "mps",    # Kaladesh Inventions
    "MPSAKH": "mp2",    # Amonkhet Invocations
    "MPSGRN": "med",    # Mythic Edition (may not exist in catalog)
}

# Promo sets → Scryfall codes (these may not exist in your catalog)
PROMOS = {
    "PRMJDG": "pjgp",   # Judge Promos
    "PRMFNM": "pfnm",   # FNM Promos
    "PRMARE": "parl",    # Arena Promos
    "PRMSET": "prel",    # Set Release Cards
    "PRMOTH": None,      # Other Promos — no clear Scryfall match
    "PRMAPC": None,      # APAC Lands
    "PRMWPN": None,      # WPN Promos
}

# Special sets
SPECIAL = {
    "MB1": "mb1",     # Mystery Booster
    "MB1R": "mb1",    # Mystery Booster Retail Foils → same set
    "DD3": "dd3dvd",  # Duel Decks Anthology (multiple sub-sets in Scryfall)
    "OLD": None,      # "Old" placeholder — skip
    "GP2018": None,   # 2018 Gift Pack — may not be in catalog
    "PDF": "h09",     # Premium Deck Series: Fire & Lightning → Scryfall "pd2"
    "PDG": "pdp",     # Premium Deck Series: Graveborn → "ha3" or similar
    "BLCI": None,     # Bloomburrow Commander Imagine — may need manual check
}

# Foil etched suffix → base set (Scryfall treats these as same set)
# MH1CE → mh1, MH2CE → mh2
# These cards are in the same set, distinguished by collector number + frame

# Maximum sane stock value (uint32 overflow protection)
MAX_STOCK = 100000

# Scryfall bulk data cache filename
SCRYFALL_CACHE_FILE = "scryfall-default-cards.json"
SCRYFALL_CACHE_MAX_AGE_DAYS = 7


# ── Scryfall enrichment ──────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Normalize a card name for fuzzy matching between S&C and Scryfall."""
    n = name.lower().strip()
    # Strip ALL trailing parentheticals repeatedly:
    # "Abbot of Keral Keep (446) (Etched Foil)" → "abbot of keral keep"
    while True:
        stripped = re.sub(r"\s*\([^)]*\)\s*$", "", n)
        if stripped == n:
            break
        n = stripped
    # Normalize Æ/æ → ae
    n = n.replace("æ", "ae").replace("Æ", "ae")
    # Normalize smart quotes and special chars
    n = n.replace("\u2019", "'").replace("\u2018", "'")
    # Strip extra whitespace
    n = re.sub(r"\s+", " ", n).strip()
    return n


def normalize_name_no_apostrophe(name: str) -> str:
    """Further normalize by removing apostrophes for S&C matching."""
    return normalize_name(name).replace("'", "").replace("\u2019", "")


def download_scryfall_bulk(cache_dir: str) -> str:
    """Download Scryfall default-cards bulk data. Returns path to JSON file."""
    cache_path = os.path.join(cache_dir, SCRYFALL_CACHE_FILE)

    # Check if cached file is fresh enough
    if os.path.exists(cache_path):
        age_days = (time.time() - os.path.getmtime(cache_path)) / 86400
        if age_days < SCRYFALL_CACHE_MAX_AGE_DAYS:
            print(f"  Using cached Scryfall data ({age_days:.1f} days old)")
            return cache_path
        else:
            print(f"  Cached Scryfall data is {age_days:.0f} days old, refreshing...")

    # Step 1: Get the bulk data download URL
    print("  Fetching Scryfall bulk data catalog...")
    req = urllib.request.Request(
        "https://api.scryfall.com/bulk-data/default-cards",
        headers={"User-Agent": "SaleorPlatform/1.0 (legacy-inventory-transform)", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        meta = json.loads(resp.read())

    download_url = meta["download_uri"]
    size_mb = meta.get("size", 0) / 1024 / 1024
    print(f"  Downloading {size_mb:.0f}MB from Scryfall...")

    # Step 2: Download the JSON file
    req = urllib.request.Request(
        download_url,
        headers={"User-Agent": "SaleorPlatform/1.0 (legacy-inventory-transform)", "Accept-Encoding": "gzip"},
    )
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
        # Decompress if gzipped
        if resp.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)

    with open(cache_path, "wb") as f:
        f.write(data)

    print(f"  Saved to {cache_path} ({len(data) / 1024 / 1024:.0f}MB)")
    return cache_path


def build_scryfall_lookup(cache_path: str) -> tuple[dict, dict]:
    """
    Build lookups from Scryfall bulk data.

    Returns (name_lookup, tcg_lookup):

    name_lookup — keyed by name tuples:
    - Specific: (normalized_name, set_code, collector_number) → entry
    - Generic:  (normalized_name, set_code) → entry (first match only)

    tcg_lookup — keyed by TCGPlayer ID (str) → entry
    Resolves art variants when source has TCG ID but no collector number.

    Each entry: {"collector_number", "tcgplayer_id", "scryfall_id"}
    """
    print("  Parsing Scryfall bulk data...")
    with open(cache_path, "r", encoding="utf-8") as f:
        cards = json.load(f)

    lookup = {}
    tcg_lookup = {}

    def add_entry(key, entry):
        if key not in lookup:
            lookup[key] = entry

    for card in cards:
        # Only MTG cards in paper
        if card.get("object") != "card":
            continue
        if "paper" not in card.get("games", []):
            continue

        name = card.get("name", "")
        set_code = card.get("set", "")
        cn = card.get("collector_number", "")
        tcg_id = card.get("tcgplayer_id")
        scryfall_id = card.get("id", "")

        entry = {
            "collector_number": cn,
            "tcgplayer_id": str(tcg_id) if tcg_id else "",
            "scryfall_id": scryfall_id,
        }

        # TCGPlayer ID lookup (most precise — 1:1 with Scryfall cards)
        if tcg_id:
            tcg_lookup[str(tcg_id)] = entry

        norm = normalize_name(name)
        norm_no_apo = normalize_name_no_apostrophe(name)

        # Specific key: name + set + collector_number (distinguishes art variants)
        add_entry((norm, set_code, cn), entry)
        if norm_no_apo != norm:
            add_entry((norm_no_apo, set_code, cn), entry)

        # Generic key: name + set (first match wins — used when CN unknown)
        add_entry((norm, set_code), entry)
        if norm_no_apo != norm:
            add_entry((norm_no_apo, set_code), entry)

        # For DFCs like "Delver of Secrets // Insectile Aberration",
        # also index by front face name only (with and without apostrophes)
        if " // " in name:
            front_name = normalize_name(name.split(" // ")[0])
            front_no_apo = normalize_name_no_apostrophe(name.split(" // ")[0])
            add_entry((front_name, set_code, cn), entry)
            add_entry((front_name, set_code), entry)
            if front_no_apo != front_name:
                add_entry((front_no_apo, set_code, cn), entry)
                add_entry((front_no_apo, set_code), entry)

    print(f"  Built lookup with {len(lookup):,} name entries, {len(tcg_lookup):,} TCG entries")
    return lookup, tcg_lookup


def enrich_row(card_name: str, set_code: str, collector_number: str,
               tcgplayer_id: str, name_lookup: dict,
               tcg_lookup: dict) -> tuple[str, str, str]:
    """
    Enrich a row with Scryfall data if fields are missing.

    Lookup priority:
    1. TCGPlayer ID (most precise — 1:1 with Scryfall, resolves art variants)
    2. Name + set + collector_number (distinguishes art variants when CN known)
    3. Name + set (generic fallback)

    Returns (collector_number, tcgplayer_id, scryfall_id) — original values
    preserved if already populated, Scryfall values filled in if missing.
    """
    entry = None

    # Try TCGPlayer ID first — most precise, resolves art variants like
    # Abbey Matron 2a (TCG 4436) vs 2b (TCG 18266)
    if tcgplayer_id:
        entry = tcg_lookup.get(tcgplayer_id)

    # Try specific name key (name + set + collector_number)
    if not entry:
        norm_name = normalize_name(card_name)
        norm_no_apo = normalize_name_no_apostrophe(card_name)

        if collector_number:
            entry = name_lookup.get((norm_name, set_code, collector_number))
            if not entry and norm_no_apo != norm_name:
                entry = name_lookup.get((norm_no_apo, set_code, collector_number))

        # Fall back to generic key (name + set)
        if not entry:
            entry = name_lookup.get((norm_name, set_code))
        if not entry and norm_no_apo != norm_name:
            entry = name_lookup.get((norm_no_apo, set_code))

    if not entry:
        return collector_number, tcgplayer_id, ""

    # Fill in missing fields only — don't overwrite S&C source data
    enriched_cn = collector_number if collector_number else entry["collector_number"]
    enriched_tcg = tcgplayer_id if tcgplayer_id else entry["tcgplayer_id"]
    scryfall_id = entry["scryfall_id"]

    return enriched_cn, enriched_tcg, scryfall_id


# ── Set code mapping ─────────────────────────────────────────────────

def map_set_code(legacy_code: str) -> str | None:
    """Map a legacy set code to a Scryfall set code. Returns None if unmappable."""
    # Strip quotes
    code = legacy_code.strip('"').strip()

    # Check direct renames first
    if code in RENAMES:
        return RENAMES[code]
    if code in MASTERPIECES:
        return MASTERPIECES[code]
    if code in PROMOS:
        return PROMOS[code]
    if code in SPECIAL:
        return SPECIAL[code]

    # Strip ! prefix (presale/new set indicator)
    clean = code.lstrip("!")

    # Handle collector variant suffixes:
    # "C" suffix = collector cards (extended art, showcase, etc.)
    # "CE" suffix = foil etched
    # These are the SAME Scryfall set, different collector numbers
    if clean.endswith("CE") and len(clean) > 3:
        base = clean[:-2]
        return base.lower()
    if clean.endswith("CC") and len(clean) > 3:
        # Commander collector cards (e.g., AFCC → afc)
        base = clean[:-1]  # Strip one C → still ends in C for commander
        return base.lower()
    if clean.endswith("C") and len(clean) > 3:
        base = clean[:-1]
        return base.lower()

    # Handle box toppers / special suffixes
    if clean.endswith("CB"):  # e.g., LTCB, LCCB — box toppers
        base = clean[:-1]  # Strip B → base set + C → strip that too
        return clean[:-2].lower()
    if clean.endswith("CH"):  # e.g., LTCH — Hildebrandt
        return clean[:-2].lower()
    if clean.endswith("CS"):  # e.g., LTCS — scene cards
        return clean[:-2].lower()

    # Default: lowercase
    return clean.lower()


def map_foil(foil_value: str) -> str:
    """Map legacy foil 0/1 → collection import foil value."""
    return "Yes" if foil_value.strip('"') == "1" else "No"


def map_condition(cond: str) -> str:
    """Map legacy condition nick → Saleor condition."""
    # Legacy has NM, LP, HP — Saleor uses the same codes
    return cond.strip('"').strip()


# ── Transform ────────────────────────────────────────────────────────

def transform(input_path: str, output_dir: str,
              scryfall_lookup: tuple[dict, dict] | None = None):
    """Transform legacy CSV into 3 warehouse-specific collection import CSVs.

    Aggregates rows that map to the same variant (same card_name, set_code,
    collector_number, scryfall_id, condition, foil) by summing quantities and
    computing weighted-average unit cost.
    """
    os.makedirs(output_dir, exist_ok=True)

    headers = ["card_name", "set_code", "collector_number", "tcgplayer_id",
               "scryfall_id", "condition", "foil", "quantity", "unit_cost"]

    # Stats
    stats = {
        "total_rows": 0,
        "skipped_unmappable_set": 0,
        "skipped_zero_stock": 0,
        "skipped_overflow": 0,
        "written": {"main": 0, "frank": 0, "rc": 0},
        "unmapped_sets": set(),
        "unique_cards": set(),
        "with_tcgplayer_id": 0,
        "with_collector_number": 0,
        "with_either": 0,
        "enriched_cn": 0,
        "enriched_tcg": 0,
        "enriched_miss": 0,
        "aggregated_dupes": 0,
    }

    stock_columns = {
        "main": "stock",
        "frank": "stock_frank",
        "rc": "stock_rc",
    }

    # Accumulate rows per warehouse, keyed by dedup key
    # Value: {"card_name", "set_code", "collector_number", "tcgplayer_id",
    #         "scryfall_id", "condition", "foil", "total_qty", "total_cost"}
    aggregated: dict[str, dict[tuple, dict]] = {w: {} for w in stock_columns}

    with open(input_path, encoding="cp1252") as f:
        reader = csv.DictReader(f)

        for row in reader:
            stats["total_rows"] += 1

            # Map set code
            scryfall_set = map_set_code(row["set_code"])
            if scryfall_set is None:
                stats["skipped_unmappable_set"] += 1
                stats["unmapped_sets"].add(row["set_code"])
                continue

            card_name = row["card_name"]
            collector_number = row.get("collector_number", "").strip()
            # bbid = BrainBurst ID = TCGPlayer product ID (verified offset=0 for all pre-LRW sets)
            raw_bbid = row.get("bbid", "0").strip()
            tcgplayer_id = raw_bbid if raw_bbid and raw_bbid != "0" else ""
            condition = map_condition(row["condition_nick"])
            foil = map_foil(row["foil"])
            buy_price = row["buy_price"]
            card_id = row["card_id"]
            scryfall_id = ""

            # Scryfall enrichment
            if scryfall_lookup:
                name_lookup, tcg_lookup = scryfall_lookup
                orig_cn, orig_tcg = collector_number, tcgplayer_id
                collector_number, tcgplayer_id, scryfall_id = enrich_row(
                    card_name, scryfall_set, collector_number, tcgplayer_id,
                    name_lookup, tcg_lookup,
                )
                if collector_number != orig_cn:
                    stats["enriched_cn"] += 1
                if tcgplayer_id != orig_tcg:
                    stats["enriched_tcg"] += 1
                if not collector_number and not tcgplayer_id and not scryfall_id:
                    stats["enriched_miss"] += 1

            stats["unique_cards"].add(card_id)

            # Track matching identifier coverage (after enrichment)
            has_tcg = bool(tcgplayer_id)
            has_cn = bool(collector_number)
            if has_tcg:
                stats["with_tcgplayer_id"] += 1
            if has_cn:
                stats["with_collector_number"] += 1
            if has_tcg or has_cn:
                stats["with_either"] += 1

            # Parse buy_price as float for weighted average
            try:
                cost = float(buy_price)
            except (ValueError, TypeError):
                cost = 0.0

            # Accumulate per warehouse where stock > 0
            for warehouse, col in stock_columns.items():
                try:
                    qty = int(row[col])
                except (ValueError, KeyError):
                    continue

                if qty <= 0:
                    continue

                if qty > MAX_STOCK:
                    stats["skipped_overflow"] += 1
                    continue

                # Dedup key: everything that identifies a unique Saleor variant
                # Use scryfall_id as primary dedup (most precise), fall back to
                # name+set+cn when scryfall_id is empty
                dedup_key = (card_name, scryfall_set, collector_number,
                             scryfall_id, condition, foil)

                bucket = aggregated[warehouse]
                if dedup_key in bucket:
                    existing = bucket[dedup_key]
                    existing["total_qty"] += qty
                    existing["total_cost"] += cost * qty
                    # Keep the richer tcgplayer_id (non-empty wins)
                    if tcgplayer_id and not existing["tcgplayer_id"]:
                        existing["tcgplayer_id"] = tcgplayer_id
                    stats["aggregated_dupes"] += 1
                else:
                    bucket[dedup_key] = {
                        "card_name": card_name,
                        "set_code": scryfall_set,
                        "collector_number": collector_number,
                        "tcgplayer_id": tcgplayer_id,
                        "scryfall_id": scryfall_id,
                        "condition": condition,
                        "foil": foil,
                        "total_qty": qty,
                        "total_cost": cost * qty,
                    }

    # Write aggregated rows to CSV
    for warehouse in ("main", "frank", "rc"):
        path = os.path.join(output_dir, f"stock_{warehouse}.csv")
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(headers)
            for entry in aggregated[warehouse].values():
                qty = entry["total_qty"]
                # Weighted average unit cost
                unit_cost = entry["total_cost"] / qty if qty > 0 else 0.0
                w.writerow([
                    entry["card_name"],
                    entry["set_code"],
                    entry["collector_number"],
                    entry["tcgplayer_id"],
                    entry["scryfall_id"],
                    entry["condition"],
                    entry["foil"],
                    qty,
                    f"{unit_cost:.2f}",
                ])
                stats["written"][warehouse] += 1

    return stats


def main():
    if len(sys.argv) < 2 or "--help" in sys.argv or "-h" in sys.argv:
        print(f"Usage: {sys.argv[0]} <input.csv> [output_dir] [--enrich] [--cache-dir DIR]")
        print()
        print("Options:")
        print("  --enrich          Download Scryfall bulk data to fill missing identifiers")
        print("  --cache-dir DIR   Directory to cache Scryfall data (default: output_dir)")
        sys.exit(0 if "--help" in sys.argv or "-h" in sys.argv else 1)

    # Parse args
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    input_path = positional[0]
    output_dir = positional[1] if len(positional) > 1 else "."
    do_enrich = "--enrich" in sys.argv

    cache_dir = output_dir
    if "--cache-dir" in sys.argv:
        idx = sys.argv.index("--cache-dir")
        if idx + 1 < len(sys.argv):
            cache_dir = sys.argv[idx + 1]

    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found")
        sys.exit(1)

    print(f"Transforming: {input_path}")
    print(f"Output dir:   {output_dir}")
    print(f"Enrichment:   {'ON' if do_enrich else 'OFF (use --enrich to enable)'}")
    print()

    # Build Scryfall lookup if enrichment requested
    scryfall_lookup = None
    if do_enrich:
        print("── Scryfall enrichment ──")
        cache_path = download_scryfall_bulk(cache_dir)
        scryfall_lookup = build_scryfall_lookup(cache_path)
        print()

    stats = transform(input_path, output_dir, scryfall_lookup)

    print("═" * 50)
    print("TRANSFORMATION COMPLETE")
    print("═" * 50)
    print(f"Input rows:          {stats['total_rows']:,}")
    print(f"Unique cards:        {len(stats['unique_cards']):,}")
    print()
    print(f"Written — main:      {stats['written']['main']:,} rows")
    print(f"Written — frank:     {stats['written']['frank']:,} rows")
    print(f"Written — rc:        {stats['written']['rc']:,} rows")
    print(f"Total written:       {sum(stats['written'].values()):,} rows")
    print()
    print(f"Skipped (no set map): {stats['skipped_unmappable_set']:,}")
    print(f"Skipped (overflow):   {stats['skipped_overflow']:,}")
    print(f"Duplicates merged:    {stats['aggregated_dupes']:,}")
    print()
    print("── Matching identifier coverage ──")
    print(f"With TCGPlayer ID:    {stats['with_tcgplayer_id']:,} ({stats['with_tcgplayer_id']/stats['total_rows']*100:.1f}%)")
    print(f"With collector #:     {stats['with_collector_number']:,} ({stats['with_collector_number']/stats['total_rows']*100:.1f}%)")
    print(f"With either (Tier 3/4): {stats['with_either']:,} ({stats['with_either']/stats['total_rows']*100:.1f}%)")

    if do_enrich:
        print()
        print("── Enrichment results ──")
        print(f"Collector # filled:   {stats['enriched_cn']:,}")
        print(f"TCGPlayer ID filled:  {stats['enriched_tcg']:,}")
        print(f"No Scryfall match:    {stats['enriched_miss']:,}")

    if stats["unmapped_sets"]:
        print(f"\nUnmapped set codes ({len(stats['unmapped_sets'])}):")
        for code in sorted(stats["unmapped_sets"]):
            print(f"  {code}")


if __name__ == "__main__":
    main()
