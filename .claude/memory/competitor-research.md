# Competitor Research Progress

## Research Plan
- Master plan: `docs/reports/competitor-research-plan.md` (15 dimensions, 11 competitors, 3 tiers)
- PRD: `.prd/PRD-20260226-tier1-competitor-research.md`
- Branch: `research/shadowpos`
- ShadowPOS reference: `docs/reports/shadowpos/` (19 reports)

## Tier 1 Competitors (Full Depth — 15 Dimensions)

### SortSwift — Session 1 COMPLETE (2026-02-26)
**Reports:** `docs/reports/sortswift/` (7 files + cross-reference)
- D1 Tech: Next.js Pages Router SSG, DigitalOcean App Platform, Cloudflare CDN
- D2 People: Mikah Walters, Stilwell OK, Cherokee Nation citizen, bootstrapped, wife Makayla co-operates
- D3 Business: MTech Cave parent, ~2022-2023 software, $151K Kickstarter for hardware
- D4 Social: Zero G2/Capterra/Reddit/Trustpilot. All positive sentiment from own channels.
- D5 Customers: 220+ claimed, 1 verified (Balance Gaming FL). 7 testimonial stores on site.
- D6 Features: 26+ games, AI scanning, Super Sorter ($199/mo), NO native e-commerce, TCGPlayer semi-sync only
- D7 Pricing: $0-$199+/mo modular, 0% commission, POS+Inventory floor $80-90/mo
- D8 Security: D+ grade, HSTS max-age=0, no CSP, x-powered-by: Next.js leak
- D9 Infra: DO App Platform, est $740-2,850/mo, 3 subdomains (marketing/app/scanner)
- D11 Architecture: Modular monolith, scanner separate service, /compare/ SEO pages vs 5 competitors
- D12 Cross-ref: 0 critical contradictions, 4 minor resolved (Inventory pricing, team size, BinderPOS count, co-founder)
- **Still needed:** D10 (Authenticated), D14 (Threat Model), D15 (Strategic)

**Key intel:** No native storefront (our advantage), TCGPlayer Chrome extension only, hardware moat (patent-pending), team 3-8 people, revenue est $79K-$274K/yr

### Storepass — Session 1 COMPLETE (2026-02-26)
**Reports:** `docs/reports/storepass/` (4 files + cross-reference)
- D1 Tech: Next.js Pages Router, Node.js + MongoDB, Heroku hosting, S3/CloudFront assets
- D2 People: Trent Ellingsen (CEO), Cal Poly CS grad, 6yr MINDBODY, pivoted from Board Game Atlas (2018)
- D3 Business: Atlas Alpha Inc., San Luis Obispo CA, ~4 employees, CIE HotHouse + Kern VG investors (~$120K)
- D4 Social: ZERO reviews on any platform. Biggest red flag. 100+ stores but zero independent validation.
- D5 Customers: 4 verified (Game Nerdz TX, PokeRand UK, Game Grid Lehi UT, Calico Keep NZ)
- D6 Features: Best buylist UX (250K+ processed), BinderPOS migration (1 day), convention POS, ~17 games + board games
- D7 Pricing: $99/mo+2% (Scaling), $499 (Starter), $999 (Growth), $1,999 (Pro), $4,999 (Enterprise — 10hr/mo custom dev)
- D8 Security: D- grade. Wildcard CORS (`*`) with Auth header exposed. CSP script-src: *. Worse than SortSwift.
- D9 Infra: Heroku (3+ dynos), S3 bucket "5cc.images" shared with Board Game Atlas legacy
- D11 Architecture: Shopify/BigCommerce iframe embed model (middleware, NOT standalone platform). REST API.
- D12 Cross-ref: 0 critical contradictions, 4 minor resolved
- **Still needed:** D10 (Authenticated), D14 (Threat Model), D15 (Strategic)

**Key intel:** Middleware on Shopify (not standalone), buylist is their moat, BinderPOS migration = acquisition strategy, $4,999 justified by custom dev hours not features, legacy Board Game Atlas branding still visible

