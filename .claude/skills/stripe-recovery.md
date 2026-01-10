# Stripe App Recovery Procedure

## When to Use This

Use this procedure when you see any of these symptoms at checkout:

- "Missing payment gateway configuration"
- "Error fetching config: GetAuthDataError: Failed to get APL entry"
- Stripe payment option not appearing
- Stripe app logs showing "Config for channel not found"

## Root Cause

The Stripe app stores its configuration in DynamoDB (local). If the DynamoDB data is lost (container reset, table deleted, etc.), the app loses:

1. **APL (App Permission Layer)** - Authentication token linking app to Saleor
2. **StripeConfig** - Encrypted API keys
3. **ChannelConfigMapping** - Links channels to Stripe configs

## Diagnostic Steps

### 1. Check DynamoDB Table Exists

```bash
curl -s -X POST http://localhost:8001 \
  -H "Content-Type: application/x-amz-json-1.0" \
  -H "X-Amz-Target: DynamoDB_20120810.ListTables" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=local/20250109/us-east-1/dynamodb/aws4_request" \
  -d '{}'
```

Should show `stripe-main-table` in the list.

### 2. Check Table Contents

```bash
curl -s -X POST http://localhost:8001 \
  -H "Content-Type: application/x-amz-json-1.0" \
  -H "X-Amz-Target: DynamoDB_20120810.Scan" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=local/20250109/us-east-1/dynamodb/aws4_request" \
  -d '{"TableName": "stripe-main-table"}'
```

Should show 3 entries with `_et` values: `APL`, `StripeConfig`, `ChannelConfigMapping`.

### 3. Check Stripe App Logs

```bash
docker compose logs stripe-app --tail=20
```

Look for:
- `GetAuthDataError: Failed to get APL entry` = APL missing, needs reinstall
- `Config for channel not found` = StripeConfig or ChannelConfigMapping missing

## Recovery Procedure

### Step 1: Create DynamoDB Table (if missing)

```bash
curl -s -X POST http://localhost:8001 \
  -H "Content-Type: application/x-amz-json-1.0" \
  -H "X-Amz-Target: DynamoDB_20120810.CreateTable" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=local/20250109/us-east-1/dynamodb/aws4_request" \
  -d '{
    "TableName": "stripe-main-table",
    "KeySchema": [
      {"AttributeName": "PK", "KeyType": "HASH"},
      {"AttributeName": "SK", "KeyType": "RANGE"}
    ],
    "AttributeDefinitions": [
      {"AttributeName": "PK", "AttributeType": "S"},
      {"AttributeName": "SK", "AttributeType": "S"}
    ],
    "BillingMode": "PAY_PER_REQUEST"
  }'
```

### Step 2: Remove Old Stripe App Registration (if APL is broken)

```bash
docker compose exec -T db psql -U saleor << 'EOF'
BEGIN;
-- Clear payment transaction references
UPDATE payment_transactionevent SET app_id = NULL WHERE app_id IN (SELECT id FROM app_app WHERE identifier = 'saleor.app.payment.stripe');
UPDATE payment_transactionitem SET app_id = NULL WHERE app_id IN (SELECT id FROM app_app WHERE identifier = 'saleor.app.payment.stripe');
-- Clear webhook related
DELETE FROM core_eventdeliveryattempt WHERE delivery_id IN (SELECT id FROM core_eventdelivery WHERE webhook_id IN (SELECT id FROM webhook_webhook WHERE app_id IN (SELECT id FROM app_app WHERE identifier = 'saleor.app.payment.stripe')));
DELETE FROM core_eventdelivery WHERE webhook_id IN (SELECT id FROM webhook_webhook WHERE app_id IN (SELECT id FROM app_app WHERE identifier = 'saleor.app.payment.stripe'));
DELETE FROM webhook_webhookevent WHERE webhook_id IN (SELECT id FROM webhook_webhook WHERE app_id IN (SELECT id FROM app_app WHERE identifier = 'saleor.app.payment.stripe'));
DELETE FROM webhook_webhook WHERE app_id IN (SELECT id FROM app_app WHERE identifier = 'saleor.app.payment.stripe');
DELETE FROM app_app_permissions WHERE app_id IN (SELECT id FROM app_app WHERE identifier = 'saleor.app.payment.stripe');
DELETE FROM app_apptoken WHERE app_id IN (SELECT id FROM app_app WHERE identifier = 'saleor.app.payment.stripe');
DELETE FROM app_app WHERE identifier = 'saleor.app.payment.stripe';
COMMIT;
EOF
```

### Step 3: Reinstall Stripe App

```bash
# Get auth token (copy the full token from response)
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { tokenCreate(email: \"admin@example.com\", password: \"admin\") { token } }"}'

# Install app (replace TOKEN with actual token)
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"query": "mutation { appInstall(input: { appName: \"Stripe\", manifestUrl: \"http://host.docker.internal:3001/api/manifest\", permissions: [HANDLE_PAYMENTS] }) { appInstallation { id status } errors { message } } }"}'
```

