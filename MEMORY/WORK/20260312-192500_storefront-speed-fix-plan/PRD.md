---
task: Data-driven plan to fix storefront speed permanently
slug: 20260312-192500_storefront-speed-fix-plan
effort: advanced
phase: build
progress: 3/28
mode: interactive
started: 2026-03-12T19:25:00-07:00
updated: 2026-03-12T20:45:00-07:00
---

## Context

Michael has been "playing cat and mouse with website speed for weeks" and wants a definitive, data-driven fix. OTEL traces reveal two root causes:

**Root Cause 1: GraphQL DataLoader waterfall on product list queries**
- `ProductListFiltered` takes 1.3-2.4s due to N+1 DataLoader batches (AttributeValues, TaxClass, AvailableQuantity)
- DB query itself is 50-65ms; overhead is all resolver-side
- Affects: `/webstore/products`, paginated pages, category pages

**Root Cause 2: Blocking SSR queries for below-fold content**
- `RelatedProducts` (12 products × all variants) adds ~2s to every product detail page via SSR Promise.all
- `OtherPrintings` fetches up to 50 products with full variant data, also blocks SSR
- Both are below the fold on product detail pages

**Root Cause 3: Over-sized page queries with no pagination**
- `ProductListByCategory` fetches 100 products per page with NO pagination UI
- `ProductListByCollection` fetches 100 products per set detail page with NO pagination UI
- Each product triggers the full DataLoader waterfall (attributes, tax class, availability)

**Constraints**:
- ProductListItem fragment CANNOT be trimmed: stock badge needs `variants { quantityAvailable }`, set icon row needs `attributes`
- `executeGraphQL` is server-only (uses Next.js `revalidate` + `getServerAuthClient`). Client-side lazy loading requires API route handlers.
- `ProductListByCategory.graphql` and `ProductListByCollection.graphql` have NO cursor variables, NO pageInfo — must be modified before pagination can work.
- Meilisearch has NO `category` field — cannot replace Saleor GraphQL for category pages or set detail tabs (singles/sealed split depends on `category.name`).
- Set detail page (`/magic/sets/[slug]`) is currently unused — sets listing links to `/search?query=...&set=...` instead.

**Scale**: 101k products in webstore, 76k in singles-builder. Most cards have 5-15 variants each.

### Approach (v4 — final after two red team rounds)

**Tier 1A — Lazy-load below-fold sections (biggest single win: ~2s off product detail SSR):**
- Create API route handlers for RelatedProducts and OtherPrintings GraphQL queries
- Move both queries out of product detail page SSR Promise.all
- Load client-side via useEffect with skeleton placeholders
- Both components already have `'use client'` directive — ready for client-side fetching

**Tier 1B — Page size reduction + pagination (~75% less DataLoader work):**
- Modify `ProductListByCategory.graphql` to accept cursor variables ($first, $after, $last, $before) and return pageInfo
- Modify `ProductListByCollection.graphql` same way
- Reduce `first: 100` → `first: 24` on category/collection/board-games queries
- Add existing Pagination component to category, board-games pages
- **DEFER set detail page pagination**: Tab interaction (client-side singles/sealed filtering) conflicts with server-side cursor pagination — requires deeper architectural work

**Tier 2 — Cache tuning (5x fewer origin hits on stable pages):**
- Increase `s-maxage` for sets/categories to 300s in middleware.ts
- Add `stale-while-revalidate=300` to product detail pages

**Tier 3 — Payload reduction:**
- Paginate `/webstore/magic/sets` listing page (703KB response) — DEFERRED, lower priority

### Red Team Findings (rounds 1 + 2)

**Round 1:**
- CRITICAL: Cannot remove `variants` from ProductListItem — stock badge depends on it
- CRITICAL: Cannot remove `attributes` from ProductListItem — set icon row depends on it
- CRITICAL: Categories/collections have NO pagination UI

