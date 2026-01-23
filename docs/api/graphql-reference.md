# GraphQL API Reference

**Saleor Version:** 3.22
**Last Updated:** 2026-01-23

This document covers GraphQL patterns commonly used in the Hobby Gaming Platform.

---

## Overview

Saleor exposes a GraphQL API at `/graphql/`. This platform uses Saleor 3.22, which is based on the GraphQL spec with Relay-style pagination.

**Official Documentation:** https://docs.saleor.io/api-reference

---

## Common Query Patterns

### Product Queries

```graphql
# Fetch products with variants and pricing
query GetProducts($channel: String!, $first: Int!) {
  products(channel: $channel, first: $first) {
    edges {
      node {
        id
        name
        slug
        variants {
          id
          sku
          name
          pricing {
            price {
              gross {
                amount
                currency
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Product Variant by SKU

```graphql
query GetVariantBySku($sku: String!, $channel: String!) {
  productVariant(sku: $sku, channel: $channel) {
    id
    name
    sku
    stocks {
      warehouse {
        id
        name
      }
      quantity
      quantityAllocated
    }
    pricing {
      price {
        gross {
          amount
          currency
        }
      }
    }
  }
}
```

### Order Details

```graphql
query GetOrder($id: ID!) {
  order(id: $id) {
    id
    number
    status
    total {
      gross {
        amount
        currency
      }
    }
    lines {
      id
      productName
      variantName
      quantity
      unitPrice {
        gross {
          amount
        }
      }
    }
  }
}
```

---

## Common Mutation Patterns

### Create Product (Admin)

```graphql
mutation CreateProduct($input: ProductCreateInput!) {
  productCreate(input: $input) {
    product {
      id
      name
      slug
    }
    errors {
      field
      code
      message
    }
  }
}
```

### Update Stock

```graphql
mutation UpdateStock($input: StockInput!, $id: ID!) {
  stockUpdate(input: $input, id: $id) {
    stock {
      id
      quantity
    }
    errors {
      field
      code
      message
    }
  }
}
```

### Create Order

```graphql
mutation CreateOrder($input: OrderCreateInput!) {
  orderCreate(input: $input) {
    order {
      id
      number
    }
    errors {
      field
      code
      message
    }
  }
}
```

---

## Error Code Reference

Saleor mutations return structured errors. Common error codes:

| Code | Description | Typical Cause |
|------|-------------|---------------|
| `INVALID` | Invalid input value | Malformed data |
| `REQUIRED` | Required field missing | Null/empty required field |
| `NOT_FOUND` | Entity not found | Invalid ID reference |
| `UNIQUE` | Uniqueness constraint violated | Duplicate SKU, slug, etc. |
| `GRAPHQL_ERROR` | Query/mutation syntax error | Malformed GraphQL |
| `PERMISSION_DENIED` | Insufficient permissions | Missing auth or scope |
| `PRODUCT_NOT_PUBLISHED` | Product not in channel | Channel availability |
| `INSUFFICIENT_STOCK` | Not enough inventory | Checkout/order creation |
| `CHANNEL_INACTIVE` | Channel not active | Operations on inactive channel |

### Error Response Structure

```json
{
  "data": {
    "productCreate": {
      "product": null,
      "errors": [
        {
          "field": "slug",
          "code": "UNIQUE",
          "message": "Product with this slug already exists."
        }
      ]
    }
  }
}
```

---

## Pagination (Relay Style)

All list queries use Relay-style cursor pagination:

```graphql
query PaginatedProducts($channel: String!, $first: Int!, $after: String) {
  products(channel: $channel, first: $first, after: $after) {
    edges {
      node {
        id
        name
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
}
```

**Pagination Tips:**
- Use `first`/`after` for forward pagination
- Use `last`/`before` for backward pagination
- Maximum page size is typically 100 items
- Use `totalCount` for displaying total results (can be expensive)

---

## Channel Context

Most queries require a channel context. The platform uses:

| Channel | Slug | Purpose |
|---------|------|---------|
| Webstore | `webstore` | Public storefront |
| POS | `pos` | Point of sale |

```graphql
# Always specify channel for product/pricing queries
products(channel: "webstore", first: 10) { ... }
```

---

## Platform-Specific Operations

### MTG Product Attributes

Products in this platform have MTG-specific attributes:

```graphql
query GetMTGProductAttributes($id: ID!) {
  product(id: $id) {
    id
    name
    attributes {
      attribute {
        slug
      }
      values {
        name
        slug
      }
    }
  }
}
```

Common attribute slugs:
- `set-code` - MTG set code (e.g., "LEA", "MH3")
- `rarity` - Card rarity (common, uncommon, rare, mythic)
- `condition` - Card condition (NM, LP, MP, HP, DMG)
- `finish` - Card finish (non-foil, foil, etched)

---

## Rate Limiting

Saleor does not have built-in rate limiting. For production deployments, implement rate limiting at the infrastructure level (e.g., API Gateway, nginx).

---

## Further Reading

- [Saleor 3.22 API Reference](https://docs.saleor.io/api-reference)
- [Saleor GraphQL Queries](https://docs.saleor.io/docs/api-usage/queries)
- [Saleor GraphQL Mutations](https://docs.saleor.io/docs/api-usage/mutations)
- [Platform Sync Contracts](../reference/sync-contracts.md)
