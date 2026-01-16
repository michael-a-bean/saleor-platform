# IMPLEMENTATION BRIEFING — Staging Audit Remediation Council

**Date:** 2026-01-16
**Source:** Expert Council Analysis of `docs/ops/audits/2026-01-16-staging-audit.md`
**Status:** Ready for Implementation
**Priority:** Production Launch Blocker

---

## Mission Statement

This document provides complete implementation specifications for remediating 30+ issues identified in the staging production readiness audit. A council of 5 domain experts has analyzed each issue and provided production-ready code solutions.

**Objective:** Bring the Saleor Hobby Gaming Platform to production-ready state by implementing the fixes detailed below.

---

## Council Composition for Implementation

The implementation council should include the following roles:

| Role | Responsibilities | Key Sections |
|------|------------------|--------------|
| **Backend Engineer** | Race conditions, transactions, financial operations | Phase 2 |
| **Security Engineer** | Encryption keys, CSP, secrets management | Phase 0 |
| **DevOps/Infrastructure** | Terraform, ECS, RDS, auto-scaling | Phase 1 |
| **Frontend Engineer** | Storefront, Next.js, error handling | Phase 0, 3 |
| **POS Engineer** | Offline sync, hardware, Square integration | Phase 3, 4 |

---

## Implementation Phases

### Phase 0: Pre-Launch Blockers (MANDATORY)

These issues MUST be resolved before any production traffic. Estimated: 1-2 days.

---

#### P0-1: Remove Hardcoded Encryption Keys (CRITICAL)

**Severity:** CRITICAL - Security Breach Risk
**Files:**
- `scripts/setup-stripe-config.js:4`
- `scripts/fix-stripe-config.js:30`
- `scripts/fix-stripe-config.sh:17`
- `scripts/stripe-config-helper.mjs:15`

**Current State:**
```javascript
// VULNERABLE - hardcoded 256-bit key
const SECRET_KEY = '677a28c7a3f6f9b615a3dbe4657d0cf816080e482a432892f0b4c5f07dce0b54';
```

**Required Fix:**
```javascript
// scripts/setup-stripe-config.js - FIXED
const crypto = require('crypto');

const SECRET_KEY = process.env.SECRET_KEY;
if (!SECRET_KEY) {
  console.error('ERROR: SECRET_KEY environment variable is required');
  console.error('Generate one with: openssl rand -hex 32');
  process.exit(1);
}

if (!/^[a-f0-9]{64}$/i.test(SECRET_KEY)) {
  console.error('ERROR: SECRET_KEY must be a 64-character hex string (256 bits)');
  process.exit(1);
}
```

**Deployment Steps:**
1. Remove hardcoded keys from all 4 files
2. Generate new key: `openssl rand -hex 32`
3. Store in AWS SSM: `/saleor-{env}/stripe/SECRET_KEY`
4. Re-encrypt all existing Stripe configurations
5. Verify Stripe app functionality

**Verification:**
```bash
grep -r "677a28c7a3f6f9b615a3dbe4657d0cf816080e482a432892f0b4c5f07dce0b54" scripts/
# Expected: No matches

unset SECRET_KEY && node scripts/fix-stripe-config.js --help
# Expected: ERROR about missing SECRET_KEY
```

---

#### P0-2: Add Checkout Page Dynamic Flag

**Severity:** Build Blocker
**File:** `storefront/src/app/checkout/page.tsx`

**Current State:** Missing `dynamic` export causes `DYNAMIC_SERVER_USAGE` build errors.

**Required Fix:**
```typescript
import Link from "next/link";
import { invariant } from "ts-invariant";
import { RootWrapper } from "./pageWrapper";

export const metadata = {
  title: "Checkout · Saleor Storefront example",
};

// ADD THIS LINE - Required for searchParams access
export const dynamic = "force-dynamic";

export default async function CheckoutPage(props: {
  searchParams: Promise<{ checkout?: string; order?: string }>;
}) {
  // ... rest unchanged
}
```

**Verification:**
```bash
cd storefront && pnpm build
# Expected: Build succeeds without DYNAMIC_SERVER_USAGE error
```

---

#### P0-3: Add Global Error Boundary

**Severity:** App Crash Risk
**File:** `storefront/src/app/global-error.tsx` (NEW FILE)

