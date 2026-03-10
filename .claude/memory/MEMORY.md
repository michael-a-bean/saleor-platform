## Saleor Platform Key Patterns

### Architecture
- Prisma schema is shared via symlink: `inventory-ops/prisma/schema.prisma` is the source, symlinked to POS and Buylist apps. Edit inventory-ops, run migration, regenerate in POS/Buylist.
- SKU format: `{scryfall_uuid}-{condition}-{finish}` (e.g., `ff1b8fc5-NM-NF`). Used in price sync cron to parse condition/finish.
- Both `price_amount` AND `discounted_price_amount` must be set on channel listings. NULL `discounted_price_amount` causes currency AttributeError crash.

### Key File Locations
- WAC service: `saleor-apps/apps/inventory-ops/src/modules/cost-layers/wac-service.ts` (~820 LOC)
- Price sync router: `saleor-apps/apps/inventory-ops/src/modules/price-sync/price-sync-router.ts` (~1200 LOC)
- Price sync publish: `saleor-apps/apps/inventory-ops/src/modules/price-sync/publish-prices.ts` (140 LOC)
- Price sync cron: `saleor-apps/apps/inventory-ops/src/app/api/cron/price-sync/route.ts` (636 LOC)
- POS payments: `saleor-apps/apps/pos/src/modules/payments/payments-router.ts` (1200+ LOC)
- Legacy import: `scripts/mtg_scryfall_import/import_command.py` (543 LOC)

### Test Coverage Status (Mar 2026)
- Inventory-ops/price-sync: Well tested (56 test cases across router + publish-prices)
- Inventory-ops/WAC: Well tested (307+ assertions)
- Inventory-ops/card-matcher: 23 tests covering all 6 tiers, fallthrough, error handling, variant selection
- POS: Critically undertested (1 test file for entire app)
- MTG Import: Implemented (2,561 LOC across pipeline, job-processor, attribute-map; 562 LOC tests across 4 files)
- **GOTCHA: vitest + bun incompatible** — Bun's `node` wrapper breaks tinypool workers. Must use real Node.js: `export PATH="$HOME/.local/share/fnm:$PATH" && eval "$(fnm env)" && fnm use 22 && npx vitest run`

### Observability (configured Feb 21, 2026)
- **OpenTelemetry → Grafana Cloud**: Saleor API + worker export traces/metrics via OTLP HTTP/protobuf
- Grafana Cloud zone: `prod-us-west-0`, org ID: 1676082, OTLP instance: 1533536
- Endpoint: `https://otlp-gateway-prod-us-west-0.grafana.net/otlp`
- Auth stored in SSM: `/saleor/staging/api/OTEL_EXPORTER_OTLP_HEADERS` (URL-encoded `%20` not literal space)
- **Service name gotcha**: Saleor overrides `OTEL_SERVICE_NAME` env var — traces appear as `saleor` (not `saleor-api`)
- Terraform: controlled by `otel_exporter_endpoint` variable (empty string = disabled)
- Local dev: `backend.env` has endpoint/protocol, `.env` (gitignored) has auth header
- Jaeger still available locally by uncommenting in `backend.env`
- Runbook: `docs/ops/runbooks/observability-otel-grafana.md`

