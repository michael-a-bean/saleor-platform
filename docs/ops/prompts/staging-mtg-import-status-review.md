# Staging MTG Import Status Review

**Purpose:** Examine the current status of the MTG singles initial import into staging, diagnose recurring issues, and evaluate whether the process needs restructuring.

---

## Context

We've been attempting to complete an initial import of ~106,872 Magic: The Gathering singles into the staging environment. Multiple issues have blocked progress:

1. **Token refresh interruptions** - Manual acceptance required every ~5 minutes, breaking long-running imports
2. **Variant/attribute creation failures** - Variants and attributes not being created properly
3. **Process reliability** - Imports fail mid-way, requiring investigation and restart

A council meeting was held on 2026-01-18 that produced recommendations (see `.claude/plans/mtg-inventory-council-implementation.md`). Phase 5 created a new GraphQL-based import script (`scripts/mtg_scryfall_import/import_graphql.py`), but it may not be fully tested against staging.

---

## Critical Requirements

### 1. No Digital Products
Only **paper cards** should be imported. Digital-only cards (Arena rebalanced, etc.) must be excluded.

**Verification needed:**
- Confirm filter `not c.get("digital", False)` is active in import script
- Verify no products with `digital: true` exist in staging after import

### 2. Fully Unattended Operation
The import process **MUST run without human input**. Current blockers:
- Token refresh prompts requiring manual acceptance
- Interactive confirmations
- Any stdin requirements

**Requirements:**
- Service account or non-expiring app token
- No interactive prompts (use `--yes` flags or equivalent)
- Graceful error handling with automatic retry
- Checkpoint/resume capability for long-running imports
- Logging to file (not just stdout)

### 3. Council Attribute Findings (Must Address)
The 2026-01-18 council analysis identified **missing attributes** that should be imported from Scryfall:

| Attribute | Scryfall Field | Priority | Rationale |
|-----------|---------------|----------|-----------|
| `legalities` | `legalities` | Medium | Format filtering (Modern, Commander, Standard) |
| `edhrec_rank` | `edhrec_rank` | Medium | Commander demand ranking (50%+ of market) |
| `color_identity` | `color_identity` | High | Commander deckbuilding filter |
| `mana_value` | `cmc` | High | "Show me all 3-drops" |
| `keywords` | `keywords` | Medium | Flying, Trample, etc. filtering |
| `conditions_available` | (derived) | High | Stock availability filter |
| `finishes_available` | `finishes` | High | Foil/nonfoil availability |

**Council consensus:** `conditions_available` and `finishes_available` are higher priority than `legalities` for search filtering.

---

## Investigation Tasks

### 1. Current State Assessment

**Check staging environment health:**
```bash
# Health endpoints
curl -s https://staging.hobbyshop.gg/health/ | jq .
curl -s https://staging.hobbyshop.gg/api/health | jq .

# GraphQL operational check
curl -s -X POST https://staging.hobbyshop.gg/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' | jq .
```

**Check current product/variant counts in staging:**
```graphql
query {
  products(first: 1, filter: {productTypes: ["mtg-card"]}) {
    totalCount
  }
  productVariants(first: 1) {
    totalCount
  }
}
```

**Check Meilisearch index status:**
```bash
# Use MCP tool: mcp__saleor-mcp__get_index_stats with channel="webstore"
# Or direct: curl http://localhost:7700/indexes/webstore-products/stats
```

### 2. Token Refresh Issue Analysis

**Files to examine:**
- `scripts/mtg_scryfall_import/import_graphql.py` - Lines 200-225, `SaleorClient` class
- `scryfall-sync.log` - Token refresh pattern and failure point
- `scripts/bulk-sync-scryfall.py` - Previous sync script that failed

**Questions to answer:**
1. How is authentication currently handled?
2. Does the SaleorClient support token refresh during long operations?
3. What token type is being used (app token vs user token)?
4. What is the token expiration period configured in staging?
5. Is there a way to use non-expiring service account tokens?

