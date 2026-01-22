# Dashboard 3.22 Fix Follow-Through

**Date:** 2026-01-12
**Author:** Gen (Claude Opus 4.5)
**Status:** Committed and Pushed

## Summary

Completed the dashboard 3.22 alignment fix and documentation update. The staging dashboard was pointing to `localhost:8000` due to two issues:
1. Wrong environment variable name (`API_URI` instead of `API_URL`)
2. Outdated image versions (3.21 instead of 3.22.x)

## Commits

| SHA | Message | Files |
|-----|---------|-------|
| `af78487` | fix(deploy): align Saleor 3.22 and wire dashboard API_URL | 4 Terraform files |
| `6189664` | docs: correct dashboard env var to API_URL | ENV_VARS.md |

## Files Changed

### Commit 1: `af78487` (Infra Fix)
- `infra/terraform/modules/ecs/main.tf` - Changed `API_URI` → `API_URL` in dashboard task definition
- `infra/terraform/environments/staging.tfvars` - Updated API to 3.22, Dashboard to 3.22.24
- `infra/terraform/environments/production.tfvars` - Updated Dashboard from 3.22.0 to 3.22.24
- `infra/terraform/variables.tf` - Updated default dashboard image to 3.22.24

### Commit 2: `6189664` (Docs Fix)
- `docs/deploy/aws/ENV_VARS.md` - Corrected dashboard env var documentation, added clarification note

## Validation

- `/localreview` passed with no significant issues
- `terraform validate` - Success
- `terraform fmt -check` - No formatting issues
- No secrets or sensitive data in commits

---

## Manual Steps for Michael

### 1. Apply Terraform Changes to Staging

```bash
cd /home/michael/saleor-platform/infra/terraform

# Plan the changes (review output carefully)
terraform plan -var-file=environments/staging.tfvars -out=staging.tfplan

# Apply the plan
terraform apply staging.tfplan
```

**Expected changes:**
- ECS task definition for `dashboard` updated (API_URL env var)
- ECS task definition for `api` updated (image 3.22)
- ECS task definition for `worker` updated (image 3.22)

### 2. Verify GitHub Actions Deployment

After push, the `deploy-staging.yml` workflow should trigger automatically.

**Check at:** https://github.com/michael-a-bean/saleor-platform/actions

**Jobs that must be green:**
- `build` - Builds storefront image
- `migrate` - Runs database migrations
- `deploy` - Deploys ECS services
- `smoke-test` - Validates endpoints (if configured)

### 3. Post-Deploy Verification Commands

Copy and run these commands to verify the deployment:

```bash
ALB="http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

# Dashboard loads (expect 200)
curl -s -o /dev/null -w "dashboard_status=%{http_code}\n" "$ALB/dashboard/"

# GraphQL reachable (expect 200)
curl -s -o /dev/null -w "graphql_status=%{http_code}\n" "$ALB/graphql/"

# Minimal GraphQL query returns JSON
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}' \
  "$ALB/graphql/" | head -c 300

# Verify no localhost references in dashboard HTML
curl -s "$ALB/dashboard/" | grep -oE 'localhost|:8000' && echo "FAIL: localhost found" || echo "OK: No localhost references"

# Check API_URL is correctly configured in dashboard
curl -s "$ALB/dashboard/" | grep -oE 'http://[^"]*graphql' | head -1
```

**Expected results:**
- `dashboard_status=200`
- `graphql_status=200`
- GraphQL returns `{"data":{"__typename":"Query"}}`
- No localhost or :8000 references
- API URL should be the ALB endpoint, not localhost

### 4. Browser DevTools Verification

1. Open: http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard/
2. Open DevTools (F12) → Network tab
3. Filter by "graphql"
4. Attempt to log in or navigate
5. Verify all GraphQL requests go to:
   ```
   http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/
   ```
6. **FAIL condition:** Any requests to `localhost:8000`

---

## Known Limitations

1. **HTTP only:** Staging uses HTTP (no TLS). Production will require HTTPS configuration.
2. **Pre-existing issue:** `scripts/deploy/aws/deploy-service.sh` has hardcoded image versions that may need updating separately (not part of Terraform flow).
3. **ECS service update:** After Terraform apply, ECS may take 2-5 minutes to roll out new task definitions.

## Rollback

If issues occur, revert to previous commit:

```bash
git revert af78487 6189664
git push origin platform/main
cd infra/terraform
terraform apply -var-file=environments/staging.tfvars
```

## References

- [Saleor Dashboard Docker Configuration](https://github.com/saleor/saleor-dashboard/blob/main/docs/docker.md)
- [Diagnostic Report: Dashboard 3.22 Alignment](./2026-01-12-dashboard-322-alignment.md)