**Required Implementation:**
```typescript
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <html lang="en">
      <body className="min-h-dvh bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
              Something went wrong
            </h1>
            <p className="mt-6 text-base leading-7 text-neutral-600">
              We encountered an unexpected error. Our team has been notified.
            </p>
            {isDevelopment && error.message && (
              <pre className="mt-4 max-w-2xl mx-auto text-left text-sm bg-red-50 text-red-800 p-4 rounded overflow-x-auto">
                {error.message}
                {error.digest && `\n\nDigest: ${error.digest}`}
              </pre>
            )}
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <button
                onClick={() => reset()}
                className="rounded-md bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-md border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
```

---

#### P0-4: Implement CSP Headers Middleware

**Severity:** XSS Vulnerability
**File:** `storefront/src/middleware.ts`

**Required Implementation:**
```typescript
import { NextRequest, NextResponse } from "next/server";

const TRUSTED_SCRIPT_DOMAINS = [
  "https://js.stripe.com",
  "https://www.googletagmanager.com",
];

const TRUSTED_FRAME_DOMAINS = [
  "https://js.stripe.com",
  "https://hooks.stripe.com",
];

const TRUSTED_CONNECT_DOMAINS = [
  "https://api.stripe.com",
  "https://api.scryfall.com",
  process.env.NEXT_PUBLIC_SALEOR_API_URL?.replace('/graphql/', '') || "http://localhost:8000",
];

const TRUSTED_IMAGE_DOMAINS = [
  "https://cards.scryfall.io",
  "https://c2.scryfall.com",
  process.env.NEXT_PUBLIC_SALEOR_API_URL?.replace('/graphql/', '') || "http://localhost:8000",
];

function buildCSP(): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${TRUSTED_SCRIPT_DOMAINS.join(' ')} 'unsafe-inline' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: ${TRUSTED_IMAGE_DOMAINS.join(' ')}`,
    "font-src 'self' https://fonts.gstatic.com data:",
    `connect-src 'self' ${TRUSTED_CONNECT_DOMAINS.join(' ')} wss://*.saleor.cloud`,
    `frame-src 'self' ${TRUSTED_FRAME_DOMAINS.join(' ')}`,
    "frame-ancestors 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    process.env.NODE_ENV === 'production' ? "upgrade-insecure-requests" : "",
  ].filter(Boolean).join('; ');
}

function getSecurityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": buildCSP(),
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
  };
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const securityHeaders = getSecurityHeaders();
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

---

#### P0-5: Add Offline Transaction Idempotency

**Severity:** Duplicate Order Risk
**Files:**
- `saleor-apps/apps/pos/src/lib/offline/db.ts`
- `saleor-apps/apps/pos/src/lib/offline/transaction-queue.ts`
- `saleor-apps/apps/pos/src/lib/offline/OfflineProviderWithSync.tsx`

**Step 1 - Update Interface (db.ts):**
```typescript
export interface QueuedTransaction {
  localId: string;
  idempotencyKey: string; // NEW FIELD
  transactionNumber: string;
  // ... rest unchanged
}
```

**Step 2 - Generate Key (transaction-queue.ts):**
```typescript
async createTransaction(data: {...}): Promise<QueuedTransaction> {
  const localId = crypto.randomUUID();
  const idempotencyKey = `pos-offline-${localId}-${Date.now()}`; // NEW

  const transaction: QueuedTransaction = {
    localId,
    idempotencyKey, // NEW
    // ... rest unchanged
  };

  await db.transactions.add(transaction);
  return transaction;
}
```

**Step 3 - Pass During Sync (OfflineProviderWithSync.tsx):**
```typescript
const result = await createFromOffline.mutateAsync({
  idempotencyKey: transaction.idempotencyKey, // NEW
  // ... rest unchanged
});
```

**Step 4 - Server Check (transactions-router.ts):**
```typescript
createFromOffline: protectedClientProcedure
  .input(z.object({
    idempotencyKey: z.string().min(1),
    // ...
  }))
  .mutation(async ({ ctx, input }) => {
    // Check for existing
    const existing = await prisma.posTransaction.findFirst({
      where: {
        installationId: ctx.installationId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (existing) {
      return { transaction: existing, wasIdempotent: true };
    }

    // Create new with idempotencyKey stored
    const transaction = await prisma.posTransaction.create({
      data: {
        installationId: ctx.installationId,
        idempotencyKey: input.idempotencyKey,
        // ...
      },
    });

    return { transaction, wasIdempotent: false };
  }),
```

