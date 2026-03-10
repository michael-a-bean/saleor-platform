# POS Build vs Buy Analysis (Feb 24, 2026)

## Key Findings

### Ecosystem Reality
- **No POS-specific third-party apps exist for Saleor.** Our custom POS is the only known Saleor POS implementation.
- **No saleor-community GitHub org** — community contributions are individual repos (djkato's Docker builds + Rust SDK being the most notable)
- Saleor App Store has 20+ apps but all are online-commerce focused (payments, CMS, email, search)

### Top BUY Recommendations
1. **TaxJar** ($19/mo Starter) — first-party Saleor app, cheapest option, Stripe ecosystem alignment. Call API directly from POS (bypass checkout webhooks).
2. **Metabase** (self-hosted, free) — covers 19 reporting gaps immediately. Deploy via Docker.
3. **Grafana** (already deployed) — add PostgreSQL data source for business dashboards at $0 incremental cost.
4. **@point-of-sale npm suite** (free) — browser-native receipt printing, cash drawer, barcode scanner, customer display via WebUSB/Web Serial.
5. **Star mPOP / Epson TM-T20III** (~$250-400) — receipt printer hardware with integrated cash drawer option.

### Critical Third-Party Discovery: @point-of-sale
- Author: Niels Leenheer (GitHub)
- Libraries: `receipt-printer-encoder`, `webusb-receipt-printer`, `webserial-receipt-printer`, `webserial-customer-display`, `webserial-barcode-scanner`
- Eliminates need for PrintNode, Star CloudPRNT, or any middleware
- Chrome-only (WebUSB/Web Serial are Chromium-only) — acceptable for POS station

### TCGPlayer API Blocker
- TCGPlayer no longer grants new API access
- JustTCG (free API) worth evaluating as pricing complement to Scryfall
- TCGCSV provides daily historical TCGPlayer pricing data for free

### Total Year 1 Cost: ~$888
- $228 TaxJar + ~$660 hardware + $0 software licenses

### Development: ~93 days across 4 phases (~16 weeks)
- Phase 1 (Foundation/P0): ~10 days
- Phase 2 (Core Workflows): ~19 days
- Phase 3 (Inventory Intelligence): ~21 days
- Phase 4 (Integration & Polish): ~43 days

### Report Location
- Full report: `docs/pos-build-vs-buy-report.md`
- SaaS research: `docs/pos-saas-integration-research.md`
- Capability mapping: `docs/pos-capability-mapping.md`