### TCGSync — Session 1 COMPLETE (2026-02-26)
**Reports:** `docs/reports/tcgsync/` (2 files + cross-reference)
- D1 Tech: Mixed (8+ subdomains), marketing on Hostinger/LiteSpeed, enterprise app nginx/Python(Flask)
- D3 Business: UK-based, founded ~2022-2023, founder "Damo", small team (1-3 people)
- D4 Social: 4.1-4.2/5 Trustpilot (13 reviews, polarized — praise vs "scam" allegations). ScamDoc 25%.
- D6 Features: 77+ games (broadest), live autopricing on ALL tiers including free, Fujitsu scanner (8,000 cards/hr)
- D7 Pricing: Free tier (full autopricing), Enterprise GBP 14,999/yr (~$19K). Mid-tiers not publicly documented. "2% capped $500" NOT VERIFIED.
- D8 Security: Hostinger leaks server/panel info. Enterprise app missing HSTS + Secure flag.
- D9 Infra: Budget hosting (Hostinger), 8+ subdomains, no status page
- D11 Architecture: Modular app, white-label capability, separate kiosk app
- D12 Cross-ref: 2 agents only (lower confidence). 400+ stores = free tool users, not paying subs.
- **Still needed:** D2 (founder full ID), D5 (customer verification), D10, D14, D15

