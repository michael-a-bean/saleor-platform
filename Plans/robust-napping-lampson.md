# BOH Buylist Reconditioning Feature

## Context

When BOH staff verify a buylist, they may discover that a card's actual condition differs from what FOH recorded. Currently, the system allows changing a line's condition (all units), but **cannot split a line** — e.g., moving 1 of 3 NM units to LP while keeping 2 as NM.

This is critical for accurate inventory and costing: stock must go to the correct condition-specific variant in Saleor, and mis-conditionings must be trackable per employee for quality control.

**Example scenario:** Buylist has 3 NM + 1 LP for "Lightning Bolt". After BOH inspection, it's actually 2 NM + 2 LP. BOH needs to move 1 unit from the NM line to the LP line (which already exists).

## Approach

### No Schema Migration Required

Use the existing `BuylistAuditEvent` model (append-only, has `userId`, `metadata` JSON, `buylistId`) with action `"RECONDITIONED"`. The metadata will contain structured reconditioning details, queryable via PostgreSQL JSON operators for employee mis-conditioning reports. No new Prisma model needed.

### New tRPC Endpoint: `boh.reconditionLine`

**File:** `saleor-apps/apps/buylist/src/modules/boh/boh-router.ts`

**Input schema:**
```typescript
{
  buylistId: string (uuid),
  sourceLineId: string (uuid),
  targetCondition: "NM" | "LP" | "MP" | "HP" | "DMG",
  qty: number (int, min 1)
}
```

**Logic (inside Prisma `$transaction`):**
1. Fetch buylist with lines; validate `status === "PENDING_VERIFICATION"`
2. Find source line; validate `qty <= sourceLine.qty`
3. Validate `targetCondition !== sourceLine.condition` (no-op guard)
4. **Find existing target line:** Match by `buylistId + same card identity + targetCondition + same finalPrice`
   - Card identity matching: parse source SKU (`{prefix}-{condition}-{finish}`), derive target SKU (`{prefix}-{targetCondition}-{finish}`), look for line with that SKU in the same buylist
   - Fallback: if no SKU, match by `saleorVariantName` (less precise but handles edge cases)
   - **Price-aware merge rule:** Only merge if the existing target line has the SAME `finalPrice` as the source line. This preserves exact cost basis per unit.
5. **If target line exists WITH same price:** increment `qty` by moved amount
6. **If no target line, OR existing target has different price:** create new `BuylistLine` with:
   - Same `saleorVariantId`, same pricing (`finalPrice`, `quotedPrice`, `marketPrice`) **copied from the SOURCE line** (not recalculated — we paid NM price, LP unit carries NM cost)
   - New `saleorVariantSku` derived from base+targetCondition+finish
   - `condition = targetCondition`
   - `qty = moved amount`
   - Next `lineNumber`

   **Why:** If the buylist has 3 NM @ $5.00 and 1 LP @ $4.00, reconditioning 1 NM→LP creates a SECOND LP line at $5.00 (not merged into the $4.00 LP line). This ensures:
   - Original LP: 1 @ $4.00 (customer brought in LP card, paid LP price)
   - Reconditioned LP: 1 @ $5.00 (customer said NM, was actually LP, paid NM price)
   - Total still $19.00 — no money lost or created
   - Cost layer events correctly reflect what was actually paid per unit
7. **Decrement source line qty.** If qty reaches 0, delete the source line.
8. **Create `BuylistAuditEvent`** with:
   - `action: "RECONDITIONED"`
   - `userId: getUserId(ctx)` (the employee)
   - `metadata: { sourceLineId, targetLineId, qty, fromCondition, toCondition, sourceLineOriginalQty, sourceSku }`
9. Return updated buylist lines + the audit event

**Key invariant:** Total qty across all lines unchanged after reconditioning. Enforced by transaction atomicity.

### Existing Endpoint: No Changes to `verifyAndReceive`

The existing `verifyAndReceive` already iterates all buylist lines and processes each one independently — looking up condition-specific variants by SKU + condition. Newly created reconditioned lines will be processed correctly because they have proper `saleorVariantSku` and `condition` fields. The condition-change logic in verifyAndReceive (lines 170-222) already handles this.