---

#### P0-6: Block Buylist Cancellation After Payment

**Severity:** Financial Loss Risk
**File:** `saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts:1081-1128`

**Required Fix:**
```typescript
cancel: protectedClientProcedure
  .input(z.object({
    id: z.string().uuid(),
    reason: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const buylist = await ctx.prisma.buylist.findFirst({
      where: {
        id: input.id,
        installationId: ctx.installationId,
      },
      include: {
        payouts: {
          where: { status: "COMPLETED" },
        },
      },
    });

    if (!buylist) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Buylist not found" });
    }

    if (buylist.status === "COMPLETED") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Cannot cancel completed buylists",
      });
    }

    // NEW: Block cancellation after payout
    if (buylist.payouts.length > 0 || buylist.paidAt) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Cannot cancel buylist after payout. Use 'void' operation to reverse.",
      });
    }

    // ... rest of cancel logic
  }),
```

---

### Phase 1: Infrastructure (Week 1)

---

#### P1-1: ECS Auto-Scaling

**File:** `infra/terraform/modules/ecs/main.tf`

**Add to module:**
```hcl
# Auto Scaling Target for API
resource "aws_appautoscaling_target" "api" {
  count = var.enable_autoscaling ? 1 : 0

  max_capacity       = var.api_max_capacity
  min_capacity       = var.api_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU Scaling Policy
resource "aws_appautoscaling_policy" "api_cpu" {
  count = var.enable_autoscaling ? 1 : 0

  name               = "${local.name_prefix}-api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api[0].resource_id
  scalable_dimension = aws_appautoscaling_target.api[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.api[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

**Variables to add:**
```hcl
variable "enable_autoscaling" {
  type    = bool
  default = false
}

variable "api_min_capacity" {
  type    = number
  default = 2
}

variable "api_max_capacity" {
  type    = number
  default = 10
}
```

**Deployment:**
```bash
cd infra/terraform/environments/staging
terraform plan -var="enable_autoscaling=true" -out=scaling.plan
terraform apply scaling.plan
```

---

#### P1-2: RDS Proxy for Connection Pooling

**File:** `infra/terraform/modules/rds/main.tf`

**Add RDS Proxy:**
```hcl
resource "aws_db_proxy" "main" {
  count = var.enable_rds_proxy ? 1 : 0

  name                   = "${local.name_prefix}-rds-proxy"
  debug_logging          = var.environment != "production"
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy[0].arn
  vpc_security_group_ids = [aws_security_group.rds_proxy[0].id]
  vpc_subnet_ids         = var.private_subnet_ids

  auth {
    auth_scheme               = "SECRETS"
    iam_auth                  = "DISABLED"
    secret_arn                = var.db_credentials_secret_arn
    client_password_auth_type = "POSTGRES_SCRAM_SHA_256"
  }
}

resource "aws_db_proxy_default_target_group" "main" {
  count = var.enable_rds_proxy ? 1 : 0

  db_proxy_name = aws_db_proxy.main[0].name

  connection_pool_config {
    connection_borrow_timeout    = 120
    max_connections_percent      = 100
    max_idle_connections_percent = 50
  }
}

resource "aws_db_proxy_target" "main" {
  count = var.enable_rds_proxy ? 1 : 0

  db_instance_identifier = aws_db_instance.main.identifier
  db_proxy_name          = aws_db_proxy.main[0].name
  target_group_name      = aws_db_proxy_default_target_group.main[0].name
}
```

**Prerequisites:**
```bash
# Create secrets manager secret for DB credentials
aws secretsmanager create-secret \
  --name saleor-staging/rds/credentials \
  --secret-string '{"username":"saleor","password":"<PASSWORD>"}'
