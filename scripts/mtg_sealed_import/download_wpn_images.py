#!/usr/bin/env python3
"""
Download WPN marketing images for MTG sealed products.

This script:
1. Downloads product shot ZIPs from WPN media CDN
2. Extracts front-view images (angle _01)
3. Organizes by set code for later upload to Saleor

URL Pattern: https://media.wizards.com/{year}/wpn/marketing_materials/{set_code}/{set_code}_pds_en.zip

Usage:
    python download_wpn_images.py --sets dsk,fdn,blb --output-dir ./images
    python download_wpn_images.py --year 2024 --output-dir ./images
"""

import argparse
import os
import re
import shutil
import zipfile
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError

# WPN image filename patterns -> product type mapping
# Order matters - more specific patterns should come first
IMAGE_TYPE_MAP = {
    # Display Boxes (booster boxes)
    "DspBx_Play": "play-booster-box",
    "DspBxPlay": "play-booster-box",
    "DspBx_Clctr": "collector-booster-box",
    "DspBxClctr": "collector-booster-box",
    "DspBx_Draft": "draft-booster-box",
    "DspBx_Set": "set-booster-box",
    "DspBx_Jmp": "jumpstart-box",
    # Boosters (packs)
    "Bstr_Play": "play-booster-pack",
    "PlayBstr": "play-booster-pack",
    "Bstr_Clctr": "collector-booster-pack",
    "ClctrBstr": "collector-booster-pack",
    "ClctrSmplBstr": "collector-booster-pack",
    "Bstr_Jmp": "jumpstart-booster",
    # Bundles
    "OtrBx_Bndl": "bundle",
    "BndlOtrBx": "bundle",
    "BndlGft_OtrBx": "bundle",
    # Prerelease
    "Bstr_Prrl": "prerelease-kit",
    "OtrBx_Prrls": "prerelease-kit",
    "Prrls_OtrBx": "prerelease-kit",
    "Prrls_DkBx": "prerelease-kit",
    # Starter Kits
    "OtrBx_Bgnr": "starter-kit",
    "OtrBx_StrtrClctr": "starter-kit",
    "OtrBx_StrtrKt": "starter-kit",
    # Commander Decks (more specific patterns first)
    "OtrBx_CmndrClctr": "commander-deck",
    "OtrBx_Cmndr": "commander-deck",
    "Cmndr_OtrBx": "commander-deck",
    "Cmdr_OtrBx": "commander-deck",
    "CmdrDck": "commander-deck",
    "Cmdr": "commander-deck",
}

# Recent sets with known WPN URLs (set_code: [years to try])
# WotC sometimes uploads marketing materials in the prior year
KNOWN_SETS = {
    # 2023 sets
    "pip": [2023],  # Fallout (Universes Beyond)
    # 2024 sets
    "mkm": [2024],  # Murders at Karlov Manor (uses cluedo variant URL)
    "otj": [2024],  # Outlaws of Thunder Junction
    "mh3": [2024],  # Modern Horizons 3
    "blb": [2024],  # Bloomburrow
    "dsk": [2024],  # Duskmourn
    "fdn": [2024],  # Foundations
    # 2025 sets (often available under prior year)
    "dft": [2024, 2025],  # Aetherdrift - uploaded to 2024 path
    "ecl": [2025, 2024],  # Lorwyn Eclipsed (upcoming)
    "tmt": [2025, 2024],  # TMNT (upcoming)
    "spm": [2025, 2024],  # Spider-Man
}


# URL filename patterns to try for each set
URL_PATTERNS = [
    "{set}_pds_en.zip",                    # Standard pattern
    "{set}_pds_preorder_en.zip",           # Preorder variant (PIP/Fallout)
    "{set}_pds_preorder_cluedo_en.zip",    # MKM/Cluedo variant
    "{set}_onlinestore_assets_en.zip",     # Alternative pattern
]


