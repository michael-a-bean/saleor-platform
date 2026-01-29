# Phase 1 Specification Review
## GPT-5.2

**Generated**: 2026-01-10T13:14:17.575312
**Model**: gpt-5.2
**Role**: Specification Correctness
**Duration**: 38.69 seconds

---

## Specification Review Summary
The plan aligns well with the stated Phase 1 objectives (mirror `make validate`, add security scanning, broaden TS coverage, validate migrations, verify container builds). However, several items are underspecified or technically incomplete (notably Trivy pinning, Prisma validation install context, missing Django migration validation, and ambiguity around “mirror make validate”).

## Correctness Analysis

### Objectives ↔ Planned Changes traceability
1) **Mirror local `make validate` checks in CI**
- Partially met: you add lint/typecheck/tests for `saleor-apps` and keep existing backend/storefront checks.
- Ambiguity: “mirror `make validate`” is not defined. If `make validate` includes formatting, codegen, schema checks, dependency audits, or Docker build checks, CI may still diverge.

2) **Add security scanning (gitleaks, trivy)**
- Gitleaks is included; Trivy is included (but only scans the storefront image).
- Correctness gap: Trivy job uses `aquasecurity/trivy-action@master` (un-pinned) and only scans one image; custom app images are not scanned.

3) **Expand test coverage to all TypeScript projects**
- `verify_apps` covers the monorepo, but it assumes `pnpm lint`, `pnpm check-types`, `pnpm test:ci` exist and are stable across all packages.
- Potential gap: storefront is already checked; if there are other TS projects outside `storefront` and `saleor-apps`, they’re not covered (spec doesn’t enumerate TS project locations).

4) **Validate migrations (Django + Prisma)**
- Only Prisma validation is implemented, and only for `saleor-apps/apps/inventory-ops`.
- Correctness issue: the Prisma step runs `pnpm install` inside `apps/inventory-ops` without setting `working-directory` to the monorepo root where `pnpm-lock.yaml` likely lives. In many pnpm workspace setups, installing from a package subdir either fails or does not respect the workspace lock as intended. This is a common source of CI breakage.
- Django migration validation is not implemented at all, despite being in the objective.

5) **Verify container builds**
- Implemented for storefront and four custom app Dockerfiles.
- Correctness issue: `docker build ./saleor-apps -f saleor-apps/apps/inventory-ops/Dockerfile` uses build context `./saleor-apps`. That may be correct, but it depends on Dockerfiles referencing paths relative to that context. If any Dockerfile expects repo-root context, builds will fail. The plan doesn’t state the expected build contexts per Dockerfile.
- Also, no `--pull` or caching strategy is specified; not required, but impacts reproducibility and speed.

### Workflow/job structure and dependencies
- **Job dependency structure (`needs: verify_builds`)**: correct if the intent is “only scan images that successfully build.” However, your `container_scan` rebuilds the storefront image instead of reusing the image from `verify_builds`. So `needs` provides ordering but not artifact reuse. If the goal is to avoid duplicate work, you need a strategy (e.g., build once and `docker save`/upload artifact, or scan in the same job).
- **Triggers**: `push` to `platform/main` and `pull_request` are fine. Confirm branch naming is correct (`platform/main` vs `main`).
- **Concurrency**: good practice; note that grouping by `${{ github.ref }}` cancels prior runs on the same ref, which is typically desired for PRs.

### Security scanning specifics
- **Gitleaks**: `fetch-depth: 0` is good for scanning full history if desired, but it increases runtime. If you only need PR diff scanning, you can scope it; spec doesn’t state which is required.
- **Trivy**:
  - Uses `@master` (not pinned) → supply-chain risk and non-reproducible builds.
  - Only scans `storefront:scan`. Objective says “Add security scanning (gitleaks, trivy)” but doesn’t specify coverage; your “Verify container builds for custom apps” suggests those should also be scanned, or explicitly out of scope for Phase 1.

