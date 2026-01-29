# Council Comprehensive Review - 2026-01-28

**Conducted by:** Multi-Agent Council (6 specialized agents)
**Scope:** Full repository documentation, plans, issues, infrastructure, and AI configuration

---

## Executive Summary

The Council conducted a thorough review of the saleor-platform repository using 6 parallel specialized agents examining documentation structure, .claude configuration, issue tracking, infrastructure docs, plans completion, and multi-LLM crowdsourced perspectives.

### Overall Health Score: **B+ (78/100)**

**Strengths:**
- Excellent AI-first documentation structure (`.claude/` namespace)
- Well-maintained issue tracking with clear resolution dates
- Strong operational documentation in `docs/ops/`
- Mature infrastructure-as-code with drift prevention

**Critical Gaps:**
- 47 documentation issues needing cleanup/consolidation
- 1 missing skill file (`price-sync.md`) referenced in CLAUDE.md
- 6 completed plans scattered with active work
- Security/testing skills documentation gap

---

## Findings by Category

### 1. Documentation Structure (47 issues found)

| Category | Issues | Impact |
|----------|--------|--------|
| Stale/Outdated | 18 | Agents may work on completed tasks |
| Duplicate Info | 9 | Confusion about authoritative source |
| Inconsistent Organization | 12 | Hard to find correct docs |
| Missing Cross-References | 8 | Poor discoverability |

**Top 5 Priority Fixes:**
1. Archive `/docs/ai-reviews/` (15 files) - all phase planning complete
2. Merge `/docs/runbooks/` into `/docs/ops/runbooks/` - eliminate dual locations
3. Create `/docs/README.md` - main docs navigation index
4. Move completed ops docs to `/docs/ops/completed/`
5. Standardize prompts in `.claude/prompts/`

### 2. .claude Configuration (7 issues found)

| Category | Files | Current | Outdated | Missing |
|----------|-------|---------|----------|---------|
| Skills | 13 | 13 | 0 | 1 |
| Rules | 4 | 4 | 0 | 0 |
| Plans | 9 | 4 | 5 | 0 |
| Prompts | 2 | 1 | 1 | 0 |
| Sessions | 1 | 0 | 1 | 0 |

**Critical Action:** Create `.claude/skills/price-sync.md` - referenced in CLAUDE.md but missing

**Plans to Archive:**
- `mtg-sealed-products.md` - 100% complete
- `mvp-completion-plan.md` - 100% complete
- `mtg-inventory-council-implementation.md` - implemented
- `meilisearch-terraform-implementation.md` - superseded

### 3. Issue Tracking Status

**Verified Correctly Resolved:** 12 issues
**Open Issues Remaining:** 4 issues

| Issue | Category | Status | Notes |
|-------|----------|--------|-------|
| ISSUE-008 | Test Coverage | Open | 7 test files, 1.9% coverage |
| ISSUE-012 | Tech Debt | Partial | 10 TODOs remain in POS app |
| ISSUE-013 | React Compiler | Blocked | Formik dependency (~50 hrs) |
| ISSUE-014 | GraphQL | Open | 909 deprecated usages |

**Issue Tracking Health:** Excellent - accurate status, clear dates

### 4. Infrastructure Documentation

**Verified Accurate:**
- Terraform version requirements (1.5.x)
- CloudFront implementation docs
- Drift detection workflow
- Expected divergence documentation
- Import configuration

**Gaps Found:**
- Missing S3 policy backup directory referenced in docs
- AWS Config deployment status unclear (code exists, apply status unknown)
- No IAM baseline snapshots yet (workflow exists, not run)

### 5. Plans Completion Status

| Status | Count | Action |
|--------|-------|--------|
| Completed | 6 | Archive to `docs/legacy/completed/` |
| In Progress | 2 | Keep in current location |
| Draft/Pending | 4 | Decision needed |

**Completed Plans (should archive):**
1. MTG Inventory Council Implementation
2. MVP Completion Plan
3. MTG Catalog Representation
4. Webstore Meilisearch Integration
5. Square Terminal Integration
6. Phase 0-3 AWS Deployment

**Active Plans (keep):**
1. POS Completion Plan (Phase 1 ~95%)
2. MTG Sealed Products (Phase 7 pending)

### 6. Multi-LLM Consensus (Crowdsource)

Both OpenAI o1 and Gemini-2.5-Flash agreed on:

**Strengths:**
- Dual-audience docs approach (AI/human) is innovative
- CLAUDE.md WHY/WHAT/HOW structure is excellent
- Skills/Rules semantic split maps to agent architecture
- ADR practice shows engineering maturity

**Gaps Identified:**
- Missing security/testing AI guidance
- Need `.claude/CONTRIBUTING.md` for standardization
- Cross-linking between docs insufficient

---

## Recommended Actions

### Phase 1: Immediate Cleanup (2-3 hours)

