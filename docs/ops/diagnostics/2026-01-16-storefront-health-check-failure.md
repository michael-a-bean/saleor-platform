# Storefront ECS Health Check Failure Analysis

**Date**: 2026-01-16 11:24 PST
**Environment**: staging
**Affected Service**: storefront

## Summary

The storefront ECS deployment is marked as FAILED, but the service is actually running correctly and serving traffic. This is a **false negative** caused by a missing dependency in the Docker container.

## Current Status

| Metric | Value |
|--------|-------|
| ECS Deployment Status | FAILED |
| ECS Task Health | UNHEALTHY |
| ECS Running Tasks | 1 |
| ALB Target Health | **healthy** |
| Service Availability | **OPERATIONAL** |

## Root Cause Analysis

### The Problem

The ECS container health check command:
```bash
curl -f http://localhost:3000/api/health || exit 1
```

**Fails because `curl` is not installed in the Alpine-based Docker image.**

### Evidence

1. **Docker Base Image**: `node:22-alpine` (minimal Alpine Linux)
2. **Container Logs**: Show Next.js starts successfully with "Ready in 1846ms"
3. **Health Endpoint**: `/api/health` route exists and returns JSON `{"status":"healthy"}`
4. **ALB Health Check**: Uses HTTP GET (not curl) to same endpoint - **PASSES**

### Discrepancy Explained

| Check Type | Method | Result |
|------------|--------|--------|
| ALB Health Check | HTTP GET /api/health | ✅ healthy |
| ECS Container Health | curl command | ❌ fails (curl not found) |

## Impact

- **User-facing**: None - storefront is fully operational
- **Deployments**: Future deployments will fail and trigger circuit breaker rollback
- **Monitoring**: False unhealthy status in ECS console

## Recommended Fix

Update the ECS health check to use `wget` (available in Alpine/BusyBox) instead of `curl`:

**Option 1** - Use wget (preferred, no Docker change needed):
```hcl
# In terraform ECS task definition
health_check {
  command = ["CMD-SHELL", "wget -q --spider http://localhost:3000/api/health || exit 1"]
}
```

**Option 2** - Install curl in Dockerfile:
```dockerfile
# In runner stage
RUN apk add --no-cache curl
```

## Related Files

- Task Definition: `saleor-platform-staging-storefront:13`
- Dockerfile: `storefront/Dockerfile`
- Health Route: `storefront/src/app/api/health/route.ts`
- Terraform: `infra/terraform/modules/ecs/main.tf`

## Timeline

- 02:46:07 PST - Task `df3d20c843a549f5ab21c8ea7ecb90be` failed container health checks
- 02:46:18 PST - ECS began draining connections
- 02:46:34 PST - Deployment marked as FAILED
- Current - Previous task still running, serving traffic via ALB
