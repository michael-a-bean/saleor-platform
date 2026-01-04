# Webstore Meilisearch Integration Plan

**Status: IMPLEMENTED** ✅

## Overview

Integrate Meilisearch into the webstore search page (`/[channel]/search`) to provide instant search with typo tolerance and partial matching, while keeping the existing filter UI for refining results.

## Architecture

```
User types "lightn"
    → Meilisearch returns ~500 "Lightning" products (2ms)
    → User applies filters (Condition: NM, Set: M21)
    → Client-side OR Meilisearch filters narrow to ~15 results
```

**Key Principle**: Meilisearch handles the initial text search; filters refine that result set.

## Current State

### What Exists
- `storefront/src/lib/meilisearch.ts` - Meilisearch client with channel-specific indexes
- `storefront/src/app/singles-builder/[channel]/actions.ts` - Working Meilisearch integration
- `webstore-products` index - 106,882 products synced and ready
- Filter components in `storefront/src/ui/components/filters/`

### Current Webstore Search Flow
```
/[channel]/search?query=lightning
    → parseFiltersFromURL() extracts filters
    → buildProductFilter() creates GraphQL filter
    → executeGraphQL(ProductListFilteredDocument) queries Saleor
    → ProductList renders results
```

## Implementation Plan

### Phase 1: Create Meilisearch Search Action for Webstore

**File**: `storefront/src/app/[channel]/(main)/search/actions.ts` (new)

```typescript
"use server";

import { searchProducts, isMeilisearchHealthy } from "@/lib/meilisearch";

export interface WebstoreSearchResult {
  products: MeilisearchProduct[];
  totalCount: number;
  processingTimeMs: number;
}

export async function searchWebstore(
  query: string,
  channel: string,
  filters?: {
    conditions?: string[];
    finishes?: string[];
    setCodes?: string[];
    rarities?: string[];
    inStockOnly?: boolean;
  }
): Promise<WebstoreSearchResult> {
  // Check Meilisearch health, fallback to empty if unavailable
  const isHealthy = await isMeilisearchHealthy();
  if (!isHealthy) {
    return { products: [], totalCount: 0, processingTimeMs: 0 };
  }

  const result = await searchProducts(query, channel, {
    limit: 200,  // Get larger initial set for client-side filtering
    filters: {
      conditions: filters?.conditions,
      finishes: filters?.finishes,
      inStockOnly: filters?.inStockOnly,
      // Add set_code and rarity to Meilisearch filterable attributes
    },
  });

  return {
    products: result.hits,
    totalCount: result.estimatedTotalHits,
    processingTimeMs: result.processingTimeMs,
  };
}
```

### Phase 2: Update Meilisearch Index Settings

**File**: `scripts/sync-meilisearch.py`

Add more filterable attributes to support webstore filters:

```python
requests.patch(
    f"{MEILISEARCH_URL}/indexes/{index_name}/settings/filterable-attributes",
    json=[
        "set_code",
        "rarity",
        "in_stock",
        "conditions_available",
        "finishes_available",
        "colors",
        "type_line",      # Add for creature/instant/sorcery filtering
        "min_price",      # Add for price range filtering
    ]
)
```

### Phase 3: Transform Meilisearch Results to ProductList Format

**File**: `storefront/src/app/[channel]/(main)/search/transforms.ts` (new)

```typescript
import type { MeilisearchProduct } from "@/lib/meilisearch";
import type { ProductListItemFragment } from "@/gql/graphql";

export function transformToProductListItem(
  product: MeilisearchProduct
): ProductListItemFragment {
  // Find the best variant (cheapest in-stock, or cheapest overall)
  const inStockVariants = product.variants.filter(v => v.stock > 0);
  const bestVariant = inStockVariants[0] || product.variants[0];

  return {
    id: product.original_id,
    name: product.name,
    slug: product.slug,
    thumbnail: product.thumbnail ? {
      url: product.thumbnail,
      alt: product.name,
    } : null,
    pricing: {
      priceRange: {
        start: {
          gross: {
            amount: product.min_price || 0,
            currency: "USD",
          },
        },
      },
    },
    // Include variant info for condition badges
    defaultVariant: bestVariant ? {
      id: bestVariant.original_id,
      pricing: {
        price: {
          gross: { amount: bestVariant.price || 0, currency: "USD" },
        },
      },
    } : null,
  };
}
```

### Phase 4: Update Search Page Component

**File**: `storefront/src/app/[channel]/(main)/search/page.tsx`

Two approaches:

#### Option A: Hybrid (Recommended)
- Use Meilisearch for initial search query
- Pass Meilisearch results to existing filter components
- Client-side filtering on the Meilisearch result set

```typescript
// Simplified pseudocode
const meilisearchResults = await searchWebstore(searchValue, channel);
const transformedProducts = meilisearchResults.products.map(transformToProductListItem);

// Apply URL filters client-side
const filteredProducts = applyClientFilters(transformedProducts, filters);

return <ProductList products={filteredProducts} />;
```

