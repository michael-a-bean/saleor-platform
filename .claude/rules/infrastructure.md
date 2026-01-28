# Infrastructure Critical Rules

> **Full procedures**: See `docs/ops/` for runbooks and `infra/terraform/` for IaC.

## Terraform State Integrity (CRITICAL)

**NEVER make manual AWS changes without Terraform reconciliation.**

| If You Must Use AWS CLI | Then You Must Also |
|------------------------|-------------------|
| Create resources | Log in `docs/ops/incident-changes.md` within 24h |
| Modify resources | Add import block to `infra/terraform/imports.tf` within 48h |
| Delete resources | Verify not in Terraform state first |

**Why:** Manual changes caused severe VPC drift (2026-01-22) requiring 60+ imports to fix.

## Before Any Infrastructure Work

```bash
# 1. Check current Terraform state alignment
cd infra/terraform
docker run --rm -v "$(pwd):/workspace" -v "$HOME/.aws:/root/.aws:ro" \
  -w /workspace -e AWS_REGION=us-west-1 \
  hashicorp/terraform:1.5 plan -var-file=environments/staging.tfvars

# 2. If drift exists, investigate before proceeding
```

## Expected Drift (Ignore These)

The following drift is **intentional** and should not trigger concern:

| Resource Type | Reason |
|--------------|--------|
| ECS task definitions | CI/CD deploys new revisions; `ignore_changes` in Terraform |
| Task definition ARN versions | Same - deployment creates new revision numbers |

See `docs/reference/expected-divergence.md` for full list.

## Resource Tagging (REQUIRED)

All Terraform-managed resources MUST have these tags:

```hcl
tags = {
  ManagedBy   = "terraform"
  Environment = var.environment
  Project     = var.project_name
}
```

Use `local.common_tags` from `infra/terraform/main.tf`.

## Prohibited Actions

| Action | Why |
|--------|-----|
| Creating VPCs via console/CLI | Must go through Terraform |
| Modifying IAM roles manually | Security audit trail required |
| Deleting resources without checking state | May orphan Terraform references |
| Ignoring drift detection alerts | Drift compounds over time |

## Incident Response Exception

During active incidents, manual changes ARE allowed but:

1. **Immediately** log the change in `docs/ops/incident-changes.md`
2. **Within 48 hours** reconcile with Terraform state
3. **Tag manual resources** with `ManagedBy: manual-incident-YYYY-MM-DD`

## Key Files

| File | Purpose |
|------|---------|
| `infra/terraform/imports.tf` | Import blocks for state alignment |
| `docs/reference/expected-divergence.md` | Intentional drift documentation |
| `docs/ops/incident-changes.md` | Manual change log |
| `.github/workflows/terraform-drift-detection.yml` | Weekly drift checks |
