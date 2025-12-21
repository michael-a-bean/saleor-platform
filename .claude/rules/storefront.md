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

## Common Crashes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Something went wrong" | Null `discounted_price_amount` | See database.md rule |
| Currency format error | Null currency | Guard: `if (!currency) return "";` |
