# Saleor App UI Improvement Patterns

> Reference guide for upgrading Saleor App frontends from raw Macaw UI primitives to a polished, human-friendly UI. Derived from the mtg-import app refactor (2026-02-20).

## Problem

Saleor apps built rapidly tend to accumulate these UI debt patterns:

| Pattern | Example |
|---------|---------|
| **Duplicated inline components** | `StatBox` defined separately in 3+ page files |
| **Plain text loading states** | `<Text>Loading...</Text>` instead of skeletons/spinners |
| **Hand-rolled dialogs** | Custom `position: fixed` overlay divs instead of Modal |
| **No mutation feedback** | Jobs created/cancelled silently — no toast notifications |
| **Raw colored text for status** | `<Text color="critical1">FAILED</Text>` instead of semantic chips |
| **Unstyled tables** | No hover effects, no header borders, no visual hierarchy |
| **No breadcrumb navigation** | Detail pages have no clear path back to parent |

## Available Components (Already in the Monorepo)

Before building custom, check these existing packages:

### `@saleor/macaw-ui` (Design System)

| Component | Use For |
|-----------|---------|
| `Modal` + `Modal.Content` + `Modal.Close` | Confirmation dialogs, detail panels |
| `Skeleton` | Loading placeholders (accepts `__height`/`__width`) |
| `Spinner` | Inline loading indicators |
| `Chip` | Tags, labels |
| `Tooltip` + `Tooltip.Content` | Contextual help |
| `Accordion` | Collapsible sections |
| `Dropdown` + `Dropdown.Item` | Action menus |
| `SearchInput` | Search fields with built-in icon |
| `Combobox` | Searchable dropdowns with keyboard navigation |
| `Divider` | Section separators |

**Icons:** `SearchIcon`, `InfoIcon`, `WarningIcon`, `TrashBinIcon`, `EditIcon`, `PlusIcon`, `ExternalLinkIcon`, etc.

**Escape hatches:** `__width`, `__height`, `__fontSize`, `__transition`, `__zIndex`, `__boxShadow` — but NOT `__borderBottom` (use `borderBottomStyle`/`borderBottomWidth` instead).

### `@saleor/apps-ui` (App Layout)

| Component | Use For |
|-----------|---------|
| `Layout.AppSection` + `Layout.AppSectionCard` | Two-column content sections |
| `SemanticChip` | Status badges with `variant="success\|error\|warning\|default"` |
| `SkeletonLayout.Section` / `.Line` | Pre-built skeleton blocks |
| `Breadcrumbs` + `Breadcrumbs.Item` | Page navigation hierarchy |
| `ButtonsBox` | Right-aligned action button container |
| `TextLink` | Navigation-aware links |

### `@saleor/apps-shared` (Shared Utilities)

| Import | Use For |
|--------|---------|
| `useDashboardNotification` | Toast notifications (`notifySuccess`, `notifyError`, `notifyWarning`, `notifyInfo`) |
| `IframeProtectedWrapper` | Dashboard iframe guard |
| `ThemeSynchronizer` | Theme sync with Saleor dashboard |

## Shared Component Patterns

### 1. Extract Duplicated Components

Create a `src/ui/components/` directory with barrel export:

```
src/ui/components/
  index.ts          # Barrel export
  stat-box.tsx      # Label + bold value display
  progress-bar.tsx  # Animated progress with labels
  confirm-modal.tsx # Macaw Modal wrapper for confirmations
  status-badge.tsx  # SemanticChip wrapper for job/entity statuses
  loading-skeleton.tsx  # Skeleton/Spinner loading states
  data-table.tsx    # Generic typed DataTable<T> with hover effects
```

### 2. StatBox Pattern

```tsx
import { Box, Text } from "@saleor/macaw-ui";

export const StatBox = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <Box>
    <Text size={1} color="default2">{label}</Text>
    <Text size={4} fontWeight="bold" color={color as any}>{value}</Text>
  </Box>
);
```

### 3. ConfirmModal Pattern (Replaces Hand-Rolled Dialogs)

```tsx
import { Box, Button, Modal, Text } from "@saleor/macaw-ui";

export const ConfirmModal = ({ open, title, message, onConfirm, onClose }) => (
  <Modal open={open} onChange={(o) => !o && onClose()}>
    <Modal.Content>
      <Box padding={6} __maxWidth="480px">
        <Text as="h2" size={6} fontWeight="bold" marginBottom={4}>{title}</Text>
        <Text marginBottom={6}>{message}</Text>
        <Box display="flex" gap={3} justifyContent="flex-end">
          <Modal.Close>
            <Button variant="secondary">Cancel</Button>
          </Modal.Close>
          <Button variant="primary" onClick={() => { onConfirm(); onClose(); }}>
            Confirm
          </Button>
        </Box>
      </Box>
    </Modal.Content>
  </Modal>
);
```

