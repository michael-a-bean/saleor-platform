# Omnichannel Customer Accounts — Implementation Plan

> **Date**: 2026-03-08
> **Status**: Plan — no code changes
> **Prerequisite**: [Cross-Platform Analysis](customer-accounts.md) (issue #57)
> **Tracks**: [GitHub Issue #57](https://github.com/michael-a-bean/saleor-platform/issues/57)

## Executive Summary

The storefront is disconnected from the rich in-store customer experience built in POS and Buylist. A customer who regularly sells cards at the buylist counter and buys at the register has credit balance, transaction history, and group membership — but sees almost nothing when they visit the website.

This plan closes that gap in 5 phases, ordered by effort-to-impact ratio. Each phase delivers standalone value and can be shipped independently.

### Architecture Principle

**One bridge unlocks everything.** The storefront currently talks only to Saleor's GraphQL API. Store credit, customer groups, and transaction history live in the shared Prisma DB (inventory-ops schema). A single authenticated API bridge from the storefront to inventory-ops unlocks Phases 2-5. Phase 1 requires no bridge at all — it uses existing Saleor mutations.

---

## Phase 1: Profile Page & Address Book (Storefront)

**Effort**: Small (1-2 days) | **Impact**: High visibility | **Dependencies**: None

### Why First

Saleor already exposes all 15 customer-facing mutations (`accountUpdate`, `passwordChange`, `requestEmailChange`, `accountAddressCreate/Update/Delete`, `accountSetDefaultAddress`, etc.). The storefront simply doesn't use them. This is pure frontend work with zero backend changes.

### Technical Approach

**New routes:**

| Route | Purpose |
|-------|---------|
| `/[channel]/account` | Profile page — edit name, email, password |
| `/[channel]/account/addresses` | Address book — list, add, edit, delete, set defaults |

**Profile page (`/account`):**
- Display: first name, last name, email (from `me` query, already used)
- Edit name: `accountUpdate` mutation with `AccountInput { firstName, lastName }`
- Change password: `passwordChange` mutation (requires `oldPassword` + `newPassword`)
- Change email: Two-step — `requestEmailChange` (sends confirmation) → `confirmEmailChange` (token from email link)
- Delete account: `accountRequestDeletion` → `accountDelete` (two-step with email confirmation)

**Address book (`/account/addresses`):**
- List: Already fetched via `me { addresses }` query
- Add: `accountAddressCreate` with `AddressInput` + `type` (BILLING/SHIPPING)
- Edit: `accountAddressUpdate` with address `id` + `AddressInput`
- Delete: `accountAddressDelete` with address `id`
- Set default: `accountSetDefaultAddress` with address `id` + `type`

**Key files to modify/create:**

| File | Action |
|------|--------|
| `storefront/src/app/[channel]/(main)/account/page.tsx` | Create — profile page |
| `storefront/src/app/[channel]/(main)/account/addresses/page.tsx` | Create — address book |
| `storefront/src/graphql/AccountUpdate.graphql` | Create — mutation definitions |
| `storefront/src/ui/components/nav/components/UserMenu/` | Modify — add "My Account" link |
| `storefront/src/checkout/sections/GuestUser/` | Modify — add "Create Account" link to standalone registration |

**Registration improvement:** Currently, accounts can only be created during checkout (optional checkbox). Add a standalone `/[channel]/register` page using the existing `accountRegister` mutation.

**Page-level config:** All new pages need `export const dynamic = "force-dynamic"` (auth-gated, no SSG).

### What Ships

A customer can log in, see their profile, edit their name, change their password, manage addresses, and set default shipping/billing addresses — all from the website. This matches the baseline of any modern e-commerce site.

---

## Phase 2: Store Credit Visibility (Storefront + API Bridge)

**Effort**: Medium (2-3 days) | **Impact**: High differentiation | **Dependencies**: Phase 1 (account pages exist)

### Why Second

Credit earned in-store (via buylist payouts and POS adjustments) is invisible online. Customers call the store to check their balance. Showing the balance is a lightweight API endpoint — the complex part (earning and spending credit) already works.

### Technical Approach — The API Bridge

**The core problem:** Storefront authenticates via Saleor JWT. Store credit lives in inventory-ops Prisma DB. No auth path exists between them.

**Solution: JWT verification middleware in inventory-ops.**

```
Storefront → inventory-ops API → Prisma DB (CustomerCredit)
     │                │
     └── Saleor JWT ──┘ (verify via Saleor's public key / `me` query)
```

**New inventory-ops module: `src/modules/customer-api/`**

This is a public-facing REST (or tRPC) API that:
1. Accepts Saleor JWT in `Authorization` header
2. Verifies the token by calling Saleor's `me` query (or validates JWT signature directly)
3. Extracts `saleorUserId` from the verified token
4. Returns customer data scoped to that user

**Endpoints:**

| Endpoint | Returns |
|----------|---------|
| `GET /customer-api/credit/balance` | Current credit balance + currency |
| `GET /customer-api/credit/history` | Paginated credit transactions (type, amount, date, note) |
| `GET /customer-api/groups` | Customer's group memberships |

**Security considerations:**
- JWT verification prevents unauthorized access — only the authenticated user sees their own data
- `installationId` scoping ensures multi-tenant isolation
- Read-only endpoints — no credit mutations exposed to storefront
- Rate limiting on the API bridge (100 req/min per user)

**Storefront integration:**
- New component: `StoreCreditBadge` — shows balance in account page header and UserMenu dropdown
- New page: `/[channel]/account/credit` — full credit history with transaction table
- API calls from Next.js server components (SSR) using the user's JWT

### Phase 1 Cleanup (bundled with Phase 2)

- Fix `countryStr in CountryCode` enum validation — checks keys instead of values, silently coerces non-US countries to `"US"`. Use `Object.values(CountryCode).includes()` instead.

### What Ships

A customer logs into the website, sees "Store Credit: $47.50" in their account menu, and can view a history of every credit transaction (buylist payouts, POS purchases, adjustments) with dates and notes.

---

## Phase 3: Customer Groups → Discounts (POS + Buylist)

**Effort**: Medium (2-3 days) | **Impact**: Medium — activates existing infrastructure | **Dependencies**: None (independent of Phases 1-2)

### Why Third

The `CustomerGroup` model already exists with `discountPercent`. CRUD operations work. Groups can be created, members added. But the discount is never applied during transactions. This is wiring, not building.

### Technical Approach

**POS — Apply group discount at checkout:**

In `payments-router.ts`, during order creation:
1. When customer is attached to transaction, look up their group memberships
2. If any group has `discountPercent > 0`, apply the highest discount (not cumulative)
3. Apply as line-item percentage discount (not Saleor voucher — avoids double-discount conflict)
4. Display discount on receipt: "Member Discount (Gold): -10%"
5. Record group discount in `PosTransaction` metadata for audit

**Buylist — Apply group discount to buy prices:**

In `buylists-router.ts`, when calculating quoted buy prices:
1. Check customer's group membership
2. If group has `discountPercent`, apply as premium on buy price (e.g., Gold members get 10% more for their cards)
3. Display premium on buylist summary

**Important constraint:** Group discounts are a **local concern** applied at POS/Buylist transaction time. They do NOT flow through Saleor's discount/voucher system. This prevents:
- Double discounts (group discount + Saleor promo stacking)
- Complex discount priority rules
- Saleor upgrade compatibility issues

**UI additions:**
- POS checkout summary: Show "Member Discount" line when applicable
- POS customer detail page: Show group memberships
- Buylist FOH: Show group membership and premium rate

### What Ships

Staff creates customer groups (e.g., "Gold Members — 10% discount") in POS. When a Gold member checks out, their discount is automatically applied. At the buylist counter, Gold members get 10% better buy prices on their cards.

---

## Phase 4: Store Credit as Online Payment (Saleor Payment App)

**Effort**: Large (5-8 days) | **Impact**: Highest revenue impact | **Dependencies**: Phase 2 (API bridge exists)

### Why Fourth

This is the most complex phase but has the highest revenue impact. Customers with credit earned in-store currently can't spend it online. Converting credit to online spending power drives web sales and closes the omnichannel loop.

### Architecture Decision

**Council consensus: Build in inventory-ops (Option B).**

Store credit operations must execute within the same serializable transaction boundary POS already uses. A standalone payment app would need its own DB connection and duplicate concurrency logic — creating a second code path that risks double-spend. Gift card mirroring (Option C) was unanimously rejected: two sources of truth for the same balance guarantees drift.

**Implementation: New module in inventory-ops with Saleor payment app webhook handlers.**

If inventory-ops's app manifest can't declare payment gateway configurations, use a thin proxy app (`saleor-apps/apps/store-credit-gateway/`) that:
1. Registers as a Saleor payment app
2. Receives payment webhooks
3. Delegates to inventory-ops internal API for credit operations
4. Returns results to Saleor

### Webhook Flow

```
Customer clicks "Pay with Store Credit" in checkout
    │
    ▼
Storefront calls transactionInitialize(paymentGateway: "store-credit")
    │
    ▼
Saleor fires TRANSACTION_INITIALIZE_SESSION webhook → inventory-ops
    │
    ▼
inventory-ops webhook handler:
  1. Extract saleorUserId from webhook payload (via sourceObject.user)
  2. Look up CustomerCredit balance
  3. Validate: requested amount ≤ available balance
  4. If valid: hold credit (serializable transaction, mark as PENDING)
  5. Return { result: CHARGE_SUCCESS, amount, pspReference: creditTxnId }
    │
    ▼
Saleor marks transaction as charged → checkout can complete
    │
    ▼
On TRANSACTION_CHARGE_REQUESTED (confirmation):
  1. Finalize credit deduction (convert PENDING → COMPLETED)
  2. Record CreditTransaction with type=ONLINE_PAYMENT, sourceOrderId
    │
    ▼
On order cancellation / refund:
  1. TRANSACTION_REFUND_REQUESTED webhook
  2. Credit the amount back to CustomerCredit
  3. Record CreditTransaction with type=ONLINE_REFUND
```

### Split Payment (Partial Credit + Card)

Saleor supports multiple transactions per checkout. The flow:
1. Customer applies $20 credit to a $35 order via `transactionInitialize` for store-credit gateway
2. Remaining $15 charged to card via Stripe gateway (existing `transactionInitialize` for Stripe)
3. Both transactions must succeed for checkout to complete
4. If credit charge succeeds but card fails, Saleor will fire `TRANSACTION_REFUND_REQUESTED` to release the credit hold

### Double-Spend Prevention

The same serializable isolation level used by POS (`useCredit`) applies:
1. `SELECT FOR UPDATE` on `CustomerCredit` row
2. Verify `balance >= requestedAmount`
3. Deduct and record `CreditTransaction` atomically
4. If POS and online attempt simultaneous use, one will wait on the row lock and see the updated (lower) balance

### New CreditTransaction Types

Add to the `TransactionType` enum:
- `ONLINE_PAYMENT` — credit used in storefront checkout
- `ONLINE_REFUND` — credit returned from storefront order cancellation

### Storefront Checkout UI

- Add "Store Credit" payment option in checkout when balance > 0
- Show available balance: "Store Credit: $47.50 available"
- Allow partial application: "Apply $20.00 of store credit"
- Show remaining balance after application
- Remaining amount flows to card payment (Stripe)

### What Ships

A customer with $47.50 store credit from buylist payouts can apply it at checkout. They can use full credit or split between credit and card. Credit holds prevent double-spend across POS and online. Refunds return credit to the balance.

---

## Phase 5: Unified Customer View (Staff-Facing)

**Effort**: Medium (3-4 days) | **Impact**: Operational improvement | **Dependencies**: Phase 2 (API bridge exists)

### Why Last

This is a staff tool, not customer-facing. It improves operations but doesn't directly drive revenue. It also benefits from all prior phases being in place.

### Technical Approach

**Option A: Dashboard Widget** — Custom Saleor Dashboard extension showing cross-channel data on the existing customer detail page. Requires Dashboard app extension API (limited).

**Option B: Custom Page in POS** — Since POS already has the richest customer view (`/customers/[id]`), extend it to aggregate all channels. This is more practical because POS already has Prisma access and Saleor GraphQL access.

**Recommended: Option B (extend POS customer detail page).**

**Unified view sections:**

| Section | Data Source | Content |
|---------|------------|---------|
| Profile | Saleor GraphQL | Name, email, addresses, metadata |
| Store Credit | Prisma (CustomerCredit) | Balance, full transaction history |
| Online Orders | Saleor GraphQL (`orders` on User) | Order list with status, totals |
| POS Transactions | Prisma (PosTransaction) | In-store purchase history |
| Buylist History | Prisma (Buylist) | Cards sold back, payouts |
| Group Membership | Prisma (CustomerGroupMember) | Active groups, discount rates |
| Merge History | Prisma (CustomerMergeLog) | Any prior account merges |

**New POS endpoint:** `customers.getUnifiedView` — aggregates all data sources into a single response.

### What Ships

Staff at the register can pull up any customer and see everything: online orders, in-store purchases, buylist history, credit balance, group membership, and merge history — all on one screen.

---

## Cross-Cutting Concerns

### Phone Number Consistency (Gap #7)

**Current state:** Saleor stores phone on `Address`, not `User`. POS and Buylist denormalize phone to transaction records at attach time. Editing the address phone doesn't update historical records.

**Recommendation:** Accept this as intentional denormalization. Transaction records should snapshot the phone at transaction time (audit correctness). Add a `phone` field to the customer search/display that reads from the default address. Don't attempt to sync phone across historical records — that's not a bug, it's an audit feature.

### Walk-In Transaction Linking (Gap #9)

**Current state:** Walk-in POS and Buylist transactions have `saleorCustomerId = NULL`. They can't be retroactively linked if the customer registers later.

**Recommendation:** Add a "Claim Transactions" endpoint to POS:
1. Staff searches for walk-in transactions by date range, name, or email fragment
2. Staff selects matching transactions
3. System sets `saleorCustomerId` on selected transactions
4. Creates audit event: `WALK_IN_CLAIMED`
5. Does NOT move credit — walk-in transactions didn't earn credit (credit requires a customer account at payout time)

**Effort:** Small (< 1 day). Can be done independently at any time.

### Buylist Customer Merge (Gap #12)

**Recommendation:** Port the existing POS merge logic to Buylist. The `customers.merge` endpoint in POS already handles credit transfer + transaction reassignment + audit logging. Buylist needs an equivalent that also reassigns `Buylist` records. Since both share the same Prisma schema, the credit transfer logic is identical — only the transaction reassignment differs (Buylist records vs POS transactions).

**Effort:** Small (< 1 day). The pattern is proven in POS.

---

## Sequencing & Dependencies

```
Phase 1 ──────────────────────────────► Ships independently
(Profile + Addresses)                   Pure storefront, no backend

Phase 2 ──────────────────────────────► Ships independently
(Credit Visibility)                     Requires API bridge (new)
     │
     ▼
Phase 4 ──────────────────────────────► Depends on Phase 2
(Credit as Payment)                     Uses same API bridge + payment app

Phase 3 ──────────────────────────────► Ships independently
(Group Discounts)                       POS/Buylist only, no storefront

Phase 5 ──────────────────────────────► Benefits from all prior phases
(Unified View)                          Aggregates data from all sources
```

**Critical path:** Phase 2 → Phase 4 (API bridge must exist before payment app can use it).

**Parallel tracks:** Phases 1 and 3 can be developed simultaneously and independently.

## Effort Summary

| Phase | Effort | Team | Parallel? |
|-------|--------|------|-----------|
| 1. Profile + Addresses | 1-2 days | Storefront | Yes — independent |
| 2. Credit Visibility | 2-3 days | Storefront + inventory-ops | Yes — independent |
| 3. Group Discounts | 2-3 days | POS + Buylist | Yes — independent |
| 4. Credit Payment | 5-8 days | inventory-ops + Storefront | After Phase 2 |
| 5. Unified View | 3-4 days | POS | After Phase 2 |
| Walk-in Linking | < 1 day | POS | Anytime |
| Buylist Merge | < 1 day | Buylist | Anytime |
| **Total** | **~15-22 days** | | |

## What's Explicitly Out of Scope

- SSO / social login (Gap #10) — requires Saleor auth plugin, low ROI for hobby gaming
- Wishlist / favorites (Gap #13) — nice-to-have, not omnichannel
- Saved payment methods page (Gap #14) — Stripe handles this
- DCI/player ID tracking (Gap #16) — future Saleor metadata usage
- Loyalty/rewards automation (Gap #8) — requires business rules definition before implementation
- Tax exemption from POS (Gap #11) — requires Saleor metadata write, small but separate concern
- Email capture at POS basic checkout (Gap #15) — UX decision, not architecture

## Anti-Constraint Validation

This entire plan extends Saleor via apps, webhooks, and API configuration. **No Saleor core modifications are required.** All customer-facing mutations already exist in Saleor's GraphQL API. The payment app uses Saleor's standard webhook contract. The API bridge is a new module in an existing Saleor app (inventory-ops).
