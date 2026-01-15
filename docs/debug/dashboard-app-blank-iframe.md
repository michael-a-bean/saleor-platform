# Dashboard App Blank Iframe Investigation

## Investigation Start: 2026-01-14 23:40 PST

**Branch**: `fix/dashboard-app-iframe-blank`

---

## Problem Statement

After successful app installation in Saleor Dashboard, clicking on the app shows a blank page (no app UI rendered) inside the iframe. This affects multiple apps (Stripe and custom apps), indicating a systemic issue.

**Symptoms**:
- Apps install successfully
- Dashboard shows app in list
- Clicking app opens iframe panel
- Iframe is completely blank (white page, no UI)

---

## Phase 1: Capture Evidence (Browser Level)

### 1.1 Iframe URL Identification

**Current Manifest `appUrl`:**
```
http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe
```

**Dashboard embeds iframe as:**
```
{appUrl}?saleorApiUrl=...&id=...&theme=...&locale=...
```

### 1.2 Browser Console/Network Errors

**Expected errors to investigate:**
- `saleorApiUrl param was not found in iframe url`
- `document.referrer is empty`
- Origin mismatch in postMessage handler

---

## Phase 2: Validate App URL & Manifest Contract

### 2.1 Manifest Configuration - VERIFIED ✓

**Manifest endpoint:** `/apps/stripe/api/manifest`

**Key fields:**
```json
{
  "appUrl": "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe",
  "tokenTargetUrl": "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe/api/register",
  "id": "saleor.app.payment.stripe",
  "version": "2.3.8"
}
```

**Result:** Manifest URLs are correct and consistent.

### 2.2 Direct URL Response Test - VERIFIED ✓

**App root URL test:**
```bash
curl -I http://...elb.amazonaws.com/apps/stripe

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

**HTML response:** Contains valid Next.js app shell with correct asset paths.

---

## Phase 3: Header and Browser Security Blockers

### 3.1 Frame Embedding Headers - NO ISSUES ✓

**App response headers:**
```
HTTP/1.1 200 OK
X-Powered-By: Next.js
Content-Type: text/html; charset=utf-8
```

**Finding:** No `X-Frame-Options` or `Content-Security-Policy` headers that would block framing.

### 3.2 Mixed Content Check - NO ISSUES ✓

**Dashboard origin:** `http://...elb.amazonaws.com/dashboard`
**App origin:** `http://...elb.amazonaws.com/apps/stripe`

Both use HTTP (staging environment without TLS). No mixed content issues.

---

## Phase 4: Routing / Base Path / Asset Loading

### 4.1 Next.js Asset Path Configuration - VERIFIED ✓

**HTML references:**
```html
<link rel="stylesheet" href="/apps/stripe/_next/static/css/eaedf9553ee5bb6a.css">
<script src="/apps/stripe/_next/static/chunks/webpack-54f3518498986cf1.js" defer></script>
```

**Asset tests:**
```bash
curl -I /apps/stripe/_next/static/chunks/webpack-54f3518498986cf1.js
HTTP/1.1 200 OK

curl -I /apps/stripe/_next/static/chunks/main-1876e22106760241.js
HTTP/1.1 200 OK
```

**Result:** All JS/CSS assets load correctly with proper basePath `/apps/stripe`.

### 4.2 Route Verification - VERIFIED ✓

**App HTML content:**
```html
<div id="__next"></div>
<script id="__NEXT_DATA__" type="application/json">
  {"page":"/","buildId":"jZVDO-oVZuTIhEQPzXEEf","assetPrefix":"/apps/stripe"}
</script>
```

---

## Phase 5: Auth/Session Issues (Saleor App SDK)

### 5.1 App Bridge Handshake - CRITICAL FINDING

**App Bridge initialization flow:**

1. Dashboard loads app in iframe with query params:
   - `saleorApiUrl` (required)
   - `id` (app ID)
   - `theme`
   - `locale`

2. App's AppBridge extracts `saleorApiUrl` from URL and validates `document.referrer`

3. App sends `notifyReady` to Dashboard via postMessage

4. Dashboard responds with `handshake` event containing auth token

5. App sets `ready: true` and redirects to `/config`

**Potential failure points:**

1. **Missing `saleorApiUrl`:** If Dashboard doesn't pass this parameter, app logs:
   ```
   console.error("saleorApiUrl param was not found in iframe url")
   ```

2. **Referrer mismatch:** App extracts `refererOrigin` from `document.referrer`. If empty or mismatched:
   ```javascript
   if (origin !== this.refererOrigin) {
     // ALL messages from Dashboard are rejected!
     return;
   }
   ```

