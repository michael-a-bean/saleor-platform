-- Sync product and variant listings from webstore to singles-builder channel
-- This copies all product availability and pricing from the webstore channel
-- to the new singles-builder channel.
--
-- Usage:
--   docker compose exec db psql -U saleor -d saleor -f /scripts/sync-singles-builder-listings.sql
--
-- Note: Run this after create-singles-builder-channel.py

-- Get channel IDs
DO $$
DECLARE
    webstore_id INT;
    singles_builder_id INT;
    product_count INT;
    variant_count INT;
BEGIN
    -- Get webstore channel ID
    SELECT id INTO webstore_id FROM channel_channel WHERE slug = 'webstore';
    IF webstore_id IS NULL THEN
        RAISE EXCEPTION 'Webstore channel not found!';
    END IF;

    -- Get singles-builder channel ID
    SELECT id INTO singles_builder_id FROM channel_channel WHERE slug = 'singles-builder';
    IF singles_builder_id IS NULL THEN
        RAISE EXCEPTION 'Singles-builder channel not found! Run create-singles-builder-channel.py first.';
    END IF;

    RAISE NOTICE 'Webstore channel ID: %', webstore_id;
    RAISE NOTICE 'Singles-builder channel ID: %', singles_builder_id;

    -- Copy product channel listings
    INSERT INTO product_productchannellisting (
        product_id,
        channel_id,
        published_at,
        is_published,
        visible_in_listings,
        available_for_purchase_at,
        currency,
        discounted_price_amount
    )
    SELECT
        pcl.product_id,
        singles_builder_id,
        pcl.published_at,
        pcl.is_published,
        pcl.visible_in_listings,
        pcl.available_for_purchase_at,
        pcl.currency,
        pcl.discounted_price_amount
    FROM product_productchannellisting pcl
    WHERE pcl.channel_id = webstore_id
    AND NOT EXISTS (
        SELECT 1 FROM product_productchannellisting existing
        WHERE existing.product_id = pcl.product_id
        AND existing.channel_id = singles_builder_id
    );

    GET DIAGNOSTICS product_count = ROW_COUNT;
    RAISE NOTICE 'Copied % product channel listings', product_count;

    -- Copy variant channel listings (pricing)
    INSERT INTO product_productvariantchannellisting (
        variant_id,
        channel_id,
        price_amount,
        discounted_price_amount,
        currency,
        cost_price_amount
    )
    SELECT
        pvcl.variant_id,
        singles_builder_id,
        pvcl.price_amount,
        pvcl.discounted_price_amount,
        pvcl.currency,
        pvcl.cost_price_amount
    FROM product_productvariantchannellisting pvcl
    WHERE pvcl.channel_id = webstore_id
    AND NOT EXISTS (
        SELECT 1 FROM product_productvariantchannellisting existing
        WHERE existing.variant_id = pvcl.variant_id
        AND existing.channel_id = singles_builder_id
    );

    GET DIAGNOSTICS variant_count = ROW_COUNT;
    RAISE NOTICE 'Copied % variant channel listings (pricing)', variant_count;

    RAISE NOTICE '---------------------------------------------';
    RAISE NOTICE 'Sync complete!';
    RAISE NOTICE 'Products enabled: %', product_count;
    RAISE NOTICE 'Variants with pricing: %', variant_count;

END $$;

-- Verify the sync
SELECT
    c.slug as channel,
    COUNT(DISTINCT pcl.product_id) as products,
    COUNT(DISTINCT pvcl.variant_id) as variants
FROM channel_channel c
LEFT JOIN product_productchannellisting pcl ON pcl.channel_id = c.id
LEFT JOIN product_productvariantchannellisting pvcl ON pvcl.channel_id = c.id
WHERE c.slug IN ('webstore', 'singles-builder')
GROUP BY c.slug;
