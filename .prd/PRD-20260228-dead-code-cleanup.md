---
prd: true
id: PRD-20260228-dead-code-cleanup
status: COMPLETE
mode: interactive
effort_level: Extended
created: 2026-02-28
updated: 2026-02-28
iteration: 1
maxIterations: 3
loopStatus: null
last_phase: VERIFY
failing_criteria: []
verification_summary: "24/24"
parent: null
children: []
---

# Dead & Unwired Code Cleanup

> Systematic removal, implementation, and alteration of dead code findings across storefront and 4 custom saleor-apps, corrected by adversarial red team analysis.

## STATUS

| What | State |
|------|-------|
| Progress | 24/24 criteria passing — COMPLETE |
| Phase | VERIFY — all phases executed |
| Next action | None — all work complete |
| Blocked by | Nothing |

## CONTEXT

### Problem Space
Comprehensive audit of 762 source files found 32 candidate items. Red team analysis eliminated 3 false positives and reclassified 5 items. Final actionable count: 29 items across 3 categories.

### Key Files
- `saleor-apps/apps/*/src/lib/errors.ts` — Identical boilerplate error classes (4 apps)
- `saleor-apps/apps/pos/src/pages/transaction.tsx` — Hardcoded channel/warehouse IDs
- `saleor-apps/apps/pos/src/pages/register/open.tsx` — Hardcoded warehouse ID
- `saleor-apps/apps/pos/src/modules/receipts/receipts-router.ts` — Hardcoded store info + missing customer data
- `saleor-apps/apps/pos/src/modules/settings/settings-router.ts` — **Already exists** (discovered by red team)
- `storefront/src/ui/components/` — EnvLogger, LoginForm, RangeFilter, AuthProvider

### Constraints
- Must not break existing functionality
- Apps share Prisma schema (pos/inventory-ops) — careful with shared types
- POS is ~95% Phase 1 MVP — some TODOs are intentionally deferred to later phases
- Storefront is in production — changes must not break SSR/hydration
- `cleanupOldTransactions()` is client-side IndexedDB — cannot call from server-side tRPC

---

## RED TEAM FINDINGS

### CRITICAL — Audit False Positives (3 items REMOVED from plan)

| # | Original Finding | Red Team Verdict | Evidence |
|---|-----------------|------------------|----------|
| **RT-1** | Delete `PRODUCT_METADATA_QUERY` from mtg-import | **AUDIT IS WRONG — actively used** | Imported at `saleor-import-client.ts:25`, called at line 504 |
| **RT-2** | Delete `createInstrumentedGraphqlClient` from POS | **AUDIT IS WRONG — actively used** | Imported at `protected-client-procedure.ts:6`, called at line 103 |
| **RT-3** | Remove `FINISH_OPTIONS` import from MobileFilterModal | **ALREADY FIXED — stale finding** | Current file does not contain this import |

### HIGH — Architecture Corrections (3 proposals REWRITTEN)

| # | Original Proposal | Red Team Finding | Corrected Approach |
|---|------------------|------------------|-------------------|
| **RT-4** | 2A: Store settings in Saleor privateMetadata | **`PosAppSettings` Prisma model already exists** with `storeName`, `storeAddress`, `storePhone`, `receiptHeader`, `receiptFooter`, `returnPolicyText`. A `settingsRouter` with `get`/`update` endpoints already exists. | Use existing `PosAppSettings` model + `settingsRouter`. Just wire receipts-router to call `settings.get`. Create `/settings` page (add to `allowedPathNames` in `_app.tsx`). Scope: 1-2h not 2-3h. |
| **RT-5** | 2B: Channel/warehouse from register session (3-4h) | **Massively understated**: 5+ hardcoded locations (transaction.tsx, register/open.tsx, _app.tsx OfflineProvider, SinglesBuilderImport, products-router). OfflineProvider needs channel at app mount BEFORE any register session exists. Would need schema migration to add `saleorChannelId` to `RegisterSession`. | **DEFER** to dedicated Phase 2 task. Current env-var fallback in `_app.tsx` is adequate. Scope if done: 8-12h with schema migration. |
| **RT-6** | 2C: Wire cleanupOldTransactions to register.close | **Architecturally wrong**: `cleanupOldTransactions()` operates on client-side IndexedDB (Dexie). `register.close` is a server-side tRPC mutation. Can't call browser DB from Node.js. Also, offline mode is Phase 4 — the IndexedDB never has data yet. | **DEFER** to Phase 4 (offline mode). When implemented, wire into client-side `onSuccess` callback of close mutation, not the server handler. |