```

---

#### P1-3: Increase max_connections

**File:** `infra/terraform/modules/rds/main.tf`

**Update parameter:**
```hcl
parameter {
  name         = "max_connections"
  value        = var.max_connections  # Change from hardcoded "200"
  apply_method = "pending-reboot"
}
```

**Variable:**
```hcl
variable "max_connections" {
  type    = number
  default = 400  # Increased from 200
}
```

**Note:** Requires RDS reboot during maintenance window.

---

### Phase 2: Data Integrity (Week 1-2)

---

#### P2-1: WAC Race Condition Fix

**Files:**
- `saleor-apps/apps/inventory-ops/src/modules/cost-layers/wac-service.ts`
- NEW: `saleor-apps/apps/inventory-ops/src/modules/cost-layers/wac-service-transactional.ts`

**Solution:** Optimistic concurrency with unique constraint on `previousEventId`.

**Step 1 - Prisma Schema Migration:**
```prisma
model CostLayerEvent {
  // ... existing fields
  previousEventId String? @map("previous_event_id")

  @@unique([installationId, saleorVariantId, saleorWarehouseId, previousEventId], name: "unique_cost_layer_chain")
}
```

**Step 2 - Transactional Wrapper:**
```typescript
// wac-service-transactional.ts
export async function createCostLayerEventWithConcurrencyControl(
  params: CreateCostLayerEventParams
): Promise<CostLayerEventResult> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const lastEvent = await tx.costLayerEvent.findFirst({
            where: {
              installationId: params.installationId,
              saleorVariantId: params.saleorVariantId,
              saleorWarehouseId: params.saleorWarehouseId,
            },
            orderBy: { eventTimestamp: "desc" },
          });

          // Calculate WAC...

          const newEvent = await tx.costLayerEvent.create({
            data: {
              // ... fields
              previousEventId: lastEvent?.id ?? null, // CAS field
            },
          });

          return { eventId: newEvent.id, /* ... */ };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (isPrismaError(error) && (error.code === "P2002" || error.code === "P2034")) {
        if (attempt < MAX_RETRIES) {
          await sleep(50 * Math.pow(2, attempt));
          continue;
        }
      }
      throw error;
    }
  }
}
```

---

#### P2-2: Goods Receipt Transaction Wrapping

**File:** `saleor-apps/apps/inventory-ops/src/modules/goods-receipts/goods-receipts-router.ts:563-696`

**Required Change:** Wrap all operations in a single `prisma.$transaction()`:

```typescript
post: protectedClientProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    // Validation...

    const result = await ctx.prisma.$transaction(
      async (tx) => {
        for (const line of gr.lines) {
          // 1. Create posting record
          // 2. Call Saleor API (with idempotency)
          // 3. Create cost layer event
          // 4. Update PO line
        }

        // Update GR status
        const updatedGr = await tx.goodsReceipt.update({
          where: { id: input.id },
          data: { status: "POSTED", postedAt: new Date() },
        });

        // Update PO status
        await updatePOStatusInTransaction(tx, gr.purchaseOrderId);

        return updatedGr;
      },
      { timeout: 60000 }
    );

    return result;
  }),
```

---

#### P2-3: Remove Duplicate Cost Events

**File:** `saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts:606-659`

**Required Change:** Remove cost layer event creation from `createAndPay`. Events should only be created in `verifyAndReceive`.

```typescript
// In createAndPay - REMOVE these lines (606-659):
// Cost layer events are created in boh.verifyAndReceive when cards are
// verified and stock is updated. This separates "payment" from "receiving".

// DELETE: for (const line of buylist.lines) { ... costLayerEvent.create ... }
```

---

### Phase 3: POS Reliability (Week 2)

---

#### P3-1: Cash Drawer Retry Logic

**File:** `saleor-apps/apps/pos/src/lib/hardware/printer.ts`

**Create hardware logger (new file: hardware-logger.ts):**
```typescript
class HardwareLogger {
  private logs: HardwareLogEntry[] = [];

  log(entry: Omit<HardwareLogEntry, "timestamp">): void {
    this.logs.push({ ...entry, timestamp: new Date() });
    const method = entry.level === "error" ? console.error : console.info;
    method(`[Hardware:${entry.device}] ${entry.action}`, entry);
  }
}

