# Customer Accounts — Cross-Platform Analysis

> **Date**: 2026-03-08
> **Scope**: Saleor Core, Storefront, POS, Buylist, Inventory-Ops
> **Status**: Analysis complete — no code changes

## Overview

This document examines how customer accounts work across every application in the platform, how they connect, and where gaps exist. The goal is to inform future work toward a unified omnichannel customer experience for the hobby gaming market.

The platform uses Saleor's single `User` type as the identity foundation. POS and Buylist extend this with local state (store credit, transaction history, customer groups) stored in the shared Prisma schema. The storefront relies entirely on Saleor's GraphQL API with no local customer state.

---

## 1. Saleor Core — The Identity Foundation

Saleor uses a **unified `User` type** for both customers and staff, distinguished by the `isStaff` boolean. There is no separate "Customer" model.

### User Model — Key Fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | ID | Primary identifier across all apps |
| `email` | String (unique) | Case-insensitive, used for login |
| `firstName`, `lastName` | String | Display name |
| `isActive` | Boolean | Account enabled/disabled |
| `isStaff` | Boolean | Staff (dashboard) vs customer (storefront) |
| `isConfirmed` | Boolean | Email confirmed after registration |
| `languageCode` | Enum | Preferred language for notifications |
| `externalReference` | String | External system sync ID |
| `dateJoined` | DateTime | Account creation timestamp |
| `lastLogin` | DateTime | Last successful authentication |

### Relationships

| Relationship | Type | Notes |
|-------------|------|-------|
| `addresses` | [Address] | Multiple per user |
| `defaultShippingAddress` | Address | Primary shipping |
| `defaultBillingAddress` | Address | Primary billing |
| `orders` | OrderConnection | Full order history |
| `checkouts` | CheckoutConnection | Active checkouts (per channel) |
| `giftCards` | GiftCardConnection | Cards created by or assigned to user |
| `storedPaymentMethods` | [StoredPaymentMethod] | Gateway-stored methods (Stripe, etc.) |

### Metadata System

Two-tier key-value metadata on every User:

- **Public metadata** (`metadata`): Readable by anyone. Used by POS for `tax_exempt`, `tax_exempt_reason`, `tax_exempt_cert_id`.
- **Private metadata** (`privateMetadata`): Staff-only. Internal notes, billing references.

### Authentication

| Mechanism | Details |
|-----------|---------|
| **JWT tokens** | `tokenCreate` (email/password) returns access + refresh tokens |
| **Token refresh** | `tokenRefresh` with CSRF token when using cookies |
| **Token deactivation** | `tokensDeactivateAll` invalidates all tokens |
| **Password reset** | Email-based flow: `requestPasswordReset` → `setPassword` |
| **Email change** | Two-step: `requestEmailChange` → `confirmEmailChange` |
| **Account confirmation** | Registration sends confirmation email; `confirmAccount` activates |
| **External auth (SSO)** | Plugin-based only — no native OIDC/SAML/social login |

### Customer Events (Audit Trail)

Saleor tracks `CustomerEvent` records for: `ACCOUNT_CREATED`, `ACCOUNT_ACTIVATED`, `ACCOUNT_DEACTIVATED`, `PASSWORD_RESET`, `EMAIL_CHANGED`, `PLACED_ORDER`, `NOTE_ADDED`, `CUSTOMER_DELETED`, and more. Requires `MANAGE_USERS` permission to view.

### Address Model

Phone number lives on `Address`, **not** on `User` directly. This is a recurring friction point — POS and Buylist both denormalize phone to their local transaction records.

```
Address: id, firstName, lastName, companyName, streetAddress1, streetAddress2,
         city, cityArea, postalCode, country, countryArea, phone,
         isDefaultShippingAddress, isDefaultBillingAddress, metadata, privateMetadata
```

### Staff Permissions & Channel Access

Staff users belong to `Group` objects that grant `Permission` enums (`MANAGE_USERS`, `MANAGE_ORDERS`, etc.) and optionally restrict access to specific channels. Customers don't use groups — the `CustomerGroup` concept lives in the Prisma schema (see Inventory-Ops section).

---

## 2. Storefront — Minimal Account Experience

The storefront uses `@saleor/auth-sdk` for authentication with tokens stored in httpOnly cookies. It has the thinnest customer feature set of any application.

