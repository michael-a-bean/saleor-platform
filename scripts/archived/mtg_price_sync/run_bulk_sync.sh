#!/bin/bash
#
# Bulk Price Sync Runner
#
# Downloads Scryfall data and runs the bulk price sync script.
#
# Prerequisites:
#   - Python 3.x with psycopg2, requests
#   - Saleor API running at http://localhost:8000
#   - inventory-ops database at localhost:5433
#
# Usage:
#   ./run_bulk_sync.sh [--dry-run] [--limit N] [--resume]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/../../docs/data"
SCRYFALL_FILE="${DATA_DIR}/default-cards.json"
SCRYFALL_URL="https://data.scryfall.io/default-cards/default-cards-20260107.json"

# Default values
DRY_RUN=""
LIMIT=""
RESUME=""
INSTALLATION_ID="${INSTALLATION_ID:-}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        --limit)
            LIMIT="--limit $2"
            shift 2
            ;;
        --resume)
            RESUME="--resume"
            shift
            ;;
        --installation-id)
            INSTALLATION_ID="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check for installation ID
if [ -z "$INSTALLATION_ID" ]; then
    echo "Error: INSTALLATION_ID not set"
    echo ""
    echo "Get the installation ID from the database:"
    echo "  docker compose exec inventory-ops-db psql -U inventory inventory_ops -c 'SELECT id, \"saleorApiUrl\" FROM \"AppInstallation\" LIMIT 5;'"
    echo ""
    echo "Then run:"
    echo "  INSTALLATION_ID=<id> ./run_bulk_sync.sh"
    echo "  OR"
    echo "  ./run_bulk_sync.sh --installation-id <id>"
    exit 1
fi

# Create data directory if needed
mkdir -p "$DATA_DIR"

# Download Scryfall data if not exists or older than 24 hours
if [ ! -f "$SCRYFALL_FILE" ] || [ $(find "$SCRYFALL_FILE" -mmin +1440 2>/dev/null | wc -l) -gt 0 ]; then
    echo "Downloading Scryfall bulk data..."
    echo "  URL: $SCRYFALL_URL"

    # Try to get the latest bulk data URL
    BULK_DATA_URL=$(curl -s "https://api.scryfall.com/bulk-data" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data['data']:
    if item['type'] == 'default_cards':
        print(item['download_uri'])
        break
" 2>/dev/null || echo "$SCRYFALL_URL")

    echo "  Downloading from: $BULK_DATA_URL"
    curl -L -o "$SCRYFALL_FILE" "$BULK_DATA_URL"
    echo "  Downloaded: $(ls -lh "$SCRYFALL_FILE" | awk '{print $5}')"
else
    echo "Using existing Scryfall data: $SCRYFALL_FILE"
    echo "  Size: $(ls -lh "$SCRYFALL_FILE" | awk '{print $5}')"
fi

# Check if psycopg2 is installed
if ! python3 -c "import psycopg2" 2>/dev/null; then
    echo ""
    echo "Installing psycopg2..."
    pip3 install psycopg2-binary requests
fi

# Run the sync
echo ""
echo "Running bulk price sync..."
echo "  Installation ID: $INSTALLATION_ID"
echo "  Scryfall file: $SCRYFALL_FILE"
echo "  Options: $DRY_RUN $LIMIT $RESUME"
echo ""

python3 "${SCRIPT_DIR}/bulk_price_sync.py" \
    "$SCRYFALL_FILE" \
    --installation-id "$INSTALLATION_ID" \
    --channel-slug "webstore" \
    --db-url "postgresql://inventory:inventory@localhost:5433/inventory_ops" \
    $DRY_RUN $LIMIT $RESUME

echo ""
echo "Done!"