### MEDIUM — Reclassifications (5 items adjusted)

| # | Item | Red Team Finding | Action |
|---|------|------------------|--------|
| **RT-7** | POS error classes (InsufficientStockError, PaymentError, RegisterSessionError) | Phase 2+ features will need these. Deleting creates churn. | **KEEP** — intentional scaffolding for upcoming phases |
| **RT-8** | ESC/POS constants FS, CR, HT | Phase 5 (thermal printing) will need these. 3 lines, zero runtime cost. | **KEEP** — protocol reference constants for Phase 5 |
| **RT-9** | POS getAllTransactions() | Phase 4 offline mode may need this. | **KEEP** — offline scaffolding |
| **RT-10** | 3A: Receipt customer data — 2 code paths | `getReceiptData` AND `generateReceiptHtml` both need updating. `generateReceiptHtml` has separate inline type + HTML template with no customer section. | Update BOTH code paths. Also: print customerName only, NOT email (privacy risk on paper receipts). |
| **RT-11** | 3B: BrowserPrinter.printHtml | JSDoc is fine, but `PrinterManager` does `instanceof BrowserPrinter` downcast. Consider optional interface method for type safety. | JSDoc is sufficient for now. Note the interface gap for Phase 5 printer refactor. |

---

## FINAL IMPLEMENTATION PLAN

### Execution Order & Dependencies

```
Phase 1A (parallel, independent) ──→ Type check all apps
Phase 1B (after 1A passes)       ──→ Commit "chore: remove dead code"
Phase 2  (independent)           ──→ Commit per feature
Phase 3  (independent)           ──→ Commit per feature
```

### Phase 1: REMOVE — Safe Dead Code Deletion

**Estimated time: 30-45 minutes. All changes are deletions with zero behavior change.**

#### 1A. Error Class Cleanup (4 Apps — reduced scope after red team)

**mtg-import** (`src/lib/errors.ts`):
- Delete lines 16-22: `UnknownError`, `ValueError`, `NotFoundError`, `ValidationError`
- Keep: `BaseError` (L4-14), `SaleorApiError` (L24), `ScryfallApiError` (L26)

**inventory-ops** (`src/lib/errors.ts`):
- Delete: `UnknownError`, `ValueError`, `NotFoundError`, `PermissionError`, `SaleorApiError`
- Keep: `BaseError`, `ValidationError` (used in env.ts)

**buylist** (`src/lib/errors.ts`):
- Delete lines 16-30: all 8 subclasses (`UnknownError`, `ValueError`, `NotFoundError`, `ValidationError`, `PermissionError`, `SaleorApiError`, `PricingError`, `BuylistError`)
- Keep: `BaseError` only

**pos** (`src/lib/errors.ts`):
- Delete: `ValueError` (L17) only
- **KEEP**: `UnknownError`, `NotFoundError`, `ValidationError`, `PermissionError`, `SaleorApiError`, `InsufficientStockError`, `PaymentError`, `RegisterSessionError` — all are Phase 2+ scaffolding per RT-7

#### 1B. MTG-Import

| Item | Action |
|------|--------|
| `createGraphQLClient` export | Remove `export` keyword only (keep function, used internally) |
| ~~PRODUCT_METADATA_QUERY~~ | **CANCELLED — RT-1: actively used** |

#### 1C. Inventory-Ops

| Item | Action |
|------|--------|
| `_GET_STOCKS_QUERY` + `_GetStocksResponse` | Delete both (L132-153, L288-294) |
| `DEFAULT_CONFIG` | Delete (L30-34). Add comment to Prisma schema noting default values. |

#### 1D. Buylist

| Item | Action |
|------|--------|
| `PageSkeleton` | Remove from barrel `index.ts`, delete `loading-skeleton.tsx` |
| ConditionBuilder default export | Delete `export default` line |

#### 1E. POS (reduced scope after red team)

| Item | Action | Red Team Status |
|------|--------|----------------|
| ~~createInstrumentedGraphqlClient~~ | **CANCELLED — RT-2: actively used** | False positive |
| ~~ESC/POS constants FS, CR, HT~~ | **CANCELLED — RT-8: Phase 5 scaffolding** | Keep |
| ~~getAllTransactions()~~ | **CANCELLED — RT-9: Phase 4 scaffolding** | Keep |

**Net POS removals in Phase 1: ValueError only (1 line)**

#### 1F. Storefront (reduced scope after red team)