export const hardwareLogger = new HardwareLogger();
```

**Update openCashDrawer:**
```typescript
async openCashDrawer(): Promise<boolean> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const command = escpos().openCashDrawer().build();
      const success = await this.print(command);

      if (success) {
        hardwareLogger.log({
          level: "info",
          device: "cash_drawer",
          action: "open",
          success: true,
          retryCount: attempt - 1,
        });
        return true;
      }

      hardwareLogger.log({
        level: "warn",
        device: "cash_drawer",
        action: "open",
        success: false,
        retryCount: attempt,
      });
    } catch (error) {
      hardwareLogger.log({
        level: "warn",
        device: "cash_drawer",
        action: "open",
        success: false,
        error: error instanceof Error ? error.message : "Unknown",
        retryCount: attempt,
      });
    }

    if (attempt < maxRetries) {
      await sleep(200 * attempt);
    }
  }

  hardwareLogger.log({
    level: "error",
    device: "cash_drawer",
    action: "open",
    success: false,
    error: `Failed after ${maxRetries} attempts`,
  });

  return false;
}
```

---

#### P3-2: Square Checkout Monitor

**New File:** `saleor-apps/apps/pos/src/modules/square/terminal/checkout-monitor.ts`

**Core Implementation:**
```typescript
export class CheckoutMonitor {
  private pollTimer: NodeJS.Timeout | null = null;
  private pollCount = 0;
  private config = {
    pollIntervalMs: 5000,
    maxPollAttempts: 60,
    staleThresholdMs: 5 * 60 * 1000,
    autoCancelStale: true,
  };

  start(): void {
    this.isRunning = true;
    this.schedulePoll();
  }

  private async poll(): Promise<void> {
    this.pollCount++;

    const checkout = await getCheckoutStatus(this.checkoutId);

    if (checkout.status === "COMPLETED" || checkout.status === "CANCELED") {
      this.stop();
      this.onStatusChange(checkout, false);
      return;
    }

    if (this.isCheckoutStale(checkout)) {
      if (this.config.autoCancelStale) {
        await cancelCheckout(this.checkoutId);
      }
      this.onStatusChange(checkout, true);
    }
  }
}
```

---

#### P3-3: Network Printer Endpoints

**New Files:**
- `saleor-apps/apps/pos/src/app/api/print/connect/route.ts`
- `saleor-apps/apps/pos/src/app/api/print/print/route.ts`

**Connect Endpoint:**
```typescript
export async function POST(request: NextRequest) {
  const { address } = await request.json();
  const [host, portStr] = address.split(":");
  const port = portStr ? parseInt(portStr, 10) : 9100;

  const isReachable = await testPrinterConnection(host, port, 5000);

  if (isReachable) {
    printerConnections.set(address, { host, port, connected: true });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Connection failed" }, { status: 503 });
}
```

**Print Endpoint:**
```typescript
export async function POST(request: NextRequest) {
  const address = request.headers.get("X-Printer-Address");
  const data = await request.arrayBuffer();

  const success = await sendToPrinter(host, port, Buffer.from(data));

  return NextResponse.json({ success });
}
```

---

#### P3-4: Cart Stock Validation

**File:** `storefront/src/app/[channel]/(main)/cart/page.tsx`

**Step 1 - Update GraphQL Query (CheckoutFind.graphql):**
```graphql
variant {
  # ... existing fields
  quantityAvailable  # ADD THIS
}
```

**Step 2 - Add Validation Logic:**
```typescript
// Check stock availability
const stockIssues: StockIssue[] = [];
checkout.lines.forEach((item) => {
  const available = item.variant?.quantityAvailable ?? 0;
  if (available === 0) {
    stockIssues.push({
      lineId: item.id,
      productName: item.variant?.product?.name ?? "Unknown",
      type: "out_of_stock",
    });
  } else if (item.quantity > available) {
    stockIssues.push({
      lineId: item.id,
      productName: item.variant?.product?.name ?? "Unknown",
      requested: item.quantity,
      available,
      type: "insufficient_stock",
    });
  }
});

// Disable checkout button if issues
<CheckoutLink disabled={hasStockIssues} />
```

---

### Phase 4: Performance & Polish (Month 1)

---

#### P4-1: Image Optimization

**File:** `storefront/next.config.js`

```javascript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: process.env.SALEOR_MEDIA_HOST || 'localhost' },
    { protocol: 'https', hostname: 'cards.scryfall.io' },
    { protocol: 'https', hostname: 'c2.scryfall.com' },
  ],
  unoptimized: process.env.NODE_ENV === "development",
  formats: ["image/avif", "image/webp"],
},
```

---

#### P4-2: Dedicated Celery Beat Service

**File:** `infra/terraform/modules/ecs/main.tf`

Add separate task definition and service for Celery Beat without the `-B` flag on workers.

---

#### P4-3: RDS Read Replica

**File:** `infra/terraform/modules/rds/main.tf`

```hcl
resource "aws_db_instance" "read_replica" {
  count = var.create_read_replica ? 1 : 0

  identifier          = "${local.name_prefix}-saleor-replica-1"
  replicate_source_db = aws_db_instance.main.identifier
  instance_class      = var.read_replica_instance_class

  publicly_accessible = false
  multi_az            = false
  storage_encrypted   = true
}
```

---

#### P4-4: Product Cache Pagination

**File:** `saleor-apps/apps/pos/src/lib/offline/product-cache.ts`

Implement paginated sync with 50k product limit and incremental updates.

---

## Verification Checklist

### Pre-Launch Gate

- [ ] No hardcoded secrets in codebase (`grep -r "677a28c7" .`)
- [ ] Checkout page builds successfully
- [ ] Global error boundary renders on crash
- [ ] CSP headers present (`curl -I https://staging.example.com`)
- [ ] Offline transactions include idempotency key
- [ ] Buylist cancel blocked after payment

