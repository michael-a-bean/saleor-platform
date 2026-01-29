# Delivery Contract

**Version:** 1.0.0
**Last Updated:** 2026-01-10
**Status:** Active

This document defines the canonical delivery invariants for the Saleor Hobby Gaming Platform. All CI/CD pipelines, deployment processes, and development workflows MUST adhere to these rules.

---

## 1. Environments

| Environment | Branch | Purpose | Access |
|-------------|--------|---------|--------|
| **local** | Any | Developer workstation | Individual |
| **staging** | `platform/main` | Pre-production testing | Team |
| **production** | `platform/main` (promoted) | Customer-facing | Restricted |

### Environment-Specific Invariants

| Invariant | Local | Staging | Production |
|-----------|-------|---------|------------|
| Secrets source | `.env` file | GitHub Secrets / Vault | GitHub Secrets / Vault |
| Fallback defaults | NOT ALLOWED | NOT ALLOWED | NOT ALLOWED |
| Debug mode | Allowed | Disabled | Disabled |
| HTTP IP Filter | Disabled | Enabled | Enabled |
| Database | Local container | Managed PostgreSQL | Managed PostgreSQL |
| SSL/TLS | Optional | Required | Required |

**CRITICAL:** Applications MUST fail fast if required environment variables are missing. No fallback defaults for secrets.

---

## 2. Artifact Strategy

### Image Tagging Convention

```
ghcr.io/michael-a-bean/saleor-platform/<service>:<tag>
```

| Tag Format | Purpose | Example |
|------------|---------|---------|
| `sha-<commit>` | Immutable build artifact | `sha-abc1234` |
| `staging` | Current staging deployment | Floating tag |
| `production` | Current production deployment | Floating tag |
| `latest` | Most recent main build | Floating tag |

### Build Requirements

1. All images MUST be built with:
   - `--frozen-lockfile` (no lockfile modifications during build)
   - Explicit base image versions (no `:latest` tags)
   - Multi-stage builds for production images

2. Build-time secrets MUST:
   - Use placeholder values only
   - Never contain real credentials
   - Be overridden at runtime

### Artifact Registry

- **Primary:** GitHub Container Registry (ghcr.io)
- **Backup:** DockerHub (if GHCR unavailable)

---

## 3. Promotion Rules

### Local to Staging

| Trigger | Conditions | Actions |
|---------|------------|---------|
| PR merge to `platform/main` | All CI checks pass | Build, tag, push, deploy |

**Required CI Checks:**
- [ ] Lint passes (all languages)
- [ ] Type check passes (TypeScript)
- [ ] Unit tests pass
- [ ] Migration validation passes
- [ ] Container builds succeed
- [ ] Security scan passes (gitleaks, trivy)
- [ ] /localreview passes (no HIGH findings)

### Staging to Production

| Trigger | Conditions | Actions |
|---------|------------|---------|
| Manual approval | Staging smoke tests pass | Tag promotion, deploy |

**Required Approvals:**
- [ ] At least 1 team member approval
- [ ] Staging deployment verified (smoke tests)
- [ ] No blocking incidents in staging
- [ ] Migration dry-run successful

---

## 4. Migration Rules

### Pre-Migration Requirements

1. **Dry-Run Mandatory:**
   - Django: `python manage.py migrate --plan`
   - Prisma: `pnpm prisma migrate diff --preview-feature`

2. **Backup Verification:**
   - Database backup exists and is restorable
   - Backup timestamp within 1 hour of migration

3. **Rollback Plan:**
   - Every migration MUST have documented rollback steps
   - Rollback MUST be tested in staging before production

### Migration Execution Order

1. **Additive Changes First:**
   - Add new columns (nullable or with defaults)
   - Add new tables
   - Add new indexes

2. **Backfill Data:**
   - Populate new columns with data
   - Verify data integrity

3. **Constraint Changes:**
   - Add NOT NULL constraints
   - Add foreign keys
   - Add check constraints

4. **Destructive Changes Last (CAUTION):**
   - Drop columns (after code no longer references them)
   - Drop tables
   - Rename columns (use add/copy/drop pattern)

### Rollback Procedures

| Scenario | Procedure |
|----------|-----------|
| Migration failed mid-execution | Restore from backup |
| Application error after migration | Rollback migration (if reversible) |
| Data corruption detected | Restore from backup + investigate |
| Performance degradation | Rollback migration (if reversible) |

**CRITICAL:** Some migrations are not reversible. Document this explicitly and require additional approval.

---

## 5. Secrets Policy

### Classification

| Classification | Examples | Handling |
|----------------|----------|----------|
| **Critical** | Database passwords, API keys with write access | Vault/Secrets Manager only |
| **Sensitive** | Read-only API keys, JWT signing keys | GitHub Secrets or Vault |
| **Internal** | Service URLs, non-secret config | Environment variables |

### Requirements

1. **No Secrets in Repository:**
   - `.env` files MUST be in `.gitignore`
   - `*.example` files MUST contain placeholders only
   - Commit hooks MUST scan for secret patterns

