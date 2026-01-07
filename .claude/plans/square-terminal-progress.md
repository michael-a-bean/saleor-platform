# Square Terminal Integration - Progress & Handoff

## Current Status

**Branch:** `feature/square-terminal-integration`
**Last Updated:** 2026-01-06

### Completed Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Setup & Square Client | ✅ Complete |
| Phase 2 | OAuth Integration | ✅ Complete |
| Phase 3 | Device Pairing | ✅ Complete |
| Phase 4 | Terminal Checkout | ✅ Complete |
| Phase 5 | Webhook Handler | ✅ Complete |
| Phase 6 | Frontend UI | ⏳ Not Started |
| Phase 7 | Testing & Documentation | ⏳ Not Started |

---

## Implementation Summary

### Phase 1: Setup & Square Client

**Files Created:**
- `saleor-apps/apps/pos/src/modules/square/square-api-version.ts` - API version constant (`2025-10-16`)
- `saleor-apps/apps/pos/src/modules/square/square-client.ts` - Client wrapper with token refresh
- `saleor-apps/apps/pos/src/modules/square/types/errors.ts` - Error classes
- `saleor-apps/apps/pos/src/modules/square/index.ts` - Module exports

**Key Decisions:**
- Square SDK v43 uses `SquareClient` (not `Client`)
- API version must be `2025-10-16` for SDK v43 compatibility
- Methods are `client.oAuth.obtainToken()` not `client.oAuthApi.obtainToken()`

**Environment Variables Added** (in `src/lib/env.ts`):
```typescript
SQUARE_APPLICATION_ID: z.string().optional(),
SQUARE_APPLICATION_SECRET: z.string().optional(),
SQUARE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().optional(),
SQUARE_WEBHOOK_URL: z.string().url().optional(),
```

### Phase 2: OAuth Integration

**Files Created:**
- `src/modules/square/oauth/token-encryption.ts` - AES-256-GCM encryption
- `src/modules/square/oauth/oauth-service.ts` - OAuth flow logic
- `src/modules/square/oauth/oauth-router.ts` - tRPC router
- `src/modules/square/oauth/index.ts` - Module exports
- `src/app/api/square/oauth/authorize/route.ts` - OAuth initiation
- `src/app/api/square/oauth/callback/route.ts` - OAuth callback handler

**tRPC Endpoints (`square.oauth.*`):**
- `isConfigured` - Check if Square credentials are set
- `getStatus` - Get OAuth connection status
- `getAuthorizationUrl` - Generate authorization URL
- `disconnect` - Revoke tokens and cleanup

**Key Decisions:**
- Tokens encrypted with AES-256-GCM using `SECRET_KEY`
- State parameter for CSRF protection (10-minute expiry)
- On-demand token refresh (within 1 hour of expiry)
- OAuth scopes: `PAYMENTS_WRITE`, `PAYMENTS_READ`, `DEVICE_CREDENTIAL_MANAGEMENT`, `DEVICES_READ`

### Phase 3: Device Pairing

**Files Created:**
- `src/modules/square/terminal/device-mapper.ts` - Device code creation and pairing
- `src/modules/square/terminal/terminal-router.ts` - tRPC router
- `src/modules/square/terminal/index.ts` - Module exports

**tRPC Endpoints (`square.terminal.*`):**
- `listLocations` - Get Square merchant locations
- `listDevices` - List paired terminal devices
- `createDeviceCode` - Generate pairing code (5-min validity)
- `getDeviceCodeStatus` - Poll for pairing completion
- `completePairing` - Save device after successful pairing
- `linkToRegister` / `unlinkFromRegister` - Associate with register session
- `removeDevice` - Unpair a device
- `addSandboxDevice` - Add test devices (sandbox only)
- `getSandboxDeviceTypes` - List available sandbox test devices

**Key Decisions:**
- **Uses legacy SDK** (`square/legacy`) for Devices API - the new SDK doesn't expose this endpoint
- Sandbox test device IDs from Square documentation are hardcoded
- Devices linked to register sessions for automatic checkout targeting

**Sandbox Test Device IDs:**
```typescript
SUCCESS_CREDIT: "9fa747a2-25ff-48ee-b078-04381f7c828f"     // max $25
SUCCESS_WITH_TIP: "22cd266c-6246-4c06-9983-67f0c26346b0"  // 20% tip
BUYER_CANCELED: "841100b9-ee60-4537-9bcf-e30b2ba5e215"
IMMEDIATE_TIMEOUT: "0a956d49-619a-4530-8e5e-8eac603ffc5e"
OFFLINE_TERMINAL: "da40d603-c2ea-4a65-8cfd-f42e36dab0c7"
```

### Phase 4: Terminal Checkout

**Files Created:**
- `src/modules/square/terminal/terminal-checkout-service.ts` - Checkout creation, polling, completion

**tRPC Endpoints Added (`square.terminal.*`):**
- `createCheckout` - Send checkout to Square Terminal
- `getCheckoutStatus` - Poll for status updates
- `cancelCheckout` - Cancel pending checkout
- `getActiveCheckout` - Get current active checkout for transaction
- `getCheckoutsForTransaction` - Get all checkouts for a transaction
- `completeCheckoutPayment` - Create PosPayment after checkout completes

**Key Decisions:**
- **Uses legacy SDK** (`square/legacy`) for Terminal API
- 5-minute checkout deadline (`PT5M`)
- Tips enabled by default
- Receipt screen skipped (POS handles receipts)
- `completeCheckoutPayment` creates `PosPayment` with `methodType: CARD_PRESENT`
- Card details (brand, last four, entry method) extracted from Square payment response

### Phase 5: Webhook Handler

