# Buylist Pricing Rules

## Overview

The buylist app has a pricing rule engine that allows dynamic pricing adjustments based on product attributes, market conditions, inventory levels, and time-based promotions.

## Status

- **Phase 1**: ✅ Complete (Core rule engine)
- **Phases 2-5**: ⏳ Pending (see plan file)

**Full plan**: `~/.claude/plans/temporal-percolating-ullman.md`

## Architecture

```
BuylistPricingPolicy (base policy)
    │
    └── PricingRule[] (ordered by priority)
            │
            ├── conditions: AND/OR tree
            ├── actionType: PERCENTAGE_MODIFIER | FIXED_MODIFIER | SET_*
            ├── stackingMode: MULTIPLICATIVE | ADDITIVE
            └── startsAt/endsAt: time activation
```

## Key Files

```
saleor-apps/apps/buylist/
├── prisma/schema.prisma                    # PricingRule, ProductAttributeCache models
└── src/modules/pricing/
    ├── rule-engine/
    │   ├── types.ts                        # TypeScript types
    │   ├── condition-evaluator.ts          # Evaluates conditions
    │   ├── rule-matcher.ts                 # Finds matching rules
    │   ├── rule-stacker.ts                 # Applies modifiers
    │   └── rule-engine.ts                  # Main orchestrator
    ├── rules-router.ts                     # tRPC CRUD endpoints
    └── pricing-router.ts                   # Updated calculatePrice
```

## API Endpoints

### Rule Management (`pricing.rules.*`)

```typescript
// CRUD
pricing.rules.list({ policyId, isActive?, search? })
pricing.rules.getById({ id })
pricing.rules.create({ policyId, name, conditions, actionType, actionValue, stackingMode, ... })
pricing.rules.update({ id, ... })
pricing.rules.delete({ id })
pricing.rules.reorder({ policyId, ruleIds[] })
pricing.rules.toggleActive({ id, isActive })
pricing.rules.duplicate({ id, newName? })

// Utilities
pricing.rules.validate({ conditions })
pricing.rules.preview({ policyId, marketPrice, condition, attributes?, qtyOnHand? })
```

### Price Calculation

```typescript
pricing.calculatePrice({
  policyId?,
  marketPrice,
  condition,           // NM, LP, MP, HP, DMG
  variantId?,
  attributes?: {
    setCode?,          // "MH3", "LTR"
    rarity?,           // "mythic", "rare"
    finish?,           // "foil", "nonfoil"
    cardType?,
    formatLegality?,
  },
  qtyOnHand?,
}) → {
  policyId,
  policyName,
  baseOffer,
  conditionMultiplier,
  appliedRules: [{
    ruleId,
    ruleName,
    modifier,
    stackingMode,
    offerBefore,
    offerAfter,
  }],
  finalOffer,
  constraintsApplied,
}
```

## Condition Types

| Type | Fields | Operators |
|------|--------|-----------|
| `ATTRIBUTE` | setCode, rarity, finish, cardType, formatLegality.* | EQUALS, IN, CONTAINS |
| `MARKET_PRICE` | marketPrice | EQUALS, GREATER_THAN, LESS_THAN, BETWEEN |
| `INVENTORY` | qtyOnHand | EQUALS, GREATER_THAN, LESS_THAN |
| `DATE` | date, month, dayOfWeek, hour | EQUALS, IN, BETWEEN |
| `CATEGORY` | categoryId, categorySlug | EQUALS, IN |

## Example Rules

### MH3 Bonus (+10%)
```json
{
  "name": "Modern Horizons 3 Bonus",
  "conditions": {
    "operator": "AND",
    "conditions": [
      { "type": "ATTRIBUTE", "field": "setCode", "operator": "EQUALS", "value": "MH3" }
    ]
  },
  "actionType": "PERCENTAGE_MODIFIER",
  "actionValue": 10,
  "stackingMode": "MULTIPLICATIVE"
}
```

### Mythic Premium (set = MH3 OR LTR) AND rarity = mythic AND price > $20
```json
{
  "name": "Mythic Premium",
  "conditions": {
    "operator": "AND",
    "conditions": [
      {
        "operator": "OR",
        "conditions": [
          { "type": "ATTRIBUTE", "field": "setCode", "operator": "EQUALS", "value": "MH3" },
          { "type": "ATTRIBUTE", "field": "setCode", "operator": "EQUALS", "value": "LTR" }
        ]
      },
      { "type": "ATTRIBUTE", "field": "rarity", "operator": "EQUALS", "value": "mythic" },
      { "type": "MARKET_PRICE", "field": "marketPrice", "operator": "GREATER_THAN", "value": 20 }
    ]
  },
  "actionType": "PERCENTAGE_MODIFIER",
  "actionValue": 5,
  "stackingMode": "MULTIPLICATIVE"
}
```

### Summer Promo (June-August)
```json
{
  "name": "Summer Promo",
  "conditions": {
    "operator": "AND",
    "conditions": [
      { "type": "DATE", "field": "month", "operator": "IN", "value": [6, 7, 8] }
    ]
  },
  "actionType": "PERCENTAGE_MODIFIER",
  "actionValue": 3,
  "stackingMode": "ADDITIVE",
  "startsAt": "2024-06-01T00:00:00Z",
  "endsAt": "2024-08-31T23:59:59Z"
}
```

## Testing

```bash
cd saleor-apps/apps/buylist

# Type check
pnpm exec tsc --noEmit

# Run rule engine tests (48 tests)
pnpm exec vitest run --project unit src/modules/pricing/rule-engine/
```

## Database Migration

After schema changes, run:
```bash
DATABASE_URL="postgresql://inventory:inventory@localhost:5433/inventory_ops" \
  pnpm exec prisma migrate dev --name add_pricing_rules
```

## Remaining Work

See `~/.claude/plans/temporal-percolating-ullman.md` for:
- Phase 2: Attribute caching service
- Phase 3: Inventory conditions
- Phase 4: Time-based conditions
- Phase 5: UI (rules list, condition builder)
