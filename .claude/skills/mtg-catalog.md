---
name: mtg-catalog
description: Work with the MTG card catalog. Use for querying cards, checking attributes, and managing card data.
---

# MTG Card Catalog Skill

## When to Use

Use this skill when you need to:
- Query MTG cards by attributes
- Check card pricing or inventory
- Debug card data issues
- Understand the MTG data model

## Catalog Overview

- **106,872 cards** imported from Scryfall
- **Product Type**: MTG Card
- **Category**: MTG Cards
- **Channel**: webstore

## GraphQL Queries

### Search Cards by Name
```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { products(first: 10, channel: \"webstore\", search: \"lightning bolt\") { edges { node { id name slug } } } }"
  }' | python3 -m json.tool
```

### Get Card with Attributes
```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($slug: String!) { product(slug: $slug, channel: \"webstore\") { id name attributes { attribute { slug } values { name } } } }",
    "variables": {"slug": "card-slug-here"}
  }' | python3 -m json.tool
```

### Filter by Rarity
```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { products(first: 20, channel: \"webstore\", filter: {attributes: [{slug: \"rarity\", values: [\"mythic\"]}]}) { edges { node { id name } } } }"
  }' | python3 -m json.tool
```

## Database Queries

### Count Cards by Rarity
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
SELECT av.name as rarity, COUNT(*) as count
FROM attribute_assignedproductattributevalue apav
JOIN attribute_attributevalue av ON apav.value_id = av.id
JOIN attribute_attribute a ON av.attribute_id = a.id
WHERE a.slug = 'rarity'
GROUP BY av.name
ORDER BY count DESC;
"
```

### Find Cards by Color
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
SELECT p.name, av.name as color
FROM product_product p
JOIN attribute_assignedproductattributevalue apav ON p.id = apav.product_id
JOIN attribute_attributevalue av ON apav.value_id = av.id
JOIN attribute_attribute a ON av.attribute_id = a.id
WHERE a.slug = 'colors' AND av.name = 'U'
LIMIT 10;
"
```

### Check Card Pricing
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
SELECT p.name, pvcp.price_amount, pvcp.currency
FROM product_product p
JOIN product_productvariant pv ON p.id = pv.product_id
JOIN product_productvariantchannellisting pvcp ON pv.id = pvcp.variant_id
WHERE pvcp.price_amount > 0
ORDER BY pvcp.price_amount DESC
LIMIT 10;
"
```

### Find Reserved List Cards
```bash
docker compose exec -T db psql -U saleor -d saleor -c "
SELECT p.name
FROM product_product p
JOIN attribute_assignedproductattributevalue apav ON p.id = apav.product_id
JOIN attribute_attributevalue av ON apav.value_id = av.id
JOIN attribute_attribute a ON av.attribute_id = a.id
WHERE a.slug = 'reserved_list' AND av.boolean = true
LIMIT 20;
"
```

## MTG Attributes

| Attribute | Type | Values |
|-----------|------|--------|
| `mana_cost` | string | {2}{U}{U} |
| `mana_value` | number | 0-16+ |
| `colors` | multiselect | W, U, B, R, G |
| `color_identity` | multiselect | W, U, B, R, G |
| `type_line` | string | Creature — Dragon |
| `rarity` | dropdown | common, uncommon, rare, mythic |
| `set_name` | string | Set name |
| `set_code` | string | 3-letter code |
| `reserved_list` | boolean | true/false |
| `promo` | boolean | true/false |
| `full_art` | boolean | true/false |

## After Catalog Changes

Always update the search index:
```bash
docker compose exec api python manage.py update_search_indexes
```

## Import Scripts

Located at `scripts/mtg_scryfall_import/`:
- `import_command.py` - Django management command
- `run_import.sh` - Orchestration script
