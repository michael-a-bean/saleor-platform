# Issue #001: POS - Square Terminal Device Pairing UI

**Priority**: P1 (blocks usage)
**Created**: 2026-01-28
**Status**: Open
**Labels**: enhancement, pos

---

## Summary

The Square Terminal backend integration is complete (Phases 1-5), but users cannot pair devices because the UI is missing. This blocks all Square Terminal usage.

## What Exists
- ✅ `SquareCheckout.tsx` - Checkout flow with status polling (134 lines)
- ✅ All tRPC endpoints for device pairing (`createDeviceCode`, `getDeviceCodeStatus`, `completePairing`, etc.)
- ✅ OAuth flow endpoints
- ✅ Webhook handler for checkout status updates

## What's Missing
- ❌ **Settings page** (`/settings/square.tsx`) - OAuth connection UI
- ❌ **Device Pairing UI** (`SquareDevicePairing.tsx`) - Generate pairing code, show on screen
- ❌ **Device List UI** (`SquareDeviceList.tsx`) - Show paired devices, link to registers

## Acceptance Criteria
- [ ] User can navigate to Square settings page
- [ ] User can initiate OAuth flow to connect Square account
- [ ] User can generate device pairing code
- [ ] Device pairing code displays for 5 minutes (Square timeout)
- [ ] Successfully paired devices appear in device list
- [ ] Devices can be linked to register sessions

## Technical Notes
- tRPC router: `square.terminal.*` and `square.oauth.*`
- Sandbox test device IDs available in `terminal-router.ts`
- OAuth scopes: `PAYMENTS_WRITE`, `PAYMENTS_READ`, `DEVICE_CREDENTIAL_MANAGEMENT`, `DEVICES_READ`

## Context
Archived from: `.claude/plans/archived/square-terminal-integration.md`
Related: Phase 6 UI completion work
