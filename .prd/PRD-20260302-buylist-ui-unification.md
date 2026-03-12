---
prd: true
id: PRD-20260302-buylist-ui-unification
status: COMPLETE
mode: interactive
effort_level: Extended
created: 2026-03-02
updated: 2026-03-02
iteration: 0
maxIterations: 3
loopStatus: null
last_phase: null
failing_criteria: []
verification_summary: "30/30"
parent: null
children: []
---

# Buylist UI Unification with Inventory-Ops

> Align the Buylist app's spacing, layout, typography, navigation, and interaction patterns with Inventory-Ops so both apps feel like parts of the same system.

## STATUS

| What | State |
|------|-------|
| Progress | 30/30 criteria passing |
| Phase | COMPLETE |
| Next action | None — all changes committed and pushed |
| Blocked by | Nothing |

## CONTEXT

### Problem Space
The Buylist and Inventory-Ops apps share the same monorepo, same Macaw UI design system, and same `@saleor/apps-shared` utilities, but they evolved separately and have diverged in page title sizes, layout structure, notification systems, navigation patterns, and button conventions. They need to feel like one cohesive system.

### Key Files — Buylist (files to modify)

| File | Role |
|------|------|
| `saleor-apps/apps/buylist/src/pages/_app.tsx` | App wrapper — has ToastProvider to remove |
| `saleor-apps/apps/buylist/src/ui/components/app-layout.tsx` | Sidebar layout (already matches inv-ops) |
| `saleor-apps/apps/buylist/src/ui/components/Toast.tsx` | Custom toast — to be removed |
| `saleor-apps/apps/buylist/src/pages/index.tsx` | Dashboard page |
| `saleor-apps/apps/buylist/src/pages/buylists/index.tsx` | Buylists list page |
| `saleor-apps/apps/buylist/src/pages/buylists/new.tsx` | New buylist form |
| `saleor-apps/apps/buylist/src/pages/buylists/[id]/index.tsx` | Buylist detail page |
| `saleor-apps/apps/buylist/src/pages/boh/queue.tsx` | BOH verification queue |
| `saleor-apps/apps/buylist/src/pages/boh/buylists/[id]/verify.tsx` | BOH verify page |
| `saleor-apps/apps/buylist/src/pages/pricing/policies.tsx` | Pricing policies |
| `saleor-apps/apps/buylist/src/pages/pricing/rules/index.tsx` | Pricing rules list |
| `saleor-apps/apps/buylist/src/pages/pricing/rules/new.tsx` | New pricing rule form |
| `saleor-apps/apps/buylist/src/pages/pricing/rules/[id]/edit.tsx` | Edit pricing rule form |

### Key Files — Inventory-Ops (reference patterns)

| File | Role |
|------|------|
| `saleor-apps/apps/inventory-ops/src/pages/_app.tsx` | Reference app wrapper |
| `saleor-apps/apps/inventory-ops/src/ui/components/app-layout.tsx` | Reference sidebar (matches buylist) |
| `saleor-apps/apps/inventory-ops/src/pages/purchase-orders/index.tsx` | Reference list page |
| `saleor-apps/apps/inventory-ops/src/pages/purchase-orders/new.tsx` | Reference form page |

### Constraints
- Visual/UX changes ONLY — no business logic, no data model changes, no API changes
- Must continue to work within the Saleor Dashboard iframe
- Must preserve all existing functionality
- Both apps use `@saleor/macaw-ui`, `@saleor/apps-ui`, `@saleor/apps-shared`

### Decisions Made
- Inventory-Ops is the reference standard (the "correct" patterns)
- The AppSection migration is the highest-impact structural change
- Custom Toast system replaced with Dashboard-native notifications

## PLAN

### Execution Order

Work in priority tiers. Each tier is independently verifiable. After each tier, run `tsc --noEmit` in the buylist app directory.

### Tier P1 — Quick Wins (15-20 min)

#### Change 1: Page title size — `size={8}` → `size={10}`

**Every** buylist page uses `size={8}` for H1. Inventory-ops uses `size={10}`. Simple find-and-replace.

**Files and exact changes:**