### Registration

- **Only during checkout**: The `GuestUser` form has an optional "I want to create account" checkbox that shows a password field (8+ chars).
- Calls `accountRegister` mutation with email, password, channel, and redirect URL.
- No standalone registration page exists.

### Login

- **Login page** (`/[channel]/login`): Email/password form using `saleorAuthClient.signIn()`.
- **Checkout login**: `SignIn` component integrated into checkout flow with "Forgot password?" link.
- Successful login redirects to `?redirect=` parameter.
- Token refresh is automatic via the SDK; failed refresh falls back to unauthenticated.

### Token Storage

```
nextServerCookiesStorageAsync → httpOnly cookies
  - secure: true in production (HTTPS)
  - secure: false on localhost
  - Both access and refresh tokens stored as cookies
  - Auto-refresh on 401 responses
  - CSRF protection via csrfToken
```

### Account Pages

| Page | Route | Features |
|------|-------|----------|
| Login | `/[channel]/login` | Email/password form |
| Order List | `/[channel]/orders` | Last 10 orders (auth required) |
| Order Detail | `/[channel]/orders/[id]` | Line items, totals, fulfillment, addresses |

**That's it.** No profile page, no address book, no password change, no account settings.

### Checkout — Guest vs Registered

The Contact section handles 4 states: `guestUser`, `signIn`, `signedInUser`, `resetPassword`.

**Guest checkout**:
1. Enter email only
2. Optional "create account" checkbox + password
3. Guest addresses entered inline — **not saved** to any account
4. Order created without `user` field in Saleor

**Registered checkout**:
1. Login via email/password
2. `checkoutCustomerAttach` links user to checkout
3. Saved addresses displayed in `AddressList` from user profile
4. Can add/edit/delete addresses during checkout (persisted to account)

### Address Management

Addresses are managed **only within the checkout flow**:
- `accountAddressCreate` (with BILLING or SHIPPING type)
- `accountAddressUpdate`
- `accountAddressDelete`

No standalone address book page exists.

### GraphQL Operations Used

**Queries**: `me` (user + addresses), `CurrentUser` (basic profile), `CurrentUserOrderList` (orders)
**Mutations**: `accountRegister`, `requestPasswordReset`, `setPassword`, `accountAddressCreate/Update/Delete`, `checkoutCustomerAttach`

### Key Files

| File | Purpose |
|------|---------|
| `storefront/src/app/config.ts` | Auth client factory with cookie storage |
| `storefront/src/ui/components/AuthProvider.tsx` | URQL + auth SDK provider |
| `storefront/src/app/[channel]/(main)/login/page.tsx` | Login page |
| `storefront/src/app/[channel]/(main)/orders/page.tsx` | Order list |
| `storefront/src/checkout/sections/Contact/Contact.tsx` | Contact state machine |
| `storefront/src/checkout/sections/GuestUser/` | Guest/register form |
| `storefront/src/checkout/sections/SignIn/` | Login form in checkout |
| `storefront/src/checkout/graphql/user.graphql` | Account GraphQL operations |

---

## 3. POS — Richest Customer System

POS has the most complete customer management of any application. It creates Saleor User accounts, manages store credit, supports customer merge, and has infrastructure for customer groups.

### Customer Creation

- `customers.create` calls Saleor's `customerCreate` mutation
- Input: email (required), firstName, lastName, optional note
- Auto-initializes `CustomerCredit` record with $0 balance
- Duplicate prevention: case-insensitive email check before creation
- No password set — customer can set later via email link if they want web access

### Customer Search & Attach

- `customers.search`: Queries Saleor by email/name/phone (limit 10-50), enriched with store credit balances from Prisma
- `customers.lookupByEmail`: Exact match for quick attach
- `customers.getById`: Full detail including addresses, last 5 orders, default addresses
- `customers.attachToTransaction`: Links customer to draft `PosTransaction`, reads tax exemption metadata, creates `CUSTOMER_ATTACHED` audit event
- `customers.detachFromTransaction`: Reverts to guest, creates `CUSTOMER_DETACHED` audit event

### Transaction Customer Data

POS denormalizes customer data onto each `PosTransaction`:

