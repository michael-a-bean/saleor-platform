# Plan: Optimize deploy-staging Pipeline

## Context

Every push to `platform/main` triggers `deploy-staging.yml`, which runs the full pipeline (migrations + all deploys) even when only a few files changed. The deploy takes ~14 min with most time wasted on:
- Migrations running as ECS tasks (~4.5 min) even when no schema changed
- Core services (api, worker, dashboard) force-restarting via `--force-new-deployment` even with unchanged `KEEP` images
- App deploys spinning up 5 runners when only 1 app changed

Combined with the already-applied fix (removing the redundant `test-platform` push trigger), these changes cut a no-change deploy from ~14 min to ~1 min.

## Changes

### File: `.github/workflows/deploy-staging.yml`

#### 1. Add migration detection to `changes` job

**dorny paths-filter** — add new filter:
```yaml
migrations:
  - 'saleor-apps/apps/inventory-ops/prisma/**'
  - 'saleor-apps/apps/mtg-import/prisma/**'
```

**Submodule content inspection** — add migration path checks:
```bash
echo "migrations-inventory-ops=$(check_app apps/inventory-ops/prisma)" >> $GITHUB_OUTPUT
echo "migrations-mtg-import=$(check_app apps/mtg-import/prisma)" >> $GITHUB_OUTPUT
```

**Merge step** — combine dorny + submodule for migrations:
```bash
MIGRATIONS=$(merge migrations "${{ steps.filter.outputs.migrations }}" \
  "$([ "${{ steps.submodule.outputs.migrations-inventory-ops }}" = "true" ] || \
     [ "${{ steps.submodule.outputs.migrations-mtg-import }}" = "true" ] && echo true || echo false)" \
  "$SUB_PKG")
echo "migrations=$MIGRATIONS" >> $GITHUB_OUTPUT
```

**New output**: `migrations: ${{ steps.merge.outputs.migrations }}`

#### 2. Make `migrate` job conditional

Only run if migration files changed or force_all:
```yaml
if: >-
  always()
  && needs.validate.result == 'success'
  && (needs.build.result == 'success' || needs.build.result == 'skipped')
  && (needs.changes.outputs.migrations == 'true' || inputs.force_all == 'true')
```

#### 3. Add `should-deploy` gate to `deploy` job (core services)

Add first step checking each service's need:
- `api` / `worker`: deploy only if migrations ran OR force_all (these use `KEEP` images)
- `storefront`: deploy only if storefront changed OR force_all
- `dashboard`: deploy only if force_all (scaled to 0)

All subsequent steps (Checkout, AWS config, deploy-service.sh, wait-for-stability) gated on `if: steps.should-deploy.outputs.deploy == 'true'`.

#### 4. Add `should-deploy` gate to `deploy-apps` job

Same pattern: first step checks `needs.changes.outputs[matrix.app]` OR force_all. All subsequent steps gated.

#### 5. Adjust `validate-urls` and `smoke-test` conditions

Run if any deploy or migration actually happened. Use:
```yaml
if: >-
  always()
  && (needs.deploy.result == 'success' || needs.deploy-apps.result == 'success')
  && needs.changes.outputs.any_changed == 'true'
```

Also handle the migrate-skipped case: allow deploy/deploy-apps to proceed when migrate is skipped (already using `always()` pattern, but ensure `needs.migrate.result` allows 'skipped').

## Files Modified

| File | Change |
|------|--------|
| `.github/workflows/deploy-staging.yml` | Migration detection, conditional migrate/deploy/smoke |
| `.github/workflows/test-platform.yml` | Already done: removed push trigger |
| `docs/reference/pr-review-pipeline.md` | Already done: added design decision |

## Expected Results

**No-change push** (e.g. docs, workflow files only):

| Phase | Before | After |
|-------|--------|-------|
| Detect Changes + Validate | 30s | 30s |
| Build | 4 min (6 runners) | Skipped |
| Migrate | 4.5 min (3 ECS tasks) | Skipped |
| Core Deploys | 4.5 min (4 services) | Skipped |
| App Deploys | 28s (5 runners) | Skipped |
| Validation + Smoke | 40s | Skipped |
| **Total** | **~14 min** | **~1 min** |

**Single app change** (e.g. inventory-ops only):

| Phase | Before | After |
|-------|--------|-------|
| Build | 6 runners | Only inventory-ops |
| Migrate | All 3 migrations | Only if Prisma schema changed |
| Core Deploys | All 4 services | Skipped |
| App Deploys | All 5 apps | Only inventory-ops |
| **Total** | **~14 min** | **~6-8 min** |

## Verification

1. Read the final workflow YAML and verify all `if:` conditions are correct
2. Check that `force_all=true` manual dispatch still runs full pipeline
3. Push to `platform/main` and confirm GitHub Actions shows skipped jobs