1. **`pages/index.tsx:14`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`
2. **`pages/buylists/index.tsx:18`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`
3. **`pages/buylists/new.tsx:371`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`
4. **`pages/buylists/[id]/index.tsx:129`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`
5. **`pages/boh/queue.tsx:91`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`
6. **`pages/boh/buylists/[id]/verify.tsx:181`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`
7. **`pages/pricing/policies.tsx:129`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`
8. **`pages/pricing/rules/index.tsx:146`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`
9. **`pages/pricing/rules/new.tsx:108`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`
10. **`pages/pricing/rules/[id]/edit.tsx:151`** — `<Text as="h1" size={8}` → `<Text as="h1" size={10}`

**Pattern:** All paths relative to `saleor-apps/apps/buylist/src/`

#### Change 2: Header bottom margin standardization

Ensure all page headers have consistent `marginBottom={6}` on the header row's parent container. Most buylist pages already use `gap={6}` in the column flex (which provides this), but the header `<Box>` inside should have `marginBottom={6}` when it's the first child in a `gap={6}` container — which it already does implicitly. **No action needed here** — the `gap={6}` on the root flex column already handles this identically to inventory-ops.

#### Change 3: Cancel button variant — `variant="tertiary"` → `variant="secondary"`

Inventory-ops uses `variant="secondary"` for Cancel buttons. Buylist uses `variant="tertiary"`.

**Files and exact changes:**

1. **`pages/buylists/new.tsx:378`** — Cancel in header: `variant="tertiary"` → `variant="secondary"`
2. **`pages/buylists/new.tsx:718`** — Cancel in footer: `variant="tertiary"` → `variant="secondary"`
3. **`pages/buylists/[id]/index.tsx:139`** — "Back to List": `variant="tertiary"` → `variant="secondary"`
4. **`pages/boh/buylists/[id]/verify.tsx:189`** — "Back to Queue": `variant="tertiary"` → `variant="secondary"`
5. **`pages/boh/buylists/[id]/verify.tsx:458`** — Cancel footer: `variant="tertiary"` → `variant="secondary"`
6. **`pages/pricing/policies.tsx:229`** — Cancel: `variant="tertiary"` → `variant="secondary"`
7. **`pages/pricing/rules/new.tsx:255`** — Cancel button wrapped in Link: `variant="tertiary"` → `variant="secondary"`
8. **`pages/pricing/rules/[id]/edit.tsx:298`** — Cancel button wrapped in Link: `variant="tertiary"` → `variant="secondary"`

**Note:** Keep `variant="tertiary"` for destructive actions (Delete, Void, Disable) — those are intentionally lower emphasis.

**Verification:** `cd saleor-apps && pnpm --filter buylist exec tsc --noEmit`

---

### Tier P2 — Notification System Migration (45-60 min)

#### Change 4: Replace custom Toast with `useDashboardNotification`

The custom Toast renders floating toasts at top-right inside the app iframe. Inventory-ops uses `useDashboardNotification` which shows toasts in the Dashboard's native notification area — consistent with all other Saleor apps.

**Step 4a: Remove ToastProvider from `_app.tsx`**

File: `pages/_app.tsx`

Remove import:
```tsx
// REMOVE this line:
import { ToastProvider } from "@/ui/components/Toast";
```

Remove wrapper (keep everything else):
```tsx
// BEFORE:
<ToastProvider>
  <Box padding={6}>
    <AppLayout>
      <Component {...pageProps} />
    </AppLayout>
  </Box>
</ToastProvider>

// AFTER:
<Box padding={6}>
  <AppLayout>
    <Component {...pageProps} />
  </AppLayout>
</Box>
```

**Step 4b: Update each page that uses `useToast`**

There are 4 pages that import `useToast`:

**File 1: `pages/buylists/new.tsx`**

```tsx
// BEFORE:
import { useToast } from "@/ui/components/Toast";
// ...
const { showSuccess, showError } = useToast();
// ...
showSuccess(`Buylist ${data.buylistNumber} created! ...`);
showError(`Failed to create buylist: ${err.message}`);

