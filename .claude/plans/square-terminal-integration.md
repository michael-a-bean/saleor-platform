# Square Terminal Integration Plan

## Overview

Integrate Square Terminal hardware with the Saleor POS app to enable card-present payments via Square's Terminal API.

**Branch**: `feature/square-terminal-integration` (from `platform/main`)

## Square API Reference Summary

### Key Documentation Findings
- **Terminal API**: Creates checkout requests sent to paired Square Terminal devices
- **OAuth**: Code flow with 30-day access token expiration; refresh tokens don't expire
- **Webhooks**: HMAC-SHA256 signature validation, 24-hour retry with exponential backoff
- **Required Scopes**: `PAYMENTS_WRITE`, `PAYMENTS_READ`, `DEVICE_CREDENTIAL_MANAGEMENT`, `DEVICES_READ`
- **API Version**: `2024-11-20` (use `square` npm package v43.x)

### Sandbox Test Device IDs
| Device ID | Behavior |
|-----------|----------|
| `9fa747a2-25ff-48ee-b078-04381f7c828f` | Success, credit card, max $25 |
| `22cd266c-6246-4c06-9983-67f0c26346b0` | Success with 20% tip |
| `841100b9-ee60-4537-9bcf-e30b2ba5e215` | Buyer cancellation |
| `0a956d49-619a-4530-8e5e-8eac603ffc5e` | Immediate timeout |
| `da40d603-c2ea-4a65-8cfd-f42e36dab0c7` | Offline terminal |

---

## Implementation Phases

### Phase 1: Setup & Square Client (Step 1-3)
### Phase 2: OAuth Integration (Step 4-6)
### Phase 3: Device Pairing (Step 7-8)
### Phase 4: Terminal Checkout (Step 9-11)
### Phase 5: Webhook Handler (Step 12-14)
### Phase 6: Frontend UI (Step 15-18)
### Phase 7: Testing & Documentation (Step 19-21)

---

## Step-by-Step Implementation

### Step 1: Create Feature Branch
```bash
git checkout platform/main
git pull origin platform/main
git checkout -b feature/square-terminal-integration
git push -u origin feature/square-terminal-integration
```

### Step 2: Add Square SDK Dependency
**File**: `saleor-apps/apps/pos/package.json`
```json
"dependencies": {
  "square": "^43.1.0"
}
```

### Step 3: Create Square Client Wrapper
**Files to create**:
- `saleor-apps/apps/pos/src/modules/square/index.ts`
- `saleor-apps/apps/pos/src/modules/square/square-client.ts`
- `saleor-apps/apps/pos/src/modules/square/square-api-version.ts`
- `saleor-apps/apps/pos/src/modules/square/types/errors.ts`

**Key patterns**:
- Centralize API version: `SQUARE_API_VERSION = "2024-11-20"`
- Idempotency key generation: `{prefix}-{timestamp}-{uuid8}`
- Environment switching via `Environment.Production` vs `Environment.Sandbox`

### Step 4: Extend Environment Variables
**File**: `saleor-apps/apps/pos/src/lib/env.ts`

Add:
```typescript
// Square Terminal integration
SQUARE_APPLICATION_ID: z.string().optional(),
SQUARE_APPLICATION_SECRET: z.string().optional(),
SQUARE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().optional(),
SQUARE_WEBHOOK_URL: z.string().url().optional(),
```

### Step 5: Add Database Schema for Square
**File**: `saleor-apps/apps/inventory-ops/prisma/schema.prisma`

Add models:
1. `SquareOAuthToken` - Encrypted access/refresh tokens, merchant ID, expiry
2. `SquareTerminalDevice` - Device pairing to RegisterSession
3. `SquareTerminalCheckout` - Checkout state tracking, links to PosTransaction/PosPayment
4. `SquareWebhookEvent` - Idempotent event processing

Add relations to existing models:
- `AppInstallation.squareOAuthToken`
- `RegisterSession.squareDevice`
- `PosTransaction.squareCheckouts`
- `PosPayment.squareCheckout`

### Step 6: Create OAuth Module
**Files to create**:
- `saleor-apps/apps/pos/src/modules/square/oauth/oauth-service.ts`
- `saleor-apps/apps/pos/src/modules/square/oauth/oauth-router.ts`

