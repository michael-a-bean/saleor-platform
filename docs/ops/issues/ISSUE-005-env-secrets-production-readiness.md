# ISSUE-005: Local .env Contains Active Secrets

**Status:** Resolved (2026-01-23)
**Priority:** P0 - Critical (for production readiness)
**Category:** Security
**Created:** 2026-01-23
**Source:** Repository Health Audit

---

## Problem Statement

The local development `.env` file contains cryptographic secrets that must be rotated before any production deployment. While the file IS properly gitignored (no git leak), these secrets should be treated as potentially compromised for production use.

**This is NOT a security incident** - it's a production-readiness checklist item.

---

## Secrets Requiring Rotation

| Secret | Purpose | Production Approach |
|--------|---------|---------------------|
| `SECRET_KEY` | Django cryptographic signing | AWS Secrets Manager |
| `STRIPE_APP_SECRET_KEY` | Saleor-Stripe app webhook signing | AWS Secrets Manager |
| `INVENTORY_OPS_SECRET_KEY` | Inventory app webhook signing | AWS Secrets Manager |
| `BUYLIST_SECRET_KEY` | Buylist app webhook signing | AWS Secrets Manager |
| `POS_SECRET_KEY` | POS app webhook signing | AWS Secrets Manager |
| `POSTGRES_PASSWORD` | Main database auth | RDS managed credentials |
| `INVENTORY_POSTGRES_PASSWORD` | Inventory database auth | RDS managed credentials |

---

## Current State Verification

Run these commands to verify current security posture:

```bash
# Verify .env is gitignored
grep -n "\.env" .gitignore
# Expected: Line 16 shows ".env"

# Verify no historical commits
git log --all --oneline -- .env
# Expected: Empty (no commits)

# Check for any .env files in git history
git log --all --full-history -- "*.env" | head -20
# Expected: Empty or only example files
```

---

## Remediation Steps

### Step 1: Document Production Secret Requirements

Create a production secrets manifest:

```bash
cat > docs/deploy/aws/SECRETS_MANIFEST.md << 'EOF'
# Production Secrets Manifest

## Required Secrets (AWS Secrets Manager)

| Secret Path | Description | Rotation Policy |
|-------------|-------------|-----------------|
| `saleor/prod/SECRET_KEY` | Django signing key | 90 days |
| `saleor/prod/STRIPE_APP_SECRET_KEY` | Stripe webhook key | On compromise |
| `saleor/prod/INVENTORY_OPS_SECRET_KEY` | Inventory app key | 90 days |
| `saleor/prod/BUYLIST_SECRET_KEY` | Buylist app key | 90 days |
| `saleor/prod/POS_SECRET_KEY` | POS app key | 90 days |

## Database Credentials

Managed via RDS IAM authentication or Secrets Manager rotation.

## Generation Commands

```bash
# Generate 256-bit hex secret
openssl rand -hex 32

# Create in AWS Secrets Manager
aws secretsmanager create-secret \
  --name saleor/prod/SECRET_KEY \
  --secret-string "$(openssl rand -hex 32)"
```
EOF
```

### Step 2: Verify Git Safety

```bash
# Full history check
git log --all --full-history --diff-filter=A -- "*.env" ".env*"

# Search for accidental secret commits
git log -p --all -S "SECRET_KEY" -- "*.md" "*.yml" "*.yaml" | head -100
```

### Step 3: Create .env.example for Onboarding

Ensure `.env.example` exists with placeholder values:

```bash
# Verify .env.example exists
ls -la .env.example

# If missing, create from .env (redacted)
grep -E "^[A-Z_]+=" .env | sed 's/=.*/=your_value_here/' > .env.example.new
```

---

## Verification Commands

After completing remediation:

```bash
# 1. Confirm .env still gitignored
git check-ignore .env && echo "✓ .env is ignored"

# 2. Verify no secrets in tracked files
git grep -l "SECRET_KEY.*=" -- ":(exclude).env*" | grep -v example

# 3. Confirm documentation exists
ls docs/deploy/aws/SECRETS_MANIFEST.md

# 4. Verify .env.example has no real secrets
grep -E "(sk_live|sk_test|[a-f0-9]{64})" .env.example && echo "WARNING: Real secrets in example!" || echo "✓ No secrets in example"
```

---

## Definition of Done

- [x] `.env` confirmed in `.gitignore` (line 16)
- [x] No historical `.env` commits in git history
- [x] `docs/deploy/aws/SECRETS_MANIFEST.md` created (2026-01-23)
- [x] `.env.example` verified - contains safe placeholders only
- [x] Scripts verified - no hardcoded secrets (fix-stripe-config.* already remediated)
- [x] Issue status updated to Resolved in README.md

---

## Notes

- Development secrets can continue to be used locally
- Production deployment MUST use AWS Secrets Manager or equivalent
- Rotation schedule should be established before go-live
- Consider implementing automatic secret rotation for database credentials

---

## Related

- `docs/deploy/aws/ENV_VARS.md` - Environment variable documentation
- `docs/setup/security-checklist.md` - Full security checklist
- AWS Secrets Manager: https://aws.amazon.com/secrets-manager/
