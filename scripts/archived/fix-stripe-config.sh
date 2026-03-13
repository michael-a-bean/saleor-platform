#!/bin/bash
#
# Fix Stripe App Configuration for Local Development
#
# This script properly inserts Stripe configuration into DynamoDB using
# the proper encryption format expected by the Stripe app.
#
# Usage:
#   ./scripts/fix-stripe-config.sh <publishable_key> <restricted_key> [webhook_secret]
#
# Example:
#   ./scripts/fix-stripe-config.sh pk_test_xxx rk_test_xxx whsec_xxx

set -e

# Configuration - STRIPE_APP_SECRET_KEY must be provided via environment
# (matches .env.example convention; falls back to SECRET_KEY for container use)
SECRET_KEY="${STRIPE_APP_SECRET_KEY:-$SECRET_KEY}"
if [[ -z "$SECRET_KEY" ]]; then
    echo "ERROR: STRIPE_APP_SECRET_KEY environment variable is required"
    echo "Generate one with: openssl rand -hex 32"
    exit 1
fi

if [[ ! "$SECRET_KEY" =~ ^[a-fA-F0-9]{64}$ ]]; then
    echo "ERROR: STRIPE_APP_SECRET_KEY must be a 64-character hex string (256 bits)"
    exit 1
fi
TABLE_NAME="stripe-main-table"
NETWORK="saleor-platform_saleor-backend-tier"
ENDPOINT="http://dynamodb-local:8000"

# Saleor identifiers
PK="http://localhost:8000/graphql/#QXBwOjQ="
CHANNEL_ID="Q2hhbm5lbDox"
CONFIG_ID="local-stripe-config"
CONFIG_NAME="Local Development"

# Parse arguments
STRIPE_PK="${1:-}"
STRIPE_RK="${2:-}"
# Default to a placeholder webhook secret for local dev (Stripe webhooks won't work, but checkout will)
WEBHOOK_SECRET="${3:-whsec_local_dev_placeholder_not_for_production}"

if [[ -z "$STRIPE_PK" || -z "$STRIPE_RK" ]]; then
    echo "Stripe Configuration Fixer for Local Development"
    echo "================================================"
    echo ""
    echo "Usage:"
    echo "  ./scripts/fix-stripe-config.sh <publishable_key> <restricted_key> [webhook_secret]"
    echo ""
    echo "Arguments:"
    echo "  publishable_key   Stripe publishable key (pk_test_xxx or pk_live_xxx)"
    echo "  restricted_key    Stripe RESTRICTED key (rk_test_xxx or rk_live_xxx)"
    echo "                    NOTE: Must be a restricted key, NOT a secret key (sk_xxx)"
    echo "  webhook_secret    Optional - Webhook signing secret from Stripe CLI (whsec_xxx)"
    echo ""
    echo "Prerequisites:"
    echo "  1. Create a restricted API key at https://dashboard.stripe.com/test/apikeys"
    echo "     Click 'Create restricted key' and enable these permissions:"
    echo "     - Payment Intents (write)"
    echo "     - Webhooks (write)"
    echo "     - Charges (write)"
    echo ""
    echo "  2. For local webhook testing, install Stripe CLI:"
    echo "     https://stripe.com/docs/stripe-cli"
    echo ""
    echo "  3. Get webhook secret by running:"
    echo "     stripe listen --print-secret"
    echo ""
    echo "Example:"
    echo "  ./scripts/fix-stripe-config.sh pk_test_51SeWpP... rk_test_51SeWpP... whsec_..."
    exit 1
fi

# Validate key formats
if [[ ! "$STRIPE_PK" =~ ^pk_(test|live)_ ]]; then
    echo "ERROR: Publishable key must start with pk_test_ or pk_live_"
    exit 1
fi

if [[ ! "$STRIPE_RK" =~ ^rk_(test|live)_ ]]; then
    echo "ERROR: You must use a RESTRICTED key (rk_test_xxx or rk_live_xxx)"
    echo "       Secret keys (sk_xxx) are NOT supported."
    echo ""
    echo "Create a restricted key at: https://dashboard.stripe.com/test/apikeys"
    echo "Click 'Create restricted key' and enable these permissions:"
    echo "  - Payment Intents (write)"
    echo "  - Webhooks (write)"
    echo "  - Charges (write)"
    exit 1
fi

# Check environment consistency
if [[ "$STRIPE_PK" =~ ^pk_test_ ]]; then
    PK_ENV="TEST"
else
    PK_ENV="LIVE"
fi

if [[ "$STRIPE_RK" =~ ^rk_test_ ]]; then
    RK_ENV="TEST"
else
    RK_ENV="LIVE"
fi

if [[ "$PK_ENV" != "$RK_ENV" ]]; then
    echo "ERROR: Key environment mismatch - PK is $PK_ENV but RK is $RK_ENV"
    exit 1
fi

