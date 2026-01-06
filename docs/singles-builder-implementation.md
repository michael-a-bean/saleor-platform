# Singles Builder Implementation Status

## Overview

Employee-only interface for building MTG singles carts for customers with POS handoff.

## Current Branch

```bash
git checkout feature/singles-builder-channel
```

## Completed

### PR1: Channel + Permissions ✅

**Commit:** `2968992` - feat(singles-builder): add employee-only channel and auth gating

**Channel Created:**
- Slug: `singles-builder`
- ID: `Q2hhbm5lbDoy`
- Currency: USD
- Products synced: 106,882
- Variants synced: 534,410

**Files:**
- `scripts/create-singles-builder-channel.py` - Channel creation script
- `scripts/sync-singles-builder-listings.sql` - Product/variant sync
- `storefront/src/middleware.ts` - Route protection
- `storefront/src/graphql/UserDetailsFragment.graphql` - Added `isStaff`
- `storefront/src/app/singles-builder/` - Staff-only routes
- `storefront/src/app/unauthorized/page.tsx` - Access denied page
- `storefront/Dockerfile` - Updated to run codegen during build

**Auth Flow:**
1. Unauthenticated → redirect to `/webstore/login?redirect=/singles-builder/singles-builder`
2. Non-staff → redirect to `/unauthorized`
3. Staff → access granted

### PR2: Search UI ✅

**Features:**
- Debounced search input (300ms) with keyboard shortcuts
- Virtualized results list using @tanstack/react-virtual
- Product cards with thumbnail, set info, collector number, rarity
- Variant rows showing condition, finish, stock, price
- Quick-add buttons with loading states
- Infinite scroll with load more
- Toast notifications for cart actions

**Files Created:**
```
storefront/src/graphql/SinglesBuilderSearch.graphql
storefront/src/app/singles-builder/[channel]/components/
  ├── index.ts
  ├── SinglesSearch.tsx          - Debounced search with URL sync
  ├── SinglesResults.tsx         - Virtualized list container
  ├── SinglesResultItem.tsx      - Product/variant display
  └── SinglesResultsWrapper.tsx  - Client wrapper for data fetching
storefront/src/app/singles-builder/[channel]/actions.ts - Server actions
storefront/package.json - Added @tanstack/react-virtual
```

**GraphQL:**
- `SinglesBuilderSearch` query with product + variant fragments
- Fetches: name, thumbnail, attributes (set, rarity, collector-number)
- Variant details: condition, finish, price, stock quantity

### PR3: Filtering ✅

**Features:**
- Filter sidebar component with toggle chips
- Set name text search (debounced 400ms)
- Multi-select filters: rarity, condition, finish
- Price range inputs (min/max)
- In-stock only toggle
- URL state synchronization
- Active filter count badge
- Clear all button

**Files Created:**
```
storefront/src/app/singles-builder/[channel]/components/
  ├── filterTypes.ts          - Filter state types and URL helpers
  ├── buildSinglesFilter.ts   - GraphQL filter builder
  └── SinglesFilters.tsx      - Filter sidebar UI component
```

**GraphQL Updates:**
- `SinglesBuilderSearch` query now accepts `ProductFilterInput`
- Server action updated to pass filters to query

**Filter Implementation:**
- Product-level: rarity, price range, stock availability, set name (via search)
- Variant-level: condition, finish (client-side filtering available)

### PR4: Cart Persistence ✅

**Features:**
- Zustand cart store with localStorage persistence
- Floating cart button with item count + total
- Slide-out cart drawer with full cart management
- Quantity +/- controls on cart lines
- Remove item functionality
- Customer name and notes input fields
- 6-character alphanumeric POS short code generation
- Checkout metadata storage for POS handoff

**Files Created:**
```
storefront/src/graphql/SinglesBuilderCart.graphql
  - SinglesBuilderCartLine fragment
  - SinglesBuilderCheckout fragment (includes metadata)
  - SinglesBuilderCartFind query
  - SinglesBuilderCartCreate mutation
  - SinglesBuilderCartAddLines mutation
  - SinglesBuilderCartUpdateLines mutation
  - SinglesBuilderCartDeleteLines mutation
  - SinglesBuilderCartUpdateMetadata mutation

storefront/src/app/singles-builder/[channel]/store/
  ├── index.ts
  └── singlesCartStore.ts     - Zustand store with persist middleware

storefront/src/app/singles-builder/[channel]/components/
  ├── CartButton.tsx          - Floating cart button
  └── CartDrawer.tsx          - Slide-out cart panel
```