**Check Saleor auth configuration:**
```bash
# Check if ACCESS_TOKEN_EXPIRE_SECONDS is configured
docker exec saleor-api-1 env | grep -i token
docker exec saleor-api-1 env | grep -i expire
```

### 3. Variant/Attribute Creation Analysis

**Files to examine:**
- `scripts/mtg_scryfall_import/import_graphql.py` - `transform_card_to_variants()` function (lines 384+)
- `scripts/mtg_scryfall_import/import_command.py` - Legacy ORM approach for comparison

**Questions to answer:**
1. Are variant-level attributes (condition, finish) being set on variants?
2. Is the attribute mapping complete (product vs variant attributes)?
3. What does the GraphQL mutation `ProductVariantBulkCreate` expect for attributes?
4. Are channel listings with prices being created for each variant?
5. Is `discounted_price_amount` being set (critical - see `.claude/rules/database.md`)?

**Council-identified attribute gaps to verify:**
```python
# These Scryfall fields should map to Saleor attributes:
field_mapping = [
    # Existing (verify present)
    ("id", "mtg-scryfall-id"),
    ("cmc", "mtg-mana-value"),  # Council: HIGH priority

    # Missing per council (need to add)
    ("color_identity", "mtg-color-identity"),  # Council: HIGH priority
    ("keywords", "mtg-keywords"),              # Council: MEDIUM priority
    ("legalities", "mtg-legalities"),          # Council: MEDIUM priority
    ("edhrec_rank", "mtg-edhrec-rank"),        # Council: MEDIUM priority
]
```

