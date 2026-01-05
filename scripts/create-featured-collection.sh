#!/bin/bash
# Script to create a featured collection with iconic MTG cards

set -e
API_URL="http://localhost:8000/graphql/"

# Get auth token
echo "Getting auth token..."
AUTH_RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { tokenCreate(email: \"admin@example.com\", password: \"admin\") { token } }"}')

# Extract token (note: Saleor API returns JSON with spaces like "token": "xxx")
TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"token": "[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get auth token. Response:"
  echo "$AUTH_RESPONSE"
  exit 1
fi
echo "Got token: ${TOKEN:0:50}..."

# Get channel ID for webstore
echo "Getting webstore channel ID..."
CHANNEL_RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "{ channels { id slug } }"}')
echo "Channels: $CHANNEL_RESPONSE"

# Find the webstore channel - extract ID from the JSON
# The response has spaces, e.g., "id": "xxx", "slug": "webstore"
CHANNEL_ID=$(echo "$CHANNEL_RESPONSE" | grep -o '"id": "[^"]*", "slug": "webstore"' | head -1 | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
if [ -z "$CHANNEL_ID" ]; then
  # Try alternative pattern (no space after colon)
  CHANNEL_ID=$(echo "$CHANNEL_RESPONSE" | grep -o '"id":"[^"]*","slug":"webstore"' | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
fi
echo "Channel ID: $CHANNEL_ID"

# Create the featured collection (description must be null or JSON string)
echo "Creating featured collection..."
COLLECTION_RESULT=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { collectionCreate(input: { name: \"Featured Cards\", slug: \"featured\" }) { collection { id name slug } errors { field message code } } }"}')

echo "Collection result: $COLLECTION_RESULT"

# Extract collection ID (with space after colon)
COLLECTION_ID=$(echo "$COLLECTION_RESULT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "Collection ID: $COLLECTION_ID"

if [ -z "$COLLECTION_ID" ]; then
  echo "Trying to get existing collection..."
  EXISTING_RESULT=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"query": "{ collection(slug: \"featured\", channel: \"webstore\") { id } }"}')
  echo "Existing result: $EXISTING_RESULT"
  COLLECTION_ID=$(echo "$EXISTING_RESULT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
  echo "Existing collection ID: $COLLECTION_ID"
fi

if [ -z "$COLLECTION_ID" ]; then
  echo "ERROR: Could not create or find featured collection"
  exit 1
fi

# Add products to the collection - iconic MTG cards
echo "Adding products to collection..."
ADD_RESULT=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\": \"mutation { collectionAddProducts(collectionId: \\\"$COLLECTION_ID\\\", products: [\\\"UHJvZHVjdDoxMDI3NTY=\\\", \\\"UHJvZHVjdDoxMDA0MjE=\\\", \\\"UHJvZHVjdDo3NDA3OQ==\\\", \\\"UHJvZHVjdDoxMDY4NDI=\\\", \\\"UHJvZHVjdDo4ODgzMA==\\\", \\\"UHJvZHVjdDoxMDM5NTM=\\\", \\\"UHJvZHVjdDo0NDE1NQ==\\\", \\\"UHJvZHVjdDo5ODc5NQ==\\\", \\\"UHJvZHVjdDo5OTE1OA==\\\", \\\"UHJvZHVjdDo4MTYxOA==\\\", \\\"UHJvZHVjdDoxMDY2MzA=\\\", \\\"UHJvZHVjdDo5ODg0MQ==\\\"]) { collection { id products(first: 15) { totalCount } } errors { field message } } }\"}")

echo "Add products result: $ADD_RESULT"

# Assign collection to webstore channel
echo "Assigning to webstore channel..."
if [ -n "$CHANNEL_ID" ]; then
  CHANNEL_RESULT=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"query\": \"mutation { collectionChannelListingUpdate(id: \\\"$COLLECTION_ID\\\", input: { addChannels: [{ channelId: \\\"$CHANNEL_ID\\\", isPublished: true }] }) { collection { id channelListings { channel { slug } isPublished } } errors { field message } } }\"}")
  echo "Channel assignment result: $CHANNEL_RESULT"
else
  echo "WARNING: No channel ID found, skipping channel assignment"
fi

# Verify the collection
echo ""
echo "Verifying collection..."
VERIFY_RESULT=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ collection(slug: \"featured\", channel: \"webstore\") { id name products(first: 15) { totalCount edges { node { name } } } } }"}')
echo "Collection verification: $VERIFY_RESULT"

echo ""
echo "Done!"
