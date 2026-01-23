# ISSUE-001: CSP Allows unsafe-eval

**Priority:** P0 - Critical
**Category:** Security
**Status:** Open
**Created:** 2026-01-23
**Source:** Repository Health Audit

---

## Problem

Content Security Policy permits `unsafe-eval`, significantly increasing XSS attack surface.

**File:** `storefront/src/middleware.ts:28`

```typescript
// Current (vulnerable):
script-src 'self' https://js.stripe.com https://www.googletagmanager.com 'unsafe-inline' 'unsafe-eval'
```

## Impact

- Allows arbitrary code execution in script context
- Increases XSS attack surface
- `unsafe-inline` also permits inline scripts without cryptographic validation

## Root Cause

Blanket permission added during development, possibly for Stripe/GTM compatibility. Both libraries have documented CSP-compliant integration paths.

## Remediation Steps

### Step 1: Test Current Dependencies

```bash
cd storefront
pnpm dev
```

1. Open checkout page with Stripe payment
2. Open browser DevTools → Console
3. Note any CSP violations

### Step 2: Remove unsafe-eval

Edit `storefront/src/middleware.ts`:

```typescript
// Before:
script-src 'self' https://js.stripe.com https://www.googletagmanager.com 'unsafe-inline' 'unsafe-eval'

// After:
script-src 'self' https://js.stripe.com https://www.googletagmanager.com 'unsafe-inline'
```

### Step 3: Test Payment Flow

1. Add item to cart
2. Proceed to checkout
3. Enter Stripe test card: `4242 4242 4242 4242`
4. Complete payment
5. Verify no console errors

### Step 4: (Optional) Upgrade to Nonce-Based CSP

For stronger protection, replace `unsafe-inline` with nonces:

```typescript
function buildCSP(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' https://js.stripe.com https://www.googletagmanager.com 'nonce-${nonce}'`,
    // ... rest of CSP
  ].join('; ');
}
```

## Verification

```bash
# After fix, verify no CSP violations:
cd storefront && pnpm dev
# Open DevTools Console, navigate to checkout
# Should see no "Refused to evaluate" errors
```

## References

- Stripe CSP: https://stripe.com/docs/security/guide#content-security-policy
- GTM CSP: https://developers.google.com/tag-platform/tag-manager/csp
- MDN CSP: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

## Definition of Done

- [x] `unsafe-eval` removed from CSP
- [ ] Stripe payment flow works (manual verification required)
- [ ] GTM tracking works (if used) (manual verification required)
- [ ] No console CSP violation errors (manual verification required)
- [x] Committed to platform/main