**Files Created:**
- `src/modules/square/webhook/webhook-signature-validator.ts` - HMAC-SHA256 signature validation
- `src/modules/square/webhook/webhook-event-processor.ts` - Terminal checkout event processing
- `src/modules/square/webhook/webhook-handler.ts` - Main handler with idempotency
- `src/modules/square/webhook/index.ts` - Module exports
- `src/app/api/square/webhook/route.ts` - Next.js API route

**Event Types Handled:**
- `terminal.checkout.updated` - Status changes (PENDING → IN_PROGRESS → COMPLETED/CANCELED)

**Key Features:**
- HMAC-SHA256 signature validation with timing-safe comparison
- Idempotent processing via `SquareWebhookEvent` table (uses `event_id`)
- Always returns 200 OK (Square retries on 5xx for 24h)
- Automatic `PosPayment` creation when checkout completes
- Card details (brand, last four, entry method) extracted from Square payment

**Webhook Signature Validation:**
```typescript
// Per Square docs: HMAC-SHA256 of (notificationUrl + body)
const payload = webhookUrl + body;
const signature = crypto.createHmac("sha256", signatureKey).update(payload, "utf8").digest("base64");
// Timing-safe comparison to prevent timing attacks
crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
```

---

## Remaining Work

### Phase 6: Frontend UI (Step 15-18)

**Files to Create:**
- `src/pages/settings/square.tsx` - Square settings/OAuth page
- `src/ui/components/SquareDevicePairing.tsx` - Device pairing modal
- `src/ui/components/SquareDeviceList.tsx` - Paired devices list
- `src/ui/components/SquareCheckoutStatus.tsx` - Checkout progress display
- `src/ui/components/SquarePaymentButton.tsx` - Card payment button

**Files to Modify:**
- `src/pages/transaction.tsx` - Add SquarePaymentButton, integrate checkout flow

### Phase 7: Testing & Documentation (Step 19-21)

**Test Files to Create:**
- `src/modules/square/square-client.test.ts`
- `src/modules/square/oauth/oauth-service.test.ts`
- `src/modules/square/webhook/webhook-signature-validator.test.ts`
- `src/modules/square/terminal/terminal-checkout-service.test.ts`

**Documentation Files to Create:**
- `docs/payments/square_terminal.md` - Setup and usage guide
- `docs/payments/square_oauth.md` - OAuth configuration
- `docs/payments/square_terminal_runbook.md` - Troubleshooting

---

## Database Models

All models exist in `saleor-apps/apps/inventory-ops/prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| `SquareOAuthToken` | Encrypted access/refresh tokens, merchant info |
| `SquareTerminalDevice` | Paired terminal devices, linked to register sessions |
| `SquareTerminalCheckout` | Checkout state, links transaction to payment |
| `SquareWebhookEvent` | Idempotent webhook processing |

**Enum:**
```prisma
enum SquareCheckoutStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELED
  CANCEL_REQUESTED
}
```

---

## Important Technical Notes

### SDK Compatibility Issues

1. **Square SDK v43 API Changes:**
   - Uses `SquareClient` not `Client`
   - Uses `SquareEnvironment` not `Environment`
   - Methods: `client.oAuth.obtainToken()` not `client.oAuthApi.obtainToken()`
   - API version must be `2025-10-16`

2. **Legacy SDK Required:**
   - Devices API and Terminal API not fully exposed in new SDK
   - Import: `import { Client, Environment } from "square/legacy"`
   - Both SDKs can coexist in the same codebase

### tRPC Router Structure

```
trpcRouter
├── square
│   ├── oauth
│   │   ├── isConfigured
│   │   ├── getStatus
│   │   ├── getAuthorizationUrl
│   │   └── disconnect
│   └── terminal
│       ├── listLocations
│       ├── listDevices
│       ├── createDeviceCode
│       ├── getDeviceCodeStatus
│       ├── completePairing
│       ├── linkToRegister
│       ├── unlinkFromRegister
│       ├── removeDevice
│       ├── getDeviceForRegister
│       ├── addSandboxDevice
│       ├── getSandboxDeviceTypes
│       ├── createCheckout
│       ├── getCheckoutStatus
│       ├── cancelCheckout
│       ├── getActiveCheckout
│       ├── getCheckoutsForTransaction
│       └── completeCheckoutPayment
```

---

## Commit History

| Repo | Commit | Description |
|------|--------|-------------|
| pos | `bcaf09d` | Phase 1: Square SDK and module structure |
| pos | `34bf889` | Phase 2: OAuth 2.0 integration |
| pos | `acd0936` | Phase 3: Device pairing module |
| pos | `6514d60` | Phase 4: Terminal checkout service |
| pos | `6f9338f` | Phase 5: Webhook handler for terminal checkout updates |
| platform | `bda1a8d` | Phase 2 submodule update |
| platform | `62009cb` | Phase 3 submodule update |
| platform | `4ebaf69` | Phase 4 submodule update |
| platform | `7115aa1` | Phase 5 submodule update |

---

## To Continue Implementation

1. Ensure you're on the correct branch:
   ```bash
   cd /home/michael/saleor-platform
   git checkout feature/square-terminal-integration
   git submodule update --init --recursive
   ```

2. Read the main plan for detailed implementation steps:
   ```
   .claude/plans/square-terminal-integration.md
   ```

3. Start with Phase 6 (Frontend UI) - see Steps 15-18 in the plan.

4. Key files to reference:
   - Webhook handler: `saleor-apps/apps/pos/src/modules/square/webhook/webhook-handler.ts`
   - Terminal checkout service: `saleor-apps/apps/pos/src/modules/square/terminal/terminal-checkout-service.ts`
   - Terminal router: `saleor-apps/apps/pos/src/modules/square/terminal/terminal-router.ts`
   - OAuth service: `saleor-apps/apps/pos/src/modules/square/oauth/oauth-service.ts`
