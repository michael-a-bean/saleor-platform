---
task: Fix terraform, test deploy, ship app consolidation to staging
slug: 20260311-120000_app-consolidation-staging-deploy
effort: advanced
phase: verify
progress: 12/24
mode: interactive
started: 2026-03-11T12:00:00-07:00
updated: 2026-03-11T12:05:00-07:00
---

## Context

App consolidation branch (`feature/app-consolidation`) merges buylist + mtg-import into inventory-ops. 7 platform commits, 12 saleor-apps commits. PR #69 is open. CI shows:
- Apps Checks: PASS (consolidated app builds)
- Terraform Validation: PASS (config is valid)
- Terraform Plan: FAIL (OIDC auth — IAM trust policy doesn't allow PR refs)

The user ran `terraform plan` from another computer — config is confirmed working. This machine is fully synced with remote. Need to fix the OIDC issue, push, merge, and deploy.

### Risks
- OIDC fix is chicken-and-egg: can't apply terraform to fix the trust policy via CI because CI can't authenticate
- Removing buylist/mtg-import ECS services may fail if they have running tasks
- Consolidated inventory-ops may need Saleor app re-registration for expanded permissions

## Criteria

- [x] ISC-1: OIDC trust policy includes pull_request subject pattern in terraform
- [ ] ISC-2: Terraform plan workflow authenticates successfully on PR (blocked: chicken-and-egg)
- [x] ISC-3: Terraform fmt check passes (no formatting drift)
- [x] ISC-4: Terraform validate passes clean
- [ ] ISC-5: tflint reports no errors (blocked: OIDC)
- [ ] ISC-6: Trivy IaC scan shows no HIGH/CRITICAL findings (blocked: OIDC)
- [ ] ISC-7: All PR CI checks pass (green) (blocked: OIDC)
- [x] ISC-8: PR description accurately reflects final changes
- [x] ISC-9: deploy-staging.yml has no buylist/mtg-import references
- [x] ISC-10: test-platform.yml has no stale buylist/mtg-import jobs
- [x] ISC-11: deploy-service.sh has no buylist/mtg-import IMAGE_MAP entries
- [x] ISC-12: rollback.sh has no buylist-app in service list
- [x] ISC-13: docker-compose.yml has no buylist/mtg-import service definitions
- [x] ISC-14: apps-smoke.sh has no buylist/mtg-import endpoints
- [x] ISC-15: inventory-ops memory set to 1024MB in terraform
- [x] ISC-16: Grafana dashboard service list excludes buylist and mtg-import
- [x] ISC-17: ECR repos for buylist/mtg-import retained (rollback safety)
- [x] ISC-18: Submodule commits pushed before platform push
- [ ] ISC-19: Feature branch merged to platform/main
- [ ] ISC-20: Terraform apply succeeds on staging
- [ ] ISC-21: inventory-ops ECS service deploys with new image
- [ ] ISC-22: buylist ECS service removed (desired_count=0 or deleted)
- [ ] ISC-23: mtg-import ECS service removed (desired_count=0 or deleted)
- [ ] ISC-24: Consolidated inventory-ops responds on /apps/inventory health check

## Decisions

## Verification