**Files Modified:**
- `actions.ts` - Complete rewrite with full checkout CRUD + metadata
- `SinglesResultsWrapper.tsx` - Updates cart store on add-to-cart
- `index.ts` - Export new cart components
- `page.tsx` - Use real CartButton and CartDrawer

**Metadata Keys:**
- `singles_builder_customer` - Customer name
- `singles_builder_notes` - Notes for POS
- `singles_builder_code` - 6-char alphanumeric lookup code
- `singles_builder_created` - ISO timestamp

### PR5: POS Lookup API ✅

**Features:**
- Cart lookup API endpoint (`/api/singles-builder/lookup`)
- 6-character alphanumeric code lookup via checkout metadata
- Full cart details returned for POS display
- GET and POST support

**Files Created:**
```
storefront/src/app/api/singles-builder/lookup/route.ts
```

**GraphQL Updates:**
- `SinglesBuilderPOSLookup` query - searches checkouts by metadata

**API Usage:**
```bash
# POST request
curl -X POST http://localhost:3000/api/singles-builder/lookup \
  -H "Content-Type: application/json" \
  -d '{"code": "ABC123"}'

# GET request
curl "http://localhost:3000/api/singles-builder/lookup?code=ABC123"
```

**Response Format:**
```json
{
  "success": true,
  "checkout": {
    "id": "Q2hlY2tvdXQ6...",
    "token": "...",
    "customerName": "John Doe",
    "notes": "Hold for pickup",
    "shortCode": "ABC123",
    "createdAt": "2026-01-04T...",
    "lines": [...],
    "subtotal": { "amount": 25.00, "currency": "USD" },
    "total": { "amount": 25.00, "currency": "USD" }
  }
}
```

**Note:** This endpoint requires staff authentication (MANAGE_CHECKOUTS or HANDLE_PAYMENTS permission).

## Remaining Work

### Phase 2: POS Integration

**Scope:**
- POS app retrieve screen implementation
- Cart to draft order conversion
- Customer account assignment
- Receipt printing integration

## Architecture Reference

See planning deliverables in conversation for:
- A) Architecture & scope summary
- B) Data model & Saleor configuration
- C) API design (GraphQL queries/mutations)
- D) UI wireframes
- E) Implementation plan with task breakdown

## Running the Stack

```bash
# Ensure services are running
docker compose up -d api db cache storefront

# Rebuild storefront after changes
DOCKER_BUILDKIT=1 docker compose build storefront
docker compose up -d storefront

# Test unauthorized access
curl -L http://localhost:3000/singles-builder

# Login as staff to test (admin@example.com / admin)
http://localhost:3000/webstore/login
```

## Key Decisions

1. **Search Backend (MVP):** Saleor native GraphQL search
   - Phase 2: Consider Meilisearch/Typesense for sub-50ms search

2. **Cart Persistence:** Saleor Checkout with metadata
   - Checkout token generates short code for POS handoff

3. **POS Handoff (MVP):** Option A - Checkout Token
   - Short code lookup via `/api/singles-builder/lookup`
   - POS retrieves cart and converts to draft order

4. **Auth:** `isStaff` boolean check
   - Phase 2: Consider dedicated permission group

## Production Deployment

### Prerequisites

1. **Channel exists:** `singles-builder` channel must be created and products synced
2. **Staff accounts:** At least one staff user with active account
3. **API running:** Saleor API must be accessible during build (GraphQL introspection)

### Build Commands

```bash
# Ensure API is running
docker compose up -d api

# Build storefront with network access for codegen
docker build --network=host \
  --build-arg NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/ \
  --build-arg NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_DEFAULT_CHANNEL=webstore \
  -t saleor-storefront:local ./storefront

# Deploy
docker compose up -d --force-recreate storefront
```

### Verification Checklist

- [ ] Staff user can access `/singles-builder/singles-builder`
- [ ] Non-staff user is redirected to `/unauthorized`
- [ ] Search returns products with thumbnails
- [ ] Filters work (rarity, condition, finish, price range)
- [ ] Add to cart works with toast notification
- [ ] Cart shows correct item count and total
- [ ] POS code generation saves to metadata
- [ ] Cart drawer opens and shows all items

### Troubleshooting

| Issue | Solution |
|-------|----------|
| `DYNAMIC_SERVER_USAGE` error | Add `export const dynamic = "force-dynamic"` to page |
| Null currency crash | Check `discounted_price_amount` is set (see database.md) |
| Build fails at codegen | Ensure API is running and accessible |
| Auth redirect loop | Check cookies, clear site data |
| POS lookup 403 | Endpoint requires staff auth (MANAGE_CHECKOUTS permission) |