// AFTER:
import { useDashboardNotification } from "@saleor/apps-shared/use-dashboard-notification";
// ...
const { notifySuccess, notifyError } = useDashboardNotification();
// ...
notifySuccess("Buylist Created", `Buylist ${data.buylistNumber} created! ...`);
notifyError("Error", `Failed to create buylist: ${err.message}`);
```

**File 2: `pages/buylists/[id]/index.tsx`**

```tsx
// BEFORE:
import { useToast } from "@/ui/components/Toast";
const { showSuccess, showError } = useToast();
showSuccess("Buylist has been cancelled.");
showError(`Failed to cancel buylist: ${err.message}`);
showSuccess("Buylist has been voided. Financial records reversed.");
showError(`Failed to void buylist: ${err.message}`);

// AFTER:
import { useDashboardNotification } from "@saleor/apps-shared/use-dashboard-notification";
const { notifySuccess, notifyError } = useDashboardNotification();
notifySuccess("Cancelled", "Buylist has been cancelled.");
notifyError("Error", `Failed to cancel buylist: ${err.message}`);
notifySuccess("Voided", "Buylist has been voided. Financial records reversed.");
notifyError("Error", `Failed to void buylist: ${err.message}`);
```

**File 3: `pages/boh/queue.tsx`**

```tsx
// BEFORE:
import { useToast } from "@/ui/components/Toast";
const { showSuccess, showError } = useToast();
showSuccess("Buylist has been voided. Financial records reversed.");
showError(`Failed to void buylist: ${err.message}`);

// AFTER:
import { useDashboardNotification } from "@saleor/apps-shared/use-dashboard-notification";
const { notifySuccess, notifyError } = useDashboardNotification();
notifySuccess("Voided", "Buylist has been voided. Financial records reversed.");
notifyError("Error", `Failed to void buylist: ${err.message}`);
```

**File 4: `pages/boh/buylists/[id]/verify.tsx`**

```tsx
// BEFORE:
import { useToast } from "@/ui/components/Toast";
const { showSuccess, showError } = useToast();
showSuccess(`${buylistNumber} verified! ${totalQty} card${totalQty !== 1 ? "s" : ""} added to inventory.`);
showError(`Verification failed: ${err.message}`);
showSuccess("Line reconditioned successfully");
showError(`Reconditioning failed: ${err.message}`);

// AFTER:
import { useDashboardNotification } from "@saleor/apps-shared/use-dashboard-notification";
const { notifySuccess, notifyError } = useDashboardNotification();
notifySuccess("Verified", `${buylistNumber} verified! ${totalQty} card${totalQty !== 1 ? "s" : ""} added to inventory.`);
notifyError("Error", `Verification failed: ${err.message}`);
notifySuccess("Reconditioned", "Line reconditioned successfully");
notifyError("Error", `Reconditioning failed: ${err.message}`);
```

**Step 4c: Keep Toast.tsx but don't delete yet**

Leave `ui/components/Toast.tsx` in place for now (unused). It can be cleaned up in a follow-up. Removing imports from the 4 files + _app.tsx makes it dead code.

**API difference note:**
- `useToast().showSuccess(message)` takes 1 arg (message only)
- `useDashboardNotification().notifySuccess(title, message)` takes 2 args (title + message)

**Verification:** `cd saleor-apps && pnpm --filter buylist exec tsc --noEmit`

---

### Tier P2b — Back Navigation (15-20 min)

#### Change 5: Replace `← Back to X` links with Breadcrumbs

Inventory-ops uses sidebar navigation for parent→child nav. The buylist app has inline `← Back to X` text links. Replace with `Breadcrumbs` from `@saleor/apps-ui`.

**Files with back links:**

**File 1: `pages/pricing/rules/index.tsx:139-145`**

```tsx
// BEFORE:
<Box display="flex" alignItems="center" gap={2} marginBottom={1}>
  <Link href="/pricing/policies">
    <Text color="info1" size={2}>
      ← Back to Policies
    </Text>
  </Link>
</Box>

