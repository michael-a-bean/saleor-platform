---
name: saleor-database
description: Execute PostgreSQL queries against the Saleor database. Use for data inspection, debugging, and bulk updates.
---

# Saleor Database Skill

## When to Use

Use this skill when you need to:
- Inspect product/variant data directly
- Debug pricing or inventory issues
- Perform bulk data updates
- Check table schemas

## Connection

```bash
docker compose exec -T db psql -U saleor -d saleor
```

## Quick Queries

### Interactive Shell
```bash
docker compose exec db psql -U saleor -d saleor
```

### Single Query
```bash
docker compose exec -T db psql -U saleor -d saleor -c "YOUR SQL HERE"
```

## Common Queries

### Count Products
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
SELECT COUNT(*) as total_products FROM product_product;
"
```

### List Product Types
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
SELECT id, name, slug FROM product_producttype;
"
```

### Check Product Pricing
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
SELECT p.name, pvcp.price_amount, pvcp.discounted_price_amount, pvcp.currency
FROM product_product p
JOIN product_productvariant pv ON p.id = pv.product_id
JOIN product_productvariantchannellisting pvcp ON pv.id = pvcp.variant_id
LIMIT 10;
"
```

### Find Products by Name
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
SELECT id, name, slug FROM product_product
WHERE name ILIKE '%dragon%' LIMIT 10;
"
```

### Check Attributes
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
SELECT id, name, slug, input_type FROM attribute_attribute
WHERE product_type_id IS NOT NULL;
"
```

### View Table Schema
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
\d product_product
"
```

## Key Tables

| Table | Purpose |
|-------|---------|
| `product_product` | Product records |
| `product_productvariant` | Variant records |
| `product_productchannellisting` | Product channel visibility |
| `product_productvariantchannellisting` | Variant pricing per channel |
| `attribute_attribute` | Attribute definitions |
| `attribute_assignedproductattributevalue` | Product attribute values |
| `channel_channel` | Sales channels |
| `order_order` | Orders |
| `checkout_checkout` | Active checkouts |

## Dangerous Operations

Always backup before bulk updates:

```bash
# Backup
docker compose exec -T db pg_dump -U saleor saleor > backup.sql

# Restore
docker compose exec -T db psql -U saleor -d saleor < backup.sql
```