```
saleorCustomerId    STRING (null = guest/walk-in)
customerName        STRING (from Saleor)
customerEmail       STRING (from Saleor)
customerPhone       STRING (from address)
isTaxExempt         BOOLEAN
taxExemptReason     STRING
taxExemptCertId     STRING
```

Guest transactions have `saleorCustomerId = NULL` and can still store optional name/email/phone directly.

### Store Credit System

The `CustomerCredit` table tracks per-customer balances:

```prisma
model CustomerCredit {
  id                String   @id @default(uuid())
  installationId    String
  saleorCustomerId  String
  balance           Decimal  @default(0)
  currency          String   @default("USD")
  creditTransactions CreditTransaction[]
}
```

Transaction types: `BUYLIST_PAYOUT`, `POS_PAYMENT`, `POS_REFUND`, `ADJUSTMENT`, `EXPIRATION`

Each `CreditTransaction` records: amount, balanceAfter, source (buylist or POS transaction), note, createdBy (staff), timestamp.

Credit usage at POS (`customers.useCredit`):
- Atomic serializable transaction to prevent double-spend
- Creates `PosPayment` with STORE_CREDIT method type
- Records `CreditTransaction` with type=POS_PAYMENT

### Customer Merge

`customers.merge` (source → target):
1. Transfers credit from source to target (atomic serializable transaction)
2. Reassigns all POS transactions from source to target
3. Creates `CustomerMergeLog` audit record
4. Records ADJUSTMENT credit transactions on both accounts

### Customer Groups

Infrastructure exists but is **not integrated with transactions**:

```prisma
model CustomerGroup {
  id               String   @id @default(uuid())
  installationId   String
  name             String   // unique per installation
  description      String?
  color            String?
  discountPercent  Decimal?
  isActive         Boolean  @default(true)
  members          CustomerGroupMember[]
}
```

CRUD operations work, but groups don't apply automatic discounts during checkout.

### Tax Exemption

- Reads customer metadata: `tax_exempt`, `tax_exempt_reason`, `tax_exempt_cert_id`
- Sets `isTaxExempt=true` on PosTransaction when attaching tax-exempt customer
- **Cannot set** tax exemption from POS — must be set in Dashboard or via API

### UI Components

| Component | Purpose |
|-----------|---------|
| `CustomerSearch.tsx` (433 LOC) | Debounced search, results dropdown, create-new inline |
| `pages/customers/index.tsx` (278 LOC) | Customer list with search |
| `pages/customers/[id].tsx` (303 LOC) | Detail: contact info, credit balance, transaction history |

### Key Files

| File | Purpose |
|------|---------|
| `pos/src/modules/customers/customers-router.ts` | 1365 LOC, 12 endpoints |
| `pos/src/modules/customers/customers-router.test.ts` | 428 LOC tests |
| `pos/src/modules/payments/payments-router.ts` | Order creation with customer linking |
| `pos/src/modules/receipts/receipts-router.ts` | Receipt generation (customer name, no email for privacy) |

---

## 4. Buylist — Customer-Optional with Credit Integration

Buylist supports both registered Saleor customers and anonymous walk-ins. Store credit payout is the primary integration point with the customer system.

### Walk-In vs Registered

| Feature | Walk-In | Registered |
|---------|---------|------------|
| Account required | No | Yes (Saleor User) |
| Name/email/phone | Optional, stored on Buylist record | Auto-populated from Saleor |
| Store credit payout | **Not available** (enforced) | Available |
| Transaction history | Lost (no persistent identity) | Last 10 buylists visible |
| Credit balance visible | N/A | Shown in search results |

### Customer Association

Each `Buylist` record stores:

```
saleorUserId     STRING (null for walk-ins)
customerName     STRING (from Saleor or manual entry)
customerEmail    STRING (from Saleor or manual entry)
customerPhone    STRING (from Saleor address or manual entry)
```

### FOH (Front of House) Customer Flow

1. **Search** for customer by email/phone/name (up to 10 results from Saleor, enriched with credit + buylist history)
2. **Attach** existing customer, **create** new Saleor account, or **enter walk-in** details
3. Add card items with market prices and quoted buy prices
4. Select payout method: CASH, STORE_CREDIT, CHECK, BANK_TRANSFER, PAYPAL, OTHER
5. If STORE_CREDIT: customer is **required** (enforced in UI)
6. Complete via `createAndPay()` → PENDING_VERIFICATION status

