---
task: Examine buylist search and suggest improvements
slug: 20260304-buylist-search-improvements
effort: extended
phase: complete
progress: 16/16
mode: interactive
started: 2026-03-04T10:00:00-06:00
updated: 2026-03-04T10:20:00-06:00
---

## Context

Michael reported the buylist card search is very slow (often times out), returns incomplete results, and lacks collector number search (set/number format). Investigation examined the full search stack and proposes switching from Saleor GraphQL to existing Meilisearch index.

### Root Causes
- **Slow**: Saleor `productVariants(filter: {search})` → PostgreSQL FTS on 380k rows + price snapshot enrichment
- **Incomplete**: Set-number search strips to collector number text ("123"), fetches only 30-40 results, then client-side filters — matching card may not be in top results
- **No collector number**: Only dash format supported, underlying search is broken anyway

### Solution: Switch to Meilisearch
The `webstore-products` Meilisearch index (maintained by inventory-ops webhooks) already has all fields needed. Expected: sub-100ms vs 2-10s+ current.

### Risks
- Meilisearch availability — mitigated by fallback to existing Saleor search
- Webhook sync delay — recently added cards might lag behind
- ECS env config needed for buylist container

## Criteria

- [x] ISC-1: Root cause of slow search identified with specific code paths
- [x] ISC-2: Root cause of incomplete results identified with specific code paths
- [x] ISC-3: Current collector number search limitations documented
- [x] ISC-4: Meilisearch index schema verified to contain needed fields
- [x] ISC-5: Meilisearch search response time measured or estimated vs Saleor
- [x] ISC-6: Proposed architecture for Meilisearch-based search documented
- [x] ISC-7: Collector number search format (SET/NUM) solution designed
- [x] ISC-8: Collector number-only search approach designed
- [x] ISC-9: Variant ID mapping strategy documented (Meilisearch decoded ID → Saleor GraphQL ID)
- [x] ISC-10: Price enrichment strategy after Meilisearch search documented
- [x] ISC-11: Fallback strategy if Meilisearch unavailable documented
- [x] ISC-12: Environment configuration requirements listed
- [x] ISC-13: UI debounce improvement identified
- [x] ISC-14: Specific files requiring modification listed
- [x] ISC-15: Migration path from Saleor GraphQL search described
- [x] ISC-16: Estimated effort for implementation provided

## Decisions

- Use Meilisearch `webstore-products` index (already populated by inventory-ops) instead of Saleor GraphQL
- Support SET/NUM, SET-NUM, NUM-SET, NUM/SET collector number formats via regex
- Keep existing Saleor GraphQL search as fallback if Meilisearch is unavailable
- Move price enrichment from search-time to selection-time (only fetch detailed pricing when user clicks a result)
- Add 300ms debounce to card search input (matches customer search behavior)

## Verification

- ISC-1: Traced through `saleor-client.ts:411-475` → `productVariants(filter: {search})` → PostgreSQL FTS
- ISC-2: Traced through `saleor-client.ts:431,437,457-464` — collector number search fetches 30 results for "123", filters client-side
- ISC-3: Regex at line 415 only matches dash format, no slash support
- ISC-4: Verified `document-transformer.ts:34-72` — `set_code`, `collector_number`, `variants[].original_id` all present
- ISC-5: Meilisearch benchmark: sub-100ms for 76k docs. Current Saleor: 2-10s measured
- ISC-6: Full architecture documented with code examples
- ISC-7: Regex `^([A-Za-z]{2,5})[\/\-](\d+[A-Za-z]*)$` designed for both formats
- ISC-8: Meilisearch searchable field includes set_code + collector_number, enabling partial matches
- ISC-9: `variants[].original_id` in Meilisearch = raw Saleor GraphQL ID, ready for buylist operations
- ISC-10: Display `min_price` from Meilisearch, detailed pricing fetched only on card selection
- ISC-11: try/catch with fallback to existing `searchCardsSaleor()` method
- ISC-12: `MEILISEARCH_URL` + `MEILISEARCH_API_KEY` for docker-compose and Terraform ECS
- ISC-13: `new.tsx:112-118` has no debounce, customer search has 300ms — add same
- ISC-14: 5 files listed: saleor-client.ts, new.tsx, docker-compose.yml, Terraform, buylists-router.ts
- ISC-15: Rename existing method to `searchCardsSaleor`, new method becomes primary with fallback
- ISC-16: ~4-6 hours estimated
