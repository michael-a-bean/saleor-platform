# Phase 1 Plan: CI Quality Gates

**Date:** 2026-01-10
**Author:** Claude Code (Gen)
**Status:** DRAFT - Pending Multi-Agent Review

---

## Objectives

1. Mirror local `make validate` checks in CI
2. Add security scanning (gitleaks, trivy)
3. Expand test coverage to all TypeScript projects
4. Validate migrations (Django + Prisma)
5. Verify container builds

---

## Current State

**Existing `.github/workflows/test-platform.yml`:**
- `verify_backend`: docker compose build + pytest
- `verify_storefront`: pnpm install, typecheck, lint, test

**Gaps:**
- saleor-apps not tested at platform level
- No migration validation
- No security scanning
- No container build verification for custom apps

---

## Planned Changes

### 1. Expand test-platform.yml

Add new jobs to match local validation:

```yaml
jobs:
  # Existing jobs (keep)
  verify_backend: ...
  verify_storefront: ...

  # NEW: Validate saleor-apps monorepo
  verify_apps:
    name: Apps Checks
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./saleor-apps
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
          cache-dependency-path: saleor-apps/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm check-types
      - run: pnpm test:ci

  # NEW: Security scanning
  security_scan:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Run gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # NEW: Container builds (verify all Dockerfiles build)
  verify_builds:
    name: Container Builds
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Build storefront
        run: |
          docker build ./storefront \
            --build-arg NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/ \
            --build-arg NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000 \
            --build-arg NEXT_PUBLIC_DEFAULT_CHANNEL=webstore
      - name: Build custom apps
        run: |
          docker build ./saleor-apps -f saleor-apps/apps/inventory-ops/Dockerfile
          docker build ./saleor-apps -f saleor-apps/apps/buylist/Dockerfile
          docker build ./saleor-apps -f saleor-apps/apps/pos/Dockerfile
          docker build ./saleor-apps -f saleor-apps/apps/stripe/Dockerfile

  # NEW: Migration validation
  validate_migrations:
    name: Migration Validation
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Validate Prisma schema
        working-directory: ./saleor-apps/apps/inventory-ops
        run: |
          pnpm install --frozen-lockfile
          pnpm prisma validate
```

### 2. Add Trivy Container Scanning

```yaml
  container_scan:
    name: Container Security Scan
    runs-on: ubuntu-latest
    needs: verify_builds
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - name: Build storefront for scanning
        run: docker build -t storefront:scan ./storefront --build-arg ...
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'storefront:scan'
          format: 'sarif'
          output: 'trivy-results.sarif'
      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'
```

### 3. Workflow Configuration

```yaml
name: test-platform
on:
  pull_request:
  push:
    branches:
      - platform/main

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

---

## Scope Boundaries

### WILL Change
- `.github/workflows/test-platform.yml` - Expand with new jobs
- Add security scanning (gitleaks, trivy)

### WILL NOT Change
- Application source code
- Deployment configuration (Phase 2)
- Container registry setup (Phase 2)
- Infrastructure provisioning

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| CI runtime increase | LOW | Parallel jobs, caching |
| False positives from gitleaks | LOW | Configure `.gitleaks.toml` allowlist |
| Storefront build requires API | MEDIUM | Skip codegen in CI build test |
| saleor-apps tests may fail | MEDIUM | Review existing test status first |

---

## Validation Criteria

Phase 1 complete when:
- [ ] All new CI jobs pass on a PR
- [ ] gitleaks detects no secrets in codebase
- [ ] Container builds succeed for all custom apps
- [ ] Prisma schema validation passes
- [ ] No regressions in existing checks

---

## Questions for Multi-Agent Review

### For GPT-5.2 (Specification/Correctness)
1. Is the job dependency structure correct (needs: verify_builds)?
2. Should we add Django migration validation in CI? (requires running db)
3. Are there any missing checks from the DELIVERY_CONTRACT.md?

### For Gemini 3 (Security/Ops Risk)
1. Is gitleaks + trivy sufficient for Phase 1 security scanning?
2. Any concerns with building containers in CI without pushing?
3. Should we add SARIF upload for all security tools?

---

*This plan will be implemented after multi-agent review feedback is incorporated.*