echo "Stripe Configuration Fixer"
echo "=========================="
echo "Environment: $PK_ENV"
echo "Publishable Key: ${STRIPE_PK:0:20}..."
echo "Restricted Key: ${STRIPE_RK:0:20}..."
if [[ -n "$WEBHOOK_SECRET" ]]; then
    echo "Webhook Secret: ${WEBHOOK_SECRET:0:15}..."
else
    echo "Webhook Secret: (not provided)"
fi
echo ""

# AES-256-CBC encryption function using openssl
# Format: iv_hex:encrypted_hex (matches saleor-apps Encryptor)
encrypt() {
    local text="$1"
    local iv_hex=$(openssl rand -hex 16)

    # Encrypt using AES-256-CBC and output as hex
    local encrypted_hex=$(echo -n "$text" | openssl enc -aes-256-cbc -K "$SECRET_KEY" -iv "$iv_hex" 2>/dev/null | xxd -p | tr -d '\n')

    echo "${iv_hex}:${encrypted_hex}"
}

# Helper function to run AWS CLI commands via Docker
aws_cmd() {
    docker run --rm \
        --network="$NETWORK" \
        -e AWS_ACCESS_KEY_ID=local \
        -e AWS_SECRET_ACCESS_KEY=local \
        amazon/aws-cli \
        --endpoint-url "$ENDPOINT" \
        --region localhost \
        "$@" 2>/dev/null
}

echo "Step 1: Cleaning up existing data..."
# Get existing items
ITEMS=$(aws_cmd dynamodb scan --table-name "$TABLE_NAME" --output json || echo '{"Items":[]}')

# Extract and delete each item
echo "$ITEMS" | grep -oP '"SK":\s*\{"S":\s*"\K[^"]+' | while read -r SK; do
    if [[ -n "$SK" ]]; then
        echo "  Deleting: $SK"
        aws_cmd dynamodb delete-item \
            --table-name "$TABLE_NAME" \
            --key "{\"PK\": {\"S\": \"$PK\"}, \"SK\": {\"S\": \"$SK\"}}" || true
    fi
done
echo "  Done."

echo ""
echo "Step 2: Creating encrypted configuration..."

# Get current timestamp in ISO format
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Encrypt sensitive data
ENCRYPTED_RK=$(encrypt "$STRIPE_RK")
if [[ -n "$WEBHOOK_SECRET" ]]; then
    ENCRYPTED_WH=$(encrypt "$WEBHOOK_SECRET")
else
    ENCRYPTED_WH=$(encrypt "")
fi

echo "  Encrypted RK: ${ENCRYPTED_RK:0:40}..."
echo "  Encrypted WH: ${ENCRYPTED_WH:0:40}..."

# Create config item JSON
CONFIG_JSON=$(cat << EOF
{
    "PK": {"S": "$PK"},
    "SK": {"S": "CONFIG_ID#$CONFIG_ID"},
    "configId": {"S": "$CONFIG_ID"},
    "configName": {"S": "$CONFIG_NAME"},
    "stripePk": {"S": "$STRIPE_PK"},
    "stripeRk": {"S": "$ENCRYPTED_RK"},
    "stripeWhId": {"S": ""},
    "stripeWhSecret": {"S": "$ENCRYPTED_WH"},
    "createdAt": {"S": "$NOW"},
    "modifiedAt": {"S": "$NOW"},
    "_et": {"S": "StripeConfig"}
}
EOF
)

aws_cmd dynamodb put-item \
    --table-name "$TABLE_NAME" \
    --item "$CONFIG_JSON"

echo "  Created config: $CONFIG_ID"

echo ""
echo "Step 3: Creating channel mapping..."

# Create channel mapping JSON
MAPPING_JSON=$(cat << EOF
{
    "PK": {"S": "$PK"},
    "SK": {"S": "CHANNEL_ID#$CHANNEL_ID"},
    "channelId": {"S": "$CHANNEL_ID"},
    "configId": {"S": "$CONFIG_ID"},
    "createdAt": {"S": "$NOW"},
    "modifiedAt": {"S": "$NOW"},
    "_et": {"S": "ChannelConfigMapping"}
}
EOF
)

aws_cmd dynamodb put-item \
    --table-name "$TABLE_NAME" \
    --item "$MAPPING_JSON"

echo "  Mapped channel $CHANNEL_ID -> $CONFIG_ID"

echo ""
echo "Step 4: Verifying configuration..."
VERIFY=$(aws_cmd dynamodb scan --table-name "$TABLE_NAME" --output json)
COUNT=$(echo "$VERIFY" | grep -c '"SK"' || echo "0")
echo "  Found $COUNT items in table"

echo ""
echo "✓ Configuration complete!"
echo ""
echo "Next steps:"
echo "1. Restart the Stripe app to pick up new config:"
echo "   docker compose restart stripe-app"
echo ""
echo "2. For webhook testing, run Stripe CLI in a separate terminal:"
echo "   stripe listen --forward-to localhost:3001/api/webhooks/stripe/$CONFIG_ID/http%3A%2F%2Flocalhost%3A8000%2Fgraphql%2F"
echo ""
echo "3. Test checkout at http://localhost:3000"
