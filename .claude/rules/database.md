# Database Critical Rules

> **Full procedures**: See skill `saleor-database` for queries and operations.

## Pricing Gotcha (CRITICAL)

When creating/importing products, **both** price fields must be set:

| Field | If NULL |
|-------|---------|
| `price_amount` | No price displayed |
| `discounted_price_amount` | `AttributeError: 'NoneType' object has no attribute 'currency'` |

**Fix** (if pricing crashes occur):
```sql
UPDATE product_productvariantchannellisting
SET discounted_price_amount = price_amount
WHERE discounted_price_amount IS NULL AND price_amount IS NOT NULL;
```
