-- Delete all digital-only MTG cards from Saleor
-- Run with: docker compose exec -T db psql -U saleor saleor < scripts/delete-digital-cards.sql

BEGIN;

-- Count digital products before deletion
SELECT 'Digital products to delete:' AS status, COUNT(DISTINCT p.id) AS count
FROM product_product p
JOIN attribute_assignedproductattributevalue apav ON apav.product_id = p.id
JOIN attribute_attributevalue av ON av.id = apav.value_id
JOIN attribute_attribute a ON a.id = av.attribute_id
WHERE a.slug = 'mtg-is-digital' AND av.boolean = true;

-- Create temp table of product IDs to delete (for performance)
CREATE TEMP TABLE digital_products AS
SELECT DISTINCT p.id
FROM product_product p
JOIN attribute_assignedproductattributevalue apav ON apav.product_id = p.id
JOIN attribute_attributevalue av ON av.id = apav.value_id
JOIN attribute_attribute a ON a.id = av.attribute_id
WHERE a.slug = 'mtg-is-digital' AND av.boolean = true;

-- Create temp table of variant IDs
CREATE TEMP TABLE digital_variants AS
SELECT pv.id FROM product_productvariant pv
WHERE pv.product_id IN (SELECT id FROM digital_products);

-- Delete in order to handle foreign key constraints:

-- 1. Delete variant attribute values FIRST (references assignments)
DELETE FROM attribute_assignedvariantattributevalue
WHERE assignment_id IN (
    SELECT id FROM attribute_assignedvariantattribute
    WHERE variant_id IN (SELECT id FROM digital_variants)
);

-- 2. Now delete variant attribute assignments
DELETE FROM attribute_assignedvariantattribute
WHERE variant_id IN (SELECT id FROM digital_variants);

-- 3. Delete checkout line items for digital products
DELETE FROM checkout_checkoutline
WHERE variant_id IN (SELECT id FROM digital_variants);

-- 4. Delete variant channel listings
DELETE FROM product_productvariantchannellisting
WHERE variant_id IN (SELECT id FROM digital_variants);

-- 5. Delete warehouse allocations BEFORE stock entries (FK constraint)
DELETE FROM warehouse_allocation
WHERE stock_id IN (
    SELECT id FROM warehouse_stock
    WHERE product_variant_id IN (SELECT id FROM digital_variants)
);

-- 6. Delete stock entries
DELETE FROM warehouse_stock
WHERE product_variant_id IN (SELECT id FROM digital_variants);

-- 7. Delete product variants
DELETE FROM product_productvariant
WHERE product_id IN (SELECT id FROM digital_products);

-- 8. Delete product channel listings
DELETE FROM product_productchannellisting
WHERE product_id IN (SELECT id FROM digital_products);

-- 9. Delete product media
DELETE FROM product_productmedia
WHERE product_id IN (SELECT id FROM digital_products);

-- 10. Delete assigned product attribute values
DELETE FROM attribute_assignedproductattributevalue
WHERE product_id IN (SELECT id FROM digital_products);

-- 11. Delete collection product associations
DELETE FROM product_collectionproduct
WHERE product_id IN (SELECT id FROM digital_products);

-- 12. Delete the products themselves
DELETE FROM product_product
WHERE id IN (SELECT id FROM digital_products);

-- Clean up temp tables
DROP TABLE digital_variants;
DROP TABLE digital_products;

-- Verify deletion
SELECT 'Remaining digital products:' AS status, COUNT(*) AS count
FROM product_product p
JOIN attribute_assignedproductattributevalue apav ON apav.product_id = p.id
JOIN attribute_attributevalue av ON av.id = apav.value_id
JOIN attribute_attribute a ON a.id = av.attribute_id
WHERE a.slug = 'mtg-is-digital' AND av.boolean = true;

-- Show total product count after
SELECT 'Total products remaining:' AS status, COUNT(*) AS count FROM product_product;

COMMIT;
