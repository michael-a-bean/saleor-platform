---
paths:
  - storefront/**
---

# Storefront Development Rules

## Stack

- Next.js 15 with App Router
- React 19 with Server Components
- TypeScript (strict mode)
- TailwindCSS
- pnpm package manager

## Key Patterns

### Dynamic Rendering

Pages using `notFound()`, `redirect()`, or `useSearchParams()` require:

```typescript
export const dynamic = "force-dynamic";
```

Without this, production builds fail with `DYNAMIC_SERVER_USAGE` errors.

### Null-Safe Formatting

Always handle null/undefined in formatters:

```typescript
export const formatMoney = (amount: number, currency: string) => {
    if (!currency) return "";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(amount);
};
```

## GraphQL Codegen

After modifying `.graphql` files:

```bash
docker compose exec storefront pnpm graphql-codegen
# Then rebuild
docker compose build storefront
```

## Building the Image

```bash
docker compose up -d api  # API must be running

docker build --network=host \
  --build-arg NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/ \
  --build-arg NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_DEFAULT_CHANNEL=webstore \
  -t saleor-storefront:local ./storefront

docker compose up -d storefront
```

## Directory Structure

```
src/
  app/[channel]/          # Channel-scoped routes
    (main)/               # Main layout group
      products/           # Product pages
      search/             # Search results
  ui/
    components/           # Shared components
    atoms/                # Small reusable elements
  lib/
    graphql.ts            # GraphQL client
    utils.ts              # Formatting utilities
    checkout.ts           # Checkout helpers
  graphql/                # .graphql query files
  gql/                    # Generated types (don't edit)
```

## Common Issues

### "Something went wrong" on product pages
Check API logs for pricing errors. Usually caused by missing `discounted_price_amount` in database.

### Images not loading
External images need to be added to `next.config.js` remotePatterns.

### CORS errors
Ensure `extra_hosts: "localhost:host-gateway"` is set in docker-compose.yml.
