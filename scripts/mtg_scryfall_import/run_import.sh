#!/bin/bash
# Run MTG Scryfall import
#
# Usage: ./run_import.sh [--resume] [--limit N]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
JSON_FILE="$PROJECT_ROOT/docs/all-cards-20251214224928.json"
COMMAND_FILE="$SCRIPT_DIR/import_command.py"
CONTAINER_COMMAND_PATH="/app/saleor/core/management/commands/import_mtg_cards.py"
CONTAINER_JSON_PATH="/app/data/all-cards.json"

echo "=========================================="
echo "MTG Scryfall Import Runner"
echo "=========================================="
echo "Project root: $PROJECT_ROOT"
echo "JSON file: $JSON_FILE"
echo "Command file: $COMMAND_FILE"
echo ""

# Check files exist
if [ ! -f "$JSON_FILE" ]; then
    echo "ERROR: JSON file not found: $JSON_FILE"
    exit 1
fi

if [ ! -f "$COMMAND_FILE" ]; then
    echo "ERROR: Command file not found: $COMMAND_FILE"
    exit 1
fi

# Ensure management commands directory exists in container
echo "Creating management commands directory..."
docker compose exec -T api mkdir -p /app/saleor/core/management/commands/

# Copy management command to container
echo "Copying management command to container..."
docker compose cp "$COMMAND_FILE" api:"$CONTAINER_COMMAND_PATH"

# Create data directory and copy JSON (this may take a while for 2.3GB)
echo "Creating data directory in container..."
docker compose exec -T api mkdir -p /app/data/

echo "Copying JSON file to container (2.3GB - this may take a few minutes)..."
docker compose cp "$JSON_FILE" api:"$CONTAINER_JSON_PATH"

# Verify files were copied
echo "Verifying files..."
docker compose exec -T api ls -la "$CONTAINER_COMMAND_PATH"
docker compose exec -T api ls -lh "$CONTAINER_JSON_PATH"

# Create __init__.py if it doesn't exist
docker compose exec -T api touch /app/saleor/core/management/__init__.py
docker compose exec -T api touch /app/saleor/core/management/commands/__init__.py

# Run the import
echo ""
echo "=========================================="
echo "Starting import..."
echo "=========================================="

docker compose exec -T api python manage.py import_mtg_cards "$CONTAINER_JSON_PATH" "$@"

echo ""
echo "=========================================="
echo "Import complete!"
echo "=========================================="