```bash
# 1. Create archive directories
mkdir -p docs/legacy/ai-reviews
mkdir -p docs/legacy/localreview
mkdir -p docs/ops/completed

# 2. Archive completed AI review planning
mv docs/ai-reviews/phase0-* docs/legacy/ai-reviews/
mv docs/ai-reviews/phase1-* docs/legacy/ai-reviews/
mv docs/ai-reviews/phase2-* docs/legacy/ai-reviews/
mv docs/ai-reviews/preflight-* docs/legacy/ai-reviews/
mv docs/ai-reviews/localreview.md docs/legacy/ai-reviews/
mv docs/ai-reviews/MCP_TOOLING_INTAKE.md docs/legacy/ai-reviews/

# 3. Archive completed ops docs
mv docs/ops/staging_deploy_blocker_audit.md docs/ops/completed/2026-01-15-staging-deploy-blocker-audit.md
mv docs/ops/staging_verification_checklist.md docs/ops/completed/2026-01-15-staging-verification-checklist.md

# 4. Merge runbooks
mv docs/runbooks/* docs/ops/runbooks/
rmdir docs/runbooks
```

### Phase 2: Create Missing Docs (1-2 hours)

**Create `/docs/README.md`:**
```markdown
# Documentation Index

## Quick Navigation
- [Architecture](reference/architecture.md)
- [Sync Contracts](reference/sync-contracts.md)
- [Git Workflow](reference/git-philosophy.md)

## AI Agent Docs
- [Claude Configuration](../.claude/skills/README.md)
- [Critical Rules](../.claude/rules/)

## Operations
- [Runbooks](ops/runbooks/)
- [Issues](ops/issues/README.md)
- [Incident Log](ops/incident-changes.md)
```

**Create `.claude/skills/price-sync.md`:**
```markdown
# Price Sync Skill

> **Full implementation**: `saleor-apps/apps/inventory-ops/src/modules/price-sync/`

## When to Use
- Syncing Scryfall market prices to Saleor variants
- Running delta or full price updates
- Investigating price anomalies

## Sync Types
| Type | Command | Use Case |
|------|---------|----------|
| Full | `full` | Initial import or recovery |
| Delta | `delta` | Daily incremental updates |
| Variant | `variant <id>` | Single variant update |

## CLI Usage
```bash
cd saleor-apps/apps/price-sync
bun run src/cli.ts full --channel webstore
bun run src/cli.ts delta --since 24h
```

## Dashboard Integration
- Endpoint: `/price-sync` in inventory-ops app
- Features: Approval workflow, anomaly detection, trend analysis

## Related
- `.claude/skills/inventory-ops.md`
- `docs/reference/sync-contracts.md` (Contract 2)
```

### Phase 3: Consolidation (2-3 hours)

1. **Standardize prompts location:**
   - Move `/docs/prompts/` to `.claude/prompts/`
   - Archive one-time prompts to `/docs/ops/completed/`

2. **Organize root-level docs:**
   - Move `brand-integration.md` → `docs/reference/`
   - Move `singles-builder-implementation.md` → `docs/reference/`
   - Move `pos.md` → `docs/reference/`
   - Move `INVENTORY_OPS_SETUP.md` → `docs/setup/`

3. **Archive completed plans:**
   - Move to `.claude/plans/completed/` or `docs/legacy/completed/`

### Phase 4: Add Cross-References (1 hour)

Update CLAUDE.md to add explicit links:
```markdown
### Quick Links for AI Agents
- [Database Safety Rules](.claude/rules/database.md)
- [Infrastructure Rules](.claude/rules/infrastructure.md)
- [Sync Contracts](docs/reference/sync-contracts.md)
- [Recent Incidents](docs/ops/incident-changes.md)
- [Open Issues](docs/ops/issues/README.md)
```

---

## Files to Delete (After Review)

| File | Reason |
|------|--------|
| `docs/ai-reviews/2026-01-12-localreview.md` | Duplicate of earlier file |
| `.claude/prompts/fix-broken-images.md` | One-time debugging session |

---

## Open Questions Requiring User Input

1. **Meilisearch Terraform**: The plan at `.claude/plans/meilisearch-terraform-implementation.md` shows "APPROVED" but wasn't executed. Is Meilisearch running differently? Should this plan be archived?

2. **POS Payment Router**: The plan at `saleor-apps/apps/pos/docs/implementation-plan.md` has 19 P0/P1 financial integrity issues. Is POS in production? These are critical if yes.

3. **Archive Strategy**: Preference for completed plans?
   - Option A: Move to `docs/legacy/completed/`
   - Option B: Create `.claude/plans/completed/`
   - Option C: Delete after creating summary doc

---

## Metrics for Ongoing Health

```bash
# Documentation freshness check
find docs/ .claude/ -name "*.md" -mtime +30 | wc -l

# Cross-link density
grep -r "\[.*\](.*\.md)" .claude/ docs/reference/ | wc -l

# Open issues count
grep -c "Open" docs/ops/issues/README.md

# Skill coverage
ls -1 .claude/skills/*.md | wc -l
```

---

## Summary

The repository is in **good overall health** with a well-designed AI-first documentation approach. The main issues are organizational (stale docs mixed with current, completed plans not archived) rather than structural.

**Estimated cleanup effort:** 8-10 hours total across 4 phases

**Post-cleanup benefits:**
- Agents won't attempt re-implementing completed work
- Clear authoritative sources for each topic
- Improved discoverability via cross-references
- Reduced context window pollution from stale docs

---

*Report generated by Council multi-agent review system*
*Agents: docs-structure, claude-config, issue-tracking, infrastructure, crowdsource, plans-completion*
