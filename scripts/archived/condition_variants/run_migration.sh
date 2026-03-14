#!/bin/bash
#
# Condition Variants Migration Script
# Creates NM/LP/MP/HP/DMG variants for all MTG card products
#
# Usage:
#   ./run_migration.sh [--resume] [--limit N] [--batch-size N] [--dry-run]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANAGEMENT_CMD="create_condition_variants.py"
CONTAINER_CMD_PATH="/app/saleor/core/management/commands/${MANAGEMENT_CMD}"

echo "========================================"
echo "MTG Condition Variants Migration"
echo "========================================"
echo ""

# Check if API container is running
if ! docker compose ps api | grep -q "Up"; then
    echo "ERROR: Saleor API container is not running."
    echo "Start it with: docker compose up -d api"
    exit 1
fi

# Copy management command to container
echo "Copying management command to API container..."
docker compose cp "${SCRIPT_DIR}/${MANAGEMENT_CMD}" "api:${CONTAINER_CMD_PATH}"

# Make sure the commands directory exists
docker compose exec api mkdir -p /app/saleor/core/management/commands

# Copy the file
docker compose cp "${SCRIPT_DIR}/${MANAGEMENT_CMD}" "api:${CONTAINER_CMD_PATH}"

echo "Management command installed at: ${CONTAINER_CMD_PATH}"
echo ""

# Parse arguments
ARGS=""
DRY_RUN=false

for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            ARGS="$ARGS --dry-run"
            ;;
        *)
            ARGS="$ARGS $arg"
            ;;
    esac
done

if [ "$DRY_RUN" = true ]; then
    echo "Running in DRY RUN mode (no changes will be made)"
    echo ""
fi

# Run the migration
echo "Running migration..."
echo "Command: python manage.py create_condition_variants $ARGS"
echo ""
echo "----------------------------------------"

docker compose exec api python manage.py create_condition_variants $ARGS

echo "----------------------------------------"
echo ""
echo "Migration complete!"
echo ""

# Show summary
echo "Verification commands:"
echo "  # Count total variants:"
echo "  docker compose exec db psql -U saleor -d saleor -c \"SELECT COUNT(*) FROM product_productvariant;\""
echo ""
echo "  # Count variants by condition:"
echo "  docker compose exec db psql -U saleor -d saleor -c \\"
echo "    \"SELECT RIGHT(sku, 2) as condition, COUNT(*) FROM product_productvariant WHERE sku LIKE '%-__' GROUP BY RIGHT(sku, 2);\""
