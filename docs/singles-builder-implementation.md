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

## Remaining Work

### PR2: Search UI (Next)

**Scope:**
- Debounced search input (300ms)
- Virtualized results list (@tanstack/react-virtual)
- Display all printings/variants with key attributes
- Quick-add buttons

**Files to Create:**
```
storefront/src/graphql/SinglesBuilderSearch.graphql
storefront/src/app/singles-builder/[channel]/components/
  ├── SinglesSearch.tsx
  ├── SinglesResults.tsx
  └── SinglesResultItem.tsx
```

### PR3: Filtering

**Scope:**
- Filter sidebar component
- Set dropdown (async load)
- Multi-select: rarity, finish, condition
- Range: price
- Toggle: in-stock only
- URL state sync

### PR4: Cart Persistence

**Scope:**
- Zustand cart store
- Cart drawer component
- Saleor checkout mutations
- Customer name + notes (metadata)
- Short code generation

### PR5: POS Handoff

**Scope:**
- Cart lookup API endpoint
- POS app retrieve screen
- Documentation

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
