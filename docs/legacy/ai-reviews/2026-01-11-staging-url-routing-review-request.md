# AI Review Request: Staging URL Routing Fix

**Date:** 2026-01-11
**Status:** Pending External Review

## Review Request

This document contains the diagnosis and proposed fix for the staging URL routing issue.
External AI reviews were requested from GPT-5.2 and Gemini 3 but require manual submission.

## Diagnosis Summary

### Problem
- Staging generates URLs for `api.staging.shuffleandcut.com` which has no DNS records
- Dashboard has `localhost:8000` baked in from official Saleor image
- ALB DNS (`saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com`) is the only reachable endpoint

### Proposed Fix

1. **Introduce `public_api_base_url` variable in Terraform**
   - For staging without DNS: use ALB DNS directly
   - For production with DNS: use custom domain

2. **Update ECS task definitions**
   - Conditionally generate URLs based on whether custom domain is available

3. **Update GitHub Actions variables**
   - Set to ALB DNS for staging

4. **Add URL validation script**
   - Verify configured URLs are reachable before deployment

## Questions for GPT-5.2 (Correctness)

1. Is the approach of using a single `public_api_base_url` variable correct for unifying URL configuration?
2. Are there any Next.js-specific concerns with runtime vs build-time env injection?
3. Should we implement runtime env injection for the storefront, or is per-environment builds acceptable?

## Questions for Gemini 3 (Security)

1. Are there any security concerns with using HTTP on staging (no TLS)?
2. Is the CORS/CSRF configuration correct when using ALB DNS directly?
3. Should we restrict `ALLOWED_HOSTS` more tightly for staging?

## Proposed Implementation

See detailed changes in the diagnostic report:
`docs/ops/diagnostics/2026-01-11-staging-url-routing.md`

---

**Note:** To submit for external review:
1. Copy the diagnostic report content
2. Submit to GPT-5.2 with correctness questions
3. Submit to Gemini 3 with security questions
4. Record responses in this file
