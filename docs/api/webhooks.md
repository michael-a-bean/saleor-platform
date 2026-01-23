# Webhooks

**Saleor Version:** 3.22
**Last Updated:** 2026-01-23

This document covers webhook usage in the Hobby Gaming Platform.

---

## Overview

Saleor webhooks enable real-time integration between Saleor and external systems. Apps register webhook subscriptions to receive events.

**Official Documentation:** https://docs.saleor.io/docs/developer/webhooks

**Detailed Contracts:** See [sync-contracts.md](../reference/sync-contracts.md) for complete payload specifications.

---

## Webhook Events Used by Platform

### inventory-ops App

| Event | Endpoint | Purpose |
|-------|----------|---------|
| `ORDER_FULFILLED` | `/api/webhooks/saleor/order-fulfilled` | Trigger COGS calculation |
| `PRODUCT_VARIANT_STOCK_UPDATED` | `/api/webhooks/saleor/stock-updated` | Detect stock discrepancies |

### buylist App

| Event | Endpoint | Purpose |
|-------|----------|---------|
| `ORDER_CREATED` | `/api/webhooks/saleor/order-created` | Track buylist orders |

### pos App

| Event | Endpoint | Purpose |
|-------|----------|---------|
| `ORDER_FULLY_PAID` | `/api/webhooks/saleor/order-paid` | Register drawer reconciliation |

---

## Payload Format

### Standard Webhook Payload Structure

```json
{
  "event": "ORDER_FULFILLED",
  "timestamp": "2026-01-23T10:30:00.000Z",
  "payload": {
    // Event-specific data
  },
  "meta": {
    "issued_at": "2026-01-23T10:30:00.000Z"
  }
}
```

### ORDER_FULFILLED Payload

```json
{
  "order": {
    "id": "T3JkZXI6MTIzNA==",
    "number": "1234",
    "status": "FULFILLED",
    "channel": {
      "slug": "webstore"
    },
    "lines": [
      {
        "id": "T3JkZXJMaW5lOjU2Nzg=",
        "variant": {
          "id": "UHJvZHVjdFZhcmlhbnQ6OTAxMg==",
          "sku": "ff1b8fc5-1234-5678-90ab-cdef12345678-NM-F"
        },
        "productName": "Lightning Bolt",
        "variantName": "Near Mint / Foil",
        "quantity": 2,
        "unitPrice": {
          "gross": {
            "amount": 5.99,
            "currency": "USD"
          }
        }
      }
    ]
  }
}
```

### PRODUCT_VARIANT_STOCK_UPDATED Payload

```json
{
  "productVariant": {
    "id": "UHJvZHVjdFZhcmlhbnQ6OTAxMg==",
    "sku": "ff1b8fc5-1234-5678-90ab-cdef12345678-NM-F",
    "name": "Near Mint / Foil",
    "stocks": [
      {
        "warehouse": {
          "id": "V2FyZWhvdXNlOjE=",
          "slug": "default"
        },
        "quantity": 10,
        "quantityAllocated": 2
      }
    ]
  }
}
```

---

## Webhook Registration

Apps register webhooks via their manifest or GraphQL mutations.

### Via App Manifest

```typescript
// apps/inventory-ops/saleor-app.ts
export const apl = new FileAPL();

export const saleorApp = new SaleorApp({
  apl,
  manifest: {
    name: "Inventory Ops",
    webhooks: [
      {
        name: "Order Fulfilled",
        asyncEvents: ["ORDER_FULFILLED"],
        targetUrl: `${env.APP_URL}/api/webhooks/saleor/order-fulfilled`,
        query: ORDER_FULFILLED_SUBSCRIPTION,
      },
    ],
  },
});
```

### Via GraphQL Mutation

```graphql
mutation CreateWebhook($input: WebhookCreateInput!) {
  webhookCreate(input: $input) {
    webhook {
      id
      name
      targetUrl
      events {
        eventType
      }
    }
    errors {
      field
      message
    }
  }
}
```

---

## Webhook Subscriptions (GraphQL)

Webhooks use GraphQL subscription queries to define their payload:

```graphql
subscription OrderFulfilled {
  event {
    ... on OrderFulfilled {
      order {
        id
        number
        lines {
          variant {
            id
            sku
          }
          quantity
        }
      }
    }
  }
}
```

---

## Available Async Event Types

Common events used in e-commerce workflows:

| Category | Events |
|----------|--------|
| **Orders** | `ORDER_CREATED`, `ORDER_CONFIRMED`, `ORDER_PAID`, `ORDER_FULLY_PAID`, `ORDER_FULFILLED`, `ORDER_CANCELLED`, `ORDER_REFUNDED` |
| **Products** | `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DELETED` |
| **Variants** | `PRODUCT_VARIANT_CREATED`, `PRODUCT_VARIANT_UPDATED`, `PRODUCT_VARIANT_DELETED`, `PRODUCT_VARIANT_STOCK_UPDATED`, `PRODUCT_VARIANT_OUT_OF_STOCK`, `PRODUCT_VARIANT_BACK_IN_STOCK` |
| **Checkout** | `CHECKOUT_CREATED`, `CHECKOUT_UPDATED`, `CHECKOUT_FULLY_PAID` |
| **Fulfillment** | `FULFILLMENT_CREATED`, `FULFILLMENT_CANCELED`, `FULFILLMENT_APPROVED` |

For the complete list, see the [Saleor webhook events documentation](https://docs.saleor.io/docs/developer/webhooks/events).

---

## Error Handling

### Delivery Failures

Saleor retries failed webhook deliveries:
- **Retry policy:** 3 attempts with exponential backoff
- **Timeout:** 20 seconds per request
- **Failure tracking:** Via webhook logs in Dashboard

### App Error Handling

```typescript
// Example webhook handler with error handling
export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // Validate webhook signature
    const signature = request.headers.get("saleor-signature");
    if (!verifySignature(payload, signature)) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Process webhook
    await processOrderFulfilled(payload);

    return Response.json({ received: true });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    // Return 500 to trigger retry
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
```

---

## Security

### Webhook Signature Verification

Saleor signs webhook payloads. Always verify signatures:

```typescript
import { verifySignature } from "@saleor/app-sdk";

const isValid = verifySignature({
  payload: body,
  signature: request.headers.get("saleor-signature"),
  secretKey: env.SECRET_KEY,
});
```

### Network Security

- Webhook endpoints should only accept POST requests
- Use HTTPS in production
- Consider IP allowlisting for Saleor API server

---

## Monitoring

### Dashboard Webhook Logs

1. Navigate to **Configuration > Webhooks**
2. Select the app
3. View delivery logs with status, duration, response

### Application Logging

Apps should log webhook events for debugging:

```typescript
logger.info("Webhook received", {
  event: "ORDER_FULFILLED",
  orderId: payload.order.id,
  timestamp: new Date().toISOString(),
});
```

---

## Further Reading

- [Saleor Webhooks Documentation](https://docs.saleor.io/docs/developer/webhooks)
- [Platform Sync Contracts](../reference/sync-contracts.md) - Detailed payload specifications
- [Saleor App SDK](https://github.com/saleor/saleor-app-sdk)