3. **Stored `appUrl` mismatch:** The Dashboard uses the `appUrl` stored at installation time, NOT the current manifest value. If the app was installed before environment variable fixes, the stored URL might be wrong.

---

## ROOT CAUSE CONFIRMED

### Primary: `crypto.randomUUID()` Not Available in Non-Secure Context

**Browser console error:**
```
Error: Failed to generate action ID. Please ensure you are using https or localhost
    at S (_app-be34b44491289bc8.js:41:74090)
    at Object.NotifyReady
```

**Cause:** The Saleor App SDK uses `crypto.randomUUID()` to generate action IDs for postMessage communication. This API is **only available in secure contexts** (HTTPS or localhost).

The staging environment uses plain HTTP over a public ALB URL (`http://saleor-platform-staging-alb-*.elb.amazonaws.com`), which is NOT a secure context.

**Code path:**
```javascript
// @saleor/app-sdk
function withActionId(action) {
  try {
    const actionId = globalThis.crypto.randomUUID(); // FAILS on HTTP!
    return { ...action, payload: { ...action.payload, actionId } };
  } catch (e) {
    throw new Error("Failed to generate action ID. Please ensure you are using https or localhost");
  }
}
```

**Result:** App crashes during initialization before rendering any UI → blank iframe.

### Secondary Findings (Not Root Cause)

- **Stored `appUrl` mismatch:** Not the issue - URLs were correct
- **Origin check:** Not the issue - referrer was present
- **Asset loading:** Not the issue - all bundles load 200 OK
- **Frame headers:** Not the issue - no blocking headers

---

## Investigation Log

| Timestamp | Hypothesis | Action | Result |
|-----------|------------|--------|--------|
| 23:40 PST | Start | Created debug log | - |
| 23:45 PST | Frame headers blocking | Checked X-Frame-Options, CSP | No blocking headers |
| 23:48 PST | Asset loading issues | Tested JS/CSS bundle loading | All assets return 200 OK |
| 23:50 PST | Mixed content | Verified HTTP/HTTPS scheme | Both HTTP, no issue |
| 23:55 PST | Manifest URLs wrong | Fetched manifest, verified appUrl | Manifest correct |
| 00:00 PST | App Bridge failure | Analyzed SDK source code | Found origin check mechanism |
| 00:10 PST | Stored URL mismatch | Need to verify stored vs manifest | Requires reinstall or DB check |

---

## FIX IMPLEMENTED

### Solution: Polyfill `crypto.randomUUID()` for Non-Secure Contexts

Added polyfill to all app `_app.tsx` files that runs before AppBridge initialization:

```typescript
/**
 * Polyfill for crypto.randomUUID() in non-secure contexts (HTTP).
 */
if (typeof window !== "undefined" && typeof crypto !== "undefined" && !crypto.randomUUID) {
  crypto.randomUUID = function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set UUID version (4) and variant (RFC4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}
```

**Files modified:**
- `saleor-apps/apps/stripe/src/pages/_app.tsx`
- `saleor-apps/apps/buylist/src/pages/_app.tsx`
- `saleor-apps/apps/inventory-ops/src/pages/_app.tsx`
- `saleor-apps/apps/pos/src/pages/_app.tsx`

**Why this works:** `crypto.getRandomValues()` IS available in non-secure contexts, so we use it to generate RFC4122-compliant UUIDs.

### Alternative: Enable HTTPS (Production Solution)

For production, enable HTTPS by:
1. Set up domain name and Route53 zone
2. In `staging.tfvars`:
   ```hcl
   create_acm_certificate = true
   use_https_urls = true
   route53_zone_id = "<zone-id>"
   ```
3. Run `terraform apply`

### Deployment Required

After committing the polyfill fix:
1. Build new Docker images for all apps
2. Push to ECR
3. Redeploy ECS services

---

## VERIFICATION CHECKLIST

After fix:
- [ ] Dashboard → Apps → click Stripe → UI renders (not blank)
- [ ] App shows configuration page, not "Loading..." forever
- [ ] Browser console has no frame-blocking errors
- [ ] No mixed content warnings
- [ ] Network tab shows app HTML and JS assets loading (200)

---

## Debug Tools Created

**Test iframe page:** `scripts/debug/test-app-iframe.html`

Simulates Dashboard embedding app in iframe. Use to test:
1. PostMessage communication
2. Handshake event flow
3. App Bridge initialization

---

*Investigation: 2026-01-14 23:40 PST - 2026-01-15 00:15 PST*
*Status: Root cause identified, fix pending validation*
