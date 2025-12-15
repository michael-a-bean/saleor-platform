#!/bin/bash
# Setup DynamoDB table for Stripe app
# Run this after starting the dynamodb-local container

set -e

ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:8001}"
TABLE_NAME="${DYNAMODB_MAIN_TABLE_NAME:-stripe-main-table}"

echo "Setting up DynamoDB table: $TABLE_NAME at $ENDPOINT_URL"

# Check if table exists
TABLE_EXISTS=$(aws dynamodb describe-table \
  --table-name "$TABLE_NAME" \
  --endpoint-url "$ENDPOINT_URL" \
  --region localhost \
  2>/dev/null && echo "yes" || echo "no")

if [ "$TABLE_EXISTS" = "yes" ]; then
  echo "Table $TABLE_NAME already exists - skipping creation"
  exit 0
fi

# Create table
aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --endpoint-url "$ENDPOINT_URL" \
  --region localhost \
  --no-cli-pager

echo "Table $TABLE_NAME created successfully"
