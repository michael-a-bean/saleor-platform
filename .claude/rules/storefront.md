---
paths:
  - storefront/**
---

# Storefront Critical Rules

> **Full procedures**: See skill `storefront-dev` for builds, codegen, and development.

## Build Gotcha (CRITICAL)

API must be running during build (GraphQL introspection):
```bash
docker compose up -d api
docker build --network=host ... ./storefront
```

## Dynamic Rendering (CRITICAL)

Pages using `notFound()`, `redirect()`, or `useSearchParams()` require:
```typescript
export const dynamic = "force-dynamic";
```
Without this: `DYNAMIC_SERVER_USAGE` build errors.

## Null-Safe Formatting

Always handle null currency:
```typescript
if (!currency) return "";
```

## Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| "Something went wrong" | Null `discounted_price_amount` | Fix pricing in DB |
| Images not loading | Missing remotePatterns | Add to `next.config.js` |
| CORS errors | Docker networking | Set `extra_hosts: "localhost:host-gateway"` |
