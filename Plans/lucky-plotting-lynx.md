# Purchase Order Feature Expansion — Implementation Plan

## Context

A competitive analysis of 7 retail POS systems (Lightspeed X, Lightspeed R, Shopify/Stocky, Square for Retail, Clover, BinderPOS, CrystalCommerce) identified 21 feature gaps in our inventory-ops PO system. Michael confirmed: implement all except buylist-specific features (kiosk mode, card scanning, market-price rules). CSV import for PO lines was explicitly requested.

**Current baseline** (from code review):
- Full PO lifecycle: DRAFT → PENDING_APPROVAL → APPROVED → PARTIALLY/FULLY_RECEIVED → CANCELLED
- PO line management with inline editing (blur-save pattern)
- Supplier CRUD with soft delete
- Goods receipt with per-variant mutex and WAC integration
- Landed costs with BY_VALUE and BY_QUANTITY allocation
- Variant search (inline autocomplete + modal)
- Audit trail on all mutations

**What's missing** (prioritized):
1. PO-level financial summary (subtotal, discount, shipping, total)
2. CSV import for PO lines
3. Supplier payment terms & account number
4. Vendor SKU per supplier-variant pair
5. PO-level discount (% and flat) and shipping cost
6. Additional landed cost allocation methods (NONE, CUSTOM)
7. Bulk line operations (select-all, bulk delete, bulk qty edit)
8. Returns to supplier
9. Over-receive validation controls
10. PO activity feed / comments
11. Receiving progress bar on PO detail
12. PDF generation / email PO to supplier
13. Supplier default lead time
14. PO templates (save & reuse)
15. Reorder points / suggested POs

## Plan — 5 Implementation Phases

Phases are ordered by value and dependency. Each phase is a single PR.

---

### Phase 1: Schema Foundation + Financial Summary + CSV Import

**Why first**: Schema changes underpin everything else. CSV import is explicitly requested. Financial summary is the #1 gap vs competitors.

#### 1A. Prisma Schema Migration

**File**: `apps/inventory-ops/prisma/schema.prisma`

```
Supplier model — ADD fields:
  paymentTerms     String?          // e.g. "Net 30", "Net 60", "COD"
  accountNumber    String?          // Vendor account number
  defaultLeadDays  Int?             // Default lead time in days
  defaultCurrency  String?  @db.VarChar(3)  // Default PO currency

PurchaseOrder model — ADD fields:
  discountType     DiscountType?    // PERCENTAGE or FLAT
  discountValue    Decimal?  @db.Decimal(19,4)
  shippingCost     Decimal?  @db.Decimal(19,4)
  currency         String   @db.VarChar(3) @default("USD")

NEW enum:
  enum DiscountType { PERCENTAGE FLAT }

NEW model — SupplierVariant (vendor SKU mapping):
  id               String   @id @default(uuid())
  installationId   String
  supplierId       String
  saleorVariantId  String
  vendorSku        String          // Supplier's product code
  vendorName       String?         // Supplier's product name
  lastCost         Decimal? @db.Decimal(19,4)
  currency         String?  @db.VarChar(3)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@unique([installationId, supplierId, saleorVariantId])
  @@index([supplierId])
  @@index([saleorVariantId])

AllocationMethod enum — ADD value:
  NONE     // No allocation (informational cost only)
```

**Migration file**: `prisma/migrations/YYYYMMDD_po_financial_fields/migration.sql`

#### 1B. Backend — PO Financial Calculations

**File**: `apps/inventory-ops/src/modules/purchase-orders/purchase-orders-router.ts`

- Update `poCreateSchema` and `poUpdateSchema` to accept `discountType`, `discountValue`, `shippingCost`, `currency`
- Add computed `getFinancialSummary` helper (pure function, no DB call):
  ```
  subtotal = SUM(line.qtyOrdered * line.expectedUnitCost)
  discount = discountType === PERCENTAGE ? subtotal * discountValue/100 : discountValue
  total = subtotal - discount + shippingCost
  ```
- Include financial summary in `getById` response (calculate from lines + PO header fields)
- Update `list` response to include `currency` field

#### 1C. Backend — CSV Import for PO Lines

**New file**: `apps/inventory-ops/src/modules/purchase-orders/csv-import.ts`
**Reuse**: `papaparse` (already a dependency), pattern from `collection-imports/csv-parser.ts`