**Usage:** Replace complex `confirmDialog` state objects with a simple string:

```tsx
const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

<ConfirmModal
  open={!!confirmMessage}
  title="Confirm Action"
  message={confirmMessage ?? ""}
  onConfirm={doAction}
  onClose={() => setConfirmMessage(null)}
/>
```

### 4. StatusBadge Pattern

```tsx
import { SemanticChip } from "@saleor/apps-ui";

const statusVariantMap = {
  PENDING: "default", RUNNING: "warning", COMPLETED: "success",
  FAILED: "error", CANCELLED: "default",
};

export const StatusBadge = ({ status }) => (
  <SemanticChip variant={statusVariantMap[status] ?? "default"}>{status}</SemanticChip>
);
```

### 5. DataTable Pattern (Generic Typed Table)

```tsx
interface Column<T> {
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, data, rowKey, onRowClick, fontSize }) {
  return (
    <Box as="table" width="100%" __fontSize={fontSize}>
      <Box as="thead">
        <Box as="tr">
          {columns.map((col) => (
            <Box as="th" key={col.header} padding={2} textAlign={col.align ?? "left"}
              borderBottomStyle="solid" borderBottomWidth={1} borderColor="default2">
              <Text size={1} fontWeight="bold">{col.header}</Text>
            </Box>
          ))}
        </Box>
      </Box>
      <Box as="tbody">
        {data.map((row) => (
          <Box as="tr" key={rowKey(row)} cursor={onRowClick ? "pointer" : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined} className="data-table-row">
            {columns.map((col) => (
              <Box as="td" key={col.header} padding={2} textAlign={col.align ?? "left"}>
                {col.render(row)}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
```

### 6. Toast Notifications

```tsx
import { useDashboardNotification } from "@saleor/apps-shared/use-dashboard-notification";

const { notifySuccess, notifyError } = useDashboardNotification();

const mutation = trpcClient.something.useMutation({
  onSuccess: () => notifySuccess("Done", "Operation completed."),
  onError: (err) => notifyError("Failed", err.message),
});
```

### 7. Loading States

```tsx
import { Skeleton, Spinner } from "@saleor/macaw-ui";

// Inline spinner with label
<Box display="flex" alignItems="center" gap={3} padding={4}>
  <Spinner />
  <Text color="default2">Loading data...</Text>
</Box>

// Table skeleton placeholder
<Box padding={4} display="flex" flexDirection="column" gap={3}>
  {Array.from({ length: 5 }).map((_, i) => (
    <Box key={i} display="flex" gap={4}>
      <Skeleton __height="16px" __width="60px" />
      <Skeleton __height="16px" __width="180px" />
    </Box>
  ))}
</Box>
```

### 8. Table Hover Effects (CSS)

```css
.data-table-row { transition: background-color 0.15s ease; }
.data-table-row:hover { background-color: rgba(0, 0, 0, 0.04); }
[data-macaw-ui-theme="defaultDark"] .data-table-row:hover {
  background-color: rgba(255, 255, 255, 0.04);
}
```

Import in `_app.tsx`: `import "@/ui/styles/globals.css";`

### 9. Breadcrumb Navigation

```tsx
import { Breadcrumbs } from "@saleor/apps-ui";
import Link from "next/link";

<Breadcrumbs>
  <Breadcrumbs.Item><Link href="/parent">Parent Page</Link></Breadcrumbs.Item>
  <Breadcrumbs.Item>Current Page</Breadcrumbs.Item>
</Breadcrumbs>
```

## Gotchas

| Issue | Fix |
|-------|-----|
| `__borderBottom` doesn't exist on Box | Use `borderBottomStyle="solid" borderBottomWidth={1}` |
| `color` prop type mismatch | Cast: `color={myColor as any}` (Macaw theme tokens) |
| `useDashboardNotification` not found | Import from `@saleor/apps-shared/use-dashboard-notification` (sub-path export) |
| `Modal` needs controlled state | Pass `open` boolean + `onChange` callback |
| `SemanticChip` not found | Import from `@saleor/apps-ui`, not `@saleor/macaw-ui` |

## Checklist for New App UI Upgrades

- [ ] Create `src/ui/components/` with barrel `index.ts`
- [ ] Extract duplicated components (StatBox, tables, dialogs)
- [ ] Replace `<Text>Loading...</Text>` with `Spinner` or `Skeleton`
- [ ] Replace hand-rolled overlay dialogs with `Modal`
- [ ] Add `useDashboardNotification` to all mutation handlers
- [ ] Replace inline status text with `SemanticChip` via `StatusBadge`
- [ ] Add `data-table-row` class and CSS for table hover effects
- [ ] Add `Breadcrumbs` to all detail/sub-pages
- [ ] Import `globals.css` in `_app.tsx`
- [ ] Verify: `tsc --noEmit` passes with no new errors
- [ ] Verify: existing tests still pass
