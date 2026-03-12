# Plan: Inventory Ops PO Usability Improvements

## Context

The PO editing interface has three usability issues:
1. **No inline supplier creation** — creating a supplier navigates away from the PO form, losing all entered data
2. **Wasted horizontal space** — `Layout.AppSection` splits the content area 50/50 with a side description panel, making the edit form and line items table unnecessarily narrow
3. **Non-editable line items** — after adding a line, qty and cost can only be changed by deleting and re-adding the line. The backend `updateLine` mutation already exists but the UI doesn't use it

Reference: Lightspeed Retail Series X uses full-width tables with inline editable qty/cost cells and save-on-blur.

## Changes

### 1. Create `SupplierCreateModal` component
**File:** `saleor-apps/apps/inventory-ops/src/ui/components/supplier-create-modal.tsx` (NEW)

- Modal using Macaw UI `<Modal>` (same pattern as `confirm-modal.tsx`)
- Contains compact supplier form: code, name, contact name, email, phone (no address/notes — keep it minimal for quick inline creation)
- Props: `open`, `onClose`, `onCreated(supplier: {id, code, name})`
- Uses `trpcClient.suppliers.create.useMutation` internally
- On success: calls `onCreated` with the new supplier, then closes

### 2. Update PO creation page — inline supplier creation
**File:** `saleor-apps/apps/inventory-ops/src/pages/purchase-orders/new.tsx` (EDIT)

- Add "New Supplier" button next to the supplier dropdown (always visible, not just when empty)
- Replace `router.push("/suppliers/new")` with modal open
- On modal `onCreated`: invalidate suppliers.list, auto-select the new supplier ID
- Form state is preserved since we never navigate away

### 3. Update PO edit page — full width + inline editing
**File:** `saleor-apps/apps/inventory-ops/src/pages/purchase-orders/[id]/edit.tsx` (EDIT)

**Layout changes:**
- Replace `Layout.AppSection` / `Layout.AppSectionCard` wrappers with plain `Box` containers
- Use full width for both the order details section and line items table
- Keep the header section and form fields but remove the descriptive side panels

**Inline editing changes:**
- Add local state map for line edits: `editingLines: Record<lineId, {qty: string, cost: string}>`
- Qty and Unit Cost cells become `<Input type="number">` when PO is DRAFT
- On blur: compare with original value, if changed → call `purchaseOrders.updateLine` mutation
- Show brief green checkmark or "Saved" indicator on successful save
- Line total = locally computed from edited values (live update before save)
- PO total = sum of all line totals using local edited values
- Add "New Supplier" button + modal here too (for editing supplier on draft PO)

### 4. Existing code to reuse
- `purchaseOrders.updateLine` mutation — already exists at `purchase-orders-router.ts:350`, accepts partial `poLineSchema`
- `trpcClient.suppliers.create` — already exists in suppliers router
- `<Modal>` from `@saleor/macaw-ui` — used by `confirm-modal.tsx`
- `formatCurrency` — already defined in `edit.tsx`

## Files Modified

| File | Action | What Changes |
|------|--------|-------------|
| `src/ui/components/supplier-create-modal.tsx` | CREATE | New modal component for inline supplier creation |
| `src/pages/purchase-orders/new.tsx` | EDIT | Add supplier modal trigger, remove router.push to suppliers/new |
| `src/pages/purchase-orders/[id]/edit.tsx` | EDIT | Full-width layout, inline qty/cost editing, supplier modal |

## Verification

1. **Type check:** `cd saleor-apps && pnpm --filter inventory-ops exec tsc --noEmit`
2. **Visual:** Read modified files to confirm no `sideContent`, confirm `<Input>` in table cells, confirm modal usage
3. **Logic:** Verify `onBlur` handlers call `updateLine`, verify `onCreated` sets supplier ID and invalidates list
