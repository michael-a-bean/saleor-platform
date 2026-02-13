# MTG Singles at Local Game Stores: Buylist Economics & Operations

**Agent**: ClaudeResearcher
**Date**: 2026-02-13
**Scope**: Buylist economics, WAC methodology, POS requirements, shipping/fulfillment
**Focus**: Operational detail for MVP feature validation

---

## 1. Buylist Economics and Workflow

### Competitive Buylist Channels

**Store-Specific Buylists (In-Store)**
Most common model. Stores set prices as percentage of TCGPlayer Market Price. Customer brings cards, employee looks up each, quotes price, customer accepts/declines. Store controls grading, pricing, payout timing.

**TCGPlayer Buylist Program**
Mediated service: stores set pricing (items, quantities, prices) and withholding funds. Players submit through TCGPlayer, ship to TCGPlayer, TCGPlayer confirms on behalf of store. Flat 10% fee + shipping costs.

**CardConduit (Third-Party Aggregator)**
Accepts bulk collections, grades them, distributes across vendor buylists to maximize payout. Total payout averages 19% better than single retailer.
- Standard: Up to 2,500 cards, 10% fee + $0.03/card
- Curated: Cards $0.50+ buylist only, 5% fee
- Sorted: Seller pre-sorts, 2% fee

### Cash vs. Store Credit Differentials

| Payout Type | Typical Range | Common Midpoint |
|---|---|---|
| **Cash** | 25-50% of market | ~40-50% |
| **Store Credit** | 50-75% of market | ~60-70% |
| **Credit Premium** | 15-25% above cash | ~20% |

Some stores use tiered rates by card value:
- Cards over $3: 55% store credit / 40% cash
- Cards under $3: 25% store credit / 15% cash

The credit premium keeps money circulating within the business. Stores operating on 5-10% net margins need the spread to remain viable.

**Platform implication:** Configurable buylist pricing rules -- percentage of market price, separate cash/credit rates, tiered rates by value threshold, per-card quantity caps.

### FOH vs. BOH Workflow

**Front of House (FOH):**
1. Customer arrives with cards
2. Employee enters cards into buylist system
3. System displays offered price per configured rules
4. Customer reviews total, accepts or negotiates
5. Small submissions (<5-6 cards): processed immediately
6. Larger submissions: tagged to customer, moved to back

**Back of House (BOH):**
1. Grading specialist examines each card for condition
2. Price adjusted if condition differs from claimed
3. If price differential >10%, customer contacted for approval
4. Cards sorted into inventory bins/binders
5. Payment issued (credit immediately; cash via drawer/Venmo/PayPal)

### Grading Standards

| Grade | Description | Price Impact |
|---|---|---|
| NM | Minimal/subtle wear | 100% |
| SP/LP | Minor edge wear, light scratches | 80-90% |
| MP | Moderate wear, legal sleeved for tournament | 60-75% |
| HP | Distinguishing marks visible on back | 40-50% |
| DMG | Structural damage, creases, water damage | 10-30% |

TCGPlayer recommends ~10% partial refund per condition step for mismatches.

---

## 2. Costing and Profitability

### WAC Methodology

WAC is appropriate for singles because:
- Cards are fungible (NM copies interchangeable)
- Multiple acquisition channels create different cost bases
- Permitted under GAAP and IFRS
- Eliminates manual cost-layer tracking

**Formula:**
```
New WAC = (Existing Inventory Value + New Purchase Cost) / (Existing Quantity + New Quantity)
```

**Example:** 3 copies at WAC $4.00 ($12.00 total). Buy 2 more at $3.00 ($6.00).
New WAC = ($12.00 + $6.00) / (3 + 2) = $3.60.

**Must recalculate on every inventory receipt event** (buylist acceptance, goods receipt, sealed product allocation). WAC per card per condition, not just per card.

### Sealed Product Cracking Cost Allocation

Most complex costing problem in the industry:

**EV varies dramatically by product type:**
- Draft booster boxes ($275 MSRP) may yield ~$687 EV at release (2.5x)
- Set booster boxes ($275) may yield ~$905 EV (3.3x)
- Collector booster boxes ($400) may yield ~$1,286 EV (3.2x)

Card values typically lose at least half within a couple months of release.

**Allocation approaches:**
1. Pro-rata by market value at time of opening (most accurate, labor-intensive)
2. Flat allocation (simple but inaccurate for sets with chase cards)
3. Zero-cost bulk + allocated value cards (pragmatic compromise)

### Margin Expectations

| Metric | Range |
|---|---|
| Gross margin on singles | 30-50% |
| High-value staples | 45%+ |
| Net profit margin (whole store) | 5-10% |
| Buylist markup to retail | 2x-3x |

