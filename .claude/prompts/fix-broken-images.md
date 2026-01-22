# Fix Broken Image Links in Webstore

## Objective

Investigate and fix broken image links throughout the webstore (storefront). Product images may be failing to display due to URL issues, null values, or Saleor thumbnail processing failures with external images.

## Background Context

The storefront displays product images from two sources:
1. **External images** (Scryfall card images) stored in `product.media[].url`
2. **Saleor-generated thumbnails** from `product.thumbnail.url`

**Known issue:** Saleor's thumbnail endpoint returns 404 for external image URLs. The codebase uses `media[0]?.url || thumbnail?.url` as a fallback pattern, but this may not be applied consistently everywhere.

## Investigation Steps

### Step 1: Identify Where Images Break

Check the storefront in browser with DevTools Network tab open:
- Product listing pages (`/[channel]/products`)
- Product detail pages (`/[channel]/products/[slug]`)
- Cart page (`/[channel]/cart`)
- Checkout flow (`/checkout`)
- Order history (`/[channel]/orders`)
- Singles builder (`/singles-builder/[channel]`)

Look for:
- 404 errors on image requests
- Images showing placeholder icons
- Broken image indicators
- Console errors related to images

### Step 2: Trace Image URL Sources

Check GraphQL queries to understand what data is being fetched:

```bash
# Find all GraphQL fragments/queries that fetch images
grep -r "thumbnail\|media" storefront/src/graphql/ --include="*.graphql"
```

Verify these patterns are consistent:
- `thumbnail(size: X, format: WEBP) { url, alt }`
- `media { url, alt, type }`

### Step 3: Audit Image Display Components

Check all components that display images for proper null safety:

**Files to audit:**
```
storefront/src/ui/components/ProductElement.tsx
storefront/src/ui/atoms/ProductImageWrapper.tsx
storefront/src/app/[channel]/(main)/products/[slug]/page.tsx
storefront/src/app/[channel]/(main)/cart/page.tsx
storefront/src/checkout/sections/Summary/SummaryItem.tsx
storefront/src/checkout/sections/Summary/utils.ts
storefront/src/ui/components/OrderListItem.tsx
storefront/src/app/singles-builder/[channel]/components/SinglesResultItem.tsx
```

**Pattern to verify in each:**
```typescript
// CORRECT - prioritizes media URL over thumbnail
const imageUrl = media?.[0]?.url || thumbnail?.url;

// INCORRECT - may 404 for external images
const imageUrl = thumbnail?.url;
```

### Step 4: Check for Type Filtering

Some media may be videos, not images. Verify components filter by type:

```typescript
// Good pattern from checkout
const image = media?.find((m) => m.type === "IMAGE");
```

### Step 5: Database Check

Query the database to identify products with missing or problematic image URLs:

```sql
-- Products without any media
SELECT p.id, p.name
FROM product_product p
LEFT JOIN product_productmedia pm ON pm.product_id = p.id
WHERE pm.id IS NULL
LIMIT 20;

-- Media URLs that look suspicious
SELECT id, product_id, image, external_url
FROM product_productmedia
WHERE image IS NULL AND external_url IS NULL
LIMIT 20;

-- Check if external URLs are properly set
SELECT id, product_id, LEFT(external_url, 100) as url_preview
FROM product_productmedia
WHERE external_url IS NOT NULL
LIMIT 10;
```

## Common Fixes

### Fix 1: Consistent Media URL Priority

Ensure all image displays use this pattern:

```typescript
// For product images
const imageUrl = product.media?.[0]?.url || product.thumbnail?.url;

// For variant images (checkout, cart)
const imageUrl =
  variant?.media?.find(m => m.type === "IMAGE")?.url ||
  product?.media?.find(m => m.type === "IMAGE")?.url ||
  thumbnail?.url;
```

### Fix 2: Add Null Guards

Wrap image components with null checks:

```typescript
{imageUrl ? (
  <Image src={imageUrl} alt={alt || ""} fill />
) : (
  <PlaceholderIcon />
)}
```

### Fix 3: GraphQL Query Updates

Ensure all product queries include both fields:

```graphql
fragment ProductImage on Product {
  thumbnail(size: 1024, format: WEBP) {
    url
    alt
  }
  media {
    url
    alt
    type
  }
}
```

### Fix 4: Next.js Image Configuration

Verify `storefront/next.config.js` allows all image domains:

```javascript
images: {
  remotePatterns: [{ hostname: "*" }],
  unoptimized: true,  // Required for external images
  dangerouslyAllowSVG: true,
}
```

## Testing After Fixes

1. **Clear caches:**
   ```bash
   cd storefront && rm -rf .next && bun run build
   ```

2. **Test with fresh browser session** (clear cache, incognito)

3. **Verify all pages:**
   - Product listings load images
   - Product detail pages show images
   - Cart shows line item images
   - Checkout shows product images
   - Order history shows images

4. **Check for console errors** - no 404s or null reference errors

## Success Criteria

- [ ] All product listing pages display images correctly
- [ ] Product detail pages show primary image
- [ ] Cart page shows line item images
- [ ] Checkout summary shows product thumbnails
- [ ] Order history shows product images
- [ ] No 404 errors in network tab for image requests
- [ ] No console errors related to images
- [ ] Placeholder icons appear only for products genuinely missing images

## Notes

- External Scryfall images are the primary source for MTG cards
- Saleor thumbnails are fallback only
- `media[].url` already contains the direct external URL
- Thumbnail generation doesn't work for external URLs (returns 404)