### BOH (Back of House) Verification

1. Queue shows PENDING_VERIFICATION buylists (FIFO by paidAt)
2. Verify card conditions (may differ from FOH entry)
3. Adjust accepted quantities per line
4. Update Saleor stock with condition-specific variants
5. Create cost layer events for WAC tracking
6. Customer info is **locked** during verification

### Store Credit Payout

When a buylist with STORE_CREDIT payout completes:
- `CreditTransaction` created with type=BUYLIST_PAYOUT
- Links back to buylist via `sourceBuylistId`
- Balance updated atomically
- Same `CustomerCredit` table as POS (shared Prisma schema)

### Audit Trail

`BuylistAuditEvent` is append-only and tracks: CREATED, CUSTOMER_ATTACHED, CUSTOMER_DETACHED, QUOTED, PAID, VERIFIED, COMPLETED, with staff attribution and state snapshots.

### Key Files

| File | Purpose |
|------|---------|
| `buylist/src/modules/customers/customers-router.ts` | 830 LOC, customer CRUD + search |
| `buylist/src/modules/buylists/buylists-router.ts` | 1600+ LOC, full buylist lifecycle |
| `buylist/src/modules/boh/boh-router.ts` | 500+ LOC, verification workflow |
| `buylist/src/ui/components/BuylistCustomerSearch.tsx` | 554 LOC, search + attach UI |

---

## 5. Inventory-Ops — No Customer Features

Inventory-ops is purely B2B/internal: purchase orders, goods receipts, price sync, WAC calculations, cost layers.

The **shared Prisma schema** (symlinked from inventory-ops to POS and Buylist) contains the customer-related models (`CustomerCredit`, `CustomerGroup`, `CustomerGroupMember`, `CustomerMergeLog`), but inventory-ops doesn't expose any customer endpoints in its tRPC router.

---

## 6. Cross-App Architecture

### Identity Linkage

```
                    ┌─────────────────┐
                    │   Saleor DB     │
                    │   (User table)  │
                    └────────┬────────┘
                             │
              saleorUserId   │   JWT tokens
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│   POS App      │  │  Buylist App   │  │  Storefront    │
│                │  │                │  │                │
│ CustomerCredit │  │ Buylist record │  │ (no local DB)  │
│ PosTransaction │  │ CreditTxn     │  │ Pure GraphQL   │
│ CustomerGroup  │  │ AuditEvent    │  │ client         │
│ MergeLog       │  │                │  │                │
└────────────────┘  └────────────────┘  └────────────────┘
         │                   │
         └───────┬───────────┘
                 │
         Shared Prisma Schema
         (inventory-ops source)
```

**The glue is `saleorUserId`** — the Saleor User `id` stored on POS transactions, buylist records, and credit accounts.

**Store credit is unified**: POS and Buylist read/write the same `CustomerCredit` table. Credit earned at the buylist counter is immediately spendable at the POS register.

**The storefront is disconnected**: It talks only to Saleor's GraphQL API and has no visibility into the Prisma-side customer state (credit, groups, buylist history, POS history).

### Data Flow for a Customer Lifecycle

1. **Customer created** at POS counter (or Buylist, or storefront checkout) → Saleor User created
2. **POS purchase** → `PosTransaction` with `saleorCustomerId`, draft order linked in Saleor
3. **Buylist sell-back** → `Buylist` record with `saleorUserId`, credit issued to `CustomerCredit`
4. **POS credit usage** → `CreditTransaction` debits balance, `PosPayment` records credit method
5. **Online order** → Saleor order linked to same User via JWT auth
6. **No online credit visibility** → Customer cannot see or use credit on storefront

---

## 7. Gap Analysis

### HIGH Priority — Customer experience and revenue impact

