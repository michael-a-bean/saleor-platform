#!/bin/bash
#
# MTG Finish Variants Migration Script
#
# This script orchestrates the full migration to add finish variants
# (Foil, Etched) to MTG cards in Saleor.
#
# Prerequisites:
# - Docker Compose running with api container
# - Scryfall all-cards.json downloaded
# - MTGJSON TcgplayerSkus.json downloaded
#
# Usage:
#   ./run_migration.sh [--dry-run] [--step N]
#
# Steps:
#   1. Create finish attribute (mtg-finish)
#   2. Migrate existing variants to Non-Foil
#   3. Create Foil and Etched variants
#   4. Sync TCGPlayer SKU mappings
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Data file locations
SCRYFALL_JSON="${PLATFORM_DIR}/docs/all-cards-20251214224928.json"
TCGPLAYER_SKUS_JSON="${PLATFORM_DIR}/docs/data/TcgplayerSkus.json"

# Parse arguments
DRY_RUN=""
START_STEP=1

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        --step)
            START_STEP="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=============================================="
echo "MTG Finish Variants Migration"
echo "=============================================="
echo "Platform dir: ${PLATFORM_DIR}"
echo "Scryfall JSON: ${SCRYFALL_JSON}"
echo "TCGPlayer SKUs: ${TCGPLAYER_SKUS_JSON}"
echo "Start step: ${START_STEP}"
echo "Dry run: ${DRY_RUN:-No}"
echo ""

# Check prerequisites
if [ ! -f "$SCRYFALL_JSON" ]; then
    echo "ERROR: Scryfall JSON not found at $SCRYFALL_JSON"
    echo "Please download from: https://api.scryfall.com/bulk-data"
    exit 1
fi

if [ ! -f "$TCGPLAYER_SKUS_JSON" ]; then
    echo "ERROR: TCGPlayer SKUs JSON not found at $TCGPLAYER_SKUS_JSON"
    echo "Run: curl -L -o TcgplayerSkus.json.zip https://mtgjson.com/api/v5/TcgplayerSkus.json.zip && unzip TcgplayerSkus.json.zip"
    exit 1
fi

# Check Docker
if ! docker compose ps api | grep -qE "(running|Up)"; then
    echo "ERROR: API container is not running"
    echo "Run: docker compose up -d api"
    exit 1
fi

# Copy scripts to container
echo "Copying migration scripts to container..."
docker compose cp "${SCRIPT_DIR}/create_finish_attribute.py" api:/app/saleor/core/management/commands/create_finish_attribute.py
docker compose cp "${SCRIPT_DIR}/migrate_existing_variants.py" api:/app/saleor/core/management/commands/migrate_finish_variants.py
docker compose cp "${SCRIPT_DIR}/create_finish_variants.py" api:/app/saleor/core/management/commands/create_finish_variants.py
docker compose cp "${SCRIPT_DIR}/sync_tcgplayer_skus.py" api:/app/saleor/core/management/commands/sync_tcgplayer_skus.py

# Copy data files (if not already present)
echo "Checking data files in container..."
if ! docker compose exec -T api test -f /app/scryfall-data.json; then
    echo "Copying Scryfall JSON to container (this may take a moment)..."
    docker compose cp "$SCRYFALL_JSON" api:/app/scryfall-data.json
fi

if ! docker compose exec -T api test -f /app/TcgplayerSkus.json; then
    echo "Copying TCGPlayer SKUs JSON to container..."
    docker compose cp "$TCGPLAYER_SKUS_JSON" api:/app/TcgplayerSkus.json
fi

# Step 1: Create finish attribute
if [ "$START_STEP" -le 1 ]; then
    echo ""
    echo "=============================================="
    echo "Step 1: Create finish attribute"
    echo "=============================================="
    docker compose exec -T api python manage.py create_finish_attribute $DRY_RUN
fi

# Step 2: Migrate existing variants to Non-Foil
if [ "$START_STEP" -le 2 ]; then
    echo ""
    echo "=============================================="
    echo "Step 2: Migrate existing variants"
    echo "=============================================="
    docker compose exec -T api python manage.py migrate_finish_variants /app/scryfall-data.json $DRY_RUN
fi

# Step 3: Create Foil and Etched variants
if [ "$START_STEP" -le 3 ]; then
    echo ""
    echo "=============================================="
    echo "Step 3: Create Foil and Etched variants"
    echo "=============================================="
    docker compose exec -T api python manage.py create_finish_variants /app/scryfall-data.json $DRY_RUN
fi

# Step 4: Sync TCGPlayer SKU mappings
if [ "$START_STEP" -le 4 ]; then
    echo ""
    echo "=============================================="
    echo "Step 4: Sync TCGPlayer SKU mappings"
    echo "=============================================="
    docker compose exec -T api python manage.py sync_tcgplayer_skus /app/TcgplayerSkus.json $DRY_RUN
fi

echo ""
echo "=============================================="
echo "Migration complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Run price sync to update foil/etched prices from Scryfall"
echo "2. Verify variants in Saleor Dashboard"
echo "3. Update storefront filters for finish attribute"
