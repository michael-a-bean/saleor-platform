---
name: saleor-graphql
description: Execute GraphQL queries and mutations against the Saleor API. Use for product queries, checkout operations, and API exploration.
---

# Saleor GraphQL Skill

## When to Use

Use this skill when you need to:
- Query products, categories, or collections
- Execute checkout/order mutations
- Explore the GraphQL schema
- Test API operations

## GraphQL Endpoint

```
http://localhost:8000/graphql/
```

## Executing Queries

Use curl to execute GraphQL queries:

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "YOUR_QUERY_HERE"
  }' | python3 -m json.tool
```

## Common Queries

### List Products
```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { products(first: 10, channel: \"webstore\") { edges { node { id name slug } } } }"
  }' | python3 -m json.tool
```

### Search Products
```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($search: String!) { products(first: 20, channel: \"webstore\", search: $search) { edges { node { id name } } } }",
    "variables": {"search": "dragon"}
  }' | python3 -m json.tool
```

### Get Product Details
```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($slug: String!) { product(slug: $slug, channel: \"webstore\") { id name description variants { id name pricing { price { gross { amount currency } } } } } }",
    "variables": {"slug": "product-slug"}
  }' | python3 -m json.tool
```

### Introspect Schema
```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ __schema { types { name kind } } }"
  }' | python3 -m json.tool | head -100
```

## Authenticated Queries

For mutations requiring authentication, first get a token:

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { tokenCreate(email: \"admin@example.com\", password: \"admin\") { token } }"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['tokenCreate']['token'])")

# Use token in subsequent requests
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "{ me { email } }"}' | python3 -m json.tool
```

## Schema Location

The full GraphQL schema is at:
```
/home/michael/saleor-platform/storefront/schema.json
```