| # | Gap | Details | Affected Apps |
|---|-----|---------|---------------|
| 1 | **No customer profile page on storefront** | Customers cannot edit their name, email, or password from the web. Only option is to contact support or use password reset email. | Storefront |
| 2 | **No standalone address book on storefront** | Addresses can only be managed during checkout. No way to pre-add, review, or clean up addresses outside of a purchase. | Storefront |
| 3 | **Store credit invisible online** | Customers earn credit via POS buylist payouts and adjustments but cannot see their balance on the website. | Storefront |
| 4 | **Store credit not usable online** | No payment method integration for store credit in storefront checkout. Would require a Saleor payment app that reads `CustomerCredit`. | Storefront, Checkout |
| 5 | **Customer groups don't apply discounts** | `CustomerGroup` has `discountPercent` field but it's not checked during POS or Buylist transactions. Infrastructure exists, integration doesn't. | POS, Buylist |
| 6 | **No unified customer view** | No single screen (Dashboard or otherwise) shows a customer's full cross-channel activity: online orders + POS transactions + buylist history + credit balance + group membership. | Dashboard, All |

### MEDIUM Priority — Operational friction

| # | Gap | Details | Affected Apps |
|---|-----|---------|---------------|
| 7 | **Phone number inconsistency** | Saleor stores phone on Address objects only. POS and Buylist denormalize phone to transaction records. Editing phone in Saleor doesn't update historical records. | All |
| 8 | **No loyalty/rewards automation** | Store credit exists but isn't auto-generated from purchases (e.g., 5% back). Must be manually added by staff. | POS |
| 9 | **Walk-in history is lost** | Walk-in POS and Buylist transactions cannot be retroactively linked to a customer account if they register later. | POS, Buylist |
| 10 | **No SSO or social login** | Saleor's external auth is plugin-based. No Google, Apple, or social login is configured. Registration is email/password only. | Storefront |
| 11 | **Tax exemption can't be set from POS** | POS reads tax exemption metadata but cannot write it. Staff must use Dashboard or direct API call. | POS |
| 12 | **Buylist lacks customer merge** | POS has a full merge workflow (credit transfer + transaction reassignment + audit log). Buylist doesn't — separate router, same schema. Duplicate buylist customers must be fixed manually. | Buylist |

### LOW Priority — Nice to have

| # | Gap | Details | Affected Apps |
|---|-----|---------|---------------|
| 13 | **No wishlist/favorites** | Standard e-commerce feature. Not implemented. | Storefront |
| 14 | **No saved payment methods page** | Stripe tokenization exists in checkout but no account page to view/manage saved cards. | Storefront |
| 15 | **No email capture at POS basic checkout** | POS only captures email when explicitly creating or attaching a customer. Quick sales miss the opportunity. | POS |
| 16 | **No DCI/player ID tracking** | No Magic: The Gathering-specific identifier for competitive players. Could use Saleor metadata fields but nothing is implemented. | POS, Buylist |

---

## 8. What's Working Well

| Strength | Details |
|----------|---------|
| **Unified identity** | POS and Buylist create real Saleor User accounts. Same `saleorUserId` works everywhere. |
| **Shared store credit** | Single `CustomerCredit` table in shared Prisma schema. Credit earned at buylist counter is spendable at POS register. |
| **Customer merge (POS)** | Handles credit transfer + transaction reassignment with full audit trail and atomic transactions. |
| **Guest support** | Both POS and Buylist handle walk-ins gracefully without forcing account creation. |
| **Comprehensive audit trails** | Both apps log customer events (`CUSTOMER_ATTACHED`, `CUSTOMER_DETACHED`) and all credit movements with staff attribution. |
| **Tax exemption metadata** | Clean pattern: store flags in Saleor metadata, read at POS transaction time. |
| **Secure auth** | Storefront uses httpOnly cookies with CSRF protection. Token refresh is automatic. |

---

## 9. Strategic Recommendation

The biggest gap is that the **storefront is disconnected from the in-store customer experience**. A customer who regularly sells cards at the buylist counter and buys at the register has a rich profile in POS/Buylist — credit balance, transaction history, group membership — but sees almost nothing when they visit the website.

Closing the HIGH priority gaps (profile page, address book, credit visibility, credit as payment method) would create the unified omnichannel experience that differentiates this hobby gaming platform from a generic Saleor deployment.

The recommended sequence:
1. **Profile page + address book** (storefront) — lowest effort, highest visibility
2. **Store credit visibility** (storefront + API) — requires a lightweight API endpoint to expose `CustomerCredit` balance for authenticated users
3. **Customer groups → discounts** (POS/Buylist) — activate existing infrastructure
4. **Store credit as online payment** (Saleor payment app) — most complex, highest revenue impact
5. **Unified customer view** (Dashboard widget or custom page) — operational improvement for staff