---

## 3. Technology Integration Pain Points

### Why LGS Use Multiple Disconnected Systems

| Function | Common Tool |
|---|---|
| In-store POS | Square, BinderPOS, Lightspeed |
| Online marketplace | TCGPlayer, eBay |
| Website | Shopify (often via BinderPOS) |
| Accounting | QuickBooks |
| Price reference | Scryfall, TCGPlayer, MTGStocks |
| Inventory | Spreadsheets, Crystal Commerce |

One distribution company reported **4+ hours daily** manually moving data between systems.

### API Availability

| Platform | Status | Limitations |
|---|---|---|
| **Scryfall** | Free, open, well-documented | Prices "dangerously stale" after 24h. Read-only. |
| **TCGPlayer** | RESTful API available | Recent restrictions. Access increasingly gated. Terms prohibit mixing with competitor data. |
| **CardMarket** | Official API exists | **Not accepting new applications.** European only. |
| **JustTCG** | Alternative pricing API | Newer, less established. |

---

## 4. Singles-Specific POS Requirements

### How Selling a Single Differs from Sealed

| Aspect | Sealed | Single Card |
|---|---|---|
| Identification | UPC barcode | Name + Set + Condition + Foil lookup |
| Pricing | Fixed MSRP | Dynamic, market-driven, changes daily |
| Inventory | Simple quantity | Quantity per condition per printing |
| At counter | Scan and sell | Must verify condition matches listing |
| Returns | Standard retail | Generally no returns (volatile market) |

### Lookup Requirements
1. Search by card name (with fuzzy matching)
2. Filter by set (same card in 10+ sets)
3. Filter by condition (different price points)
4. Filter by variant (foil, extended art, showcase, etc.)
5. Display current market price alongside store price
6. Show in-stock quantity per condition/variant

**Must be sub-second.** This is the highest-friction interaction in the store.

### Cash Register / Drawer Management

- Buylist payouts are outflows (not sales)
- Must be tracked as distinct transaction type
- Some stores use Venmo/PayPal to avoid depleting drawer
- End-of-day reconciliation: sales in - buylist payouts out = expected cash

### Store Credit Systems

- Stored in customer database
- Never expires (industry standard)
- Valid government ID required for trade-ins (regulatory requirement in many jurisdictions)
- Higher rate than cash (15-25% premium)
- Applied at checkout like a payment method
- Credit balance = liability on balance sheet
- Aging report needed (state escheatment laws)

---

## 5. Shipping and Fulfillment for Singles

### Method Thresholds

| Method | Cost | Use Case | Tracking |
|---|---|---|---|
| PWE | $0.53-0.75 | Orders under $20-30 | No |
| Bubble Mailer | $2.60-3.50 | Orders $20-50+ | Yes |
| Small box | $5-8+ | Orders $50-250 | Yes |
| Insured package | $8+ plus insurance | Orders $250+ | Yes + Insurance |

Switch threshold from PWE to tracked: **$20-30 in order value.**

### Packaging Standards

1. Penny sleeve on card (minimum)
2. Top-loader or semi-rigid card saver over sleeve
3. Team bag around top-loader
4. For PWE: sandwiched between cardboard, "Do Not Bend / Non-Machinable"
5. Non-machinable surcharge: $0.40

### Returns Policy (Industry Standard)

- **No returns on singles** (market volatility)
- Three exceptions: condition mismatch, wrong card, missing cards
- Condition mismatch: ~10% partial refund per grade difference
- Seller bears return shipping when at fault
- Insurance recommended on orders $250+

---

## Sources

- [Keystone Games - Trade-In Values](https://www.keystonegames.net/blogs/keystone-games-community-news-1/the-two-sides-of-the-counter-understanding-card-trade-in-values)
- [MTGGoldfish - eBay vs TCGPlayer vs Buylists](https://www.mtggoldfish.com/articles/selling-cards-ebay-vs-tcgplayer-vs-buylists/)
- [CardConduit](https://cardconduit.com/)
- [TCGPlayer - Buylist Process](https://help.tcgplayer.com/hc/en-us/articles/221181588)
- [TCGPlayer - Refunds and Returns](https://help.tcgplayer.com/hc/en-us/articles/24768427937943)
- [Scryfall API Documentation](https://scryfall.com/docs/api)
- [Corporate Finance Institute - WAC Method](https://corporatefinanceinstitute.com/resources/accounting/weighted-average-cost-method/)
- [MTGGoldfish - Expected Value Analysis](https://www.mtggoldfish.com/articles/the-expected-value-of-modern-horizons-2)