| Item | Action | Red Team Status |
|------|--------|----------------|
| `EnvLogger` | Delete function (~20 lines from EnvBanner.tsx) | Safe |
| ~~FINISH_OPTIONS import~~ | **CANCELLED — RT-3: already fixed** | Stale |
| Empty `<div></div>` | Delete line 64 from LoginForm.tsx | Safe |
| Local `clsx` function | Delete L94-96, add `import clsx from "clsx"` at top | Safe (both ops atomic) |
| Commented `requestPolicy` | Delete comment line from AuthProvider.tsx | Safe |

#### 1G. Verification Gate

After all Phase 1 changes:
```bash
# In saleor-apps/
cd saleor-apps/apps/mtg-import && pnpm check-types
cd saleor-apps/apps/inventory-ops && pnpm check-types
cd saleor-apps/apps/buylist && pnpm check-types
cd saleor-apps/apps/pos && pnpm check-types

# In storefront/
cd storefront && npx tsc --noEmit
```

All must pass before committing.

---

### Phase 2: IMPLEMENT — Feature Work (Selective)

#### 2A. POS Receipt Header from Settings (DO NOW — 1-2h)

**Corrected approach per RT-4**: Use existing `PosAppSettings` model + `settingsRouter`.

1. In `receipts-router.ts`, import settings query and call it in both `getReceiptData` AND `generateReceiptHtml`
2. Replace hardcoded values (L143-146 and L447-451) with settings values, fall back to defaults
3. Create `/pages/settings.tsx` with form for store info
4. Add `/settings` to `allowedPathNames` in `_app.tsx` (L56-71)

#### 2B. POS Channel/Warehouse — DEFERRED (per RT-5)

**Reason**: 5+ hardcoded locations, needs schema migration, conflicts with OfflineProvider initialization at app mount (before register session exists). True scope: 8-12h. File as separate Phase 2 task.

#### 2C. POS Offline Cleanup — DEFERRED (per RT-6)

**Reason**: Method operates on client-side IndexedDB; proposed server-side location is architecturally wrong. Offline mode is Phase 4; no transactions exist in IndexedDB yet. Wire into client-side close callback when Phase 4 ships.

#### 2D. Buylist Price History Stub (DO NOW — 1 min)

Delete the commented-out nav link from `app-layout.tsx` (L46-49). Track feature in project management if desired.

#### 2E. React 18 Workaround Docs (DO NOW — 5 min)

In all 4 apps' `_app.tsx`:
- Replace TODO with documentation comment explaining two separate workarounds:
  1. `crypto.randomUUID()` polyfill for non-HTTPS staging environments
  2. `AppBridge` singleton for React 18 StrictMode double-mount