PO CSV column aliases (auto-detected):
```
sku:       ["sku", "variant_sku", "product_sku", "item_sku", "item_code"]
name:      ["name", "product_name", "item_name", "description", "product"]
vendorSku: ["vendor_sku", "supplier_sku", "vendor_code", "supplier_code", "vendor_item"]
quantity:  ["quantity", "qty", "count", "amount", "order_qty"]
unitCost:  ["unit_cost", "cost", "price", "unit_price", "each"]
notes:     ["notes", "note", "comment", "memo"]
```

Functions to implement:
- `detectPOColumnMappings(headers)` — returns suggested mappings + confidence
- `parsePOCsv(content, options)` → `ParsedPOLine[]`
- `validatePOCsvRow(row)` — validates required fields (sku OR vendorSku, qty > 0, cost >= 0)
- `resolvePOCsvLines(parsedLines, prisma, installationId, supplierId)` — resolves SKUs to saleorVariantIds via Saleor GraphQL + SupplierVariant table, returns `{ resolved: POLine[], unresolved: UnresolvedLine[] }`

**New tRPC endpoints** on `purchaseOrdersRouter`:
- `importCsvPreview` — accepts raw CSV string, returns parsed preview with column detection
- `importCsvExecute` — accepts PO ID + parsed lines, creates PO lines in bulk (reuses `addLine` validation logic)

#### 1D. Frontend — CSV Import UI

**New file**: `apps/inventory-ops/src/pages/purchase-orders/[id]/import-csv.tsx`
**Reuse**: File upload pattern from `pages/collection-imports/new.tsx`

Three-step wizard:
1. **Upload** — drag-and-drop or file picker, validate CSV structure, show row count
2. **Map Columns** — auto-detect with manual override dropdowns, show 5 sample rows preview
3. **Review & Import** — show resolved vs unresolved lines, allow deselecting rows, import button

Navigation: Add "Import CSV" button to PO edit page header (only for DRAFT POs).

#### 1E. Frontend — Financial Summary on PO Detail + Edit

**Files**: `pages/purchase-orders/[id].tsx`, `pages/purchase-orders/[id]/edit.tsx`, `pages/purchase-orders/new.tsx`

- Add discount fields (type dropdown + value input) and shipping cost input to create/edit forms
- Add financial summary card to PO detail page:
  ```
  Subtotal:  $X,XXX.XX   (N lines)
  Discount:  -$XX.XX     (10% / $50 flat)
  Shipping:  +$XX.XX
  ─────────────────────
  Total:     $X,XXX.XX
  ```
- Update PO list page to show total column

#### 1F. Backend + Frontend — Supplier Enhancements

**Files**: `modules/suppliers/suppliers-router.ts`, supplier pages

- Add `paymentTerms`, `accountNumber`, `defaultLeadDays`, `defaultCurrency` to create/update schemas
- Add fields to supplier detail/edit pages
- When creating a PO, pre-populate currency from supplier's `defaultCurrency`

---

### Phase 2: Vendor SKU + Bulk Operations + Landed Cost NONE

#### 2A. Backend — SupplierVariant CRUD

**New file**: `apps/inventory-ops/src/modules/supplier-variants/supplier-variants-router.ts`

Endpoints:
- `upsert` — create or update vendor SKU mapping for a supplier+variant pair
- `getBySupplier` — list all vendor SKU mappings for a supplier
- `getByVariant` — list all supplier prices for a variant
- `search` — search by vendorSku or variant name within a supplier
- `bulkUpsert` — batch create/update from CSV import

Register in `trpc-router.ts` as `supplierVariants`.

#### 2B. Frontend — Vendor SKU in PO Line Editing

**File**: `pages/purchase-orders/[id]/edit.tsx`

- Show vendor SKU column in line items table (from SupplierVariant lookup)
- When adding a line: if SupplierVariant exists for this supplier+variant, pre-fill `expectedUnitCost` from `lastCost`
- Auto-update SupplierVariant `lastCost` when PO line cost changes (on blur save)

#### 2C. Backend + Frontend — Bulk Line Operations

**File**: `modules/purchase-orders/purchase-orders-router.ts`

New endpoints:
- `bulkRemoveLines` — delete multiple lines by ID array (DRAFT only)
- `bulkUpdateLineQty` — update qty on multiple lines

**File**: `pages/purchase-orders/[id]/edit.tsx`

