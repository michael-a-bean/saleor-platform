---
name: storefront-dev
description: Develop and build the Next.js storefront. Use for component development, GraphQL codegen, and Docker builds.
---

# Storefront Development Skill

## When to Use

Use this skill when you need to:
- Build or rebuild the storefront Docker image
- Generate GraphQL types
- Run storefront in development mode
- Debug Next.js issues

## Directory Structure

```
storefront/
├── src/
│   ├── app/[channel]/      # Pages (App Router)
│   ├── ui/components/      # React components
│   ├── lib/                # Utilities
│   ├── graphql/            # .graphql files
│   └── gql/                # Generated types (don't edit)
├── Dockerfile
└── package.json
```

## Common Operations

### Build Docker Image

```bash
# Ensure API is running first
docker compose up -d api

# Build with network access for GraphQL introspection
docker build --network=host \
  --build-arg NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/ \
  --build-arg NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_DEFAULT_CHANNEL=webstore \
  -t saleor-storefront:local ./storefront

# Restart container
docker compose up -d --force-recreate storefront
```

### Regenerate GraphQL Types

After modifying `.graphql` files in `storefront/src/graphql/`:

```bash
# Run codegen in container
docker run --rm --network=host \
  -v $(pwd)/storefront:/app -w /app \
  -e NEXT_PUBLIC_SALEOR_API_URL=http://localhost:8000/graphql/ \
  node:20-alpine sh -c "corepack enable && pnpm install && pnpm graphql-codegen"

# Then rebuild Docker image
```

### View Logs

```bash
docker compose logs -f storefront
```

### Check Build Output

```bash
docker compose exec storefront ls -la /app/.next/
```

## Key Patterns

### Dynamic Rendering

Pages using `notFound()`, `redirect()`, or dynamic features need:

```typescript
export const dynamic = "force-dynamic";
```

### Server Components

Default in App Router. Use `"use client"` only when needed.

### GraphQL Queries

1. Create query in `src/graphql/MyQuery.graphql`
2. Run codegen
3. Import from `@/gql/graphql`

```typescript
import { MyQueryDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";

const data = await executeGraphQL(MyQueryDocument, {
  variables: { ... },
  revalidate: 60,
});
```

### Null Safety

Always handle null pricing:

```typescript
const price = product.pricing?.priceRange?.start?.gross
  ? formatMoney(
      product.pricing.priceRange.start.gross.amount,
      product.pricing.priceRange.start.gross.currency
    )
  : "";
```

## Debugging

### Check API Connectivity

```bash
docker compose exec storefront wget -qO- http://localhost:8000/graphql/ --post-data='{"query":"{__typename}"}' || echo "API unreachable"
```

### View Generated Types

```bash
cat storefront/src/gql/graphql.ts | head -100
```

### Check Environment

```bash
docker compose exec storefront env | grep NEXT
```
