# Database Critical Rules

> **Full procedures**: See skill `saleor-database` for queries and operations.

## Pricing Gotcha (CRITICAL)

When creating/importing products, **both** price fields must be set:

| Field | Required | If NULL |
|-------|----------|---------|
| `price_amount` | Yes | No price displayed |
| `discounted_price_amount` | **Yes** | `AttributeError: 'NoneType' object has no attribute 'currency'` |

**Fix script** (if pricing crashes occur):
```sql
UPDATE product_productvariantchannellisting
SET discounted_price_amount = price_amount
WHERE discounted_price_amount IS NULL AND price_amount IS NOT NULL;
```

## Connection

```bash
docker compose exec db psql -U saleor -d saleor
# Credentials: saleor/saleor on port 5432
```