### Grafana Cloud CloudWatch Dashboards (configured Mar 6, 2026)
- **Terraform module**: `infra/terraform/modules/grafana-dashboards/` — data source, folder, 2 dashboards
- **Grafana provider**: `grafana/grafana ~> 3.0` in `versions.tf` + `providers.tf`
- **Auth**: Service account token via `TF_VAR_grafana_api_token` env var (never in tfvars). Token: `glsa_qn0x...` stored in GitHub secret `GRAFANA_API_TOKEN`
- **Service account**: Requires **Admin** role (not Editor) to create data sources
- **CRITICAL: schemaVersion must be 21** — Grafana Cloud 13.0.0 silently refuses to fire CloudWatch queries with schemaVersion 39. Built-in dashboards use 21.
- **CRITICAL: Use `"statistics": ["Average"]` (plural array)** — NOT `"statistic": "Average"` (singular string). The singular form silently fails.
- **Unnecessary fields**: `queryMode` and `id` are NOT needed in CloudWatch targets — the working built-in dashboards don't use them
- **CloudWatch data source**: Uses `grafana_assume_role` auth (cross-account via IAM role `saleor-platform-staging-grafana-cloudwatch`)
- **IAM module**: `infra/terraform/modules/grafana-cloudwatch/` — trust policy for Grafana Labs AWS account
- **Two dashboards**: ECS Services (11 services, CPU/mem/network) + Infrastructure (RDS, ElastiCache, ALB, fck-nat)
- **CRITICAL: Template variables don't work with CloudWatch** — `$variable` in dimensions silently fails (all variable types tested). Inject hardcoded values from Terraform via `service_names_json` instead.
- **CloudWatch plugin**: Must be enabled (`/api/plugins/cloudwatch/settings` → `enabled: true`). Was disabled by default.
- Grafana Cloud stack URL: `https://michaelbean.grafana.net/`
- Grafana AWS Account: `008923505280`, External ID: `1533536`
- **OTEL dashboards** (Mar 6, 2026): APM (saleor_request_*, saleor_graphql_*, Tempo traces) + External Services (saleor_external_request_*). Conditionally created via `tempo_datasource_uid`/`prometheus_datasource_uid` vars.
- **OTEL metric names are Saleor-custom** (NOT standard OTEL): `saleor_request_count_total`, `saleor_graphql_operation_count_total`, etc. Service name: `saleor-api`.
- **Grafana Cloud data source UIDs**: Tempo=`grafanacloud-traces`, Prometheus=`grafanacloud-prom` (pre-existing, NOT Terraform-managed)
- **Full reference**: `docs/reference/grafana-cloudwatch-dashboards.md`

### Meilisearch (as of Mar 2026)
- **Staging sizing**: 1024 CPU / 2048 MB (bumped from 512/1024 — filter rebuilds on 76k docs froze at lower config)
- **EFS storage**: Persistent data on EFS. Filter index rebuilds are I/O-bound and take extended time. Previous 512MB config caused frozen process.
- **Filterable attributes**: `collector_number`, `tcgplayer_id`, `scryfall_id`, `set_code`, `set_name`, `color_identity`, `colors`, `conditions_available`, `finishes_available`, `in_stock`, `keywords`, `mana_value`, `min_price`, `rarity`, `type_line`
- **Indexes**: `webstore-products`, `singles-builder-products`
- **Service discovery**: `meilisearch.saleor-platform-staging.local:7700` (namespace `ns-xhvqzcnvqxn3agm7`, service `srv-xzf7plnegd6nuhst`)
- **Master key**: Secrets Manager `saleor/staging/meilisearch/master-key`
- **GOTCHA**: Adding filterable attributes triggers full re-index. On EFS with 76k docs, this can take 30+ min and make Meilisearch completely unresponsive. 2048MB minimum.

