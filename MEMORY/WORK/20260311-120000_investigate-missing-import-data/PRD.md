---
task: Investigate missing import data after app consolidation
slug: 20260311-120000_investigate-missing-import-data
effort: standard
phase: complete
progress: 8/8
mode: interactive
started: 2026-03-11T12:00:00-07:00
updated: 2026-03-11T12:05:00-07:00
---

## Context

Michael consolidated buylist + mtg-import into inventory-ops. The app is running but import data (sets, jobs, imported products) is not visible. Investigation needed to determine if this is a local-only issue or also affects staging.

### Key Findings
- Local `inventory_ops` DB has ZERO rows across ALL tables (not just import)
- DB volume created 2025-12-16, never had bulk import data locally
- All 73k+ imports were done on staging RDS
- The `installationId` migration (20260311) adds tenant scoping — if deployed to staging, old data associated with mtg-import's installation ID would not be visible to inventory-ops queries
- 4 AppInstallation records exist locally (all empty/unused)
- mtg-import-app container is an orphan (not in current docker-compose)

### Risks
- Staging data may be invisible due to installationId mismatch (mtg-import ID vs inventory-ops ID)
- If `prisma db push` was used instead of `migrate deploy`, the installationId migration's backfill SQL never ran

## Criteria

- [x] ISC-1: Root cause — installationId mismatch (mtg-import vs inventory-ops)
- [x] ISC-2: Local DB is empty (no imports ever run locally)
- [x] ISC-3: Staging has 113 jobs, 103k products, 271 sets
- [x] ISC-4: installationId migration deployed (most recent in _prisma_migrations)
- [x] ISC-5: Mismatch confirmed: data had mtg-import ID, not inventory-ops ID
- [x] ISC-6: UPDATE migrated all 4 tables to inventory-ops installationId
- [x] ISC-7: Data now scoped to inventory-ops — queries will match
- [x] ISC-8: All row counts verified identical pre/post migration

## Decisions

## Verification