#### Option B: Full Meilisearch Filtering
- Pass all filters to Meilisearch
- Requires updating Meilisearch filterable attributes
- Better for large result sets

```typescript
const meilisearchResults = await searchWebstore(searchValue, channel, {
  conditions: filters.conditions,
  finishes: filters.finishes,
  setCodes: filters.sets,
  inStockOnly: filters.availability === "in-stock",
});
```

### Phase 5: Handle Pagination

Meilisearch uses offset-based pagination vs Saleor's cursor-based.

**Option 1**: Fetch large result set (500 products), paginate client-side
**Option 2**: Use Meilisearch offset/limit for server-side pagination

```typescript
// Meilisearch pagination
const result = await searchProducts(query, channel, {
  limit: 24,  // Products per page
  offset: (page - 1) * 24,
});
```

### Phase 6: Add Saleor Fallback

If Meilisearch is unavailable, fall back to current Saleor search:

```typescript
const meilisearchHealthy = await isMeilisearchHealthy();

if (meilisearchHealthy) {
  // Use Meilisearch
  const results = await searchWebstore(query, channel, filters);
  return <MeilisearchResults results={results} />;
} else {
  // Fallback to Saleor GraphQL
  const { products } = await executeGraphQL(ProductListFilteredDocument, {...});
  return <ProductList products={products} />;
}
```

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `search/actions.ts` | Create | Meilisearch search action for webstore |
| `search/transforms.ts` | Create | Transform Meilisearch → ProductList format |
| `search/page.tsx` | Modify | Use Meilisearch for search, keep filter UI |
| `lib/meilisearch.ts` | Modify | Add set_code, type_line to filters if needed |
| `scripts/sync-meilisearch.py` | Modify | Add filterable attributes |

## Testing Checklist

- [ ] Search "lightning" returns Lightning Bolt variants
- [ ] Search "lightn" (partial) returns Lightning cards
- [ ] Search "litning" (typo) returns Lightning cards
- [ ] Filter by condition (NM only) reduces results
- [ ] Filter by set (M21) reduces results
- [ ] Pagination works correctly
- [ ] Fallback to Saleor works when Meilisearch is down
- [ ] Performance: search < 50ms, filter application < 100ms

## Commands

```bash
# Sync webstore index (run before testing)
python3 scripts/sync-meilisearch.py --channel webstore

# Full reindex if schema changes
python3 scripts/sync-meilisearch.py --full --channel webstore

# Test search directly
curl -X POST 'http://localhost:7700/indexes/webstore-products/search' \
  -H 'Content-Type: application/json' \
  -d '{"q": "lightning bolt", "limit": 5}'
```

## Notes

- The `original_id` field in Meilisearch documents contains the Saleor GraphQL ID needed for cart operations
- Meilisearch indexes are channel-specific: `{channel}-products`
- Consider adding a cron job or webhook to keep Meilisearch in sync with Saleor product changes

---

## Implementation Summary

**Implemented on 2026-01-04**

### Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `storefront/src/app/[channel]/(main)/search/actions.ts` | Created | Server action for Meilisearch search with health check |
| `storefront/src/app/[channel]/(main)/search/transforms.ts` | Created | Transforms Meilisearch results to ProductListItemFragment format |
| `storefront/src/app/[channel]/(main)/search/page.tsx` | Modified | Hybrid search with Meilisearch primary, Saleor fallback |
| `storefront/src/lib/meilisearch.ts` | Modified | Added typeLine and priceRange filter support |
| `scripts/sync-meilisearch.py` | Modified | Added type_line and min_price filterable attributes |

### Key Implementation Details

1. **Hybrid Architecture**: Search page checks Meilisearch health first. If available, uses Meilisearch; otherwise falls back to Saleor GraphQL.

2. **Pagination**: Uses offset-based pagination with cursors in format `offset:N` that work with existing Pagination component.

3. **Filters Supported**:
   - Rarity (array)
   - Type line (text)
   - Price range (min/max)
   - Set name (combined with search query)
   - Conditions, finishes, in-stock (via Meilisearch filters)

4. **Sorting**: Translates URL sort params to Meilisearch format:
   - `price-asc` → `min_price:asc`
   - `price-desc` → `min_price:desc`
   - Default → `name:asc`

5. **Performance Display**: Shows search time in milliseconds when using Meilisearch.

### To Test

```bash
# Start services
docker compose up -d api meilisearch

# Sync webstore index
python3 scripts/sync-meilisearch.py --channel webstore

# Test search
curl -X POST 'http://localhost:7700/indexes/webstore-products/search' \
  -H 'Content-Type: application/json' \
  -d '{"q": "lightning bolt", "limit": 5}'

# Access in browser
# http://localhost:3000/webstore/search?query=lightning
```