### Infrastructure (as of Feb 2026)
- **AWS Region**: `us-west-1` (NOT us-east-1) — per `staging.tfvars`
- **ECS Cluster**: `saleor-platform-staging` — 11 services (api, worker, dashboard, storefront, pos, inventory-ops, beat, meilisearch, buylist, stripe, mtg-import)
- Staging domain: `staging.michaelbean.org` (HTTPS via ACM wildcard cert)
- Route53 hosted zone: `Z04460563Q0BF3J4587VW` (michaelbean.org)
- Staging URLs: `https://api.staging.michaelbean.org`, `https://staging.michaelbean.org`, `https://dashboard.staging.michaelbean.org`
- ALB routing: host-based on HTTPS listener (port 80 redirects to 443)
- Terraform: always run from `infra/terraform/` with `-var-file=environments/staging.tfvars`
- Terraform init needs S3 backend: `-backend-config="key=staging/terraform.tfstate"`
- `terraform` binary is at `/usr/bin/terraform` (not Docker)
- When switching ALB from HTTP to HTTPS, remove old `_http[0]` import blocks from `imports.tf`
- ACM certs may fail with `UnsupportedCertificate` immediately after creation — retry after a minute
- `count` in Terraform cannot depend on computed values — use explicit bool variables instead
- CI/CD: `deploy-staging.yml` uses selective builds (dorny/paths-filter) + matrix strategy
- Single-service deploy: `scripts/deploy/aws/deploy-single.sh staging <service>`
- **Auto-scaling**: min=0, max=2 (default). Midnight PST scheduled action sets max=0 to save costs. Manual spin-up: `aws ecs update-service --desired-count 1` (must set max>0 first via Application Auto Scaling)
- **ECS one-off tasks**: Use `saleor-platform-staging-migrate` task def with command overrides. Subnets: `subnet-0885b491c2d394fb6,subnet-0917a8f4d0d7b7080`, SG: `sg-0210b4854c817f8ac`, assignPublicIp=DISABLED