2. **No Secrets in Docker Images:**
   - Build-time secrets use placeholder values
   - Runtime secrets injected via environment

3. **Rotation Policy:**
   - All secrets MUST be rotatable without code changes
   - Rotation process documented for each secret type

4. **Audit Trail:**
   - Secret access logged
   - Secret changes tracked in change management

### Secret Scanning Tools

| Tool | Purpose | Stage |
|------|---------|-------|
| gitleaks | Detect secrets in commits | Pre-commit, CI |
| trivy | Container vulnerability + secret scan | CI |
| detect-secrets | Additional secret pattern detection | CI |

---

## 6. Environment Variable Validation

### Startup Validation Requirements

Applications MUST validate ALL required environment variables at startup:

```typescript
// Example validation pattern
const required = ['DATABASE_URL', 'SECRET_KEY', 'SALEOR_API_URL'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
```

### Fail-Fast Behavior

- Missing required variable: Application MUST NOT start
- Invalid format: Application MUST NOT start
- Connection failure: Retry with backoff, then fail

### Error Messages

Error messages MUST:
- Clearly identify the missing/invalid variable
- NOT expose the expected value or format for secrets
- Provide reference to documentation

---

## 7. Version Pinning

### Dockerfile Requirements

| Resource | Pinning | Example |
|----------|---------|---------|
| Base images | Exact version | `node:22.12.0-alpine3.21` |
| System packages | Explicit install | `apk add --no-cache openssl=3.1.4-r5` |
| Language packages | Lockfile only | `--frozen-lockfile` |

### Package Manager Requirements

| Package Manager | Lockfile | Install Command |
|-----------------|----------|-----------------|
| pnpm | `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| pip | `requirements.txt` (pinned) | `pip install -r requirements.txt --no-deps` |

### Corepack Version

Node.js corepack MUST specify exact pnpm version in `package.json`:

```json
{
  "packageManager": "pnpm@9.15.0"
}
```

---

## 8. Local Development

### First-Time Setup

```bash
# 1. Clone with submodules
git clone --recursive https://github.com/michael-a-bean/saleor-platform.git
cd saleor-platform

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your values
# REQUIRED: All variables marked as required

# 4. Start infrastructure
docker compose up -d db cache

# 5. Run migrations
docker compose run --rm api python3 manage.py migrate

# 6. Start all services
docker compose up -d
```

### Validation Before Commit

```bash
# Run full validation suite
make validate

# Run local review (required for CI/CD, migrations, secrets changes)
make localreview
```

---

## 9. Validation Entrypoints

### make validate

Runs all validation checks in sequence. **Does not require a local `.env` file.**

| Check | Command | Expected Behavior |
|-------|---------|-------------------|
| Docker Config | `docker compose config` | Valid configuration |
| Lint | `pnpm lint` | All linters pass |
| Type Check | `tsc --noEmit` | No type errors |
| Unit Tests | `pnpm test` | All tests pass |
| Migration Check | See below | No pending migrations |
| Local Review | `make localreview` | No HIGH findings |

**Environment Handling:**
- If `.env` exists: Uses it for docker-compose validation
- If `.env` is missing: Falls back to `.env.example` for validation
- This allows CI and fresh clones to run `make validate` without secrets

### make validate-with-env

Same as `make validate` but **requires** a properly configured `.env` file. Use this when you need to validate the full local development environment.

```bash
# Strict validation (fails if .env is missing or incomplete)
make validate-with-env
```

### make localreview

Runs deterministic pre-commit review gate:

| Check | Severity | Action on Failure |
|-------|----------|-------------------|
| Hardcoded secrets | CRITICAL | Block commit |
| CI/CD changes | HIGH | Require review |
| Migration changes | HIGH | Require review |
| New NEXT_PUBLIC_ vars | MEDIUM | Warning |

---

## 10. Compliance Checklist

Before any deployment, verify:

- [ ] All CI checks pass
- [ ] No HIGH/CRITICAL findings from /localreview
- [ ] All required environment variables documented
- [ ] Migration dry-run completed
- [ ] Rollback procedure documented (if applicable)
- [ ] Security scan completed
- [ ] At least one reviewer approved (for staging/production)

---

## Appendix A: Required Environment Variables

### Platform Core

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Django secret key (64+ chars) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CACHE_URL` | Yes | Redis/Valkey connection string |
| `CELERY_BROKER_URL` | Yes | Celery broker URL |

### Custom Apps

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_APP_SECRET_KEY` | Yes | Stripe app encryption key |
| `INVENTORY_OPS_SECRET_KEY` | Yes | Inventory ops encryption key |
| `BUYLIST_SECRET_KEY` | Yes | Buylist app encryption key |
| `POS_SECRET_KEY` | Yes | POS app encryption key |

### Optional

| Variable | Required | Description |
|----------|----------|-------------|
| `INSTALLATION_ID` | No | Saleor app installation ID |
| `MEILISEARCH_API_KEY` | No | Meilisearch master key |

---

## Appendix B: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-10 | Initial delivery contract |

---

*This document is maintained by the platform team. Changes require review.*
