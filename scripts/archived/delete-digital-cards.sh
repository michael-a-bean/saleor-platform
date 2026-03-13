#!/bin/bash
# Script to delete all digital-only MTG cards from Saleor inventory
# Uses productBulkDelete for efficient batch deletion

set -e
API_URL="http://localhost:8000/graphql/"
BATCH_SIZE=100

echo "=== Delete Digital-Only Cards ==="
echo ""

# Get auth token
get_token() {
  AUTH_RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d '{"query": "mutation { tokenCreate(email: \"admin@example.com\", password: \"admin\") { token } }"}')
  echo "$AUTH_RESPONSE" | grep -o '"token": "[^"]*"' | cut -d'"' -f4
}

echo "Getting auth token..."
TOKEN=$(get_token)
if [ -z "$TOKEN" ]; then
  echo "Failed to get auth token"
  exit 1
fi
echo "Got token: ${TOKEN:0:50}..."

# Count digital products
echo ""
echo "Counting digital-only products..."
COUNT_RESULT=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "{ products(first: 1, channel: \"webstore\", filter: { attributes: [{ slug: \"mtg-is-digital\", values: [\"mtg-is-digital-yes\"] }] }) { totalCount } }"}')

TOTAL_COUNT=$(echo "$COUNT_RESULT" | grep -o '"totalCount": [0-9]*' | grep -o '[0-9]*')
echo "Found $TOTAL_COUNT digital-only products to delete"

if [ "$TOTAL_COUNT" -eq 0 ]; then
  echo "No digital products to delete!"
  exit 0
fi

# Confirm deletion
echo ""
echo "WARNING: This will permanently delete $TOTAL_COUNT products!"
echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
sleep 5

# Delete in batches using productBulkDelete
DELETED=0
BATCH_NUM=0
TOKEN_TIME=$(date +%s)

echo ""
echo "Starting bulk deletion (batch size: $BATCH_SIZE)..."

while [ $DELETED -lt $TOTAL_COUNT ]; do
  BATCH_NUM=$((BATCH_NUM + 1))

  # Refresh token every 3 minutes
  CURRENT_TIME=$(date +%s)
  if [ $((CURRENT_TIME - TOKEN_TIME)) -gt 180 ]; then
    echo ""
    echo "Refreshing token..."
    TOKEN=$(get_token)
    TOKEN_TIME=$CURRENT_TIME
  fi

  # Fetch batch of digital product IDs
  BATCH_RESULT=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"query\": \"{ products(first: $BATCH_SIZE, channel: \\\"webstore\\\", filter: { attributes: [{ slug: \\\"mtg-is-digital\\\", values: [\\\"mtg-is-digital-yes\\\"] }] }) { edges { node { id } } } }\"}")

  # Extract product IDs into JSON array format
  IDS=$(echo "$BATCH_RESULT" | grep -o '"id": "[^"]*"' | cut -d'"' -f4 | tr '\n' ',' | sed 's/,$//' | sed 's/\([^,]*\)/"\1"/g')

  if [ -z "$IDS" ] || [ "$IDS" = '""' ]; then
    echo ""
    echo "No more digital products found."
    break
  fi

  # Bulk delete
  DELETE_RESULT=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"query\": \"mutation { productBulkDelete(ids: [$IDS]) { count errors { field message } } }\"}")

  # Extract count
  BATCH_DELETED=$(echo "$DELETE_RESULT" | grep -o '"count": [0-9]*' | grep -o '[0-9]*' || echo "0")

  if [ -n "$BATCH_DELETED" ] && [ "$BATCH_DELETED" -gt 0 ]; then
    DELETED=$((DELETED + BATCH_DELETED))
    echo -ne "\rBatch $BATCH_NUM: Deleted $DELETED / $TOTAL_COUNT ($((DELETED * 100 / TOTAL_COUNT))%)"
  else
    # Check for errors
    if echo "$DELETE_RESULT" | grep -q '"message"'; then
      echo ""
      echo "Error in batch $BATCH_NUM: $DELETE_RESULT"
      # Try to continue anyway
    fi
    # Safety break to avoid infinite loop
    if [ $BATCH_NUM -gt $((TOTAL_COUNT / BATCH_SIZE + 10)) ]; then
      echo ""
      echo "Safety limit reached, stopping."
      break
    fi
  fi
done

echo ""
echo ""
echo "=== Deletion Complete ==="
echo "Deleted: $DELETED products"

# Verify remaining
echo ""
echo "Verifying..."
VERIFY_RESULT=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "{ products(first: 1, channel: \"webstore\", filter: { attributes: [{ slug: \"mtg-is-digital\", values: [\"mtg-is-digital-yes\"] }] }) { totalCount } }"}')
REMAINING=$(echo "$VERIFY_RESULT" | grep -o '"totalCount": [0-9]*' | grep -o '[0-9]*')
echo "Remaining digital products: $REMAINING"