def download_wpn_zip(set_code: str, year: int, output_dir: Path) -> Path | None:
    """Download WPN product shots ZIP for a set, trying multiple URL patterns."""
    base_url = f"https://media.wizards.com/{year}/wpn/marketing_materials/{set_code}"

    for pattern in URL_PATTERNS:
        filename = pattern.format(set=set_code)
        url = f"{base_url}/{filename}"
        zip_path = output_dir / filename

        print(f"  Trying: {url}")

        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(req, timeout=60) as response:
                with open(zip_path, "wb") as f:
                    shutil.copyfileobj(response, f)
            print(f"  Downloaded: {zip_path.name} ({zip_path.stat().st_size / 1024 / 1024:.1f} MB)")
            return zip_path
        except HTTPError as e:
            if e.code == 404:
                continue  # Try next pattern
            else:
                print(f"  HTTP Error: {e.code}")
                continue
        except Exception as e:
            print(f"  Error: {e}")
            continue

    print(f"  Not found with any URL pattern")
    return None


def extract_front_images(zip_path: Path, output_dir: Path, set_code: str) -> list:
    """Extract front-view product images from ZIP."""
    extracted = []
    set_dir = output_dir / set_code

    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            # Only PNG files
            if not name.lower().endswith(".png"):
                continue

            # Only front view (angle 01)
            if "_01_01.png" not in name and "_01.png" not in name:
                # Also include single-angle images
                if re.search(r"_\d+_\d+\.png$", name):
                    continue

            # Extract filename
            filename = os.path.basename(name)
            if not filename:
                continue

            # Determine product type from filename
            product_type = None
            for pattern, ptype in IMAGE_TYPE_MAP.items():
                if pattern in filename:
                    product_type = ptype
                    break

            if not product_type:
                # Keep for manual review
                product_type = "unknown"

            # Create output directory
            type_dir = set_dir / product_type
            type_dir.mkdir(parents=True, exist_ok=True)

            # Extract file
            out_path = type_dir / filename
            with zf.open(name) as src, open(out_path, "wb") as dst:
                shutil.copyfileobj(src, dst)

            extracted.append({
                "filename": filename,
                "product_type": product_type,
                "path": str(out_path),
            })

    return extracted


def main():
    parser = argparse.ArgumentParser(description="Download WPN marketing images")
    parser.add_argument(
        "--sets",
        type=str,
        default="",
        help="Comma-separated set codes to download (e.g., dsk,fdn,blb)",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=0,
        help="Download all known sets from this year",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./wpn_images",
        help="Output directory for images",
    )
    parser.add_argument(
        "--keep-zips",
        action="store_true",
        help="Keep downloaded ZIP files",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Determine which sets to download
    sets_to_download = []

    if args.sets:
        for code in args.sets.split(","):
            code = code.strip().lower()
            years = KNOWN_SETS.get(code, [2024])  # Default to [2024]
            if isinstance(years, int):
                years = [years]  # Handle legacy single-year format
            sets_to_download.append((code, years))
    elif args.year:
        for code, years in KNOWN_SETS.items():
            if isinstance(years, int):
                years = [years]
            if args.year in years:
                sets_to_download.append((code, years))
    else:
        # Download all known sets
        for code, years in KNOWN_SETS.items():
            if isinstance(years, int):
                years = [years]
            sets_to_download.append((code, years))

    print(f"WPN Image Downloader")
    print(f"=" * 50)
    print(f"Output directory: {output_dir}")
    print(f"Sets to download: {len(sets_to_download)}")
    print()

    stats = {"downloaded": 0, "failed": 0, "images": 0}

    for set_code, years in sets_to_download:
        print(f"\n{set_code.upper()}:")

        # Try each year until one succeeds
        zip_path = None
        for year in years:
            zip_path = download_wpn_zip(set_code, year, output_dir)
            if zip_path:
                break

        if zip_path:
            stats["downloaded"] += 1

            # Extract images
            images = extract_front_images(zip_path, output_dir, set_code)
            stats["images"] += len(images)
            print(f"  Extracted {len(images)} front-view images")

            # Group by product type
            by_type = {}
            for img in images:
                ptype = img["product_type"]
                by_type[ptype] = by_type.get(ptype, 0) + 1

            for ptype, count in sorted(by_type.items()):
                print(f"    {ptype}: {count}")

            # Optionally remove ZIP
            if not args.keep_zips:
                zip_path.unlink()
        else:
            stats["failed"] += 1

    print(f"\n" + "=" * 50)
    print(f"Summary:")
    print(f"  Downloaded: {stats['downloaded']} sets")
    print(f"  Failed:     {stats['failed']} sets")
    print(f"  Images:     {stats['images']} files")
    print(f"\nImages saved to: {output_dir}")


if __name__ == "__main__":
    main()
