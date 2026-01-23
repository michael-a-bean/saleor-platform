# API Versioning Policy

**Current Saleor Version:** 3.22
**Last Updated:** 2026-01-23

This document defines the platform's approach to API versioning and migration.

---

## Version Pinning Strategy

### Current Pinned Versions

| Component | Version | File |
|-----------|---------|------|
| Saleor API | 3.22 | `docker-compose.yml` |
| Saleor Dashboard | 3.22 | `docker-compose.yml` |
| Saleor App SDK | 1.3.0 | `saleor-apps/package.json` |

### Why Pin Versions

1. **Reproducibility** - Same behavior across environments
2. **Stability** - No surprise breaking changes
3. **Controlled upgrades** - Test before adopting new versions
4. **Team coordination** - Everyone works against same API

---

## Saleor Release Cadence

Saleor follows a regular release schedule:

| Release Type | Frequency | Example |
|--------------|-----------|---------|
| Major (X.0) | ~Annual | 3.0 -> 4.0 |
| Minor (3.X) | ~Monthly | 3.21 -> 3.22 |
| Patch (3.22.X) | As needed | Bug fixes |

### Breaking Changes

- **Minor versions** may deprecate APIs (warnings, not breaks)
- **Major versions** remove deprecated APIs
- Breaking changes are documented in release notes

---

## Deprecation Handling

### Current Deprecations

The platform has 909 deprecated GraphQL field usages (ISSUE-014), primarily Saleor 4.0 migration warnings.

### Deprecation Response Strategy

1. **Monitor** - Track deprecation warnings in CI/CD
2. **Assess** - Evaluate impact during next version planning
3. **Plan** - Schedule migration before removal in major version
4. **Execute** - Update code, test, deploy

### Checking Deprecations

```bash
# GraphQL deprecation warnings appear during codegen
cd storefront
pnpm generate  # Shows deprecated field warnings
```

---

## Migration Planning Process

### Pre-Migration Checklist

Before upgrading Saleor version:

- [ ] Read Saleor release notes for target version
- [ ] Identify breaking changes
- [ ] Check GraphQL schema diff
- [ ] Review deprecated fields being removed
- [ ] Estimate migration effort

### Migration Steps

1. **Create branch:** `feature/saleor-3.XX-upgrade`
2. **Update docker-compose.yml** with new version
3. **Run database migrations** (if any)
4. **Regenerate GraphQL types**
   ```bash
   cd storefront && pnpm generate
   cd saleor-apps && pnpm generate
   ```
5. **Fix type errors** from schema changes
6. **Test critical paths:**
   - Product browsing
   - Checkout flow
   - Order management
   - Webhook processing
7. **Update documentation**
8. **Merge after approval**

### Post-Migration

- Update this document with new version
- Document any migration gotchas in `docs/ops/runbooks/`
- Notify team of changes

---

## Version Compatibility Matrix

### Storefront Compatibility

| Storefront | Saleor API | Notes |
|------------|------------|-------|
| Current | 3.22 | Tested |
| Current | 3.21 | Should work |
| Current | 4.0 | Requires migration |

### Saleor Apps Compatibility

| Apps | Saleor API | SDK Version |
|------|------------|-------------|
| Current | 3.22 | 1.3.0 |

### Database Compatibility

Saleor uses Django migrations. Database schema changes require running migrations:

```bash
docker compose exec api python manage.py migrate
```

---

## Rollback Procedure

If an upgrade causes issues:

1. **Stop services:**
   ```bash
   docker compose down
   ```

2. **Revert docker-compose.yml** to previous version

3. **Restore database** if migrations were applied
   ```bash
   # From backup
   pg_restore -d saleor backup_pre_upgrade.dump
   ```

4. **Restart services:**
   ```bash
   docker compose up -d
   ```

5. **Document the issue** for future reference

---

## Planned Upgrades

### Q2 2026: Saleor 4.0 Migration

**Scope:**
- Address 909 deprecated GraphQL usages
- Update SDK to 2.x
- Potential breaking changes in checkout flow

**Estimated Effort:** 2-4 weeks

**Tracking:** ISSUE-014

---

## API Stability Guarantees

### Platform APIs

This platform does not expose public APIs beyond Saleor's. Internal integrations:

| Integration | Stability |
|-------------|-----------|
| inventory-ops webhooks | Internal, may change |
| buylist webhooks | Internal, may change |
| Meilisearch sync | Internal, documented in sync-contracts.md |

### External Dependencies

| Dependency | Update Policy |
|------------|---------------|
| Saleor | Upgrade quarterly, after testing |
| Stripe | Follow Stripe API versioning |
| Meilisearch | Upgrade as needed, test first |

---

## Further Reading

- [Saleor Release Notes](https://github.com/saleor/saleor/releases)
- [Saleor Migration Guides](https://docs.saleor.io/docs/upgrade-guides)
- [Platform Architecture](../reference/architecture.md)
- [Sync Contracts](../reference/sync-contracts.md)