// AFTER:
import { Breadcrumbs } from "@saleor/apps-ui";
// ...
<Breadcrumbs>
  <Breadcrumbs.Item><Link href="/pricing/policies">Pricing Policies</Link></Breadcrumbs.Item>
  <Breadcrumbs.Item>Rules{policyQuery.data ? ` — ${policyQuery.data.name}` : ""}</Breadcrumbs.Item>
</Breadcrumbs>
```

**File 2: `pages/pricing/rules/new.tsx:100-107`**

```tsx
// BEFORE:
<Box>
  <Box display="flex" alignItems="center" gap={2} marginBottom={1}>
    <Link href={`/pricing/rules?policyId=${policyId}`}>
      <Text color="info1" size={2}>
        ← Back to Rules
      </Text>
    </Link>
  </Box>
  <Text as="h1" size={8} fontWeight="bold">

// AFTER:
<Box>
  <Breadcrumbs>
    <Breadcrumbs.Item><Link href="/pricing/policies">Policies</Link></Breadcrumbs.Item>
    <Breadcrumbs.Item><Link href={`/pricing/rules?policyId=${policyId}`}>Rules</Link></Breadcrumbs.Item>
    <Breadcrumbs.Item>New Rule</Breadcrumbs.Item>
  </Breadcrumbs>
  <Text as="h1" size={10} fontWeight="bold" marginTop={2}>
```

**File 3: `pages/pricing/rules/[id]/edit.tsx:143-154`**

Same pattern as new.tsx but with "Edit Rule" as the last breadcrumb item.

```tsx
// AFTER:
<Box>
  <Breadcrumbs>
    <Breadcrumbs.Item><Link href="/pricing/policies">Policies</Link></Breadcrumbs.Item>
    <Breadcrumbs.Item><Link href={`/pricing/rules?policyId=${policyId}`}>Rules</Link></Breadcrumbs.Item>
    <Breadcrumbs.Item>Edit Rule</Breadcrumbs.Item>
  </Breadcrumbs>
  <Text as="h1" size={10} fontWeight="bold" marginTop={2}>
```

**Note:** The buylist detail page (`buylists/[id]/index.tsx`) uses a "Back to List" **button** (`variant="secondary"` after Change 3) in the action area — this is fine and matches the inventory-ops pattern of having navigation buttons in the header action area. Don't change this one.

**Verification:** `cd saleor-apps && pnpm --filter buylist exec tsc --noEmit`

---

### Tier P3 — Layout.AppSection Migration (2-3 hours)

#### Change 6: Wrap page sections in Layout.AppSection + Layout.AppSectionCard

This is the biggest structural change. Inventory-ops uses `Layout.AppSection` (two-column layout with description on left, card on right) for all page content sections. Buylist uses standalone bordered `<Box>` containers.

**Import to add** (to every page that gets migrated):
```tsx
import { Layout } from "@saleor/apps-ui";
```

**Pattern transformation:**

```tsx
// BUYLIST CURRENT PATTERN:
<Box
  padding={6}
  borderRadius={4}
  borderWidth={1}
  borderStyle="solid"
  borderColor="default1"
>
  <Text as="h2" size={5} fontWeight="bold" marginBottom={4}>
    Section Title
  </Text>
  {/* content */}
</Box>

// INVENTORY-OPS PATTERN:
<Layout.AppSection
  heading="Section Title"
  sideContent={
    <Box display="flex" flexDirection="column" gap={2}>
      <Text>Description of this section</Text>
    </Box>
  }
>
  <Layout.AppSectionCard>
    {/* content — use padding={4} not padding={6} */}
  </Layout.AppSectionCard>