**Round 2:**
- CRITICAL: `executeGraphQL` is server-only — lazy loading requires API route handlers (pattern exists: `/api/singles-builder/lookup`, `/api/contact`)
- CRITICAL: `ProductListByCategory.graphql` has NO cursor variables, NO pageInfo — must modify query
- CRITICAL: `ProductListByCollection.graphql` same — partial ($first only, no $after/$before, no pageInfo)
- NO-GO: Meilisearch for set detail — no category field (can't split singles/sealed), no slug-to-set-code mapping, pagination model mismatch, page currently unused
- MEDIUM: SEO risk from reducing 100→24 products — mitigated by adding rel="next/prev" link tags
- MEDIUM: Set detail page tab filtering conflicts with cursor pagination — DEFERRED

### Estimated Impact

| Change | Est. savings | Pages affected |
|--------|-------------|----------------|
| Lazy-load RelatedProducts + OtherPrintings | ~2s off SSR | Every product detail page |
| Reduce first:100→24 + pagination | ~75% less resolver time | Category + board-games pages |
| Cache s-maxage 60→300s | 5x fewer origin hits | Sets listing, category pages |

## Criteria

### Tier 1A: Lazy Loading (Below-Fold Sections)
- [ ] ISC-1: API route created for RelatedProducts query (/api/products/related)
- [ ] ISC-2: API route created for OtherPrintings query (/api/products/other-printings)
- [ ] ISC-3: RelatedProducts query removed from product page SSR Promise.all
- [ ] ISC-4: RelatedProducts loads client-side via useEffect
- [ ] ISC-5: Skeleton placeholder shown while RelatedProducts loads
- [ ] ISC-6: OtherPrintings query removed from product page SSR Promise.all
- [ ] ISC-7: OtherPrintings loads client-side via useEffect
- [ ] ISC-8: Skeleton placeholder shown while OtherPrintings loads

### Tier 1B: Page Size + Pagination
- [ ] ISC-9: ProductListByCategory.graphql accepts $first, $after, $last, $before variables
- [ ] ISC-10: ProductListByCategory.graphql returns pageInfo with cursors
- [ ] ISC-11: ProductListByCollection.graphql accepts $after, $last, $before variables
- [ ] ISC-12: ProductListByCollection.graphql returns pageInfo with cursors
- [ ] ISC-13: Category page uses first:24 with Pagination component
- [ ] ISC-14: Board games page uses first:24 with Pagination component
- [ ] ISC-15: GraphQL codegen regenerated after query changes

### Tier 2: Cache Tuning
- [ ] ISC-16: Sets listing page s-maxage increased to 300s
- [ ] ISC-17: Category pages s-maxage increased to 300s
- [ ] ISC-18: Product detail pages have stale-while-revalidate=300

### Performance Targets (origin-hit, bypass CDN)
- [ ] ISC-19: Product detail page origin TTFB under 1.0s (from ~2.5s baseline)
- [ ] ISC-20: Category page origin TTFB under 1.5s (from ~2.0s baseline)

### Anti-criteria
- [ ] ISC-A1: No regression in product detail variant selector
- [ ] ISC-A2: No layout shift from lazy-loaded sections (skeleton matches final height)
- [ ] ISC-A3: No broken images on product list pages
- [ ] ISC-A4: Cart/checkout functionality unchanged
- [ ] ISC-A5: SinglesBuilder search unaffected
- [ ] ISC-A6: Set icon row still displays on all product cards

### Verification
- [ ] ISC-21: Before/after crawl benchmark documented
- [x] ISC-22: Red team round 1 completed
- [x] ISC-23: Red team round 2 completed — revised plan validated
- [x] ISC-24: Plan reviewed before implementation begins
- [ ] ISC-25: Codex review of changes passes
- [ ] ISC-26: All changes on feature branch with PR
- [ ] ISC-27: Storefront builds successfully after changes
- [ ] ISC-28: TypeScript compilation passes with no new errors

## Decisions

- **D1**: Keep ProductListItem fragment unchanged — stock badge needs `variants`, set icon needs `attributes`
- **D2**: Lazy-load BOTH RelatedProducts and OtherPrintings — both block SSR, both below fold
- **D3**: Use API route handlers for client-side GraphQL — `executeGraphQL` is server-only
- **D4**: Modify GraphQL query files to add cursor variables — current queries lack pagination support
- **D5**: DEFER set detail page pagination — tab filtering (singles/sealed) conflicts with cursor pagination
- **D6**: DEFER Meilisearch for set detail — NO-GO (no category field, no slug mapping, page unused)
- **D7**: DEFER magic sets listing pagination — lower priority, 703KB is annoying but not blocking
- **D8**: Add skeleton UI for lazy sections — prevents layout shift
- **D9**: Measure origin TTFB not CDN — CDN-cached hits tell us nothing about the fix

## Verification

(populated during verification)
