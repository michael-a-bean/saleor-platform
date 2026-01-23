# API Documentation

**Last Updated:** 2026-01-23
**Saleor Version:** 3.22

This directory contains API documentation for the Saleor Hobby Gaming Platform.

---

## Contents

| Document | Description |
|----------|-------------|
| [GraphQL Reference](graphql-reference.md) | Query/mutation patterns, error codes, examples |
| [Webhooks](webhooks.md) | Webhook events, payloads, registration |
| [Versioning Policy](versioning-policy.md) | API versioning and migration strategy |

---

## Quick Links

### Official Saleor Documentation

- [Saleor GraphQL API Reference](https://docs.saleor.io/api-reference)
- [Saleor Webhooks Guide](https://docs.saleor.io/docs/developer/webhooks)
- [Saleor App Development](https://docs.saleor.io/docs/developer/app-store/apps-development)

### Platform-Specific Documentation

- [Sync Contracts](../reference/sync-contracts.md) - Data flow between Saleor, inventory-ops, and Meilisearch
- [Architecture](../reference/architecture.md) - Full platform architecture overview

---

## API Access

### GraphQL Playground

- **Development:** http://localhost:8000/graphql/
- **Requires:** Authentication token for most operations

### Authentication

```bash
# Get auth token via email/password
curl -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { tokenCreate(email: \"admin@example.com\", password: \"admin\") { token } }"}'
```

### Webhook Endpoints

Webhooks are registered by Saleor Apps. See [webhooks.md](webhooks.md) for details.
