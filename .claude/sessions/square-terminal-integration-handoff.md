# Square Terminal Integration - Session Handoff

**Created**: 2026-01-06
**Status**: Ready for implementation
**Plan File**: `/home/michael/.claude/plans/declarative-squishing-narwhal.md`

## Quick Start for New Session

```
Continue implementing the Square Terminal integration for the POS app.
The full plan is at .claude/plans/declarative-squishing-narwhal.md
Start with Step 1: Create the feature branch from platform/main.
```

---

## Project Summary

Integrate Square Terminal hardware with the Saleor POS app to enable card-present payments via Square's Terminal API.

### Key Deliverables
1. Square client wrapper with centralized API version and idempotency
2. OAuth token management with on-demand refresh
3. Device/register pairing system
4. Terminal checkout orchestration
5. Webhook handler for payment status updates
6. Frontend UI for settings, device pairing, and checkout status
7. Unit tests and documentation

---

## Implementation Phases

| Phase | Steps | Description |
|-------|-------|-------------|
| 1 | 1-3 | Setup & Square Client |
| 2 | 4-6 | OAuth Integration |
| 3 | 7-8 | Device Pairing |
| 4 | 9-11 | Terminal Checkout |
| 5 | 12-14 | Webhook Handler |
| 6 | 15-18 | Frontend UI |
| 7 | 19-21 | Testing & Documentation |

---

## Critical Reference Information

### Square API Details
- **API Version**: `2024-11-20`
- **SDK**: `square` npm package v43.x
- **Required Scopes**: `PAYMENTS_WRITE`, `PAYMENTS_READ`, `DEVICE_CREDENTIAL_MANAGEMENT`, `DEVICES_READ`
- **OAuth Token Expiry**: 30 days (refresh tokens don't expire)
- **Webhook Signature**: HMAC-SHA256 of `notificationUrl + body`

### Sandbox Test Device IDs
| Device ID | Behavior |
|-----------|----------|
| `9fa747a2-25ff-48ee-b078-04381f7c828f` | Success, credit card, max $25 |
| `22cd266c-6246-4c06-9983-67f0c26346b0` | Success with 20% tip |
| `841100b9-ee60-4537-9bcf-e30b2ba5e215` | Buyer cancellation |
| `0a956d49-619a-4530-8e5e-8eac603ffc5e` | Immediate timeout |
| `da40d603-c2ea-4a65-8cfd-f42e36dab0c7` | Offline terminal |

### Environment Variables to Add
```bash
SQUARE_APPLICATION_ID=sq0idp-xxx
SQUARE_APPLICATION_SECRET=sq0csp-xxx
SQUARE_ENVIRONMENT=sandbox
SQUARE_WEBHOOK_SIGNATURE_KEY=xxx
SQUARE_WEBHOOK_URL=https://your-domain.com/api/square/webhook
```

---

## Key Files to Create

### Backend Modules
```
saleor-apps/apps/pos/src/modules/square/
├── index.ts
├── square-client.ts
├── square-api-version.ts
├── oauth/
│   ├── oauth-service.ts
│   └── oauth-router.ts
├── terminal/
│   ├── terminal-router.ts
│   ├── terminal-checkout-service.ts
│   └── device-mapper.ts
├── webhook/
│   ├── webhook-handler.ts
│   ├── webhook-signature-validator.ts
│   └── webhook-event-processor.ts
└── types/
    └── errors.ts
```

### API Routes
```
saleor-apps/apps/pos/src/app/api/square/
├── oauth/
│   ├── authorize/route.ts
│   └── callback/route.ts
└── webhook/route.ts
```

### Frontend Components
```
saleor-apps/apps/pos/src/
├── pages/settings/square.tsx
└── ui/components/
    ├── SquareDevicePairing.tsx
    ├── SquareDeviceList.tsx
    ├── SquareCheckoutStatus.tsx
    └── SquarePaymentButton.tsx
```

### Documentation
```
docs/payments/
├── square_terminal.md
├── square_oauth.md
└── square_terminal_runbook.md
```

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `saleor-apps/apps/pos/package.json` | Add `square` dependency |
| `saleor-apps/apps/pos/src/lib/env.ts` | Add Square env vars |
| `saleor-apps/apps/inventory-ops/prisma/schema.prisma` | Add 4 new models |
| `saleor-apps/apps/pos/src/modules/trpc/trpc-router.ts` | Register Square router |
| `saleor-apps/apps/pos/src/pages/transaction.tsx` | Add SquarePaymentButton |

---

## Database Schema to Add

4 new Prisma models:
1. **SquareOAuthToken** - Encrypted OAuth tokens per installation
2. **SquareTerminalDevice** - Device pairing to RegisterSession
3. **SquareTerminalCheckout** - Checkout state tracking
4. **SquareWebhookEvent** - Idempotent webhook processing

Relations to update:
- `AppInstallation.squareOAuthToken`
- `RegisterSession.squareDevice`
- `PosTransaction.squareCheckouts`
- `PosPayment.squareCheckout`

---

## Design Decisions Made

1. **Branch**: `feature/square-terminal-integration` from `platform/main`
2. **Token Storage**: Prisma/PostgreSQL with encryption (matches POS app pattern)
3. **Token Refresh**: On-demand (check before each API call, refresh if < 1 hour remaining)
4. **Frontend**: Full UI including settings page, device pairing, and checkout status
5. **Webhook Idempotency**: Track events by `event_id` in `SquareWebhookEvent` table

---

## Existing Patterns to Follow

### From POS App
- Logger: `createLogger("module-name")`
- tRPC procedures: `protectedClientProcedure`
- Multi-tenant: Filter by `installationId`
- Payments: Existing `recordPayment` supports `CARD_PRESENT`, `externalPaymentId`, `paymentGateway`

### From Tests
- Mock Prisma: `vi.mock("@/lib/prisma")`
- Mock logger: `vi.mock("@/lib/logger")`
- Factory functions for test data

---

## First Steps to Execute

```bash
# Step 1: Create feature branch
cd /home/michael/saleor-platform
git checkout platform/main
git pull origin platform/main
git checkout -b feature/square-terminal-integration
git push -u origin feature/square-terminal-integration

# Step 2: Add Square dependency
cd saleor-apps/apps/pos
# Edit package.json to add "square": "^43.1.0"
pnpm install
```

---

## Resources

- **Plan File**: `/home/michael/.claude/plans/declarative-squishing-narwhal.md`
- **POS CLAUDE.md**: `saleor-apps/apps/pos/CLAUDE.md`
- **Prisma Schema**: `saleor-apps/apps/inventory-ops/prisma/schema.prisma`
- **Payments Router**: `saleor-apps/apps/pos/src/modules/payments/payments-router.ts`
- **Square Docs**: https://developer.squareup.com/docs/terminal-api/overview
