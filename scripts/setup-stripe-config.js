const crypto = require('crypto');

// Configuration
const SECRET_KEY = '677a28c7a3f6f9b615a3dbe4657d0cf816080e482a432892f0b4c5f07dce0b54';
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