**Key intel (CORRECTED by corroboration):** 1,200+ retailers (NOT 400+), FREE tier missed by agents, NO Fujitsu scanner (it's AI "Vision Pro Scanning"), Enterprise is GBP 19,999/yr (NOT 14,999), 70+ games (not 77+), 6-platform ecosystem (Cardsynced, WebuyMTGcards, TCGAlert, TCGAPIs, ValueMyCard, TCGProxies)

### Site Scrape Corroboration — COMPLETE (2026-02-26)
**Report:** `docs/reports/corroboration-report.md`
**Raw scrapes:** `docs/reports/{competitor}/site-scrape-raw.md`

**Major corrections discovered:**
1. TCGSync has **1,200+ retailers** (not 400+). The 400+ is Cardsynced marketplace stores only.
2. TCGSync Enterprise is **GBP 19,999/yr** (not 14,999). Agents fabricated the lower number.
3. TCGSync has a **FREE tier** (catalog + autopricing + Shopify sync) — agents missed entirely.
4. TCGSync has **NO Fujitsu scanner** — "Vision Pro Scanning" is AI/camera-based. Agent hallucination.
5. SortSwift pricing goes to **$499** (not $199). Has **60+ game categories** (not just 26+).
6. SortSwift is building **native Online Storefront** (Coming Soon) — threatens our key differentiator.
7. Storepass has **9 named customers** including **Troll and Toad** (major retailer). Not just 4.
8. Storepass has **31 broken feature pages** and 12 missing pages (404s). Site is immature.
9. Storepass's "0% commission" claim is **misleading** — Scaling tier has 2% (same as BinderPOS).

## Cross-Competitor Quick Comparison (POST-CORROBORATION)

| | SortSwift | Storepass | TCGSync |
|--|-----------|-----------|---------|
| **Stores** | 220+ (8 testimonials) | 100+ (9 named logos incl. Troll and Toad) | **1,200+** across 16 countries |
| **Pricing** | $0-$499/mo, 0% commission | $99+2%-$4,999/mo | Free-£19,999/yr |
| **Tech** | Next.js/DO/Cloudflare | Next.js/Heroku/CloudFront | Static HTML/Tailwind |
| **Games** | 60+ categories (26+ scanning) | 17+ | 70+ |
| **Moat** | Hardware (Super Sorter + Simple Sifter) | Buylist UX + migration | **Free tier + 6-platform ecosystem** |
| **E-commerce** | Coming Soon (roadmap!) | None (Shopify middleware) | Shopify integration |
| **Security** | D+ | D- | D |
| **Team** | Hidden (no info on site) | 2-5, SLO+Bay Area | 1-3, UK, "Damo" |
| **Threat** | HIGH (8/10) | HIGH (7/10) | **HIGH (8/10)** ↑ upgraded |

**Our advantage over ALL three:** We own the full commerce stack (Saleor + Next.js storefront). BUT SortSwift is building a native storefront (Coming Soon). **Time-limited advantage — build fast.**

**BinderPOS is on waitlist** (not accepting new customers) — confirmed by both TCGSync and SortSwift. Their refugees are the immediate market opportunity.

## Tier 2 Competitors (Standard Depth — 10 Dimensions)

### BinderPOS — COMPLETE (2026-02-26)
**Reports:** `docs/reports/binderpos/` (6 files)
- D1 Tech: Shopify-dependent hybrid app, custom SPA portal, NZ Shopify dev shop origin
- D2 People: Founded by Joshua Grant (LEFT → Fabled TTRPG), Rhys Glaskin (now SWE III at eBay AU), David Logan
- D3 Business: NZ company, bootstrapped, acquired TCGplayer July 2022 → eBay Oct 2022 ($295M total deal), ~$2-3M/yr revenue
- D4 Social: 1.0/5 Sitejabber (2 reviews), dead Discord, FTC antitrust complaints, NO G2/Capterra/Trustpilot
- D5 Customers: 110 Wappalyzer-verified, est 300-600 active, 8 named stores. Growth stalled post-acquisition.
- D6 Features: 22+ game catalogs, strong buylist/kiosk/autopricing. GAPS: no offline, no native scanning, no multi-location, no consignment, no API, PAX S300 only
- D7 Pricing: $100/$150/mo (BINDER/PRO) + 2-2.5% commission + mandatory Shopify ($39-399/mo). TCO ~$1,110/mo for $20K store.
- D9 Infra: 7 service components (Portal, POS, Web Services, eComm, Shopify Sync, Marketplace Sync, Catalog Publish), Atlassian Statuspage, 100% uptime 90 days
- D11 Architecture: Hybrid — custom SPA POS (NOT Shopify POS), Shopify e-commerce backbone, kiosk.binderpos.com, PAX S300 + USAePay payments
- D15 Strategic: MAINTENANCE MODE (12+ month onboarding freeze since Feb 2025), refugee window 6-12 months

**Key intel:** binderpos.com 301 redirects to seller.tcgplayer.com/point-of-sale (full brand absorption). $200M GMV at acquisition. TCGplayer total fees on marketplace sales: ~14.25% + $0.30. Founders departed. 3 competitors (TCGSync, Storepass, SortSwift) actively hunting refugees with dedicated migration pages.

**Our advantage:** No Shopify tax ($39-399/mo savings), zero commissions ($175/mo savings for $20K store), WAC/COGS tracking (no competitor has this), Square Terminal (vs aging PAX S300), real-time Scryfall pricing (vs 6-12hr stale), open API.

**Our gaps vs BinderPOS:** Pokemon/Yu-Gi-Oh databases (CRITICAL), TCGplayer sync, kiosk mode, event management.

**Threat level:** MEDIUM-LOW (4/10) — declining. The threat is not BinderPOS itself but competitors capturing refugees faster.

### CrystalCommerce — COMPLETE (2026-02-26)
**Reports:** `docs/reports/crystalcommerce/` (6 files)
- D1 Tech: Ruby on Rails monolith (since 2006), Liquid templating (Shopify-style), REST API only, BERT-RPC inter-service
- D2 People: Dan McCarty (Founder/CEO), MTG player from Seattle, ~15-20 employees, Glassdoor 3.3/5
- D3 Business: CrystalCommerce Inc., Mountlake Terrace WA, $900K total funding (last in 2016), est $1.0-1.5M/yr revenue
- D4 Social: Weekend downtime is #1 complaint, phantom inventory, outdated UI. Every competitor has "CC alternative" page.
- D5 Customers: 577 verified stores (StoreLeads Q4 2025), 95% US, -0.3% QoQ (flat/declining), 34.3% have only 1-9 products
- D6 Features: 11/13 domains covered. Strong: buylist (kiosk+online), marketplace sync (5+), Ally Network (cross-store inventory). GAPS: no card scanning, no gift cards, no modern payment terminals, no offline, no native apps, minimal reporting
- D7 Pricing: $99/mo + 2.5% online + $599 setup. Legacy $49/mo (pre-Nov 2017). 0% POS/buylist fees. 30-day guarantee.
- D9 Infra: DigitalOcean origin + AWS CloudFront CDN. Est $1.5-5K/mo hosting. Single point of failure risk.
- D11 Architecture: Standalone multi-tenant Rails monolith (NOT on Shopify). Server-rendered. Closed ecosystem (no SFTP, no code access).
- D15 Strategic: Legacy default eroding. LOW-MODERATE threat (3/10). 577 stores = largest migration pool. Innovation blocked by tiny team + leadership dysfunction.

**Key intel:** 700+ claimed stores is inflated (577 verified). ChannelFireball is a CC customer. No card scanning at all (F rating). Network pricing algorithm is unique but degrades as stores leave. Ally Network (cross-store inventory sharing) is genuinely innovative — no competitor has replicated.

**Our advantage:** Modern stack (Django/GraphQL/React vs 2006 Rails), no setup fee (vs $599), no online commission (vs 2.5%), Square Terminal (vs mag-stripe), rich reporting (vs basic exports), open source (vs closed ecosystem), card scanning capability.

**Our gaps vs CrystalCommerce:** Multi-marketplace sync breadth (CC has 5+ channels), shared catalog (2M+ products), Ally Network, buylist kiosk mode, network pricing algorithm.

**Threat level:** LOW-MODERATE (3/10) — cannot innovate, but 577-store install base creates switching cost moat.

### TCGplayer POS — COMPLETE (2026-02-26)
**Reports:** `docs/reports/tcgplayer-pos/` (6 files)
- D1 Tech: Shopify hard dependency (BinderPOS), AWS/MongoDB/Cloudflare, custom SPA POS + Shopify e-commerce backbone
- D2 People: Original founders departed — Joshua Grant (Fabled TTRPG), Rhys Glaskin (demoted to SWE III at eBay AU). CEO Chedy Hampson replaced by eBay's Robert Bigler. Syracuse office closed Aug 2025, 220+ layoffs.
- D3 Business: BinderPOS acquired by TCGplayer July 2022, TCGplayer acquired by eBay Oct 2022 ($295M). ~$736M marketplace GMV. BinderPOS revenue ~$2-3M/yr (<1% of investment thesis).
- D4 Social: Overwhelmingly negative. FTC petition May 2024 (anti-competitive). 50+ seller accounts terminated. "Zero support" consensus.
- D5 Customers: 200-400 estimated active (declining). Wappalyzer found 110 detectable. No new signups since Feb 2025 (onboarding frozen).
- D6 Features: 13 domains audited. A- card scanning (Roca Vision 98%+, separate $5K+ hardware). A- MassPrice autopricing. GAPS: no COGS/WAC, no multi-store, no offline, no loyalty, no accounting integration, no public API, no tournament pairing. Split system: BinderPOS handles register, TCGplayer Pro handles marketplace.
- D7 Pricing: $100/$150/mo (BINDER/PRO) + Shopify ($39-399) + 2-2.5% commission + 10.75% marketplace fee. TCO ~$1,574/mo for $20K store.
- D9 Infra: 7 BinderPOS components (separate statuspage, 100% uptime 90d). Not integrated into TCGplayer main infra.
- D11 Architecture: Two-product frankenstein — BinderPOS (NZ-built POS) + TCGplayer Pro (marketplace toolkit). 4-portal UX: BinderPOS + Shopify Admin + TCGplayer Seller Portal + Kiosk. API frozen to new applicants.
- D15 Strategic: POS in managed decline. eBay investing in marketplace + Roca hardware, NOT POS. Zero POS job postings. "Reimagining inventory/pricing tools" = building new, not extending BinderPOS.

**Key intel:** Three distinct product brands — BinderPOS (POS, $100-150/mo), TCGplayer Pro (marketplace tools, Level 4 sellers only), Roca (hardware, $5K+). binderpos.com 301 → seller.tcgplayer.com/point-of-sale. Onboarding frozen = every new store that needs POS goes elsewhere. 10 of 17 seller-facing URLs returned 404/403 — content consolidation/removal underway.

**Our advantage:** Zero commissions (vs 14.25%+ total), no Shopify tax ($39-399/mo), WAC/COGS tracking (no competitor has), Square Terminal (vs PAX S300), real-time Scryfall (vs stale), one portal (vs 4), open API (vs frozen).

**Our gaps vs TCGplayer POS:** TCGplayer marketplace sync (CRITICAL — their only real moat), Pokemon/Yu-Gi-Oh databases, buylist with marketplace pricing, Roca-level scanning hardware, event management.

**Threat level:** MODERATE (5/10) — entirely due to marketplace gravity. POS component alone is LOW (2/10). Not being invested in.

## Tier 3 Competitors (Light Depth — 6 Dimensions)

### CollectPOS — COMPLETE (2026-02-26)
**Report:** `docs/reports/collectpos/tier3-competitive-intel.md`
- Brand-new beta (Squarespace site created Jan 15, 2026 — 6 weeks old)
- React SPA on Azure/LiteSpeed (dev-grade infra: "resourcegroupdev8b04")
- $99-$159/mo, 4 tiers, PAX terminals at 2.6-2.8% + $0.15
- POS + inventory + trade-ins + PriceCharting pricing. No e-commerce, no marketplace, no card scanning
- Zero public reviews anywhere. "Dozens of stores" claim unverifiable.
- **Threat: 2/10** — pre-revenue beta, non-threat. Quarterly monitoring only.

### CCGSeller — COMPLETE (2026-02-26)
**Report:** `docs/reports/ccgseller/competitive-intel-tier3.md`
- NOT a POS system — listing aggregator pushing to 6 channels (Amazon, TCGplayer, ChannelFireball, eBay, Shopify, Square)
- Solo developer/bootstrapped, unknown operator, AWS ALB + Nginx
- Zero public reviews on any platform
- Pricing not publicly disclosed
- **Threat: 2/10** — narrow listing tool, not competing in POS/inventory/buylist space

### Talaria — COMPLETE (2026-02-26)
**Report:** `docs/reports/talaria/competitive-intel-2026-02-26.md`
- Early-stage purpose-built TCG e-commerce platform (shoptalaria.com)
- Next.js + OpenNext on AWS CloudFront/Lambda + Cloudflare dual-CDN
- One live customer: Oasis Games (Salt Lake City), migrating from CrystalCommerce
- 7+ game lines, automated pricing, buylist, event management. NO POS, no marketplace integrations, no card scanning
- Pre-launch/early beta, zero market presence
- **Threat: 3/10** — validates demand for purpose-built TCG commerce, but missing POS. Monitor for launch.

### NerdSlice — COMPLETE (2026-02-26)
**Report:** `docs/reports/nerdslice/tier3-competitive-assessment.md`
- Full POS for comic + game stores. Laravel/Vue.js/Inertia.js, Cloudflare CDN
- NerdSlice LLC, Casper WY, founded 2021, 2-10 employees, Steve Howe lead dev
- **$0/month base plan** — revenue from 3.5% NerdPay credit surcharge + $10-20/mo add-ons
- Claims 500+ stores but ZERO public reviews (Reddit, G2, Capterra, Trustpilot)
- Comic pull box (League of Comic Geeks), TCG scanning, events, loyalty, branded app
- Gaps: no marketplace integrations (TCGplayer/eBay), basic buylist
- **Threat: 5/10** — aggressive pricing benchmark, meaningful niche player. Missing marketplace integrations.

### Syncrostore — COMPLETE (2026-02-26)
**Report:** `docs/reports/syncrostore/tier3-assessment.md`
- Consignment/antique mall POS with TCG bolted on as expansion vertical
- MP Software LLC, Overland Park KS, ~2022, 2-8 people, bootstrapped
- $49.99/mo starting price, free tier for merchants >$20K/mo via SyncroPay
- SyncroAI card recognition, PriceCharting pricing, TrinketVault e-commerce
- Gaps: no buylist, no events, no TCGplayer integration, no Shopify integration
- Zero Reddit/community presence
- **Threat: 2/10** — consignment-first DNA, TCG is afterthought

## Tier 3 Quick Comparison

| | CollectPOS | CCGSeller | Talaria | NerdSlice | Syncrostore |
|--|-----------|-----------|---------|-----------|------------|
| **Type** | POS beta | Listing tool | E-commerce | POS | Consignment POS |
| **Age** | 6 weeks | Unknown | Pre-launch | 2021 | ~2022 |
| **Stores** | ~0 | Unknown | 1 | 500+ claimed | Unknown |
| **Pricing** | $99-159/mo | Hidden | Hidden | $0 + 3.5% | $49.99+/mo |
| **Threat** | 2/10 | 2/10 | 3/10 | **5/10** | 2/10 |
| **Promote?** | No | No | Monitor | Consider Tier 2 | No |

**Decision gate result:** NerdSlice scored 5/10 — borderline for Tier 2 promotion. Its $0 pricing model + 500+ claimed stores warrants monitoring, but missing marketplace integrations and zero public validation keep it at Tier 3 for now.

## Methodology
- 4 parallel research agents per Tier 1 competitor
- Cross-reference validation after all agents return
- All reports written to disk immediately (context preservation)
- Ethical boundaries: public endpoints only
