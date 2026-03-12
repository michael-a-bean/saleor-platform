# MTG Import Dashboard — Replace `/import` Index

## Context

The MTG import section has 5 pages (job list, new import, job detail, sets, settings) but no at-a-glance overview. The current `/import` index is just a job queue table. You have to mentally aggregate across multiple pages to answer "how's the catalog looking?" This replaces it with a proper dashboard.

## Approach

**Replace `/import/index.tsx`** with a dashboard that combines KPI stats, system health, recent jobs, and incomplete sets into a single view. The old job queue becomes a section within the dashboard. No backend changes needed — all data comes from existing tRPC endpoints.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/import/index.tsx` | **Rewrite** — dashboard replaces job queue |
| `src/ui/components/app-layout.tsx` | **Edit** — rename sidebar nav from "Import Jobs" → "Import Dashboard" |

## Dashboard Layout (4 sections)

### Section 1: KPI Header Row
**Data source:** `catalog.summary` (single query)

4-column grid with large stat cards:
- **Total Products** — `totalProducts` (successfully imported unique cards)
- **Catalog Completeness** — `completenessPercent`% with ProgressBar (`totalCards / totalExpected`)
- **Sets Imported** — `completeSets / totalSets` (e.g., "142 / 156")
- **Total Jobs** — `totalJobs`

### Section 2: System Health
**Data source:** `system.readiness` (single query)

Compact row of check results (channels, product-type, attributes, category). Each shows pass/fail/warn icon + message. If all pass, collapsed to a single green "System Ready" indicator. If any fail, expanded with details and "Setup Attributes" action button (wired to `system.setupAttributes`).

### Section 3: Recent Jobs
**Data source:** `catalog.summary.recentJobs` (already included in summary query, last 5 jobs)

Table with columns: Type, Set, Status (StatusBadge), Progress, Errors, Created. Row click navigates to `/import/[id]`. Header has "New Import" button (→ `/import/new`) and "View All Jobs" link that could filter/paginate.

Note: For "View All Jobs" we'll add a query param approach — the dashboard shows last 5 from the summary, and a "View All" link navigates to `/import/jobs` (new page with the current full job list moved there).

### Section 4: Incomplete Sets (Attention Needed)
**Data source:** `sets.importStatus` (returns all SetAudit records)

Filter to sets where `importedCards < totalCards`. Show as a compact table: Set Code, Name, Progress (x/y with ProgressBar), Last Imported. Include "Backfill All" button (wired to `jobs.createBatch`). Only shown if incomplete sets exist.

## Additional File

| File | Change |
|------|--------|
| `src/pages/import/jobs.tsx` | **New** — move the current full job queue here |

The current `index.tsx` content (the full job list with cancel/retry) moves to a new `jobs.tsx` page. This preserves the full job list as a dedicated page accessible from the dashboard's "View All Jobs" link and from the sidebar.

## Sidebar Nav Update

```typescript
const importItems = [
  { href: "/import", label: "Import Dashboard" },  // was "Import Jobs"
  { href: "/import/jobs", label: "Job Queue" },     // new — full job list
  { href: "/sets", label: "Sets" },
  { href: "/settings", label: "Import Settings" },
];
```

## Data Flow

```
catalog.summary ──→ KPIs + Recent Jobs (1 query)
system.readiness ──→ Health checks (1 query)
sets.importStatus ──→ Incomplete sets (1 query)
                     Total: 3 queries on page load
```

All queries use the existing `refetchInterval` pattern — summary at 30s, readiness at 60s (rarely changes), importStatus at 30s.

## Existing Components to Reuse

- `StatBox` (`src/ui/components/stat-box.tsx`) — KPI values
- `ProgressBar` (`src/ui/components/progress-bar.tsx`) — completeness bars
- `StatusBadge` (`src/ui/components/status-badge.tsx`) — job status chips
- `DataTable` (`src/ui/components/data-table.tsx`) — jobs and sets tables
- `TableSkeleton` (`src/ui/components/loading-skeleton.tsx`) — loading states

Layout follows the price-sync index page pattern (closest existing dashboard-like page): stat grid + content sections in bordered cards.

## Verification

1. `cd saleor-apps/apps/inventory-ops && pnpm tsc --noEmit` — type check passes
2. `pnpm dev` — dashboard loads in Saleor Dashboard iframe
3. Verify all 4 sections render with data from existing tRPC endpoints
4. Verify sidebar nav links work (Dashboard, Job Queue, Sets, Settings)
5. Verify "New Import" button navigates to `/import/new`
6. Verify job row click navigates to `/import/[id]`
7. Verify "View All Jobs" link navigates to `/import/jobs`
