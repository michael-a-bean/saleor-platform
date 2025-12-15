/**
 * Stripe Configuration Helper - Run inside stripe-app container
 *
 * Usage:
 *   docker compose exec stripe-app node /scripts/stripe-config-helper.mjs \
 *     --pk "pk_test_xxx" \
 *     --rk "rk_test_xxx" \
 *     --webhook-secret "whsec_xxx"
 */

import crypto from "node:crypto";
import { DynamoDBClient, PutItemCommand, DeleteItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";

// Configuration from environment (set in docker-compose.yml)
const SECRET_KEY = process.env.SECRET_KEY || "677a28c7a3f6f9b615a3dbe4657d0cf816080e482a432892f0b4c5f07dce0b54";
const DYNAMODB_ENDPOINT = process.env.AWS_ENDPOINT_URL || "http://dynamodb-local:8000";
const TABLE_NAME = process.env.DYNAMODB_MAIN_TABLE_NAME || "stripe-main-table";

// Saleor identifiers
const SALEOR_API_URL = "http://localhost:8000/graphql/";
const APP_ID = "QXBwOjQ="; // Base64 of "App:4"
const CHANNEL_ID = "Q2hhbm5lbDox"; // Base64 of "Channel:1"
const CONFIG_ID = "local-stripe-config";
const CONFIG_NAME = "Local Development";

// Encryption helper (matches saleor-apps encryptor)
function encrypt(text, secret) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secret, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "").replace(/-/g, "_");
    const value = args[i + 1];
    if (key && value) {
      result[key] = value;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  // Validate arguments
  if (!args.pk || !args.rk) {
    console.log(`
Stripe Configuration Helper
===========================

This script creates proper encrypted Stripe configuration in DynamoDB.

Usage (run inside stripe-app container):
  docker compose exec stripe-app node /scripts/stripe-config-helper.mjs \\
    --pk <publishable_key> \\
    --rk <restricted_key> \\
    [--webhook-secret <secret>]

Arguments:
  --pk              Stripe publishable key (pk_test_xxx or pk_live_xxx)
  --rk              Stripe RESTRICTED key (rk_test_xxx or rk_live_xxx)
                    NOTE: Must be a restricted key, NOT a secret key (sk_xxx)
  --webhook-secret  Webhook signing secret from Stripe CLI (whsec_xxx)
                    Optional - get from: stripe listen --print-secret

Create a restricted key at: https://dashboard.stripe.com/test/apikeys
with these permissions:
  - Payment Intents (write)
  - Webhooks (write)
  - Charges (write)
`);
    process.exit(1);
  }

  // Validate key formats
  if (!args.pk.startsWith("pk_test_") && !args.pk.startsWith("pk_live_")) {
    console.error("ERROR: Publishable key must start with pk_test_ or pk_live_");
    process.exit(1);
  }

  if (!args.rk.startsWith("rk_test_") && !args.rk.startsWith("rk_live_")) {
    console.error("ERROR: You must use a RESTRICTED key (rk_test_xxx or rk_live_xxx)");
    console.error("       Secret keys (sk_xxx) are NOT supported.");
    process.exit(1);
  }

  const pkEnv = args.pk.startsWith("pk_test_") ? "TEST" : "LIVE";
  const rkEnv = args.rk.startsWith("rk_test_") ? "TEST" : "LIVE";
  if (pkEnv !== rkEnv) {
    console.error(`ERROR: Key environment mismatch - PK is ${pkEnv} but RK is ${rkEnv}`);
    process.exit(1);
  }

  const webhookSecret = args.webhook_secret || "";

  console.log("Stripe Configuration Helper");
  console.log("===========================");
  console.log(`Endpoint: ${DYNAMODB_ENDPOINT}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Environment: ${pkEnv}`);
  console.log(`Publishable Key: ${args.pk.slice(0, 20)}...`);
  console.log(`Restricted Key: ${args.rk.slice(0, 20)}...`);
  console.log(`Webhook Secret: ${webhookSecret ? webhookSecret.slice(0, 15) + "..." : "(not provided)"}`);
  console.log("");

  // Create DynamoDB client
  const client = new DynamoDBClient({
    endpoint: DYNAMODB_ENDPOINT,
    region: "localhost",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  });

  const PK = `${SALEOR_API_URL}#${APP_ID}`;

  // Step 1: Delete existing items
  console.log("Step 1: Cleaning up existing data...");

  try {
    const scanResult = await client.send(new ScanCommand({ TableName: TABLE_NAME }));

    for (const item of scanResult.Items || []) {
      const pk = item.PK?.S;
      const sk = item.SK?.S;
      if (pk && sk) {
        console.log(`  Deleting: ${sk}`);
        await client.send(new DeleteItemCommand({
          TableName: TABLE_NAME,
          Key: { PK: { S: pk }, SK: { S: sk } },
        }));
      }
    }
    console.log("  Done.");
  } catch (err) {
    console.log(`  Warning: ${err.message}`);
  }

  // Step 2: Insert config
  console.log("\nStep 2: Creating encrypted configuration...");

  const now = new Date().toISOString();
  const encryptedRk = encrypt(args.rk, SECRET_KEY);
  const encryptedWhSecret = encrypt(webhookSecret, SECRET_KEY);

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: { S: PK },
      SK: { S: `CONFIG_ID#${CONFIG_ID}` },
      configId: { S: CONFIG_ID },
      configName: { S: CONFIG_NAME },
      stripePk: { S: args.pk },
      stripeRk: { S: encryptedRk },
      stripeWhId: { S: "" },
      stripeWhSecret: { S: encryptedWhSecret },
      createdAt: { S: now },
      modifiedAt: { S: now },
      _et: { S: "StripeConfig" },
    },
  }));
  console.log(`  Created config: ${CONFIG_ID}`);

  // Step 3: Insert channel mapping
  console.log("\nStep 3: Creating channel mapping...");

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: { S: PK },
      SK: { S: `CHANNEL_ID#${CHANNEL_ID}` },
      channelId: { S: CHANNEL_ID },
      configId: { S: CONFIG_ID },
      createdAt: { S: now },
      modifiedAt: { S: now },
      _et: { S: "ChannelConfigMapping" },
    },
  }));
  console.log(`  Mapped channel ${CHANNEL_ID} -> ${CONFIG_ID}`);

  console.log("\n✓ Configuration complete!");
  console.log("");
  console.log("Next steps:");
  console.log("1. Exit and restart the Stripe app:");
  console.log("   docker compose restart stripe-app");
  console.log("");
  console.log("2. For webhook testing, run Stripe CLI in a separate terminal:");
  console.log(`   stripe listen --forward-to localhost:3001/api/webhooks/stripe/${CONFIG_ID}/http%3A%2F%2Flocalhost%3A8000%2Fgraphql%2F`);
  console.log("");
  console.log("3. Test checkout at http://localhost:3000");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
