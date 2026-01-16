const crypto = require('crypto');

// Configuration - STRIPE_APP_SECRET_KEY must be provided via environment
// (matches .env.example convention; falls back to SECRET_KEY for container use)
const SECRET_KEY = process.env.STRIPE_APP_SECRET_KEY || process.env.SECRET_KEY;
if (!SECRET_KEY) {
  console.error('ERROR: STRIPE_APP_SECRET_KEY environment variable is required');
  console.error('Generate one with: openssl rand -hex 32');
  process.exit(1);
}

if (!/^[a-f0-9]{64}$/i.test(SECRET_KEY)) {
  console.error('ERROR: STRIPE_APP_SECRET_KEY must be a 64-character hex string (256 bits)');
  process.exit(1);
}
const SALEOR_API_URL = 'http://localhost:8000/graphql/';
const APP_ID = 'QXBwOjEy';
const CHANNEL_ID = 'Q2hhbm5lbDox';
const CONFIG_ID = 'stripe-config-001';

// Stripe keys - set via environment variables
const STRIPE_PK = process.env.STRIPE_PK || 'pk_test_YOUR_STRIPE_PUBLISHABLE_KEY';
const STRIPE_RK = process.env.STRIPE_RK || 'rk_test_YOUR_STRIPE_RESTRICTED_KEY';
// Dummy webhook secret (webhooks won't work locally without public URL anyway)
const STRIPE_WH_SECRET = 'whsec_dummy_local_development';
const STRIPE_WH_ID = 'we_dummy_local';

// Encrypt function matching @saleor/apps-shared/encryptor
function encrypt(text, secret) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secret, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Build the PK
const PK = `${SALEOR_API_URL}#${APP_ID}`;

// Encrypt sensitive values
const encryptedRK = encrypt(STRIPE_RK, SECRET_KEY);
const encryptedWhSecret = encrypt(STRIPE_WH_SECRET, SECRET_KEY);

console.log('=== Stripe Config DynamoDB Entries ===\n');

// Stripe Config entry
const stripeConfig = {
    PK: { S: PK },
    SK: { S: `CONFIG_ID#${CONFIG_ID}` },
    configName: { S: 'default' },
    configId: { S: CONFIG_ID },
    stripePk: { S: STRIPE_PK },
    stripeRk: { S: encryptedRK },
    stripeWhSecret: { S: encryptedWhSecret },
    stripeWhId: { S: STRIPE_WH_ID },
    _et: { S: 'StripeConfig' },
    createdAt: { S: new Date().toISOString() },
    modifiedAt: { S: new Date().toISOString() }
};

// Channel mapping entry
const channelMapping = {
    PK: { S: PK },
    SK: { S: `CHANNEL_ID#${CHANNEL_ID}` },
    channelId: { S: CHANNEL_ID },
    configId: { S: CONFIG_ID },
    _et: { S: 'ChannelConfigMapping' },
    createdAt: { S: new Date().toISOString() },
    modifiedAt: { S: new Date().toISOString() }
};

console.log('Stripe Config JSON:');
console.log(JSON.stringify(stripeConfig));
console.log('\nChannel Mapping JSON:');
console.log(JSON.stringify(channelMapping));