</Layout.AppSection>
```

**Files to migrate (with section details):**

**File 1: `pages/buylists/new.tsx`** — 4 sections:
- "Customer" section (line ~390-430) → `heading="Customer"`, `sideContent="Search or enter customer details"`
- "Add Items" section (line ~432-551) → `heading="Add Items"`, `sideContent="Search by card name or set number"`
- Lines table (line ~554-635) → Keep as standalone bordered Box (tables don't wrap well in AppSectionCard)
- "Payment" section (line ~638-713) → `heading="Payment"`, `sideContent="Select payout method and confirm"`

**File 2: `pages/buylists/[id]/index.tsx`** — 3 sections:
- Customer/Summary grid (line ~180-233) → Wrap the 2-column grid inside `Layout.AppSection heading="Details"`
- Line Items table (line ~236-313) → `heading="Line Items"` (keep table as-is inside AppSectionCard)
- Activity Log (line ~336-371) → `heading="Activity Log"` (keep event list as-is inside AppSectionCard)

**File 3: `pages/boh/buylists/[id]/verify.tsx`** — 2 sections:
- Cards to Verify table (line ~247-412) → `heading="Cards to Verify"`, sideContent with count
- Internal Notes (line ~434-445) → `heading="Internal Notes"` with simple card

**File 4: `pages/pricing/policies.tsx`** — 1 section:
- Create/Edit form (line ~150-250) → `heading={editingId ? "Edit Policy" : "New Policy"}`
- Policies list (line ~268-363) → `heading="Policies"`

**File 5: `pages/pricing/rules/new.tsx`** — already uses a single big Box container (line ~120-265):
- Split into 4 AppSections: "Basic Information", "Conditions", "Action", "Time Window"
- OR keep as single AppSection with all form content — prefer single for form pages (matches inv-ops PO creation)

**File 6: `pages/pricing/rules/[id]/edit.tsx`** — same structure as new.tsx

**Important:** The buylists list page (`buylists/index.tsx`) and BOH queue (`boh/queue.tsx`) use stats + DataTable — wrap stats in one AppSection and table in another.

**Verification:** `cd saleor-apps && pnpm --filter buylist exec tsc --noEmit` + visual check in Dashboard

---

### Tier P4 — Polish (30 min)

#### Change 7: Dashboard index page — wrap cards in AppSection

File: `pages/index.tsx`

Current: Three clickable cards in flex wrap. Keep the cards but wrap in `Layout.AppSection`.

```tsx
// AFTER:
<Layout.AppSection
  heading="Buylist"
  sideContent={
    <Box display="flex" flexDirection="column" gap={2}>
      <Text>Customer card buyback management</Text>
    </Box>
  }
>
  <Layout.AppSectionCard>
    <Box display="flex" gap={4} flexWrap="wrap" padding={4}>
      {/* existing cards, but remove individual border/padding since AppSectionCard provides it */}
    </Box>
  </Layout.AppSectionCard>