### Migration validation specifics
- **Prisma**: `pnpm prisma validate` is fine as a static check, but it does not validate migrations are runnable against a database. If the objective is “validate migrations,” you likely also want `prisma migrate diff` / `migrate status` or a test DB apply step (depending on your workflow).
- **Django**: missing. A minimal CI check is typically `python manage.py makemigrations --check --dry-run` and/or `python manage.py migrate --check` (depending on Django version and settings), usually requiring DB connectivity for full migrate.

## Definition of Done Gaps
Your Validation Criteria are directionally correct but not measurable enough to prevent partial implementation. Missing/ambiguous acceptance criteria:
- **What exactly constitutes “mirror local `make validate`”**: list the commands and expected outputs (or reference a canonical script) and ensure CI runs the same entrypoint(s).
- **Security scanning thresholds**:
  - For Trivy: define severity threshold that fails the build (e.g., fail on CRITICAL/HIGH, allowlist, ignore unfixed, etc.).
  - For gitleaks: define whether scanning includes full git history or only PR changes; define how allowlisting is managed and reviewed.
- **Coverage scope**:
  - Enumerate “all TypeScript projects” (paths) and ensure each is included.
  - Enumerate “all custom apps” Dockerfiles to build/scan (avoid hardcoding a partial list unless that’s intended).
- **Migration validation scope**:
  - Specify which Django project(s) and which Prisma apps/schemas are validated.
  - Specify whether validation is “static” (schema validate) or “apply to ephemeral DB”.
- **Artifacts/reporting**:
  - Trivy SARIF upload is included; gitleaks results are not uploaded as SARIF (optional, but if you want consistent reporting, define it).

## CI/CD Best Practices
- **Good alignment**
  - Separate jobs for parallelism.
  - Use `actions/checkout@v4`, `setup-node@v4`, pnpm caching.
  - Concurrency cancellation to reduce wasted CI.
  - SARIF upload for Trivy (good for GitHub Security tab integration).

- **Needs improvement**
  - **Pin third-party actions** to a commit SHA (or at least a version tag). `aquasecurity/trivy-action@master` is a red flag.
  - **Avoid duplicate builds**: `verify_builds` builds storefront, then `container_scan` rebuilds it. Either scan in the same job or persist the built image as an artifact.
  - **Principle of least privilege**: consider explicitly setting `permissions:` per workflow/job (e.g., `contents: read`, `security-events: write` for SARIF upload).
  - **Determinism**: ensure Node version and pnpm version match local expectations; Node 22 is fine if your toolchain supports it, but confirm compatibility (some ecosystems still standardize on Node 20 LTS).
  - **Workspace installs**: run `pnpm install` at the workspace root for monorepos unless you have a documented reason not to.

## Recommendations
1) **Make “mirror `make validate`” concrete**
   - Add a section listing the exact commands `make validate` runs (or call `make validate` directly in CI for each component), and ensure CI uses the same entrypoints.

2) **Fix Prisma validation install context**
   - Run `pnpm install --frozen-lockfile` at `saleor-apps/` root once, then run `pnpm --filter inventory-ops prisma validate` (or equivalent), rather than installing inside `apps/inventory-ops`.

3) **Add Django migration validation (at least static)**
   - Minimum: `python manage.py makemigrations --check --dry-run`.
   - If feasible: spin up a service DB (Postgres) and run `python manage.py migrate` to ensure migrations apply cleanly.

4) **Harden and broaden Trivy scanning**
   - Pin the Trivy action to a version/commit SHA.
   - Decide scope: scan all built images (storefront + each custom app) or explicitly state Phase 1 scans only storefront.
   - Define fail conditions (severity threshold, ignore policy, handling of unfixed vulns).

5) **Reduce duplication between build and scan**
   - Option A: merge build+scan into one job per image.
   - Option B: build once, `docker save` to artifact, download in scan job, `docker load`, then scan.

6) **Add explicit workflow permissions**
   - Example: default `contents: read`; for SARIF upload job add `security-events: write`.

7) **Confirm missing checks from DELIVERY_CONTRACT.md**
   - The plan references it but doesn’t enumerate what might be missing. Add a checklist mapping each contract requirement to a CI job/step.

## Approval Status
NEEDS REVISION

---

*Generated by delivery pipeline multi-agent review*