- Add checkbox column to line items table
- Select all / deselect all header checkbox
- Bulk action bar (appears when lines selected): "Delete Selected", "Set Qty..."
- Bulk qty edit via modal with single input

#### 2D. Landed Cost — NONE Allocation Method

**File**: `modules/landed-costs/allocation-service.ts`

- Add `NONE` case in `calculateAllocations()` — returns empty allocations array
- `NONE` costs appear in financial summary but are not distributed to lines
- Useful for tracking informational costs (e.g., bank fees, customs paperwork)

**File**: `modules/landed-costs/landed-costs-router.ts`

- Update schema to accept `NONE` allocation method
- When `NONE`, skip allocation and mark as informational

---

### Phase 3: PO Activity Feed + Receiving Progress + Over-Receive Controls

#### 3A. Schema — PO Activity/Comments

**New model** in `schema.prisma`:
```
model PurchaseOrderEvent {
  id              String        @id @default(uuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(...)
  eventType       POEventType   // STATUS_CHANGE, COMMENT, LINE_ADDED, LINE_REMOVED, LINE_UPDATED, CSV_IMPORT, GR_CREATED, GR_POSTED
  description     String
  userId          String?       // Truncated Saleor user ID
  metadata        Json?         // Flexible payload (old/new status, line details, etc.)
  createdAt       DateTime      @default(now())
  @@index([purchaseOrderId])
}

enum POEventType {
  STATUS_CHANGE
  COMMENT
  LINE_ADDED
  LINE_REMOVED
  LINE_UPDATED
  CSV_IMPORT
  GR_CREATED
  GR_POSTED
}
```

#### 3B. Backend — Activity Feed + Comments

**New file**: `modules/purchase-orders/po-events-router.ts`

Endpoints:
- `list` — paginated events for a PO
- `addComment` — create a COMMENT event (text input)

Integrate auto-logging into existing mutations (status changes, line edits, CSV imports, GR creation).

#### 3C. Frontend — Activity Feed on PO Detail

**File**: `pages/purchase-orders/[id].tsx`

- New "Activity" section below line items
- Timeline layout: icon + description + timestamp + user
- Comment input box at bottom
- Auto-populated events from status changes, line edits, GR creation

#### 3D. Frontend — Receiving Progress on PO Detail

**File**: `pages/purchase-orders/[id].tsx`

- Progress bar showing `totalReceived / totalOrdered` (units)
- Per-line progress indicators in the lines table (received/ordered)
- Reuse existing `ProgressBar` component from `ui/components/progress-bar.tsx`

#### 3E. Backend — Over-Receive Validation Controls

**File**: `modules/goods-receipts/goods-receipts-router.ts`

Currently has a hardcoded 10% over-receipt tolerance. Enhance:
- Add `overReceivePolicy` field to PO schema: `BLOCK`, `WARN`, `ALLOW` (default `WARN`)
- `BLOCK`: reject GR lines exceeding PO qty
- `WARN`: return warning but allow (current behavior)
- `ALLOW`: no validation

---

### Phase 4: Returns to Supplier + PO Templates

#### 4A. Schema + Backend — Supplier Returns

**New model** in `schema.prisma`:
```
model SupplierReturn {
  id              String   @id @default(uuid())
  installationId  String
  purchaseOrderId String?  // Optional link to originating PO
  supplierId      String
  returnNumber    String   @unique
  reason          String
  status          SupplierReturnStatus @default(DRAFT)
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lines           SupplierReturnLine[]
}

model SupplierReturnLine {
  id               String         @id @default(uuid())
  supplierReturnId String
  saleorVariantId  String
  saleorVariantSku String?
  qtyReturned      Int
  unitCost         Decimal @db.Decimal(19,4)
  currency         String  @db.VarChar(3)
  reason           String?
}

enum SupplierReturnStatus { DRAFT SUBMITTED COMPLETED CANCELLED }
```

**New router**: `modules/supplier-returns/supplier-returns-router.ts`
- CRUD operations
- When COMPLETED: decrease Saleor stock, create negative cost layer event
- Link back to PO for traceability

#### 4B. Schema + Backend — PO Templates

