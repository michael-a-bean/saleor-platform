---
task: Diagnose checkout flow severe performance regression
slug: 20260308-221500_diagnose-checkout-performance-regression
effort: standard
phase: complete
progress: 8/8
mode: interactive
started: 2026-03-08T22:15:00-08:00
updated: 2026-03-08T22:30:00-08:00
---

## Context

Checkout flow had multi-second delays at every step. Root cause: **2-second debounce** in `useDebouncedSubmit.ts` applied to delivery method radio button clicks (a discrete action that should not be debounced). Upstream Saleor storefront uses no debouncing at all.

### Risks
- Reducing debounce too aggressively for text fields could spam API
- 300ms is standard for type-ahead, well-tested pattern

## Criteria

- [x] ISC-1: Root cause of multi-second checkout delays identified
- [x] ISC-2: Delivery method selection submits immediately without debounce
- [x] ISC-3: Delivery method loading state set only during actual mutation
- [x] ISC-4: Email input debounce reduced from 2000ms to 300ms
- [x] ISC-5: Address auto-save debounce reduced from 2000ms to 300ms
- [x] ISC-6: Address list debounce reduced from 2000ms to 300ms
- [x] ISC-7: TypeScript compiles clean after changes
- [x] ISC-8: All 238 storefront tests pass after changes

## Verification

- ISC-1: 2-second debounce in `useDebouncedSubmit.ts:11` confirmed as root cause
- ISC-2: `useDeliveryMethodsForm.ts` now passes `onSubmit` directly to `useForm` (no debounce wrapper)
- ISC-3: Removed preemptive `setCheckoutUpdateState("loading")` — `useSubmit` handles it at line 90
- ISC-4-6: `useDebouncedSubmit.ts` changed from `2000` to `300` ms
- ISC-7: `pnpm tsc --noEmit` clean
- ISC-8: `pnpm test` 238/238 passing