### Infrastructure Gate

- [ ] Auto-scaling triggers at 70% CPU
- [ ] RDS Proxy accepting connections
- [ ] max_connections = 400 confirmed
- [ ] Health checks passing with 10s timeout

### Data Integrity Gate

- [ ] WAC calculations survive concurrent writes
- [ ] GR posting is atomic (no partial posts)
- [ ] No duplicate cost events in database

### POS Gate

- [ ] Cash drawer retries and logs on failure
- [ ] Square checkout auto-cancels after timeout
- [ ] Network printer endpoints return 200

---

## Expert Agent References

For implementation questions or deeper consultation, resume these agents:

| Domain | Agent ID | Expertise |
|--------|----------|-----------|
| Backend | `afbafd9` | WAC, transactions, financial ops |
| Security | `a4f4dcb` | CSP, encryption, secrets |
| Infrastructure | `a433a3c` | Terraform, ECS, RDS |
| Frontend | `ab54c2c` | Next.js, React, storefront |
| POS | `ae23b17` | Offline, hardware, Square |

---

## Appendix: File Index

### Critical Files (Phase 0)
```
scripts/setup-stripe-config.js
scripts/fix-stripe-config.js
scripts/fix-stripe-config.sh
scripts/stripe-config-helper.mjs
storefront/src/app/checkout/page.tsx
storefront/src/app/global-error.tsx (NEW)
storefront/src/middleware.ts
saleor-apps/apps/pos/src/lib/offline/db.ts
saleor-apps/apps/pos/src/lib/offline/transaction-queue.ts
saleor-apps/apps/buylist/src/modules/buylists/buylists-router.ts
```

### Infrastructure Files (Phase 1)
```
infra/terraform/modules/ecs/main.tf
infra/terraform/modules/ecs/variables.tf
infra/terraform/modules/rds/main.tf
infra/terraform/modules/alb/main.tf
```

### Data Integrity Files (Phase 2)
```
saleor-apps/apps/inventory-ops/src/modules/cost-layers/wac-service.ts
saleor-apps/apps/inventory-ops/src/modules/cost-layers/wac-service-transactional.ts (NEW)
saleor-apps/apps/inventory-ops/src/modules/goods-receipts/goods-receipts-router.ts
```

### POS Files (Phase 3-4)
```
saleor-apps/apps/pos/src/lib/hardware/printer.ts
saleor-apps/apps/pos/src/lib/hardware/hardware-logger.ts (NEW)
saleor-apps/apps/pos/src/modules/square/terminal/checkout-monitor.ts (NEW)
saleor-apps/apps/pos/src/app/api/print/connect/route.ts (NEW)
saleor-apps/apps/pos/src/app/api/print/print/route.ts (NEW)
saleor-apps/apps/pos/src/lib/offline/product-cache.ts (NEW)
storefront/src/app/[channel]/(main)/cart/page.tsx
```

---

**Document Generated:** 2026-01-16 10:15 PST
**Source Audit:** docs/ops/audits/2026-01-16-staging-audit.md
**Expert Council Session:** 2026-01-16