**OAuth flow**:
1. Build authorization URL with scopes: `PAYMENTS_WRITE`, `PAYMENTS_READ`, `DEVICE_CREDENTIAL_MANAGEMENT`, `DEVICES_READ`
2. Handle callback, exchange code for tokens
3. Encrypt tokens using `SECRET_KEY` before storage
4. **On-demand refresh**: Check token expiry before each API call, refresh if < 1 hour remaining

**API routes**:
- `saleor-apps/apps/pos/src/app/api/square/oauth/authorize/route.ts`
- `saleor-apps/apps/pos/src/app/api/square/oauth/callback/route.ts`

### Step 7: Create Device Mapping Module
**Files to create**:
- `saleor-apps/apps/pos/src/modules/square/terminal/device-mapper.ts`

**Key functionality**:
- Create device code via Devices API (5-minute pairing window)
- Store device with `SquareTerminalDevice` model
- Link device to `RegisterSession` for automatic targeting
- Track sandbox vs production devices

### Step 8: Add Device tRPC Endpoints
**File**: `saleor-apps/apps/pos/src/modules/square/terminal/terminal-router.ts`

Endpoints:
- `square.isConfigured` - Check OAuth status
- `square.listLocations` - Get Square locations
- `square.listDevices` - Get paired devices
- `square.createDeviceCode` - Generate pairing code
- `square.pairWithRegister` - Link device to register session

### Step 9: Create Terminal Checkout Service
**File**: `saleor-apps/apps/pos/src/modules/square/terminal/terminal-checkout-service.ts`

**Checkout creation flow**:
1. Validate transaction is DRAFT with lines
2. Find paired device via RegisterSession
3. Check for existing pending checkout (prevent duplicates)
4. Create checkout via Terminal API with idempotency key
5. Store `SquareTerminalCheckout` record
6. Return checkout ID for frontend polling

### Step 10: Add Checkout tRPC Endpoints
**File**: `saleor-apps/apps/pos/src/modules/square/terminal/terminal-router.ts`

Add endpoints:
- `square.createCheckout` - Initiate payment on Terminal
- `square.getCheckoutStatus` - Poll for status updates
- `square.cancelCheckout` - Cancel pending checkout

### Step 11: Integrate with Existing Payments Router
**File**: `saleor-apps/apps/pos/src/modules/payments/payments-router.ts`

The existing `recordPayment` already supports:
- `methodType: "CARD_PRESENT"`
- `externalPaymentId`, `paymentGateway`, `cardLastFour`, `cardBrand`

Webhook handler will call `recordPayment` internally or create payment directly.

### Step 12: Create Webhook Signature Validator
**File**: `saleor-apps/apps/pos/src/modules/square/webhook/webhook-signature-validator.ts`

Per Square docs:
```typescript
// HMAC-SHA256 of: notificationUrl + body
const payload = webhookUrl + body;
const signature = crypto.createHmac("sha256", signatureKey).update(payload).digest("base64");
// Compare with x-square-hmacsha256-signature header using timing-safe comparison
```

### Step 13: Create Webhook Handler
**Files to create**:
- `saleor-apps/apps/pos/src/modules/square/webhook/webhook-handler.ts`
- `saleor-apps/apps/pos/src/modules/square/webhook/webhook-event-processor.ts`

**Event handling**:
1. Validate signature
2. Check `SquareWebhookEvent` for duplicate (idempotency via `event_id`)
3. Process `terminal.checkout.updated` events:
   - Update `SquareTerminalCheckout` status
   - On COMPLETED: Create `PosPayment` record with card details
   - On CANCELED: Update status, store cancel reason
4. Mark event as processed

### Step 14: Create Webhook API Route
**File**: `saleor-apps/apps/pos/src/app/api/square/webhook/route.ts`

- POST handler with signature validation
- Logger context with correlation IDs
- 200 response for successful receipt (even if processing fails)

### Step 15: Register Square Router in tRPC
**File**: `saleor-apps/apps/pos/src/modules/trpc/trpc-router.ts`

