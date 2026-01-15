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

## ROOT CAUSE HYPOTHESIS

### Primary: Stored `appUrl` Mismatch

**Timeline:**
1. App installed initially with incorrect `appUrl` (before `APP_IFRAME_BASE_URL` was configured)
2. Installation stored wrong URL in Saleor database
3. Manifest was later fixed to return correct URL
4. Dashboard still uses OLD stored URL to construct iframe src
5. Iframe loads wrong URL → blank page or missing query params

### Secondary: App Bridge Origin Check

If `document.referrer` is empty or origin doesn't match, ALL postMessage events from Dashboard are silently rejected:
```javascript
this.refererOrigin = document.referrer ? new URL(document.referrer).origin : void 0;
// ...
if (origin !== this.refererOrigin) {
  debug("Origin from message doesn't match refererOrigin. Function will return now");
  return; // Messages rejected!
}
```

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

## PROPOSED FIX

### Option 1: Reinstall Apps (Recommended)

The simplest fix is to reinstall all affected apps so the current manifest `appUrl` gets stored:

1. Uninstall existing app via Dashboard → Apps → (app) → Delete
2. Reinstall app via Dashboard → Apps → Install external app → Enter manifest URL

**Manifest URLs:**
- Stripe: `http://...elb.amazonaws.com/apps/stripe/api/manifest`

### Option 2: Update Stored appUrl via GraphQL (Advanced)

If app reinstall is not desired, use GraphQL mutation to update stored URL:
```graphql
mutation {
  appUpdate(id: "QXBwOjEyMzQ=", input: {
    appUrl: "http://...elb.amazonaws.com/apps/stripe"
  }) {
    app { id appUrl }
    errors { message }
  }
}
```

### Option 3: Database Direct Update (Emergency Only)

Update `app` table directly if GraphQL unavailable:
```sql
UPDATE app_app
SET app_url = 'http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe'
WHERE identifier = 'saleor.app.payment.stripe';
```

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
