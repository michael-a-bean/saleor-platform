#!/bin/bash
#
# Sync Bestsellers Collection
#
# Runs the script to populate the bestsellers collection
# with top-selling products from Saleor's sales reports.
#
# Prerequisites:
#   1. Create a Saleor App or Service Account with permissions:
#      - MANAGE_PRODUCTS
#      - MANAGE_DISCOUNTS (for collection access)
#
#   2. Set environment variables (or create .env file):
#      export SALEOR_AUTH_TOKEN="your-app-token"
#
# Usage:
#   ./scripts/sync-bestsellers-collection.sh
#
# Cron example (daily at 3am):
#   0 3 * * * cd /path/to/saleor-platform && ./scripts/sync-bestsellers-collection.sh >> /var/log/bestsellers-sync.log 2>&1
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Load .env if it exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Check for required token
if [ -z "$SALEOR_AUTH_TOKEN" ]; then
    echo "Error: SALEOR_AUTH_TOKEN environment variable is required"
    echo ""
    echo "To create an auth token:"
    echo "  1. Go to Saleor Dashboard → Configuration → Webhooks & Events → Apps"
    echo "  2. Create a new App or use existing one"
    echo "  3. Generate an access token with MANAGE_PRODUCTS and MANAGE_DISCOUNTS permissions"
    echo "  4. Set: export SALEOR_AUTH_TOKEN=\"your-token\""
    exit 1
fi

# Default configuration (can be overridden via env vars)
export SALEOR_API_URL="${SALEOR_API_URL:-http://localhost:8000/graphql/}"
export BESTSELLERS_COLLECTION_SLUG="${BESTSELLERS_COLLECTION_SLUG:-bestsellers}"
export BESTSELLERS_LIMIT="${BESTSELLERS_LIMIT:-50}"
export REPORTING_PERIOD="${REPORTING_PERIOD:-THIS_MONTH}"
export CHANNEL_SLUG="${CHANNEL_SLUG:-webstore}"

echo "Starting bestsellers sync at $(date)"
node "$SCRIPT_DIR/sync-bestsellers-collection.mjs"
echo "Finished at $(date)"