```typescript
import { squareTerminalRouter } from "@/modules/square/terminal/terminal-router";

export const trpcRouter = router({
  // ... existing routers
  square: squareTerminalRouter,
});
```

---

## Phase 6: Frontend UI

### Step 16: Create Square Settings Page
**File**: `saleor-apps/apps/pos/src/pages/settings/square.tsx`

Components:
- OAuth connection status display
- "Connect Square" button → redirects to OAuth authorize
- Disconnect button (revokes token)
- Connected merchant info display

### Step 17: Create Device Pairing UI
**Files to create**:
- `saleor-apps/apps/pos/src/ui/components/SquareDevicePairing.tsx`
- `saleor-apps/apps/pos/src/ui/components/SquareDeviceList.tsx`

Features:
- List of paired devices per location
- "Pair New Device" button → generates code, shows instructions
- Device status indicators (PAIRED, UNPAIRED, OFFLINE)
- Link device to current register session

### Step 18: Create Checkout Status UI
**Files to create**:
- `saleor-apps/apps/pos/src/ui/components/SquareCheckoutStatus.tsx`
- `saleor-apps/apps/pos/src/ui/components/SquarePaymentButton.tsx`

Features:
- "Pay with Card" button in transaction view
- Status polling during checkout (PENDING → IN_PROGRESS → COMPLETED)
- Visual feedback: spinner, success checkmark, error message
- Cancel button for pending checkouts
- Integration with existing payment summary display

### Step 19: Update Transaction Page
**File**: `saleor-apps/apps/pos/src/pages/transaction.tsx`

Changes:
- Add SquarePaymentButton next to existing payment options
- Show SquareCheckoutStatus when checkout is active
- Handle checkout completion → auto-refresh payment summary

---

## Phase 7: Testing & Documentation

### Step 20: Write Tests
**Files to create**:
- `saleor-apps/apps/pos/src/modules/square/square-client.test.ts`
- `saleor-apps/apps/pos/src/modules/square/oauth/oauth-service.test.ts`
- `saleor-apps/apps/pos/src/modules/square/webhook/webhook-signature-validator.test.ts`
- `saleor-apps/apps/pos/src/modules/square/terminal/terminal-checkout-service.test.ts`

**Test patterns** (from existing tests):
- Mock Prisma with `vi.mock("@/lib/prisma")`
- Mock logger with `vi.mock("@/lib/logger")`
- Factory functions for test data
- Test happy paths and error cases

### Step 21: Create Documentation
**Files to create**:
- `docs/payments/square_terminal.md` - Setup and usage guide
- `docs/payments/square_oauth.md` - OAuth configuration
- `docs/payments/square_terminal_runbook.md` - Troubleshooting and operations

---

## File Structure Summary

```
saleor-apps/apps/pos/src/
├── modules/
│   └── square/
│       ├── index.ts
│       ├── square-client.ts
│       ├── square-api-version.ts
│       ├── oauth/
│       │   ├── oauth-service.ts
│       │   └── oauth-router.ts
│       ├── terminal/
│       │   ├── terminal-router.ts
│       │   ├── terminal-checkout-service.ts
│       │   └── device-mapper.ts
│       ├── webhook/
│       │   ├── webhook-handler.ts
│       │   ├── webhook-signature-validator.ts
│       │   └── webhook-event-processor.ts
│       └── types/
│           └── errors.ts
├── app/api/square/
│   ├── oauth/
│   │   ├── authorize/route.ts
│   │   └── callback/route.ts
│   └── webhook/route.ts
├── pages/
│   └── settings/
│       └── square.tsx                  # Square settings/OAuth page
├── ui/components/
│   ├── SquareDevicePairing.tsx         # Device pairing modal
│   ├── SquareDeviceList.tsx            # Paired devices list
│   ├── SquareCheckoutStatus.tsx        # Checkout progress display
│   └── SquarePaymentButton.tsx         # Card payment button
└── lib/env.ts (modified)
```

---

## Database Schema Additions

