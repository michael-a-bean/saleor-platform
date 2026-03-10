---
task: Implement Meilisearch-based buylist card search improvements
slug: 20260304-implement-buylist-meilisearch
effort: advanced
phase: observe
progress: 20/26
mode: interactive
started: 2026-03-04T10:30:00-06:00
updated: 2026-03-04T10:35:00-06:00
---

## Context

Switching buylist card search from Saleor GraphQL (slow, incomplete) to Meilisearch (fast, complete). Previous investigation identified root causes and designed the solution. This PRD tracks implementation.

### Key Files
- `buylist/src/lib/saleor-client.ts` — Add Meilisearch search method, keep Saleor as fallback
- `buylist/src/lib/meilisearch-client.ts` — New: Meilisearch HTTP client for buylist
- `buylist/src/pages/buylists/new.tsx` — Add 300ms debounce to card search input
- `buylist/src/modules/buylists/buylists-router.ts` — Pass Meilisearch config to search
- `docker-compose.yml` — Add MEILISEARCH_URL to buylist-app

### Risks
- Meilisearch may not be running locally — fallback to Saleor search handles this
- variant ID format: Meilisearch has `original_id` (Saleor GraphQL base64 ID) in variants array

## Criteria

### Meilisearch Client
- [x] ISC-1: New meilisearch-client.ts created in buylist/src/lib/
- [x] ISC-2: searchProducts function accepts query string and limit
- [x] ISC-3: searchProducts accepts optional setCode filter parameter
- [x] ISC-4: searchProducts returns typed MeilisearchHit array
- [x] ISC-5: Meilisearch URL read from MEILISEARCH_URL env var
- [x] ISC-6: Meilisearch API key read from MEILISEARCH_API_KEY env var

### Search Logic (saleor-client.ts)
- [x] ISC-7: searchCards detects SET/NUM format (slash separator)
- [x] ISC-8: searchCards detects SET-NUM format (dash separator)
- [x] ISC-9: searchCards detects NUM-SET and NUM/SET reversed formats
- [x] ISC-10: searchCards calls Meilisearch as primary search
- [x] ISC-11: searchCards falls back to Saleor GraphQL on Meilisearch failure
- [x] ISC-12: Meilisearch hits mapped to CardSearchResult type
- [x] ISC-13: NM variant preferred for pricing in Meilisearch results
- [x] ISC-14: Deduplication produces one result per unique card printing

### UI (new.tsx)
- [x] ISC-15: 300ms debounce added to card search input
- [x] ISC-16: Search query only fires after debounce settles
- [x] ISC-17: Existing search UI behavior preserved (dropdown, selection)
- [x] ISC-18: Search placeholder text updated to mention collector number

### Infrastructure
- [x] ISC-19: docker-compose.yml has MEILISEARCH_URL for buylist-app
- [x] ISC-20: docker-compose.yml has MEILISEARCH_API_KEY for buylist-app (optional)

### Router
- [x] ISC-21: buylists-router searchCards passes Meilisearch config
- [x] ISC-22: searchCards input schema unchanged (backward compatible)

### Build Verification
- [ ] ISC-23: TypeScript compiles without errors in buylist app
- [ ] ISC-24: No import errors in modified files
- [ ] ISC-25: Existing tests still pass (if any)

### Anti-criteria
- [x] ISC-A1: Existing Saleor GraphQL search NOT removed (kept as fallback)

## Decisions

## Verification
