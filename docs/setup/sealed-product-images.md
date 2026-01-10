# MTG Sealed Product Images Setup

This document covers the manual steps required to set up sealed product images that are not captured in git.

## Prerequisites

- Docker containers running (`docker compose up -d`)
- Products already imported via the MTG sealed import scripts

## Step 1: Deploy Upload Script to Container

The `upload_sealed_images.py` management command must be copied into the API container:

```bash
docker cp scripts/mtg_sealed_import/upload_sealed_images.py \
  saleor-platform-api-1:/app/saleor/core/management/commands/
```

## Step 2: Copy WPN Images to Container

Copy the downloaded WPN marketing images into the container:

```bash
docker cp scripts/mtg_sealed_import/wpn_images \
  saleor-platform-api-1:/app/wpn_images/
```

## Step 3: Upload Images to Saleor

Run the management command to associate images with products:

```bash
docker exec saleor-platform-api-1 \
  python manage.py upload_sealed_images /app/wpn_images
```

This will:
- Scan the wpn_images directory for set folders
- Match images to products by name pattern
- Create ProductMedia entries in the database

## Step 4: Sync to Meilisearch

Re-sync products to Meilisearch to include the new image URLs:

```bash
python3 scripts/sync-meilisearch.py --channel webstore --full
```

## Downloading Additional WPN Images

To download images for new sets, use:

```bash
python3 scripts/mtg_sealed_import/download_wpn_images.py
```

The script tries multiple URL patterns for each set:
- `{set}_pds_en.zip` - Standard pattern
- `{set}_pds_preorder_en.zip` - Preorder variant (e.g., Fallout/PIP)
- `{set}_pds_preorder_cluedo_en.zip` - Cluedo variant (e.g., MKM)
- `{set}_onlinestore_assets_en.zip` - Alternative pattern

It also tries multiple years per set (WotC sometimes uploads 2025 releases under 2024 paths).

### Currently Available Sets

| Set | Code | Images | Notes |
|-----|------|--------|-------|
| Bloomburrow | BLB | 19 | |
| Duskmourn | DSK | 23 | |
| Foundations | FDN | 20 | |
| Modern Horizons 3 | MH3 | 24 | |
| Murders at Karlov Manor | MKM | 50 | Uses cluedo URL variant |
| Outlaws of Thunder Junction | OTJ | 8 | |
| Aetherdrift | DFT | 18 | Uses 2024 year path |
| Fallout | PIP | 12 | Universes Beyond, 2023 |

## Troubleshooting

### Broken Image Links

If images show as broken in the storefront:

1. **Check Next.js Image Optimization**: The storefront uses `unoptimized: true` by default to avoid Docker networking issues. If you see "upstream image resolved to private ip" errors, ensure `NEXT_IMAGE_UNOPTIMIZED` is not set to `false`.

2. **Verify API accessibility**: Images are served from `localhost:8000`. Ensure the API container is running and the port is exposed.

3. **Check ProductMedia entries**:
   ```bash
   docker exec saleor-platform-api-1 python manage.py shell -c "
   from saleor.product.models import ProductMedia
   print(ProductMedia.objects.filter(image__icontains='wpn').count())
   "
   ```

### macOS Metadata Files

If downloading on macOS, exclude `._` metadata files:
```bash
find wpn_images -name '._*' -delete
```

## Database State

The following database entries are created by this process:

- `product_productmedia` - Image associations for sealed products
- Media files stored in `/app/media/products/` inside the container

These are not captured in git and must be recreated if the database is reset.