```prisma
model SquareOAuthToken {
  id                String          @id @default(uuid())
  installationId    String          @unique
  installation      AppInstallation @relation(...)
  accessToken       String          // Encrypted
  refreshToken      String          // Encrypted
  expiresAt         DateTime
  merchantId        String
  environment       String          @default("sandbox")
  scopes            String[]
  lastRefreshedAt   DateTime?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  terminalDevices   SquareTerminalDevice[]
  terminalCheckouts SquareTerminalCheckout[]
}

model SquareTerminalDevice {
  id                String            @id @default(uuid())
  oauthTokenId      String
  oauthToken        SquareOAuthToken  @relation(...)
  squareDeviceId    String
  squareLocationId  String
  deviceName        String?
  registerSessionId String?           @unique
  registerSession   RegisterSession?  @relation(...)
  status            String            @default("PAIRED")
  isSandboxDevice   Boolean           @default(false)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  @@unique([oauthTokenId, squareDeviceId])
}

model SquareTerminalCheckout {
  id                String            @id @default(uuid())
  oauthTokenId      String
  deviceId          String
  posTransactionId  String
  posPaymentId      String?           @unique
  squareCheckoutId  String            @unique
  squarePaymentId   String?
  amountMoney       Decimal
  tipMoney          Decimal?
  currency          String
  status            String            @default("PENDING")
  idempotencyKey    String            @unique
  cardBrand         String?
  cardLastFour      String?
  entryMethod       String?
  completedAt       DateTime?
  canceledAt        DateTime?
  cancelReason      String?
  errorCode         String?
  errorMessage      String?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  @@index([posTransactionId])
  @@index([status])
}

model SquareWebhookEvent {
  id            String    @id @default(uuid())
  eventId       String    @unique
  eventType     String
  merchantId    String
  status        String    @default("RECEIVED")
  processedAt   DateTime?
  payload       Json?
  errorMessage  String?
  retryCount    Int       @default(0)
  createdAt     DateTime  @default(now())
  @@index([eventType])
  @@index([status])
}
```

---

## Environment Variables

```bash
# Required for Square integration
SQUARE_APPLICATION_ID=sq0idp-xxx          # From Square Developer Dashboard
SQUARE_APPLICATION_SECRET=sq0csp-xxx       # From Square Developer Dashboard
SQUARE_ENVIRONMENT=sandbox                 # "sandbox" or "production"
SQUARE_WEBHOOK_SIGNATURE_KEY=xxx           # From webhook subscription
SQUARE_WEBHOOK_URL=https://your-domain.com/api/square/webhook
```

---

## Manual QA Checklist

### OAuth Setup
- [ ] Initiate OAuth flow from POS settings
- [ ] Complete authorization on Square
- [ ] Verify token stored (check DB, should be encrypted)
- [ ] Wait 30+ days and verify token refresh works

### Device Pairing
- [ ] Create device code
- [ ] (Production) Enter code on physical Terminal
- [ ] (Sandbox) Use test device IDs
- [ ] Verify device shows as paired

### Checkout Flow
- [ ] Create transaction with items
- [ ] Initiate Square checkout
- [ ] (Sandbox) Verify status updates via polling
- [ ] (Production) Complete payment on Terminal
- [ ] Verify webhook received and processed
- [ ] Verify PosPayment created with card details
- [ ] Complete transaction, verify Saleor order created

### Error Handling
- [ ] Cancel checkout mid-flow
- [ ] Simulate timeout (sandbox device ID)
- [ ] Simulate declined card
- [ ] Attempt duplicate checkout (should fail)
- [ ] Webhook signature validation failure

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `saleor-apps/apps/pos/package.json` | Add `square` dependency |
| `saleor-apps/apps/pos/src/lib/env.ts` | Add Square env vars |
| `saleor-apps/apps/inventory-ops/prisma/schema.prisma` | Add 4 new models, update relations |
| `saleor-apps/apps/pos/src/modules/trpc/trpc-router.ts` | Register Square router |
| `saleor-apps/apps/pos/src/pages/transaction.tsx` | Add SquarePaymentButton |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Token expiration during checkout | On-demand refresh if < 1 hour remaining before API calls |
| Webhook delivery failure | Idempotent processing, Square retries 24h |
| Duplicate checkout creation | Check for existing PENDING checkout |
| Network failure mid-checkout | Store idempotency key, query by key on retry |
| Sandbox limitations | Use documented test device IDs, not hardware |
