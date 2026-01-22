# Docker App Endpoint Configuration

This document explains how Saleor apps resolve API endpoints in Docker environments and how to troubleshoot common issues.

## The Problem: localhost vs Docker Service Names

In Docker, `localhost` inside a container points to the container itself, NOT the host machine or other containers. This creates a mismatch:

| Context | `localhost:8000` resolves to |
|---------|------------------------------|
| Browser (host machine) | Saleor API (correct) |
| App container (Docker) | The app container itself (wrong) |

When a Saleor app is installed via the Dashboard:
1. The browser sends `http://localhost:8000/graphql/` as the Saleor API URL
2. The app tries to fetch the app ID from Saleor using this URL
3. Inside Docker, this fails because `localhost:8000` doesn't reach Saleor

### Error Example

```
Couldn't Install Stripe
The auth data given during registration request could not be used to fetch app ID.
This usually means that App could not connect to Saleor during installation.
Saleor URL that App tried to connect: http://localhost:8000/graphql/
```

## The Solution: URL Normalization

All apps use a `NormalizedAPL` pattern that rewrites URLs before storage and network calls:

| Original URL | Normalized URL |
|--------------|----------------|
| `http://localhost:8000/graphql/` | `http://api:8000/graphql/` |
| `http://127.0.0.1:8000/graphql/` | `http://api:8000/graphql/` |

The `api` hostname is the Docker service name for Saleor, reachable within the `saleor-backend-tier` network.

### Implementation Files

Each app implements this pattern:

| App | Normalization File | APL File |
|-----|-------------------|----------|
| Stripe | `src/lib/normalized-apl.ts` | `src/lib/saleor-app.ts` |
| Inventory Ops | `src/lib/normalized-apl.ts` | `src/lib/saleor-app.ts` |
| Buylist | `src/lib/normalized-apl.ts` | `src/lib/saleor-app.ts` |
| POS | `src/lib/normalized-apl.ts` | `src/lib/saleor-app.ts` |

### Key Code Pattern

```typescript
// normalized-apl.ts
const URL_ALIASES: [string, string][] = [
  ["localhost:8000", "api:8000"],
  ["127.0.0.1:8000", "api:8000"],
];

export const normalizeSaleorApiUrl = (url: string): string => {
  for (const [alias, canonical] of URL_ALIASES) {
    if (url.includes(alias)) {
      return url.replace(alias, canonical);
    }
  }
  return url;
};
```

The register route (`/api/register/route.ts`) also normalizes the request header:

```typescript
const normalizeRequestUrl = (request: NextRequest): NextRequest => {
  const saleorApiUrl = request.headers.get("saleor-api-url");
  if (saleorApiUrl) {
    const normalizedUrl = normalizeSaleorApiUrl(saleorApiUrl);
    if (normalizedUrl !== saleorApiUrl) {
      const newHeaders = new Headers(request.headers);
      newHeaders.set("saleor-api-url", normalizedUrl);
      return new NextRequest(request.url, {
        method: request.method,
        headers: newHeaders,
        body: request.body,
        duplex: "half",
      });
    }
  }
  return request;
};
```

## Endpoint Configuration by Runtime Context

### Local Development (Docker Compose)

```
docker-compose.yml:
├── api (Saleor) → port 8000
├── stripe-app → port 3001
├── inventory-ops-app → port 3002
├── buylist-app → port 3003
└── pos-app → port 3004
```

| From | To | URL Pattern |
|------|----|-------------|
| Browser | Saleor | `http://localhost:8000/graphql/` |
| App container | Saleor | `http://api:8000/graphql/` |
| Saleor | App | `http://<app-service>:<port>/api/...` |

### Staging (AWS ECS)

All services share an ALB, so the URL is the same from all contexts:

```
http://saleor-platform-staging-alb-xxx.elb.amazonaws.com/graphql/
```

No URL normalization is needed in staging/production.

## Troubleshooting

### Installation Fails with "Could not fetch app ID"

**Symptoms:**
- App manifest is readable
- App installation starts but fails during registration
- Error mentions "localhost:8000"

**Root Cause:**
The app's register route is not normalizing the `saleor-api-url` header.

**Fix:**
Ensure the app has:
1. `src/lib/normalized-apl.ts` with URL normalization logic
2. `src/lib/saleor-app.ts` wrapping the APL with `NormalizedAPL`
3. `src/app/api/register/route.ts` with `normalizeRequestUrl` middleware

### Auth Lookup Fails After Successful Installation

**Symptoms:**
- Installation succeeded (app shows in Dashboard)
- App iframe fails to load
- Logs show "authData not found"

**Root Cause:**
The APL stores data with normalized URL but lookup uses original URL.

**Fix:**
Ensure the APL is wrapped with `NormalizedAPL` so lookups are also normalized:

```typescript
// saleor-app.ts
const baseApl = new FileAPL(); // or DynamoAPL
export const apl: APL = new NormalizedAPL(baseApl);
```

### Verify Docker Network Connectivity

```bash
# Check if app container can reach Saleor
docker compose exec stripe-app curl -s http://api:8000/graphql/ \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' | jq .

# Expected: {"data": {"__typename": "Query"}}
```

### Verify App Auth Data

```bash
# For FileAPL-based apps
docker compose exec inventory-ops-app cat data/.saleor-app-auth.json

# For DynamoDB-based apps (Stripe)
aws dynamodb scan \
  --table-name stripe-main-table \
  --filter-expression "SK = :sk" \
  --expression-attribute-values '{":sk": {"S": "APL"}}' \
  --endpoint-url http://localhost:8001 | jq .
```

## Adding New Apps

When creating a new Saleor app that will run in Docker:

1. **Copy normalization pattern** from an existing app (`inventory-ops` recommended)

2. **Add to docker-compose.yml** with correct network:
   ```yaml
   new-app:
     networks:
       - saleor-backend-tier
     extra_hosts:
       - "localhost:host-gateway"
       - "host.docker.internal:host-gateway"
   ```

3. **Set environment variables**:
   ```yaml
   environment:
     - APP_IFRAME_BASE_URL=http://localhost:PORT  # For browser
     - APP_API_BASE_URL=http://new-app:PORT       # For Saleor callbacks
   ```

4. **Test installation** from Dashboard

## Related Documentation

- [Architecture Reference](../../reference/architecture.md) - Full platform architecture
- [Staging App Installation](staging-app-installation.md) - AWS/ECS deployment
- [Implementation Plan](../../../saleor-apps/apps/inventory-ops/IMPLEMENTATION_PLAN.md) - URL rewriting details