**One change needed:** Remove the per-line `condition` override from `verifyLineSchema` since reconditioning is now handled separately. This prevents the old "change condition on all units" behavior which is what we're replacing. OR keep it for backward compatibility but document that `reconditionLine` is the preferred path.

Decision: **Keep the existing condition field** in verifyAndReceive for simple cases (all units same condition change), but add the reconditioning endpoint for partial moves. Both can coexist.

### UI Changes: `verify.tsx`

**File:** `saleor-apps/apps/buylist/src/pages/boh/buylists/[id]/verify.tsx`

1. **Per-line "Recondition" button** — opens an inline form:
   - Qty to move (number input, max = line qty)
   - Target condition (dropdown, excluding current condition)
   - "Move" button to execute
2. **Reconditioning history section** — shows audit events with action "RECONDITIONED" for this buylist
   - Format: "Employee X moved 1 unit from NM to LP at HH:MM"
3. **Lines list updates dynamically** after reconditioning (refetch buylist data)
4. **Visual indicator** on lines created via reconditioning (e.g., small tag "reconditioned from NM")

### Accounting Layer Interaction (inventory-ops)

**No changes needed to accounting code.** The reconditioning feature operates at the BuylistLine level only. The downstream accounting pipeline processes reconditioned lines identically to original lines:

1. **`verifyAndReceive`** iterates ALL buylist lines (including reconditioned ones). For each:
   - Resolves condition-specific Saleor variant via `getConditionVariantId(line.saleorVariantSku, line.condition)`
   - Creates stock adjustment on the correct condition variant
   - Creates `CostLayerEvent` with `unitCost = line.finalPrice` and `sourceBuylistLineId = line.id`

2. **WAC impact**: A reconditioned LP line at $5.00 (NM price) creates a cost event on the LP variant with unitCost=$5.00. This correctly raises the LP variant's WAC — we actually paid $5.00 for this unit. The WAC formula (`computeWacForNewEventOptimized`) handles this naturally since it's just another receipt event.

3. **Void flow**: The void in `buylists-router.ts` finds cost events via `sourceBuylistLineId`. Reconditioned lines have their own IDs, so their cost events are found and reversed correctly.

4. **Key guarantee**: `sum(line.finalPrice × line.qty)` across all lines equals `buylist.totalFinalAmount` before and after reconditioning. No money is created or destroyed — only the condition attribution changes.

## Files to Modify

| File | Change |
|------|--------|
| `saleor-apps/apps/buylist/src/modules/boh/boh-router.ts` | Add `reconditionLine` endpoint |
| `saleor-apps/apps/buylist/src/pages/boh/buylists/[id]/verify.tsx` | Add reconditioning UI |
| `saleor-apps/apps/buylist/src/modules/trpc/trpc-router.ts` | Verify boh router is already wired (likely already is) |

## Reused Existing Code

- `getUserId(ctx)` — already in boh-router.ts for employee identification
- `conditionEnum` zod validator — already defined
- `BuylistAuditEvent` Prisma model — already exists, append-only
- SKU parsing pattern from `getConditionVariantId()` in `saleor-client.ts` (line 543-553)
- `protectedClientProcedure` for auth
- tRPC mutation pattern matching existing endpoints

## Verification

1. **Type check:** `cd saleor-apps && pnpm --filter buylist exec tsc --noEmit`
2. **Read verification:** Inspect boh-router.ts for:
   - Transaction wrapping
   - Qty validation (source >= moved amount)
   - Status guard (PENDING_VERIFICATION only)
   - Audit event creation with employee ID
   - Price preservation (no price field changes)
   - Merge-or-create logic for target line
3. **Read verification:** Inspect verify.tsx for reconditioning UI controls
4. **Scenario test (manual):**
   - 3 NM@$5 + 1 LP@$4 → recondition 1 NM to LP → result: 2 NM@$5 + 1 LP@$4 + 1 LP@$5 (separate lines, different cost basis)
   - 3 NM@$5 → recondition 1 to LP → result: 2 NM@$5 + 1 LP@$5 (new line, carries NM cost)
   - 2 NM@$5 + 1 LP@$5 → recondition 1 more NM to LP → result: 1 NM@$5 + 2 LP@$5 (merged, same price)
   - 3 NM@$5 → recondition 3 to LP → result: 3 LP@$5 (NM line deleted, cost preserved)
