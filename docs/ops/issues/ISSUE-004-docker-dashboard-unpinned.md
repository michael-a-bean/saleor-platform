# ISSUE-004: Docker Dashboard Image Unpinned

**Priority:** P0 - Critical
**Category:** Infrastructure
**Status:** Open
**Created:** 2026-01-23
**Source:** Repository Health Audit

---

## Problem

Saleor Dashboard uses `:latest` tag, causing unpredictable container updates.

**File:** `docker-compose.yml`

```yaml
# Current (risky):
image: ghcr.io/saleor/saleor-dashboard:latest
```

## Impact

- Container pulls latest dashboard on every start
- Could introduce breaking changes without warning
- No version control over frontend admin interface
- Potential API/Dashboard version mismatch

## Root Cause

Default configuration from upstream Saleor Platform fork, not updated for version pinning.

## Remediation Steps

### Step 1: Determine Compatible Version

Current Saleor API version: `3.22`

Dashboard should match:
```bash
# Check Saleor compatibility matrix or use same minor version
# Dashboard 3.22.x is compatible with API 3.22.x
```

### Step 2: Update docker-compose.yml

```yaml
# Before:
image: ghcr.io/saleor/saleor-dashboard:latest

# After:
image: ghcr.io/saleor/saleor-dashboard:3.22
```

**Location in file:** Search for `saleor-dashboard` service definition.

### Step 3: Also Fix Jaeger (Related Issue)

While editing, also pin Jaeger version:

```yaml
# Before:
image: jaegertracing/jaeger

# After:
image: jaegertracing/jaeger:2.14.0
```

### Step 4: Pull New Images

```bash
docker compose pull dashboard jaeger
```

### Step 5: Restart Services

```bash
docker compose up -d dashboard jaeger
```

## Verification

```bash
# Verify correct versions running:
docker compose ps
docker inspect saleor-platform-dashboard-1 | grep Image

# Access dashboard:
open http://localhost:9000
# Should load without errors
```

## Version Compatibility Matrix

| Saleor API | Dashboard | Status |
|------------|-----------|--------|
| 3.22.x | 3.22.x | Compatible |
| 3.22.x | 3.21.x | May work with warnings |
| 3.22.x | 3.20.x | Not recommended |

## Definition of Done

- [x] Dashboard image pinned to specific version (3.22)
- [x] Jaeger image pinned to specific version (2.14.0)
- [x] docker-compose.yml committed
- [x] Services restart successfully
- [x] Dashboard accessible at localhost:9000
