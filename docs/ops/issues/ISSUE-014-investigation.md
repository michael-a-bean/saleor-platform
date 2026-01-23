# ISSUE-014 Investigation: Deprecated GraphQL Usages

**Investigation Date:** 2026-01-23
**Unique Deprecations:** 66 field/mutation definitions
**Migration Target:** Saleor 4.0

## Executive Summary

The 909 figure refers to field definitions across types, not unique deprecations. Found:
- **52 Saleor 4.0 deprecations** - Fields being removed in 4.0
- **14 Saleor 3.14 deprecations** - Transaction API replacements

## Deprecation Categories

### 1. Channel Arguments (8+ deprecations)
**Pattern:** Fields specifying channel as input moved to root-level query arguments
**Effort:** Medium - Update query structure

### 2. Publication/Visibility (4 deprecations)
**Pattern:** Replace `isPublished` boolean with `publishedAt` datetime
**Effort:** Low-Medium - Data migration needed

### 3. Tax Configuration (5+ deprecations)
**Pattern:** Move from product-level to centralized tax classes
**Effort:** HIGH - Requires tax system refactoring

### 4. Attribute Fields (2 deprecations) - ACTIVE IN STOREFRONT
```graphql
# ProductDetails.graphql - CURRENTLY USED
attributes { values { richText, plainText } }  # DEPRECATED
```
**Action Required:** Must find alternative before 4.0

### 5. Gift Card Fields (2 deprecations)
**Pattern:** `code` auto-generated, `expiryDate` moved to `expirySettings`
**Effort:** Low - Straightforward rename

### 6. Webhook Configuration (2+ deprecations)
**Pattern:** `events` to `asyncEvents`/`syncEvents`
**Effort:** Medium

### 7. Transaction Events (8+ deprecations)
**Pattern:** Preview feature being replaced
**Effort:** HIGH - Full webhook rewrite

## Quick Wins (< 4 hours)

- Gift card expiration structure change
- Webhook event type conversion
- Simple field renames

## Medium Effort (1-2 days each)

- Channel argument elevation
- Publication system migration
- Webhook event system refactoring

## Hard Changes (5+ days)

- Tax system centralization
- Transaction event restructuring
- Attribute value representation

## Migration Checklist

### Phase 1: Inventory (Now)
- [ ] Document currently-used deprecated fields
- [ ] Identify which are imported via codegen
- [ ] Test with Saleor 4.0 preview if available

### Phase 2: Quick Wins (Can Start Now)
- [ ] Update gift card input structures
- [ ] Prepare webhook event migration scripts

### Phase 3: Medium Effort (Next Sprint)
- [ ] Refactor publication system
- [ ] Plan channel argument elevation
- [ ] Create tax class migration path

### Phase 4: Coordinate with Release
- [ ] Monitor Saleor 4.0 docs for attribute representation
- [ ] Plan transaction event subscription refactoring

## Key Finding

**Active usage:** `richText` and `plainText` in ProductDetails.graphql must be replaced before Saleor 4.0 upgrade.