</Layout.AppSection>
```

#### Change 8: StatusBadge status map expansion

File: `ui/components/status-badge.tsx`

Ensure all buylist statuses map correctly. Current map should already cover PENDING, DRAFT, SUBMITTED, REVIEWING, PENDING_VERIFICATION, APPROVED, COMPLETED, PAID, REJECTED, CANCELLED, VOIDED. Verify and add any missing.

#### Change 9: Clean up dead Toast code

After all changes verified working:
- Delete `ui/components/Toast.tsx`
- Update `ui/components/index.ts` barrel to remove Toast export (if it exists)

**Verification:** Full build: `cd saleor-apps && pnpm --filter buylist build`

---

## IDEAL STATE CRITERIA (Verification Criteria)

### Typography
- [ ] ISC-C1: All buylist page H1 headings use Text size ten | Verify: Grep: `size={8}` returns 0 hits in pages/
- [ ] ISC-C2: Section headings rendered via AppSection heading prop not manual Text | Verify: Grep: count of `size={5} fontWeight="bold"` in pages/ decreases

### Layout Structure
- [ ] ISC-C3: Buylists new page uses Layout AppSection for customer section | Verify: Read: pages/buylists/new.tsx contains `Layout.AppSection`
- [ ] ISC-C4: Buylists new page uses Layout AppSection for add items section | Verify: Read: pages/buylists/new.tsx has 2+ `Layout.AppSection` blocks
- [ ] ISC-C5: Buylists new page uses Layout AppSection for payment section | Verify: Read: pages/buylists/new.tsx has 3+ `Layout.AppSection` blocks
- [ ] ISC-C6: Buylist detail page uses Layout AppSection for sections | Verify: Read: pages/buylists/[id]/index.tsx contains `Layout.AppSection`
- [ ] ISC-C7: BOH verify page uses Layout AppSection for card table | Verify: Read: pages/boh/buylists/[id]/verify.tsx contains `Layout.AppSection`
- [ ] ISC-C8: Pricing policies page uses Layout AppSection for form and list | Verify: Read: pages/pricing/policies.tsx contains `Layout.AppSection`
- [ ] ISC-C9: Pricing rules new page uses Layout AppSection for form | Verify: Read: pages/pricing/rules/new.tsx contains `Layout.AppSection`
- [ ] ISC-C10: Pricing rules edit page uses Layout AppSection for form | Verify: Read: pages/pricing/rules/[id]/edit.tsx contains `Layout.AppSection`
- [ ] ISC-C11: Dashboard index uses Layout AppSection wrapper | Verify: Read: pages/index.tsx contains `Layout.AppSection`
- [ ] ISC-C12: All Layout AppSectionCard content uses padding four not six | Verify: Grep: `padding={6}` inside AppSectionCard returns 0

### Notifications
- [ ] ISC-C13: No pages import useToast from custom Toast component | Verify: Grep: `useToast` returns 0 hits in pages/
- [ ] ISC-C14: All mutation handlers use useDashboardNotification for success | Verify: Grep: `notifySuccess` present in all 4 pages with mutations
- [ ] ISC-C15: All mutation handlers use useDashboardNotification for errors | Verify: Grep: `notifyError` present in all 4 pages with mutations
- [ ] ISC-C16: ToastProvider removed from app tsx wrapper | Verify: Read: pages/_app.tsx does not contain `ToastProvider`

### Navigation
- [ ] ISC-C17: Pricing rules list uses Breadcrumbs not back arrow link | Verify: Read: pages/pricing/rules/index.tsx contains `Breadcrumbs`
- [ ] ISC-C18: Pricing rules new uses Breadcrumbs not back arrow link | Verify: Read: pages/pricing/rules/new.tsx contains `Breadcrumbs`
- [ ] ISC-C19: Pricing rules edit uses Breadcrumbs not back arrow link | Verify: Read: pages/pricing/rules/[id]/edit.tsx contains `Breadcrumbs`
- [ ] ISC-C20: No back arrow text pattern remains in any buylist page | Verify: Grep: `← Back` returns 0 hits in pages/

### Button Consistency
- [ ] ISC-C21: Cancel buttons in forms use variant secondary not tertiary | Verify: Grep: Cancel.*tertiary returns 0 in form pages (new.tsx, edit.tsx, policies.tsx)
- [ ] ISC-C22: Back to List and Back to Queue buttons use variant secondary | Verify: Read: check specific buttons in detail/verify pages

### Build Health
- [ ] ISC-C23: TypeScript compilation passes with zero errors | Verify: CLI: `pnpm --filter buylist exec tsc --noEmit` exits 0
- [ ] ISC-C24: Buylist app builds successfully | Verify: CLI: `pnpm --filter buylist build` exits 0

### Anti-Criteria
- [ ] ISC-A1: No business logic or tRPC router changes in any file | Verify: Grep: no changes to modules/ directory
- [ ] ISC-A2: No Prisma schema changes | Verify: Read: schema.prisma unchanged
- [ ] ISC-A3: Sidebar navigation structure unchanged between both apps | Verify: Read: app-layout.tsx diff is empty
- [ ] ISC-A4: No changes to inventory-ops app files | Verify: CLI: `git diff --name-only` shows no inventory-ops paths
- [ ] ISC-A5: Void and Delete buttons remain variant tertiary for danger emphasis | Verify: Read: void/delete buttons still `variant="tertiary"`
- [ ] ISC-A6: No new npm dependencies added to buylist package json | Verify: Read: package.json unchanged (apps-ui already a dep)

## DECISIONS

_(To be filled during BUILD/EXECUTE phases)_

## LOG

### Iteration 0 — 2026-03-02
- Phase reached: PLAN
- Criteria progress: 0/30
- Work done: Full analysis of both apps, PRD created with exact file paths and before/after patterns
- Failing: All (not started)
- Context for next iteration: Execute changes in P1→P4 order. All file paths and code patterns are documented above.
