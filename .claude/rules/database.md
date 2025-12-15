# Database Rules

## Connection

```bash
docker compose exec db psql -U saleor -d saleor
```

Credentials: `saleor` / `saleor` on port 5432

## Critical: Pricing Fields

When creating products programmatically, **both** fields must be set:

### Variant Channel Listings

| Field | Required | Purpose |
|-------|----------|---------|
| `price_amount` | Yes | Base price |
| `discounted_price_amount` | **Yes** | Current selling price |

If `discounted_price_amount` is NULL, pricing queries crash with:
```
AttributeError: 'NoneType' object has no attribute 'currency'
```

### Product Channel Listings

| Field | Required |
|-------|----------|
| `discounted_price_amount` | Yes (min variant price) |
| `currency` | Yes (must match variants) |

## Fix Scripts

If products were imported without discounted prices:

```sql
-- Fix variant channel listings
UPDATE product_productvariantchannellisting
SET discounted_price_amount = price_amount
WHERE discounted_price_amount IS NULL
  AND price_amount IS NOT NULL;

-- Fix product channel listings
UPDATE product_productchannellisting pcl
SET
    discounted_price_amount = min_prices.min_price,
    currency = min_prices.currency
FROM (
    SELECT
        pvcp.channel_id,
        pv.product_id,
        MIN(pvcp.discounted_price_amount) as min_price,
        pvcp.currency
    FROM product_productvariantchannellisting pvcp
    JOIN product_productvariant pv ON pv.id = pvcp.variant_id
    WHERE pvcp.discounted_price_amount IS NOT NULL
    GROUP BY pvcp.channel_id, pv.product_id, pvcp.currency
) AS min_prices
WHERE pcl.product_id = min_prices.product_id
  AND pcl.channel_id = min_prices.channel_id;
```

## Key Tables

| Table | Purpose |
|-------|---------|
| `product_product` | Product records |
| `product_productvariant` | Variant records |
| `product_productchannellisting` | Product visibility/pricing per channel |
| `product_productvariantchannellisting` | Variant pricing per channel |
| `attribute_attribute` | Custom attribute definitions |
| `attribute_assignedproductattributevalue` | Product attribute values |