**New model** in `schema.prisma`:
```
model PurchaseOrderTemplate {
  id              String   @id @default(uuid())
  installationId  String
  name            String
  supplierId      String
  saleorWarehouseId String
  currency        String   @db.VarChar(3)
  notes           String?
  lines           Json     // Array of { saleorVariantId, sku, name, qty, unitCost }
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**New router**: `modules/purchase-orders/po-templates-router.ts`
- `saveAsTemplate` — create template from existing PO
- `listTemplates` — list available templates
- `createFromTemplate` — create new PO pre-populated from template

**Frontend**: "Save as Template" button on PO detail, "Create from Template" option on PO list page.

---

### Phase 5: PDF Export + Email

#### 5A. Backend — PDF Generation

**New file**: `modules/purchase-orders/pdf-generator.ts`
**Dependency**: Add `@react-pdf/renderer` or `pdfmake` (evaluate which is simpler)

Generate PO PDF with:
- Company header (from app settings)
- Supplier details (name, address, contact, account number)
- PO number, date, expected delivery, payment terms
- Line items table (SKU, vendor SKU, name, qty, unit cost, line total)
- Financial summary (subtotal, discount, shipping, total)
- Notes

**New endpoint**: `purchaseOrders.generatePdf` — returns PDF as base64

#### 5B. Backend — Email PO to Supplier

**New endpoint**: `purchaseOrders.emailToSupplier`
- Validate supplier has contactEmail
- Generate PDF attachment
- Send via Saleor's email infrastructure or direct SMTP
- Log event in activity feed

#### 5C. Frontend — PDF/Email Actions

**File**: `pages/purchase-orders/[id].tsx`

- "Download PDF" button in header actions
- "Email to Supplier" button (disabled if no supplier email)
- Success/error feedback via toast

---

## Critical Files Summary

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | New models, enum values, fields on Supplier + PurchaseOrder |
| `modules/purchase-orders/purchase-orders-router.ts` | Financial fields, bulk ops, CSV endpoints |
| `modules/purchase-orders/csv-import.ts` | NEW — CSV parsing + variant resolution |
| `modules/supplier-variants/supplier-variants-router.ts` | NEW — Vendor SKU CRUD |
| `modules/purchase-orders/po-events-router.ts` | NEW — Activity feed |
| `modules/landed-costs/allocation-service.ts` | NONE allocation method |
| `modules/suppliers/suppliers-router.ts` | Payment terms, account number, lead days |
| `modules/trpc/trpc-router.ts` | Register new routers |
| `pages/purchase-orders/[id].tsx` | Financial summary, progress bar, activity feed |
| `pages/purchase-orders/[id]/edit.tsx` | Discount/shipping inputs, vendor SKU, bulk ops, CSV button |
| `pages/purchase-orders/[id]/import-csv.tsx` | NEW — CSV import wizard |
| `pages/purchase-orders/new.tsx` | Discount/shipping/currency fields |
| `ui/components/index.ts` | Export new components |

## Reusable Code

- **CSV parsing**: `collection-imports/csv-parser.ts` — reuse `papaparse`, `detectColumnMappings` pattern, `getHeaders`, `getSampleRows`, `validateCsv`
- **File upload UI**: `pages/collection-imports/new.tsx` — FileReader API pattern
- **Progress bar**: `ui/components/progress-bar.tsx` — existing component
- **Confirm modal**: `ui/components/confirm-modal.tsx` — for bulk delete confirmation
- **Variant search**: `ui/components/variant-search-input.tsx` — inline autocomplete
- **Audit trail**: Pattern from `suppliers-router.ts` lines 135-144 — `auditEvent.create()`
- **Number generation**: `generatePONumber()` pattern for return numbers

## Verification Strategy

Per phase, verify with:

1. **Phase 1**: `npx prisma migrate dev`, `tsc --noEmit`, create PO with discount/shipping via UI, import CSV file with 5-10 lines, verify financial summary matches manual calculation
2. **Phase 2**: Create SupplierVariant, verify pre-fill on PO line add, bulk select + delete lines, verify NONE landed cost skips allocation
3. **Phase 3**: Verify auto-events on status change, add manual comment, verify progress bar math, test BLOCK over-receive policy rejects excess qty
4. **Phase 4**: Create supplier return, verify stock decreases, save template from PO, create PO from template with correct pre-fill
5. **Phase 5**: Download PDF, verify layout, email to supplier with attachment

All phases: `pnpm check-types`, `vitest --project units` from app directory.

## Exclusions (buylist-specific, per Michael's instruction)

- Kiosk/customer-facing mode
- Market price lookup during PO creation
- Card condition grading workflow
- TCGplayer price integration for cost suggestions
- Buylist-specific pricing rules
