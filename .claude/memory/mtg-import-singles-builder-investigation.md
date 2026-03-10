# MTG Import: Singles Builder Channel Investigation (Feb 24, 2026)

## Status: RESOLVED

## Root Cause

**The `singles-builder` channel was inactive (`is_active = False`).** Saleor's public/storefront API excludes inactive channels entirely, returning 0 products regardless of how many channel listings exist in the database.

The import itself worked perfectly — all channel listings were created successfully.

## Evidence (from staging DB queries via ECS exec)

### Channel State
| Channel | `is_active` | Currency |
|---------|-------------|----------|
| `default-channel` | `True` | USD |
| `singles-builder` | **`False`** | USD |
| `webstore` | `True` | USD |

### Listing Counts
| Channel | Product Listings | Variant Listings |
|---------|-----------------|-----------------|
| `default-channel` | 0 | 0 |
| `singles-builder` | 99,339 | 708,369 |
| `webstore` | 99,339 | 708,371 |

Data is fully present on both channels. The 2-variant difference between webstore and singles-builder is negligible (likely an edge case in old imports).

## Fix

Activate the channel via one of:
1. **Dashboard** → Configuration → Channels → Singles Builder → toggle Active
2. **GraphQL**: `channelUpdate(id: "...", input: { isActive: true })`
3. **DB** (not recommended): `UPDATE channel_channel SET is_active = true WHERE slug = 'singles-builder'`

## Secondary Issue: Duplicate Products (STILL OPEN)

Old Python import used mixed-case slugs (`abrupt-decay-plst-GK1-57`), new mtg-import lowercases all slugs (`abrupt-decay-plst-gk1-57`). Saleor treats these as different products. This needs a cleanup pass — either deduplicate the old products or normalize slugs.

## Lessons Learned

- Saleor's public API returns 0 products for inactive channels with NO error — indistinguishable from "no listings" or "channel doesn't exist"
- The `MANAGE_CHANNELS` permission gap (hypothesis #2) was NOT the issue
- `productBulkCreate` did NOT silently fail (hypothesis #3) — listings were all created
- Always check `is_active` on channels first when debugging visibility issues