Wait 5 seconds for installation to complete.

### Step 4: Get New App ID

```bash
docker compose exec -T db psql -U saleor -c "SELECT id FROM app_app WHERE identifier = 'saleor.app.payment.stripe';"
```

Convert to base64: `echo -n "App:ID" | base64` (e.g., App:9 becomes QXBwOjk=)

### Step 5: Encrypt Stripe Keys

Run inside the Stripe container:

```bash
docker compose exec -T stripe-app node -e "
const crypto = require('crypto');
const secret = '677a28c7a3f6f9b615a3dbe4657d0cf816080e482a432892f0b4c5f07dce0b54';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secret, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

const restrictedKey = 'YOUR_STRIPE_SECRET_KEY';
const webhookSecret = 'whsec_placeholder_for_local_dev';

console.log('RK:', encrypt(restrictedKey));
console.log('WH:', encrypt(webhookSecret));
"
```

### Step 6: Insert Configuration

Replace `APP_ID_BASE64` with your base64 app ID, and `ENCRYPTED_RK`/`ENCRYPTED_WH` with encrypted values:

```bash
# Insert StripeConfig
curl -s -X POST http://localhost:8001 \
  -H "Content-Type: application/x-amz-json-1.0" \
  -H "X-Amz-Target: DynamoDB_20120810.PutItem" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=local/20250109/us-east-1/dynamodb/aws4_request" \
  -d '{
    "TableName": "stripe-main-table",
    "Item": {
      "PK": {"S": "http://localhost:8000/graphql/#APP_ID_BASE64"},
      "SK": {"S": "CONFIG_ID#config-webstore-1"},
      "_et": {"S": "StripeConfig"},
      "configId": {"S": "config-webstore-1"},
      "configName": {"S": "Webstore Config"},
      "stripePk": {"S": "YOUR_STRIPE_PUBLISHABLE_KEY"},
      "stripeRk": {"S": "ENCRYPTED_RK"},
      "stripeWhId": {"S": "we_placeholder_local"},
      "stripeWhSecret": {"S": "ENCRYPTED_WH"},
      "createdAt": {"S": "2026-01-10T00:00:00.000Z"},
      "modifiedAt": {"S": "2026-01-10T00:00:00.000Z"}
    }
  }'

# Insert ChannelConfigMapping (Q2hhbm5lbDox = Channel:1 = webstore)
curl -s -X POST http://localhost:8001 \
  -H "Content-Type: application/x-amz-json-1.0" \
  -H "X-Amz-Target: DynamoDB_20120810.PutItem" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=local/20250109/us-east-1/dynamodb/aws4_request" \
  -d '{
    "TableName": "stripe-main-table",
    "Item": {
      "PK": {"S": "http://localhost:8000/graphql/#APP_ID_BASE64"},
      "SK": {"S": "CHANNEL_ID#Q2hhbm5lbDox"},
      "_et": {"S": "ChannelConfigMapping"},
      "channelId": {"S": "Q2hhbm5lbDox"},
      "configId": {"S": "config-webstore-1"},
      "createdAt": {"S": "2026-01-10T00:00:00.000Z"},
      "modifiedAt": {"S": "2026-01-10T00:00:00.000Z"}
    }
  }'
```

### Step 7: Restart and Verify

```bash
docker compose restart stripe-app
sleep 5
docker compose logs stripe-app --tail=10
```

Look for `Successfully processed webhook request` with `httpsStatusCode: 200`.

## Key Reference Values

| Item | Value |
|------|-------|
| DynamoDB endpoint | http://localhost:8001 |
| Stripe app identifier | saleor.app.payment.stripe |
| Webstore channel ID (base64) | Q2hhbm5lbDox |
| Encryption secret (from env) | 677a28c7a3f6f9b615a3dbe4657d0cf816080e482a432892f0b4c5f07dce0b54 |

## DynamoDB Schema Reference

### APL Entry
- **PK**: `http://localhost:8000/graphql/`
- **SK**: `APL`
- Created automatically during app installation

### StripeConfig Entry
- **PK**: `{saleorApiUrl}#{appIdBase64}`
- **SK**: `CONFIG_ID#{configId}`
- Fields: `configName`, `stripePk`, `stripeRk` (encrypted), `stripeWhId`, `stripeWhSecret` (encrypted)

### ChannelConfigMapping Entry
- **PK**: `{saleorApiUrl}#{appIdBase64}`
- **SK**: `CHANNEL_ID#{channelIdBase64}`
- Fields: `channelId`, `configId`

## Prevention

To prevent data loss:
1. Use named Docker volumes for DynamoDB data
2. Back up DynamoDB table before major changes
3. Document Stripe API keys securely (they need to be re-encrypted if app is reinstalled)
