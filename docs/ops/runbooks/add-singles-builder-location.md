# Add a New Singles Builder Location

Use this checklist when spinning up a new physical location for the Singles Builder (e.g., a new retail store, collectible show, or convention).

## Prerequisites

- Saleor Dashboard access (staff user)
- AWS access for ECS env var updates (or Terraform)
- The product catalog is already imported (shared across all channels)

## Steps

### 1. Create Saleor Channel

Dashboard > Configuration > Channels > Create Channel

| Field | Value |
|-------|-------|
| Name | Display name (e.g., "Retail Store", "GenCon 2026") |
| Slug | URL-safe identifier (e.g., `retail-store`, `gencon-2026`) |
| Currency | USD |
| Country | United States |

Assign all product types and shipping methods as needed.

### 2. Create Warehouse

Dashboard > Configuration > Warehouses > Create Warehouse

| Field | Value |
|-------|-------|
| Name | Physical location name |
| Address | Physical address |

Then link the warehouse to the channel:
- Dashboard > Configuration > Channels > [new channel] > Warehouses > Add the warehouse

### 3. Create Product Channel/Variant Listings

Products need `ProductChannelListing` AND `ProductVariantChannelListing` for the new channel. Without both, products are invisible in that channel.

Option A: Use Saleor Dashboard bulk actions
Option B: Script via GraphQL `productChannelListingUpdate` + `productVariantChannelListingUpdate`

### 4. Update MEILISEARCH_CHANNELS

Add the new channel to the `MEILISEARCH_CHANNELS` environment variable on the inventory-ops ECS task definition.

```json
[
  {"slug": "webstore", "warehouseId": null},
  {"slug": "singles-builder", "warehouseId": null},
  {"slug": "retail-store", "warehouseId": "V2FyZWhvdXNlOjE="}
]
```

`warehouseId: null` = aggregated stock across all warehouses.
`warehouseId: "<id>"` = stock scoped to that specific warehouse.

Get the warehouse ID from Saleor Dashboard (URL contains the base64 ID) or via GraphQL:
```graphql
query { warehouses(first: 50) { edges { node { id name } } } }
```

### 5. Redeploy inventory-ops

```bash
scripts/deploy/aws/deploy-single.sh staging inventory-ops
```

### 6. Run Initial Meilisearch Sync

The new channel needs its Meilisearch index populated:

```bash
python scripts/sync-meilisearch.py \
  --channel <slug> \
  --warehouse-id <warehouse-graphql-id>
```

This creates the `<slug>-products` index with warehouse-scoped stock. Takes ~30 min for 76k products on staging.

### 7. Verify

1. Go to `/singles-builder` — the new location should appear as a card
2. Click into it — search should return results with correct stock levels
3. Add items to cart — cart should be scoped to this location
4. Send to Register — POS should pick up the correct channel/warehouse

## Teardown

To remove a location:
1. Remove from `MEILISEARCH_CHANNELS` env var
2. Redeploy inventory-ops
3. Delete the Meilisearch index: `curl -X DELETE http://meilisearch:7700/indexes/<slug>-products`
4. Optionally deactivate the channel in Dashboard (keeps data, hides from UI)
