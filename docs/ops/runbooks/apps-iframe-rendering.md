# Apps Iframe Rendering Troubleshooting

## Overview

This runbook covers troubleshooting when Saleor Dashboard apps display blank pages in their iframes.

## Quick Diagnosis

### Symptom: Blank iframe when clicking app in Dashboard

**Check these in order:**

1. **App URL accessible?**
   ```bash
   curl -I http://<ALB_URL>/apps/<app-name>
   # Should return 200 OK
   ```

2. **Manifest correct?**
   ```bash
   curl http://<ALB_URL>/apps/<app-name>/api/manifest
   # Check appUrl matches expected value
   ```

3. **JS assets loading?**
   ```bash
   # Get asset path from HTML, then test:
   curl -I http://<ALB_URL>/apps/<app-name>/_next/static/chunks/webpack-*.js
   # Should return 200 OK
   ```

4. **Response headers?**
   ```bash
   curl -I http://<ALB_URL>/apps/<app-name>
   # Should NOT have:
   # - X-Frame-Options: DENY
   # - Content-Security-Policy: frame-ancestors 'none'
   ```

---

## Root Causes and Fixes

### 1. Stored appUrl Mismatch (Most Common)

**Symptom:** Dashboard loads wrong URL in iframe

**Cause:** App was installed with old/incorrect `appUrl` which is stored in Saleor database. Manifest was later fixed but stored URL not updated.

**Fix - Reinstall App:**
1. Dashboard → Apps → Select app → Settings → Delete
2. Dashboard → Apps → Install external app
3. Enter manifest URL: `http://<ALB_URL>/apps/<app-name>/api/manifest`
4. Complete installation

**Fix - Update via GraphQL:**
```graphql
mutation {
  appUpdate(id: "<APP_ID>", input: {
    appUrl: "http://<ALB_URL>/apps/<app-name>"
  }) {
    app { id appUrl }
    errors { message }
  }
}
```

### 2. Missing Environment Variables

**Symptom:** Manifest returns incorrect URLs (localhost, internal DNS, etc.)

**Required environment variables for apps:**
```env
APP_API_BASE_URL=http://<PUBLIC_URL>/apps/<app-name>
APP_IFRAME_BASE_URL=http://<PUBLIC_URL>/apps/<app-name>
BASE_PATH=/apps/<app-name>
NEXT_PUBLIC_BASE_PATH=/apps/<app-name>
SALEOR_API_URL=http://<PUBLIC_URL>/graphql/
```

**Terraform config location:** `infra/terraform/modules/ecs/main.tf` (apps section)

### 3. Frame Blocking Headers

**Symptom:** Browser console shows "Refused to frame..."

**Check response headers:**
```bash
curl -I http://<ALB_URL>/apps/<app-name>
```

**Problem headers:**
- `X-Frame-Options: DENY` or `SAMEORIGIN` (without Dashboard origin)
- `Content-Security-Policy: frame-ancestors 'none'`

**Fix:** Configure app or reverse proxy to allow framing from Dashboard origin:
```
Content-Security-Policy: frame-ancestors 'self' http://<DASHBOARD_ORIGIN>
```

### 4. Mixed Content (HTTPS/HTTP)

**Symptom:** Browser blocks iframe due to insecure content

**Problem:** Dashboard served over HTTPS but app served over HTTP

**Fix:** Ensure both Dashboard and apps use same scheme (both HTTPS or both HTTP)

### 5. Asset Path Misconfiguration

**Symptom:** HTML loads but page is blank (JS doesn't execute)

**Check Network tab for 404s:**
- `/_next/static/chunks/*.js`
- `/_next/static/css/*.css`

**Fix:** Verify `basePath` and `assetPrefix` in Next.js config match deployment path.

### 6. App Bridge Communication Failure

**Symptom:** App shows "Loading..." forever

**Cause:** PostMessage handshake between Dashboard and app fails

**Debug:**
1. Open browser DevTools → Console
2. Look for:
   - `saleorApiUrl param was not found in iframe url`
   - `document.referrer is empty`
   - Origin mismatch messages

**Fix:** Ensure Dashboard passes correct query parameters to iframe URL

---

## Required Headers for Apps

Apps embedded in Dashboard iframes should have these headers:

**DO NOT SET:**
- `X-Frame-Options: DENY`
- `Content-Security-Policy: frame-ancestors 'none'`

**RECOMMENDED:**
- `Content-Security-Policy: frame-ancestors 'self' http://<dashboard-origin>`

**OPTIONAL (for caching):**
- `Cache-Control: public, max-age=0, must-revalidate`

---

## Required Environment Variables

All apps need these variables to work correctly in Dashboard iframe:

| Variable | Purpose | Example |
|----------|---------|---------|
| `APP_API_BASE_URL` | Base URL for API endpoints | `http://alb.../apps/stripe` |
| `APP_IFRAME_BASE_URL` | URL loaded in Dashboard iframe | `http://alb.../apps/stripe` |
| `BASE_PATH` | Next.js base path | `/apps/stripe` |
| `NEXT_PUBLIC_BASE_PATH` | Client-side base path | `/apps/stripe` |
| `SALEOR_API_URL` | Saleor GraphQL endpoint | `http://alb.../graphql/` |

---

## Testing Iframe Communication

Use the debug test page to isolate issues:

```bash
# Located at:
scripts/debug/test-app-iframe.html
```

This HTML page simulates Dashboard loading an app:
1. Loads app in iframe with correct query params
2. Monitors postMessage events
3. Sends handshake event on demand

---

## Verification Checklist

After fix, verify:

- [ ] Dashboard → Apps → click app → UI renders
- [ ] App does NOT show "Loading..." forever
- [ ] Browser console has no frame-blocking errors
- [ ] Browser console has no mixed content warnings
- [ ] Network tab shows all assets loading (200 OK)
- [ ] App can make API calls to Saleor GraphQL

---

## Related Documentation

- Investigation log: `docs/debug/dashboard-app-blank-iframe.md`
- Stripe app install: `docs/ops/runbooks/stripe-app-install.md`
- ECS task definitions: `infra/terraform/modules/ecs/main.tf`