### CI/CD Patterns (as of Mar 2026)
- Prisma migrations: ONLY inventory-ops runs `prisma migrate deploy`. Other apps (mtg-import, POS, buylist) share the schema via symlink but must NOT run their own migrations — causes P3009 poisoning cycle.
- If Prisma P3009 occurs: `DELETE FROM _prisma_migrations WHERE finished_at IS NULL;` via `npx prisma db execute --stdin`
- Deploy script (`deploy-service.sh`): gracefully skips services when SHA-tagged image not found in ECR (service wasn't rebuilt).
- **Dashboard uses `IMAGE="KEEP"`** in deploy-service.sh — copies current task def as-is, including env vars. Stale API_URL in task def persists across deploys until manually updated.
- Storefront has TWO API URL sources: build-time `NEXT_PUBLIC_SALEOR_API_URL` (baked in by CI) and runtime `SALEOR_API_URL` (from ECS task def env vars, used by SSR). Both must be HTTPS.
- GitHub Actions matrix YAML: `$STAGING_API_URL` is literal text; use `${{ vars.STAGING_API_URL }}` for interpolation.
- `gh run rerun --failed` only re-runs failed jobs, but skipped builds mean SHA-tagged images may not exist for deploy jobs.
- Dashboard smoke test: accept 503 (scaled to 0 for cost savings).
- **dorny/paths-filter limitation**: Cannot detect changes inside git submodules — only sees submodule pointer changes. Recommend replacing with custom `git diff --submodule=diff` script.
- **CRITICAL: Always push submodule commits before pushing parent repo.** If saleor-apps submodule pointer references a commit that doesn't exist on its remote, ALL CI workflows fail at checkout (`upload-pack: not our ref`). Pre-push hook in `.githooks/pre-push` now validates this.
- **Git hooks path**: Must be configured via `git config core.hooksPath .githooks` — this is NOT automatic and must be set after cloning. The `.githooks/` directory contains pre-push validation (branch protection, submodule ref checks, env validation). **GOTCHA (Mar 10, 2026)**: `core.hooksPath` was pointing at `.git/hooks` (default) instead of `.githooks`, causing pre-push submodule validation to silently not run. CI failed on PR #66 because nested submodule commits weren't pushed. Now also validated in `.claude/hooks/pre-pr-lint.sh` (dual protection).

### Price Sync Write-Back (implemented Feb 14, 2026)
- `publish-prices.ts`: Standalone module with `publishApprovedPrices()` — calls `productVariantChannelListingUpdate` mutation, sets both `price` and `costPrice` to prevent NULL `discounted_price_amount`.
- Wired into `approveAll`, `approveSelected`, and `autoApprove` endpoints in the router.
- `APPLIED` status enum added to `PendingPriceStatus` — separates "human approved" from "written to Saleor". Enables retry without re-approval.
- `appliedAt` timestamp on `PendingPriceUpdate` — tracks when price was written to Saleor.
- `applyToSaleor` standalone tRPC endpoint — retry failed writes by jobId or updateIds.
- Migration: `prisma/migrations/20260214_add_applied_status/migration.sql` (needs `prisma migrate deploy` on staging).
- `saleor-client.ts` also has `updateVariantPrices()` and `updateVariantPricesBatch()` methods, but the router uses `publishApprovedPrices()` instead for consistency (sets `costPrice`).

### Issue Tracking (as of Feb 14, 2026)
- GitHub Issues enabled on saleor-platform: https://github.com/michael-a-bean/saleor-platform/issues
- File-based trackers (`docs/ops/issues/`, `.claude/issues/`) deprecated — point to GitHub
- saleor-apps repo still has issues disabled (not needed — use platform repo)

### Storefront Gotchas (validated Feb 17, 2026)
- **DYNAMIC_SERVER_USAGE**: All Next.js pages using `notFound()`, `redirect()`, or `useSearchParams()` MUST have `export const dynamic = "force-dynamic"`. ISR (`revalidate = 60`) causes 500 errors in production. Fixed in products, categories, pages, sealed category pages.
- ISR can coexist with `force-dynamic` via `revalidate` option in `executeGraphQL()` calls (data fetching level), but the page-level export must be `force-dynamic`.

### Critical Gaps (validated Feb 15, 2026)
- POS Tax: Tax infra exists (env var + session override, lines 1954-1967) but defaults $0.00 — no external provider (#2)
- POS Product Search: **DONE** — #3 closed (implemented in products-router.ts)
- POS Discount: Manual discounts done; Saleor voucher/promo integration missing (#6)
- POS Test Coverage: Only 1 test file (register-router.test.ts) for entire app (#10)
- Storefront Test Coverage: 2.16% (8 test files for 371 TypeScript files) (#7)
- Price sync APPLIED migration: Needs deploy to staging (#12)
- Square Terminal pairing: **DONE** — #5 closed (742 LOC, 16 endpoints)

### MTG Import Performance (validated Feb 26, 2026)
- **Batch size matters**: Default 25 products × 15 variants = 375 variant inserts per `productBulkCreate`. Under sustained load (10+ hours), exceeds 120s ALB timeout → Gateway Timeouts.
- **Fix**: Reduce `IMPORT_BATCH_SIZE` env var to 10 (or 5). Fewer variants per call, stays under timeout.
- **BACKFILL is the recovery mechanism**: Content-based (checks `ImportedProduct.success=true`), not positional. Safe to run repeatedly — only processes missing cards.
- **COMPLETED threshold bug**: Job marked COMPLETED if `cardsProcessed > 0`, even with thousands of errors. Needs error-rate threshold.
- **Auto-scaling timezone**: All schedules use `timezone: America/Los_Angeles`. Scale-down at midnight PST, scale-up at 8 AM PST.
- **Feb 26 bulk import result**: 73,650 succeeded, 4,179 failed (Gateway Timeouts). BACKFILL recovered 3,629 more. ~550 still need recovery with reduced batch size.

### MTG Import State Tracking
- Import dedup state lives in **inventory-ops Prisma DB** (NOT Saleor DB): `ImportedProduct`, `ImportJob`, `SetAudit` tables
- `ImportedProduct` tracks `scryfallId` + `success` flag — cards with `success=true` are skipped on reimport
- To reset for fresh reimport: `TRUNCATE "ImportedProduct", "ImportJob", "SetAudit" CASCADE` on inventory_ops DB
- inventory-ops DB connection: SSM param `/saleor/staging/apps/inventory-ops/DATABASE_URL`
- Same RDS host as Saleor (`saleor-platform-staging-saleor`), different database name (`inventory_ops`)
- Can connect from API container via ECS exec (mtg-import and inventory-ops containers don't have exec enabled)

### Image Management Audit (Feb 26, 2026)
- **PRD**: `~/.claude/MEMORY/WORK/20260226-184241_fully-analyze-image-management-across-the-platform/PRD-20260226-image-management-audit.md` (PLANNED, 27 ISC, 3 plan tiers)
- **SECURITY**: `storefront/next.config.js` has `hostname: "*"` wildcard — open image proxy/SSRF risk (HIGH)
- **SECURITY**: `middleware.ts` CSP `img-src` includes direct S3 URLs despite CloudFront-only access in Terraform
- **SECURITY**: S3 CORS `allowed_headers = ["*"]` — overly permissive
- **PERF**: `OrderDetailsFragment.graphql` fetches thumbnails with NO size/format (gets 4096px default)
- **PERF**: Hero/preorder/magic `fill` images missing `sizes` prop — downloads full viewport width
- **PERF**: Checkout queries missing `format: WEBP`
- Key image config: `storefront/next.config.js` (AVIF/WebP, deviceSizes, 86400s cache TTL)
- Image pattern: `media[0].url || thumbnail.url` used consistently across storefront
- MTG Import uses `mediaUrl` (external Scryfall CDN reference), not S3 upload
- POS/Buylist fetch thumbnails but don't render them — no optimization needed there
- 3 plan tiers: Quick Wins (1-2h, 8 items), Moderate (4-8h, 5 items), Strategic (1-2d, 3 items)

### Dashboard Orders Not Visible (Mar 4, 2026) — RESOLVED
- **Symptom**: Orders page (`fulfillment/orders`) shows empty list. Customer → Orders view shows orders fine.
- **Root cause**: `get_user_accessible_channels()` in Saleor 3.22 resolver filters orders by channels the user's permission groups have access to. Two problems:
  1. `michael@michaelbean.org` is NOT in any permission group (other 3 staff users are in `Full Access`)
  2. `account_group_channels` table is EMPTY — the `Full Access` group has no channels assigned
- **Resolver code** (`saleor/graphql/order/resolvers.py`): `accessible_channels = get_user_accessible_channels(info, user)` → `qs.filter(channel_id__in=channel_ids)` → empty list = 0 orders
- **Why Customer→Orders works**: User type's `orders` field loads via `user.orders` relationship, bypasses channel access filtering
- **DB state**: 7 orders exist, all in `webstore` channel (id=2), status=`unfulfilled`, `search_document` is empty on all
- **Group table**: `account_group` id=1 name=`Full Access` restricted_access_to_channels=`False`
- **Fix via Dashboard** (Configuration → Permission Groups → Full Access):
  1. Add `michael@michaelbean.org` to the Full Access group
  2. Add all channels (default-channel, webstore, singles-builder) to the group
- **Fix via SQL alternative**:
  ```sql
  INSERT INTO account_user_groups (user_id, group_id)
  SELECT id, 1 FROM account_user WHERE email='michael@michaelbean.org';
  INSERT INTO account_group_channels (group_id, channel_id)
  SELECT 1, id FROM channel_channel;
  ```
- **Webstore channel settings to review**: "Use Transaction flow" should be ENABLED (using Stripe payment app, not legacy plugin)

### MTG Import Singles Builder Investigation (Feb 24, 2026) — RESOLVED
- See `mtg-import-singles-builder-investigation.md` for full details
- **Root cause**: `singles-builder` channel had `is_active = False`. Public API excludes inactive channels entirely (returns 0, no error).
- **Import worked perfectly**: 99,339 product listings and 708,369 variant listings exist for singles-builder in DB
- **Fix**: Activate channel via Dashboard → Configuration → Channels → Singles Builder → toggle Active
- **Gotcha**: Saleor returns 0 products for inactive channels with NO error — indistinguishable from "no listings"
- **Still open**: Duplicate products from slug case mismatch (old mixed-case vs new lowercase)