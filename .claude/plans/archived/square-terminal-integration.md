# Square Terminal Integration Plan

**Status: ARCHIVED**
**Archived**: 2026-01-28
**Reason**: Backend complete (Phases 1-5); remaining UI work tracked as GitHub issues

---

## Archive Summary

### What Shipped (Phases 1-5 Backend - 100%)

| Phase | Description | Status | Evidence |
|-------|-------------|--------|----------|
| Phase 1 | Square SDK & Client | ✅ Shipped | `square-client.ts`, `square-api-version.ts` |
| Phase 2 | OAuth Integration | ✅ Shipped | `oauth-service.ts`, `oauth-router.ts`, API routes |
| Phase 3 | Device Pairing | ✅ Shipped | `device-mapper.ts`, `terminal-router.ts` |
| Phase 4 | Terminal Checkout | ✅ Shipped | `terminal-checkout-service.ts` |
| Phase 5 | Webhook Handler | ✅ Shipped | `webhook-handler.ts`, `webhook-event-processor.ts` |

### What Shipped (Phase 6 UI - Partial)

| Component | Status | Evidence |
|-----------|--------|----------|
| SquareCheckout.tsx | ✅ Shipped | 134 lines, checkout flow with polling |
| Payment flow wiring | ✅ Shipped | Commit df21c7a |

### What Remains (Tracked as Issues)

| Feature | Issue | Priority |
|---------|-------|----------|
| Square Settings Page | See GitHub issue | P1 (blocks usage) |
| Device Pairing UI | See GitHub issue | P1 (blocks usage) |
| Device List UI | See GitHub issue | P2 |
| Checkout Status UI | See GitHub issue | P2 |

### Phase 7 (Tests & Docs) - Not Started

Would include:
- `square-client.test.ts`
- `oauth-service.test.ts`
- `webhook-signature-validator.test.ts`
- `terminal-checkout-service.test.ts`
- Setup and troubleshooting documentation

---

## Technical Reference (Preserved)

### Database Models

All models in `saleor-apps/apps/inventory-ops/prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| `SquareOAuthToken` | Encrypted access/refresh tokens |
| `SquareTerminalDevice` | Paired terminal devices |
| `SquareTerminalCheckout` | Checkout state tracking |
| `SquareWebhookEvent` | Idempotent webhook processing |

### tRPC Router Structure

```
square
├── oauth
│   ├── isConfigured
│   ├── getStatus
│   ├── getAuthorizationUrl
│   └── disconnect
└── terminal
    ├── listLocations
    ├── listDevices
    ├── createDeviceCode
    ├── getDeviceCodeStatus
    ├── completePairing
    ├── linkToRegister / unlinkFromRegister
    ├── removeDevice
    ├── addSandboxDevice / getSandboxDeviceTypes
    ├── createCheckout
    ├── getCheckoutStatus
    ├── cancelCheckout
    ├── getActiveCheckout
    ├── getCheckoutsForTransaction
    └── completeCheckoutPayment
```

### SDK Compatibility Notes

1. **Square SDK v43**: Uses `SquareClient` not `Client`, API version `2025-10-16`
2. **Legacy SDK Required**: Devices API and Terminal API need `square/legacy` import
3. **Both SDKs coexist**: New SDK for OAuth, legacy for Terminal operations

### Environment Variables

```bash
SQUARE_APPLICATION_ID=...
SQUARE_APPLICATION_SECRET=...
SQUARE_ENVIRONMENT=sandbox|production
SQUARE_WEBHOOK_SIGNATURE_KEY=...
SQUARE_WEBHOOK_URL=...
```

### Sandbox Test Device IDs

```typescript
SUCCESS_CREDIT: "9fa747a2-25ff-48ee-b078-04381f7c828f"     // max $25
SUCCESS_WITH_TIP: "22cd266c-6246-4c06-9983-67f0c26346b0"  // 20% tip
BUYER_CANCELED: "841100b9-ee60-4537-9bcf-e30b2ba5e215"
IMMEDIATE_TIMEOUT: "0a956d49-619a-4530-8e5e-8eac603ffc5e"
OFFLINE_TERMINAL: "da40d603-c2ea-4a65-8cfd-f42e36dab0c7"
```

---

## Commit History

| Repo | Commit | Description |
|------|--------|-------------|
| pos | `bcaf09d` | Phase 1: Square SDK and module structure |
| pos | `34bf889` | Phase 2: OAuth 2.0 integration |
| pos | `acd0936` | Phase 3: Device pairing module |
| pos | `6514d60` | Phase 4: Terminal checkout service |
| pos | `6f9338f` | Phase 5: Webhook handler |
| pos | `df21c7a` | Phase 6 (partial): Wire Square Terminal to payment flow |

---

## Lessons Learned

1. **Backend-first was the right approach** - All API integration complete before UI
2. **SDK compatibility issues are real** - Document workarounds immediately
3. **Phase 6 UI was underscoped** - Settings, pairing, and list UI are significant work
4. **Sandbox testing requires specific device IDs** - Worth documenting upfront
