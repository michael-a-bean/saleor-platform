# MVP Completion Plan

**Created**: 2026-01-03
**Goal**: Complete 4 remaining MVP items for hobby gaming commerce platform
**Estimated Total**: 7-9 days

## Current State: ~80% Complete (revised up from 74%)

**Key Discovery**: The order.fulfilled webhook for COGS tracking already exists and is fully implemented at:
`saleor-apps/apps/inventory-ops/src/app/api/webhooks/saleor/order-fulfilled/`

This was listed as a critical gap but is actually done. The webhook:
- Listens for ORDER_FULFILLED events
- Looks up current WAC for each fulfilled line
- Creates SALE cost layer events with negative qty delta
- Records revenue for margin calculation
- Is idempotent (won't double-process)

---

## Remaining MVP Gaps (Priority Order)

---

### 1. Cart Quantity Adjustment (Storefront) - 1 day

**Impact**: Users can't change quantities without delete/re-add
**Status**: GraphQL mutation exists, just needs UI buttons

#### File to Modify
`storefront/src/checkout/sections/Summary/SummaryItemMoneyEditableSection.tsx`

#### Current Code (lines 50-61)
```tsx
<div className="flex flex-col items-end gap-2">
  <FormProvider form={form}>
    <TextInput
      required
      onChange={handleChange}
      onBlur={handleQuantityInputBlur}
      name="quantity"
      label="Quantity"
      className="max-w-[6ch] text-center"
    />
  </FormProvider>
  ...
</div>
```

#### Target Implementation
```tsx
import { IconButton } from "@/checkout/components/IconButton";
import { MinusIcon, PlusIcon } from "@/checkout/assets/icons";

// Inside component, add handlers:
const currentQty = parseInt(form.values.quantity) || 1;

const handleDecrement = () => {
  if (currentQty > 1) {
    form.setFieldValue("quantity", String(currentQty - 1));
    form.handleSubmit();
  }
};

const handleIncrement = () => {
  // Optionally check against line.variant.quantityAvailable
  form.setFieldValue("quantity", String(currentQty + 1));
  form.handleSubmit();
};

// In JSX, wrap TextInput with buttons:
<div className="flex items-center gap-1">
  <IconButton
    onClick={handleDecrement}
    disabled={currentQty <= 1}
    className="h-8 w-8"
  >
    <MinusIcon className="h-4 w-4" />
  </IconButton>

  <TextInput
    required
    onChange={handleChange}
    onBlur={handleQuantityInputBlur}
    name="quantity"
    label="Qty"
    className="max-w-[5ch] text-center"
  />

  <IconButton
    onClick={handleIncrement}
    className="h-8 w-8"
  >
    <PlusIcon className="h-4 w-4" />
  </IconButton>
</div>
```

#### Files to Reference
- `storefront/src/checkout/components/IconButton.tsx` - Button component
- `storefront/src/checkout/assets/icons/index.ts` - Icon exports
- `storefront/src/checkout/sections/Summary/useSummaryItemForm.ts` - Form hook (already handles mutation)
- `storefront/src/checkout/graphql/checkout.graphql:198-211` - checkoutLinesUpdate mutation

#### Testing
1. Add item to cart
2. Click + button → quantity increases, price updates
3. Click - button → quantity decreases (min 1)
4. Manually type quantity → still works
5. Check mobile layout fits

---

### 2. Price Sync Dashboard (Inventory-Ops) - 2-3 days

**Impact**: Ops team can't trigger/monitor syncs without CLI
**Status**: price-sync worker exists, needs UI in inventory-ops

#### Files to Create

**1. tRPC Router Module**
`saleor-apps/apps/inventory-ops/src/modules/price-sync/price-sync-router.ts`

```typescript
import { z } from "zod";
import { protectedClientProcedure } from "@/modules/trpc/protected-client-procedure";
import { router } from "@/modules/trpc/trpc-server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const priceSyncRouter = router({
  // Get current sync status and stats
  getStatus: protectedClientProcedure.query(async ({ ctx }) => {
    const { prisma, installationId } = ctx;

    // Get latest snapshot timestamp
    const latestSnapshot = await prisma.sellPriceSnapshot.findFirst({
      where: { installationId },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true, source: true },
    });

    // Get counts
    const [totalVariants, recentUpdates] = await Promise.all([
      prisma.sellPriceSnapshot.count({ where: { installationId } }),
      prisma.sellPriceSnapshot.count({
        where: {
          installationId,
          snapshotAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      lastSyncAt: latestSnapshot?.snapshotAt?.toISOString() ?? null,
      lastSyncSource: latestSnapshot?.source ?? null,
      totalVariantsWithPrices: totalVariants,
      updatedLast24h: recentUpdates,
      status: "idle", // Could track running jobs in separate table
    };
  }),

  // Get sync history (aggregated by day/hour)
  getHistory: protectedClientProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const { prisma, installationId } = ctx;

      // Get recent snapshots grouped by approximate sync time
      const snapshots = await prisma.sellPriceSnapshot.findMany({
        where: { installationId },
        orderBy: { snapshotAt: "desc" },
        take: input.limit,
        skip: input.offset,
        select: {
          id: true,
          snapshotAt: true,
          source: true,
          currentPrice: true,
          saleorVariantId: true,
        },
      });

      const total = await prisma.sellPriceSnapshot.count({
        where: { installationId },
      });

      return {
        snapshots,
        total,
        hasMore: input.offset + input.limit < total,
      };
    }),

  // Trigger full sync (spawns CLI command)
  triggerFull: protectedClientProcedure.mutation(async () => {
    // Note: In production, use a job queue instead of direct exec
    const cmd = "docker compose --profile tools run -d --rm price-sync node dist/index.mjs full";
    try {
      await execAsync(cmd, { cwd: "/home/michael/saleor-platform" });
      return { success: true, message: "Full sync started" };
    } catch (error) {
      return { success: false, message: String(error) };
    }
  }),

  // Trigger delta sync
  triggerDelta: protectedClientProcedure
    .input(z.object({
      lookbackDays: z.number().min(1).max(30).optional().default(7),
      limit: z.number().min(1).max(1000).optional().default(500),
    }))
    .mutation(async ({ input }) => {
      const cmd = `docker compose --profile tools run -d --rm price-sync node dist/index.mjs delta --lookback ${input.lookbackDays} --limit ${input.limit}`;
      try {
        await execAsync(cmd, { cwd: "/home/michael/saleor-platform" });
        return { success: true, message: "Delta sync started" };
      } catch (error) {
        return { success: false, message: String(error) };
      }
    }),

  // Trigger single variant sync
  triggerVariant: protectedClientProcedure
    .input(z.object({ variantId: z.string() }))
    .mutation(async ({ input }) => {
      const cmd = `docker compose --profile tools run --rm price-sync node dist/index.mjs variant ${input.variantId}`;
      try {
        const { stdout } = await execAsync(cmd, { cwd: "/home/michael/saleor-platform" });
        return { success: true, output: stdout };
      } catch (error) {
        return { success: false, message: String(error) };
      }
    }),
});
```

**2. Module Index**
`saleor-apps/apps/inventory-ops/src/modules/price-sync/index.ts`

```typescript
export { priceSyncRouter } from "./price-sync-router";
```

**3. Dashboard Page**
`saleor-apps/apps/inventory-ops/src/pages/price-sync/index.tsx`

```tsx
import { Layout } from "@saleor/apps-ui";
import { Box, Button, Text, Skeleton } from "@saleor/macaw-ui";
import { NextPage } from "next";
import { trpcClient } from "@/modules/trpc/trpc-client";
import { useState } from "react";

const PriceSyncPage: NextPage = () => {
  const { data: status, isLoading, refetch } = trpcClient.priceSync.getStatus.useQuery();
  const triggerFull = trpcClient.priceSync.triggerFull.useMutation();
  const triggerDelta = trpcClient.priceSync.triggerDelta.useMutation();
  const [message, setMessage] = useState<string | null>(null);

  const handleFullSync = async () => {
    const result = await triggerFull.mutateAsync();
    setMessage(result.message);
    setTimeout(() => refetch(), 2000);
  };

  const handleDeltaSync = async () => {
    const result = await triggerDelta.mutateAsync({ lookbackDays: 7, limit: 500 });
    setMessage(result.message);
    setTimeout(() => refetch(), 2000);
  };

  return (
    <Box padding={6}>
      <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={6}>
        <Text as="h1" size={10} fontWeight="bold">Price Sync Dashboard</Text>
        <Box display="flex" gap={2}>
          <Button onClick={handleDeltaSync} disabled={triggerDelta.isPending} variant="secondary">
            {triggerDelta.isPending ? "Starting..." : "Delta Sync"}
          </Button>
          <Button onClick={handleFullSync} disabled={triggerFull.isPending}>
            {triggerFull.isPending ? "Starting..." : "Full Sync"}
          </Button>
        </Box>
      </Box>

      {message && (
        <Box marginBottom={4} padding={3} backgroundColor="default1" borderRadius={2}>
          <Text>{message}</Text>
        </Box>
      )}

      <Layout.AppSection heading="Sync Status">
        <Layout.AppSectionCard>
          {isLoading ? (
            <Skeleton />
          ) : (
            <Box display="grid" gridTemplateColumns={4} gap={4}>
              <Box>
                <Text size={3} color="default2">Last Sync</Text>
                <Text size={5} fontWeight="bold">
                  {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "Never"}
                </Text>
              </Box>
              <Box>
                <Text size={3} color="default2">Source</Text>
                <Text size={5} fontWeight="bold">{status?.lastSyncSource ?? "N/A"}</Text>
              </Box>
              <Box>
                <Text size={3} color="default2">Total Prices</Text>
                <Text size={5} fontWeight="bold">{status?.totalVariantsWithPrices?.toLocaleString()}</Text>
              </Box>
              <Box>
                <Text size={3} color="default2">Updated (24h)</Text>
                <Text size={5} fontWeight="bold">{status?.updatedLast24h?.toLocaleString()}</Text>
              </Box>
            </Box>
          )}
        </Layout.AppSectionCard>
      </Layout.AppSection>
    </Box>
  );
};

export default PriceSyncPage;
```

**4. History Page**
`saleor-apps/apps/inventory-ops/src/pages/price-sync/history.tsx`

```tsx
import { Layout } from "@saleor/apps-ui";
import { Box, Text, Button } from "@saleor/macaw-ui";
import { NextPage } from "next";
import { trpcClient } from "@/modules/trpc/trpc-client";
import { useState } from "react";

const PriceSyncHistoryPage: NextPage = () => {
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading } = trpcClient.priceSync.getHistory.useQuery({
    limit,
    offset: page * limit,
  });

  return (
    <Box padding={6}>
      <Text as="h1" size={10} fontWeight="bold" marginBottom={6}>Sync History</Text>

      <Layout.AppSection heading="Recent Price Updates">
        <Layout.AppSectionCard>
          {isLoading ? (
            <Text>Loading...</Text>
          ) : (
            <>
              <Box as="table" width="100%">
                <thead>
                  <tr>
                    <th>Variant ID</th>
                    <th>Price</th>
                    <th>Source</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.snapshots.map((s) => (
                    <tr key={s.id}>
                      <td>{s.saleorVariantId}</td>
                      <td>${Number(s.currentPrice).toFixed(2)}</td>
                      <td>{s.source}</td>
                      <td>{new Date(s.snapshotAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>
              <Box display="flex" justifyContent="space-between" marginTop={4}>
                <Button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                  Previous
                </Button>
                <Text>Page {page + 1}</Text>
                <Button onClick={() => setPage(p => p + 1)} disabled={!data?.hasMore}>
                  Next
                </Button>
              </Box>
            </>
          )}
        </Layout.AppSectionCard>
      </Layout.AppSection>
    </Box>
  );
};

export default PriceSyncHistoryPage;
```

#### Files to Modify

**1. Register Router**
`saleor-apps/apps/inventory-ops/src/modules/trpc/trpc-router.ts`

```typescript
// Add import
import { priceSyncRouter } from "@/modules/price-sync";

// Add to router definition
export const trpcRouter = router({
  // ... existing routers
  priceSync: priceSyncRouter,
});
```

**2. Add Navigation**
`saleor-apps/apps/inventory-ops/src/ui/components/app-layout.tsx`

```typescript
// Add to navItems or reportItems array:
{ href: "/price-sync", label: "Price Sync" },
{ href: "/price-sync/history", label: "Sync History" },
```

**3. Whitelist Routes**
`saleor-apps/apps/inventory-ops/src/pages/_app.tsx`

```typescript
// Add to allowedPathNames array:
"/price-sync",
"/price-sync/history",
```

#### Testing
1. Navigate to /price-sync in inventory-ops app
2. Verify status shows last sync time and counts
3. Click "Delta Sync" → verify job starts
4. Click "Full Sync" → verify job starts
5. Check /price-sync/history shows recent updates

---

### 3. Buylist Rule Preview UI (Buylist App) - 2 days

**Impact**: Users can't test rules before deploying
**Status**: `pricing.rules.preview` tRPC endpoint exists, no UI surface

#### Option A: Standalone Test Page (Recommended)

**File to Create**
`saleor-apps/apps/buylist/src/pages/pricing/rules/test.tsx`

```tsx
import { Layout } from "@saleor/apps-ui";
import { Box, Button, Text, Input, Select } from "@saleor/macaw-ui";
import { NextPage } from "next";
import { trpcClient } from "@/modules/trpc/trpc-client";
import { useState } from "react";

const RARITY_OPTIONS = [
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "mythic", label: "Mythic" },
];

const CONDITION_OPTIONS = [
  { value: "NM", label: "Near Mint", multiplier: 1.0 },
  { value: "LP", label: "Lightly Played", multiplier: 0.9 },
  { value: "MP", label: "Moderately Played", multiplier: 0.75 },
  { value: "HP", label: "Heavily Played", multiplier: 0.6 },
  { value: "DMG", label: "Damaged", multiplier: 0.4 },
];

const FINISH_OPTIONS = [
  { value: "nonfoil", label: "Non-Foil" },
  { value: "foil", label: "Foil" },
  { value: "etched", label: "Etched" },
];

interface PreviewResult {
  baseOffer: string;
  conditionMultiplier: number;
  afterCondition: string;
  finalOffer: string;
  appliedRules: Array<{
    ruleId: string;
    ruleName: string;
    actionType: string;
    offerBefore: string;
    offerAfter: string;
  }>;
  skippedRules: Array<{
    ruleId: string;
    ruleName: string;
    reason: string;
  }>;
}

const RuleTestPage: NextPage = () => {
  // Test inputs
  const [policyId, setPolicyId] = useState<string>("");
  const [marketPrice, setMarketPrice] = useState<string>("10.00");
  const [setCode, setSetCode] = useState<string>("MH3");
  const [rarity, setRarity] = useState<string>("rare");
  const [condition, setCondition] = useState<string>("NM");
  const [finish, setFinish] = useState<string>("nonfoil");
  const [qtyOnHand, setQtyOnHand] = useState<string>("0");

  // Results
  const [result, setResult] = useState<PreviewResult | null>(null);

  // Fetch policies for dropdown
  const { data: policies } = trpcClient.pricing.policies.list.useQuery();

  // Preview mutation
  const previewMutation = trpcClient.pricing.rules.preview.useMutation();

  const handlePreview = async () => {
    if (!policyId) return;

    const res = await previewMutation.mutateAsync({
      policyId,
      marketPrice: parseFloat(marketPrice),
      condition,
      attributes: {
        setCode,
        rarity,
        finish,
      },
      qtyOnHand: parseInt(qtyOnHand),
    });

    setResult(res as PreviewResult);
  };

  return (
    <Box padding={6}>
      <Text as="h1" size={10} fontWeight="bold" marginBottom={6}>
        Rule Preview Calculator
      </Text>

      <Box display="grid" gridTemplateColumns={2} gap={6}>
        {/* Input Panel */}
        <Layout.AppSection heading="Test Inputs">
          <Layout.AppSectionCard>
            <Box display="flex" flexDirection="column" gap={4}>
              {/* Policy Selector */}
              <Box>
                <Text size={3} marginBottom={1}>Pricing Policy</Text>
                <Select
                  value={policyId}
                  onChange={(e) => setPolicyId(e.target.value)}
                  options={policies?.map(p => ({ value: p.id, label: p.name })) ?? []}
                />
              </Box>

              {/* Market Price */}
              <Box>
                <Text size={3} marginBottom={1}>Market Price ($)</Text>
                <Input
                  type="number"
                  step="0.01"
                  value={marketPrice}
                  onChange={(e) => setMarketPrice(e.target.value)}
                />
              </Box>

              {/* Set Code */}
              <Box>
                <Text size={3} marginBottom={1}>Set Code</Text>
                <Input
                  value={setCode}
                  onChange={(e) => setSetCode(e.target.value.toUpperCase())}
                  placeholder="MH3, ONE, DMU..."
                />
              </Box>

              {/* Rarity */}
              <Box>
                <Text size={3} marginBottom={1}>Rarity</Text>
                <Select
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value)}
                  options={RARITY_OPTIONS}
                />
              </Box>

              {/* Condition */}
              <Box>
                <Text size={3} marginBottom={1}>Condition</Text>
                <Select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  options={CONDITION_OPTIONS}
                />
              </Box>

              {/* Finish */}
              <Box>
                <Text size={3} marginBottom={1}>Finish</Text>
                <Select
                  value={finish}
                  onChange={(e) => setFinish(e.target.value)}
                  options={FINISH_OPTIONS}
                />
              </Box>

              {/* Qty On Hand */}
              <Box>
                <Text size={3} marginBottom={1}>Current Inventory</Text>
                <Input
                  type="number"
                  value={qtyOnHand}
                  onChange={(e) => setQtyOnHand(e.target.value)}
                />
              </Box>

              <Button onClick={handlePreview} disabled={!policyId || previewMutation.isPending}>
                {previewMutation.isPending ? "Calculating..." : "Calculate Offer"}
              </Button>
            </Box>
          </Layout.AppSectionCard>
        </Layout.AppSection>

        {/* Results Panel */}
        <Layout.AppSection heading="Preview Results">
          <Layout.AppSectionCard>
            {result ? (
              <Box display="flex" flexDirection="column" gap={4}>
                {/* Offer Breakdown */}
                <Box padding={4} backgroundColor="default1" borderRadius={2}>
                  <Box display="grid" gridTemplateColumns={2} gap={2}>
                    <Text>Market Price:</Text>
                    <Text fontWeight="bold">${marketPrice}</Text>
                    <Text>Base Offer:</Text>
                    <Text fontWeight="bold">${result.baseOffer}</Text>
                    <Text>Condition ({condition}):</Text>
                    <Text fontWeight="bold">×{result.conditionMultiplier}</Text>
                    <Text>After Condition:</Text>
                    <Text fontWeight="bold">${result.afterCondition}</Text>
                  </Box>
                </Box>

                {/* Applied Rules */}
                {result.appliedRules.length > 0 && (
                  <Box>
                    <Text size={4} fontWeight="bold" marginBottom={2}>
                      Rules Applied ({result.appliedRules.length})
                    </Text>
                    {result.appliedRules.map((rule, i) => (
                      <Box key={i} padding={2} marginBottom={1} backgroundColor="success1" borderRadius={1}>
                        <Text fontWeight="bold">{rule.ruleName}</Text>
                        <Text size={2}>
                          {rule.actionType}: ${rule.offerBefore} → ${rule.offerAfter}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Skipped Rules */}
                {result.skippedRules.length > 0 && (
                  <Box>
                    <Text size={4} fontWeight="bold" marginBottom={2}>
                      Rules Not Applied ({result.skippedRules.length})
                    </Text>
                    {result.skippedRules.map((rule, i) => (
                      <Box key={i} padding={2} marginBottom={1} backgroundColor="default2" borderRadius={1}>
                        <Text>{rule.ruleName}</Text>
                        <Text size={2} color="default2">{rule.reason}</Text>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Final Offer */}
                <Box padding={4} backgroundColor="accent1" borderRadius={2}>
                  <Text size={3}>Final Offer</Text>
                  <Text size={8} fontWeight="bold">${result.finalOffer}</Text>
                </Box>
              </Box>
            ) : (
              <Text color="default2">
                Enter test values and click "Calculate Offer" to preview rule effects
              </Text>
            )}
          </Layout.AppSectionCard>
        </Layout.AppSection>
      </Box>
    </Box>
  );
};

export default RuleTestPage;
```

#### Files to Modify

**1. Add Navigation Link**
`saleor-apps/apps/buylist/src/pages/_app.tsx` or navigation component

```typescript
// Add to allowedPathNames:
"/pricing/rules/test",
```

**2. Add Link in Rules List Page**
`saleor-apps/apps/buylist/src/pages/pricing/rules/index.tsx`

```tsx
// Add button in header area:
<Link href="/pricing/rules/test">
  <Button variant="secondary">Test Rules</Button>
</Link>
```

#### Option B: Inline Preview in Edit Page

Add a collapsible preview panel to the existing edit page:
`saleor-apps/apps/buylist/src/pages/pricing/rules/[id]/edit.tsx`

This would show live preview as user edits the rule, but requires more complex state management.

#### Existing tRPC Endpoint (Reference)
`saleor-apps/apps/buylist/src/modules/pricing/rules-router.ts`

The `preview` endpoint already exists and accepts:
```typescript
{
  policyId: string;
  ruleId?: string;  // Optional: preview specific rule
  marketPrice: number;
  condition: string;
  attributes: Record<string, string>;
  qtyOnHand?: number;
}
```

#### Testing
1. Navigate to /pricing/rules/test
2. Select a pricing policy
3. Enter test card details (MH3, mythic, NM, $50)
4. Click "Calculate Offer"
5. Verify applied/skipped rules display correctly
6. Change inputs and recalculate to see different rule matches

---

### 4. Buylist → Cost Event Integration - 2-3 days (can defer)

**Impact**: Card buybacks don't update cost layer
**Status**: Schema ready (`BUYLIST_RECEIPT` event type exists), posting logic missing
**Can defer**: Manual stock adjustments in inventory-ops can capture buylist costs as workaround

#### Architecture Decision

The buylist and inventory-ops apps share the same Prisma database. The cost layer integration can be done by:

1. **Option A**: Direct database write from buylist app (simpler, chosen approach)
2. **Option B**: HTTP call to inventory-ops API (more decoupled, more overhead)

#### File to Modify
`saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts`

#### Changes to `createAndPay` Mutation

After the buylist is marked as PAID, add cost layer event creation:

```typescript
// In createAndPay mutation, after setting status to PAID:

// Import WAC service (or copy the calculation logic)
import { Decimal } from "@prisma/client/runtime/library";

// For each buylist line, create a BUYLIST_RECEIPT cost layer event
for (const line of buylist.lines) {
  // Get current WAC for this variant/warehouse
  const currentWac = await getWacForVariant(
    prisma,
    installationId,
    line.saleorVariantId,
    warehouseId
  );

  // Calculate new WAC after adding buylist inventory
  // WAC = (existingQty × existingWAC + newQty × newCost) / (existingQty + newQty)
  const existingQty = currentWac.qtyOnHand;
  const existingWac = new Decimal(currentWac.wac);
  const newQty = line.quantity;
  const newCost = new Decimal(line.unitPrice); // Price paid to customer

  const totalQty = existingQty + newQty;
  const newWac = totalQty > 0
    ? existingQty.times(existingWac).plus(new Decimal(newQty).times(newCost)).dividedBy(totalQty)
    : newCost;

  // Create cost layer event
  await prisma.costLayerEvent.create({
    data: {
      installationId,
      eventType: "BUYLIST_RECEIPT",
      saleorVariantId: line.saleorVariantId,
      saleorWarehouseId: warehouseId,
      qtyDelta: newQty,
      unitCost: newCost,
      currency: buylist.currency,
      wacAtEvent: newWac,
      qtyOnHandAtEvent: totalQty,
      totalValueAtEvent: new Decimal(totalQty).times(newWac),
      eventTimestamp: new Date(),
      // Link to buylist for audit trail
      sourceBuylistId: buylist.id,
      sourceBuylistLineId: line.id,
    },
  });

  // Update Saleor stock (increase inventory)
  await saleorClient.updateStock({
    variantId: line.saleorVariantId,
    warehouseId,
    quantityDelta: newQty,
  });
}
```

#### Schema Notes (Already Exists)
`saleor-apps/apps/inventory-ops/prisma/schema.prisma`

```prisma
enum CostEventType {
  // ... existing types
  BUYLIST_RECEIPT           // ← Already defined
  BUYLIST_RECEIPT_REVERSAL  // ← For refunds/cancellations
}

model CostLayerEvent {
  // ... existing fields
  sourceBuylistId     String?  // Add FK to buylist
  sourceBuylistLineId String?  // Add FK to buylist line
}
```

#### Helper Function (Create or Import)
```typescript
async function getWacForVariant(
  prisma: PrismaClient,
  installationId: string | string[],
  variantId: string,
  warehouseId: string
): Promise<{ wac: string; qtyOnHand: number }> {
  // Find the most recent cost layer event for this variant/warehouse
  const lastEvent = await prisma.costLayerEvent.findFirst({
    where: {
      installationId: Array.isArray(installationId)
        ? { in: installationId }
        : installationId,
      saleorVariantId: variantId,
      saleorWarehouseId: warehouseId,
    },
    orderBy: { eventTimestamp: "desc" },
    select: {
      wacAtEvent: true,
      qtyOnHandAtEvent: true,
    },
  });

  return {
    wac: lastEvent?.wacAtEvent?.toString() ?? "0",
    qtyOnHand: lastEvent?.qtyOnHandAtEvent ?? 0,
  };
}
```

#### Testing
1. Create a buylist with 2-3 lines
2. Process to PAID status
3. Check `CostLayerEvent` table for `BUYLIST_RECEIPT` events
4. Verify WAC calculation is correct
5. Verify Saleor stock increased

---

## Implementation Order

| Phase | Task | Days | Blocking? |
|-------|------|------|-----------|
| 1 | Cart quantity adjustment | 1 | Yes - UX issue |
| 2 | Price sync dashboard | 2-3 | Yes - ops blocker |
| 3 | Rule preview UI | 2 | No - API works |
| 4 | Buylist cost integration | 2-3 | No - workaround exists |

**Total: 7-9 days to full MVP**

---

## What's Already Working (No Changes Needed)

- ✅ Order.fulfilled → COGS webhook (fully implemented!)
- ✅ WAC calculation and cost layer ledger
- ✅ Purchase orders → Goods receipts → Cost events
- ✅ Stock adjustments with cost tracking
- ✅ Scryfall price sync (CLI: full/delta/variant)
- ✅ Buylist rule engine (all 5 action types)
- ✅ Condition builder with AND/OR logic
- ✅ Time-based rule activation
- ✅ Stripe checkout with account creation
- ✅ MTG card display (set icons, mana symbols, attributes)
- ✅ Search and filtering
- ✅ Mobile responsive design

---

## Quick Reference: Files to Create

```
storefront/
└── (none - modify only)

saleor-apps/apps/inventory-ops/
├── src/modules/price-sync/
│   ├── price-sync-router.ts    # NEW
│   └── index.ts                # NEW
└── src/pages/price-sync/
    ├── index.tsx               # NEW
    └── history.tsx             # NEW

saleor-apps/apps/buylist/
└── src/pages/pricing/rules/
    └── test.tsx                # NEW
```

## Quick Reference: Files to Modify

```
storefront/
└── src/checkout/sections/Summary/
    └── SummaryItemMoneyEditableSection.tsx  # Add +/- buttons

saleor-apps/apps/inventory-ops/
├── src/modules/trpc/trpc-router.ts          # Register priceSyncRouter
├── src/ui/components/app-layout.tsx         # Add nav items
└── src/pages/_app.tsx                       # Whitelist routes

saleor-apps/apps/buylist/
├── src/modules/buylists/buylists-router.ts  # Add cost event creation
├── src/pages/pricing/rules/index.tsx        # Add "Test Rules" button
└── src/pages/_app.tsx                       # Whitelist /pricing/rules/test
```

---

## Session Pickup Instructions

When resuming work:

1. **Read this plan** at `/home/michael/.claude/plans/eager-herding-cookie.md`
2. **Start with Phase 1** (Cart quantity) - smallest, highest impact
3. **Verify branch**: `git branch --show-current` should be `platform/main`
4. **Run tests** after each phase before committing

Commands to get started:
```bash
cd /home/michael/saleor-platform
git branch --show-current  # Verify on platform/main
docker compose ps          # Verify services running
```
