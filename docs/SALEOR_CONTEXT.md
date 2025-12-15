# Saleor Platform Architecture Reference

> **Purpose**: Technical reference for the Saleor platform architecture. For instructions and rules, see `CLAUDE.md` and `.claude/rules/`.

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Service Architecture](#service-architecture)
3. [Technology Stack](#technology-stack)
4. [Environment Configuration](#environment-configuration)
5. [Storefront Architecture](#storefront-architecture)
6. [GraphQL API](#graphql-api)
7. [MTG Catalog Data](#mtg-catalog-data)
8. [External Resources](#external-resources)

---

## Platform Overview

### What is Saleor?

**Saleor** is a headless e-commerce platform (22k+ GitHub stars):

- GraphQL-first API (no REST)
- Python/Django backend (v3.22)
- Composable architecture with apps and webhooks
- Multi-channel support with per-channel pricing

### This Fork

A Docker Compose orchestration layer running the complete Saleor stack, configured as an MTG card marketplace with 106,872 products.

---

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SALEOR PLATFORM                              │
│                    Network: saleor-backend-tier                      │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │  Storefront  │   │   Dashboard  │   │   Clients    │
  │  (Next.js)   │   │   (React)    │   │              │
  │  Port: 3000  │   │  Port: 9000  │   │              │
  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │ GraphQL
                     ┌──────▼───────┐
                     │     API      │
                     │  Port: 8000  │
                     └──────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
 ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
 │  PostgreSQL │     │   Valkey    │     │   Worker    │
 │ Port: 5432  │     │ Port: 6379  │     │  (Celery)   │
 └─────────────┘     └─────────────┘     └─────────────┘
```

### Service Details

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| storefront | `saleor-storefront:local` | 3000 | Customer webstore |
| api | `ghcr.io/saleor/saleor:3.22` | 8000 | GraphQL API |
| dashboard | `ghcr.io/saleor/saleor-dashboard:latest` | 9000 | Admin UI |
| db | `postgres:15-alpine` | 5432 | Database |
| cache | `valkey/valkey:8.1-alpine` | 6379 | Cache + Celery broker |
| worker | `ghcr.io/saleor/saleor:3.22` | - | Async tasks |
| jaeger | `jaegertracing/jaeger` | 16686 | Tracing |
| mailpit | `axllent/mailpit` | 8025 | Email testing |

### Data Flow

1. Client → GraphQL → API
2. API → SQL → PostgreSQL
3. API → Cache → Valkey
4. API → Task → Valkey → Worker
5. Worker → SMTP → Mailpit

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Backend | Python/Django | 3.x |
| API | GraphQL | - |
| Database | PostgreSQL | 15 |
| Cache | Valkey | 8.1 |
| Queue | Celery | - |
| Frontend | Next.js | 15 |
| UI | React | 19 |
| Styling | TailwindCSS | - |
| Tracing | OpenTelemetry/Jaeger | - |

---

## Environment Configuration

### backend.env

```bash
DATABASE_URL=postgres://saleor:saleor@db/saleor
CACHE_URL=redis://cache:6379/0
CELERY_BROKER_URL=redis://cache:6379/1
EMAIL_URL=smtp://mailpit:1025
SECRET_KEY=changeme
OTEL_SERVICE_NAME=saleor
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
```

### common.env

```bash
DEFAULT_CHANNEL_SLUG=webstore
HTTP_IP_FILTER_ALLOW_LOOPBACK_IPS=True
HTTP_IP_FILTER_ENABLED=True
```

### Database Credentials

Host: `db` (internal) / `localhost:5432` (external)
Database: `saleor`
User/Password: `saleor` / `saleor`

---

## Storefront Architecture

### Directory Structure

```
storefront/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [channel]/          # Channel-scoped routes
│   │   │   ├── (main)/         # Main layout group
│   │   │   │   ├── products/   # Product listing & detail
│   │   │   │   ├── search/     # Search results
│   │   │   │   └── cart/       # Shopping cart
│   │   │   └── checkout/       # Checkout flow
│   │   └── config.ts           # App configuration
│   ├── ui/
│   │   ├── components/         # Feature components
│   │   └── atoms/              # Base UI elements
│   ├── lib/
│   │   ├── graphql.ts          # GraphQL client
│   │   ├── utils.ts            # Formatters & helpers
│   │   └── checkout.ts         # Checkout logic
│   ├── graphql/                # .graphql query files
│   └── gql/                    # Generated types
├── Dockerfile
├── package.json
└── next.config.js
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/graphql.ts` | GraphQL client with auth |
| `src/lib/utils.ts` | `formatMoney`, `formatDate`, pagination helpers |
| `src/app/config.ts` | `ProductsPerPage` and other constants |
| `src/graphql/*.graphql` | Query/mutation definitions |

---

## GraphQL API

### Endpoint

`http://localhost:8000/graphql/`

### Key Queries

```graphql
# Products
query { products(first: 10, channel: "webstore") {
  edges { node { id name slug pricing { ... } } }
}}

# Single Product
query { product(slug: "card-name", channel: "webstore") {
  id name variants { id pricing { price { gross { amount currency }}}}
}}

# Search
query { products(first: 20, channel: "webstore", search: "dragon") {
  edges { node { id name } }
}}
```

### Key Mutations

```graphql
# Create Checkout
mutation { checkoutCreate(input: { channel: "webstore", lines: [] }) {
  checkout { id }
}}

# Add Line
mutation { checkoutLinesAdd(id: "...", lines: [{ variantId: "...", quantity: 1 }]) {
  checkout { id lines { id } }
}}
```

---

## MTG Catalog Data

### Overview

| Metric | Value |
|--------|-------|
| Total Products | 106,872 |
| Product Type | MTG Card |
| Category | MTG Cards |
| Channel | webstore |
| Custom Attributes | 23 |

### Attribute Schema

**Card Mechanics**
- `mana_cost` (string) - e.g., "{2}{U}{U}"
- `mana_value` (number) - converted mana cost
- `colors` (multiselect) - W, U, B, R, G
- `color_identity` (multiselect)
- `type_line` (string) - e.g., "Creature — Dragon"
- `power`, `toughness` (string)

**Set Information**
- `rarity` (dropdown) - common, uncommon, rare, mythic
- `set_name` (string)
- `set_code` (string)
- `collector_number` (string)

**Card Content**
- `oracle_text` (rich text)
- `flavor_text` (rich text)
- `keywords` (multiselect)
- `artist` (string)

**Collectibility**
- `reserved_list` (boolean)
- `promo` (boolean)
- `full_art` (boolean)

**External References**
- `scryfall_id` (string)
- `scryfall_uri` (string)

### Database Tables

| Table | Purpose |
|-------|---------|
| `product_product` | Product records |
| `product_productvariant` | Variants (one per card) |
| `product_productchannellisting` | Channel visibility |
| `product_productvariantchannellisting` | Variant pricing |
| `attribute_assignedproductattributevalue` | Attribute values |

---

## External Resources

### Documentation

- Saleor Docs: https://docs.saleor.io/
- GraphQL Reference: https://docs.saleor.io/api-reference/
- App Development: https://docs.saleor.io/developer/extending/apps/

### Repositories

- Saleor Core: https://github.com/saleor/saleor
- Dashboard: https://github.com/saleor/saleor-dashboard
- Platform: https://github.com/saleor/saleor-platform
- Storefront: https://github.com/saleor/storefront

### Data Sources

- Scryfall API: https://scryfall.com/docs/api
- MTG JSON: https://mtgjson.com/

---

*Last updated: December 2024*