- Remove "consider hiding in app-sdk" phrasing (it's not our SDK to modify)

---

### Phase 3: ALTER — Adjustments

#### 3A. POS Receipt Customer Data (DO NOW — 45 min, corrected per RT-10)

Two code paths need updating:

**Path 1 — `getReceiptData` (L170-172):**
```typescript
// Replace:
customerName: undefined,
customerEmail: undefined,
// With:
customerName: transaction.customerName ?? undefined,
// customerEmail intentionally omitted from printed receipts (privacy)
```

**Path 2 — `generateReceiptHtml` (L328+ inline type, L399-517 HTML template):**
1. Extend inline type to include `customerName: string | null`
2. Add customer name section to HTML template (after cashier line)
3. Do NOT include email in HTML receipts (paper privacy concern per RT-10)

**Privacy decision**: Print customer name on receipts when attached. Do NOT print email on paper/thermal receipts. Email is for digital receipt formats only (future feature).

#### 3B. BrowserPrinter.printHtml JSDoc (DO NOW — 2 min)

Add JSDoc to `printHtml` method documenting it as BrowserPrinter-specific, not on the Printer interface. Note interface gap for Phase 5 printer refactor.

---

## DECISIONS

| Date | Decision | Rationale | Alternatives |
|------|----------|-----------|-------------|
| 2026-02-28 | Keep POS error classes except ValueError | Phase 2+ features need them; deleting creates churn | Delete all (rejected: wasteful) |
| 2026-02-28 | Keep ESC/POS FS/CR/HT constants | Phase 5 thermal printing needs them; 3 lines, zero cost | Delete (rejected: penny-wise, pound-foolish) |
| 2026-02-28 | Keep POS getAllTransactions | Phase 4 offline mode may need it | Delete (rejected: will recreate) |
| 2026-02-28 | Defer channel/warehouse config | 8-12h true scope, conflicts with OfflineProvider init | Do it now (rejected: scope creep) |
| 2026-02-28 | Defer offline cleanup wiring | Client-side IndexedDB can't be called from server-side tRPC | Wire now (rejected: architecturally wrong) |
| 2026-02-28 | Use existing PosAppSettings, not privateMetadata | Model + router already exist in codebase | Build new storage (rejected: duplicate) |
| 2026-02-28 | Print customer name, not email, on receipts | Paper privacy concern (CCPA, discarded receipts) | Print both (rejected: privacy risk) |

## IDEAL STATE CRITERIA

### REMOVE (Phase 1)
- [x] ISC-R1: Unused error classes deleted from mtg-import errors.ts (4 classes) | Verify: Grep
- [x] ISC-R2: Unused error classes deleted from inventory-ops errors.ts (5 classes) | Verify: Grep
- [x] ISC-R3: Unused error classes deleted from buylist errors.ts (8 classes) | Verify: Grep
- [x] ISC-R4: POS ValueError deleted from errors.ts (1 class only) | Verify: Grep
- [x] ISC-R5: mtg-import createGraphQLClient no longer exported | Verify: Grep
- [x] ISC-R6: inventory-ops _GET_STOCKS_QUERY and type deleted | Verify: Grep
- [x] ISC-R7: inventory-ops DEFAULT_CONFIG deleted, defaults noted in schema | Verify: Grep + Read
- [x] ISC-R8: buylist PageSkeleton deleted from barrel and file | Verify: Grep
- [x] ISC-R9: buylist ConditionBuilder default export removed | Verify: Grep
- [x] ISC-R10: Storefront EnvLogger function deleted | Verify: Grep
- [x] ISC-R11: Storefront empty div removed from LoginForm | Verify: Read
- [x] ISC-R12: Storefront local clsx replaced with npm import | Verify: Grep
- [x] ISC-R13: Storefront commented requestPolicy deleted | Verify: Read

### IMPLEMENT (Phase 2)
- [x] ISC-I1: POS receipt header reads from PosAppSettings model | Verify: Read + type check
- [x] ISC-I2: POS settings page exists at /settings and is accessible | Verify: Read allowedPathNames
- [x] ISC-I3: Buylist Price History commented stub removed | Verify: Read
- [x] ISC-I4: React 18 workaround TODOs converted to docs in 4 apps | Verify: Grep no TODO

### ALTER (Phase 3)
- [x] ISC-AL1: POS receipt shows customerName when customer attached | Verify: Read both code paths
- [x] ISC-AL2: POS receipt does NOT show customerEmail on paper/HTML | Verify: Read + Grep
- [x] ISC-AL3: BrowserPrinter.printHtml has JSDoc documentation | Verify: Read

### Anti-Criteria
- [x] ISC-A1: No app fails type checking after changes | Verify: CLI: check-types
- [x] ISC-A2: No existing imports broken by removals | Verify: CLI: build passes
- [x] ISC-A3: PRODUCT_METADATA_QUERY NOT deleted (false positive) | Verify: Grep: still exists
- [x] ISC-A4: POS createInstrumentedGraphqlClient NOT deleted (false positive) | Verify: Grep: still exists

### DEFERRED (tracked, not executed)
- DEFERRED: POS channel/warehouse from config → Phase 2 task (8-12h, schema migration)
- DEFERRED: POS cleanupOldTransactions wiring → Phase 4 with offline mode
- DEFERRED: POS getAllTransactions removal → Phase 4 decision
- DEFERRED: POS ESC/POS FS/CR/HT removal → Phase 5 decision

## LOG

### Iteration 0 — 2026-02-28
- Phase reached: PLAN
- Criteria progress: 0/29
- Work done: Full audit (762 files, 5 areas), proposals for all 3 categories, red team analysis
- Red team eliminated 3 false positives, corrected 3 architectural mistakes, reclassified 5 items
- Failing: all
- Context for next iteration: Execute Phase 1 removals first, then Phase 2/3

### Iteration 1 — 2026-02-28
- Phase reached: VERIFY (COMPLETE)
- Criteria progress: 24/24
- Work done: All 3 phases executed — removals, implementations, alterations
- Phase 1: Deleted unused error classes (4 apps), stocks query, DEFAULT_CONFIG, PageSkeleton, EnvLogger, empty div, local clsx, commented requestPolicy, ConditionBuilder default export, createGraphQLClient export keyword
- Phase 2: Wired POS receipt header/footer to PosAppSettings, created /settings page, replaced React 18 TODOs with JSDoc in 4 apps, removed Price History stub
- Phase 3: Added customerName to receipts (email excluded for privacy), added BrowserPrinter.printHtml JSDoc
- All type checks pass across all changed files
- Failing: none