**Meilisearch index requirements (council recommendation #3):**
```
Filterable: conditions_available, finishes_available, mana_value, color_identity
Searchable: keywords (preprocessed)
Relevance boost: name > oracle_text > set_name
```

**Validation query - check a recently imported product:**
```graphql
query CheckVariants($externalRef: String!) {
  product(externalReference: $externalRef) {
    id
    name
    variants {
      id
      sku
      name
      attributes {
        attribute {
          slug
        }
        values {
          name
        }
      }
      channelListings {
        channel {
          slug
        }
        price {
          amount
          currency
        }
        costPrice {
          amount
        }
      }
    }
  }
}
```

### 4. Council Implementation Review

**Files to review:**
- `.claude/plans/mtg-inventory-council-implementation.md` - Full implementation plan
- `docs/analysis/2026-01-18-mtg-inventory-generation-council-analysis.md` - Original analysis

**Questions to answer:**
1. Were all 5 phases truly completed and tested?
2. Has `import_graphql.py` been tested against staging (not just dry-run)?
3. Are the delta sync and reconciliation scripts operational?
4. Is the two-tier multiplier feature flag enabled in staging?

### 5. Digital Product Filtering Verification

**Verify digital cards are excluded:**

```bash
# Check import script filtering
grep -n "digital" scripts/mtg_scryfall_import/import_graphql.py

# After import, verify no digital products in staging
```

```graphql
# Query for any digital products (should return 0)
query CheckDigitalProducts {
  products(first: 10, filter: {
    attributes: [{slug: "mtg-is-digital", values: ["true"]}]
  }) {
    totalCount
    edges {
      node {
        name
        externalReference
      }
    }
  }
}
```

**Scryfall digital field:** Cards with `"digital": true` are Arena-only rebalanced cards (Alchemy) and should never be imported.

### 6. Process Evaluation

**Determine if the import process needs restructuring:**

| Current Approach | Potential Issue |
|-----------------|-----------------|
| Single long-running script | Token expiration, no resume, connection drops |
| 50-card batches | May need smaller batches for staging stability |
| Checkpoint file in /tmp | Lost on container restart |
| GraphQL mutations | Rate limiting? Webhook backpressure? |
| **Manual token refresh** | **BLOCKER: Requires human every 5 minutes** |

**Requirements for unattended operation:**

| Requirement | Current State | Needed |
|-------------|---------------|--------|
| Non-expiring token | ❓ Unknown | App token or service account |
| No interactive prompts | ❓ Unknown | `--yes` / `--non-interactive` flags |
| Automatic retry | ❓ Unknown | Exponential backoff on failures |
| Checkpoint persistence | `/tmp/` (volatile) | Persistent volume or S3 |
| Structured logging | stdout | JSON logs to CloudWatch |
| Health reporting | None | Heartbeat to monitoring |

**Alternative approaches to consider:**
1. **Saleor App Token** - Create a Saleor App with non-expiring token for automation
2. **Queue-based import** - Push cards to SQS, process in smaller Lambda/ECS jobs
3. **Chunked imports** - Split JSON into set-based chunks (~300 sets), import separately
4. **Container-based import** - Run inside Saleor container to avoid network auth
5. **ECS Fargate task** - Dedicated import task with IAM role, secrets from Parameter Store
6. **Step Functions** - Orchestrate chunked imports with automatic retry and checkpointing

---

## Expected Deliverables

After investigation, provide:

1. **Current State Report**
   - Products/variants currently in staging
   - Meilisearch index status
   - Any digital products present (should be 0)
   - Missing attributes per council findings

2. **Root Cause Analysis**
   - Token refresh: Why is manual acceptance required every 5 minutes?
   - Variant creation: What's failing and why?
   - Attribute gaps: Which council-recommended attributes are missing?
   - Digital filtering: Is it working correctly?

3. **Unattended Operation Plan**
   - How to eliminate all human interaction requirements
   - Token strategy (app token, service account, etc.)
   - Error handling and retry logic
   - Checkpoint persistence approach

4. **Recommendation**
   - Fix current approach, or
   - Design a new import architecture
   - Include council attribute recommendations

5. **Action Plan**
   - Step-by-step to complete the initial import
   - Verification steps for each critical requirement:
     - [ ] No digital products imported
     - [ ] All council-recommended attributes present
     - [ ] Variants created with proper attributes (condition, finish)
     - [ ] Process runs fully unattended
     - [ ] Checkpoint/resume works across restarts

---

## Reference Files

| File | Purpose |
|------|---------|
| `scripts/mtg_scryfall_import/import_graphql.py` | New GraphQL-based import (Phase 5) |
| `scripts/mtg_scryfall_import/import_command.py` | Legacy Django ORM import |
| `scripts/mtg_scryfall_import/run_import.sh` | Shell runner for ORM import |
| `.claude/plans/mtg-inventory-council-implementation.md` | Council implementation plan |
| `docs/analysis/2026-01-18-mtg-inventory-generation-council-analysis.md` | **Council analysis with attribute recommendations** |
| `docs/reference/sync-contracts.md` | Data flow documentation |
| `scryfall-sync.log` | Previous sync failure log (shows token refresh pattern) |
| `.claude/rules/database.md` | Critical pricing gotcha (`discounted_price_amount`) |

### Key Council Findings to Reference

From `docs/analysis/2026-01-18-mtg-inventory-generation-council-analysis.md`:

**Recommendation #2 - Migrate to Bulk Mutations:**
> Replace direct ORM with `productVariantBulkCreate` (250/call). Ensures webhook emission for downstream sync. Prevents validation bypass (fixes `discounted_price_amount` NULL issues).

**Recommendation #3 - Meilisearch Schema:**
> Add filterable: `conditions_available`, `finishes_available`, `mana_value`, `color_identity`
> Add searchable: `keywords` (preprocessed)
> Add relevance boost: `name` > `oracle_text` > `set_name`

**Data Source Optimization:**
> Scryfall: Add `legalities`, `keywords`, `edhrec_rank` to import

**Gap Analysis - High Priority:**
> - Delta sync for Meilisearch (full reindex on every price update)
> - `conditions_available` filter (users can't filter by in-stock conditions)
> - Reconciliation mechanism (silent data drift between systems)

---

## Notes

- **Do not run destructive operations** without explicit approval
- **Staging environment** must remain operational for testing
- **Prefer investigation over action** until root causes are understood
- If council recommendations need revision, document what changed and why
