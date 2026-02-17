# Infrastructure Incident Change Log

**Purpose:** Track all manual AWS changes made during incident response for Terraform reconciliation.

**Rule:** Every manual AWS CLI command that creates, modifies, or deletes infrastructure MUST be logged here within 24 hours. This prevents Terraform drift accumulation.

---

## Template

When you make a manual change, copy this template and fill in the details:

```markdown
### [DATE] - [Brief Description]

**Incident:** [Link to incident or brief description]
**Responder:** [Your name]
**Time:** [When the change was made]

**Changes Made:**
```bash
# Paste the actual AWS CLI commands used
aws ec2 create-vpc --cidr-block 10.0.0.0/16
```

**Resources Created/Modified:**
- Resource type: [e.g., VPC, Security Group, ECS Service]
- Resource ID: [e.g., vpc-0123456789abcdef0]
- Region: [e.g., us-west-1]

**Terraform Reconciliation Status:**
- [ ] Import block added to `imports.tf`
- [ ] Terraform plan shows no unexpected drift
- [ ] Documentation updated (if applicable)

**Notes:**
[Any additional context about why this was necessary]
```

---

## Change History

### 2026-02-17 - Fix ALB HTTPS Routing for Saleor Apps

**Incident:** All 5 Saleor apps returning 404 in staging — not accessible from dashboard
**Responder:** Michael + PAI (Gen)
**Time:** 2026-02-17

**Root Cause:**
When HTTPS host-based routing was added (2026-02-14), the ALB listener rules for apps used incorrect path patterns. The HTTPS rules matched `/stripe/*`, `/inventory-ops/*`, etc., but the apps are built with `BASE_PATH=/apps/stripe`, `/apps/inventory`, etc. Requests to `/apps/stripe/*` fell through to the default rule (storefront), returning a Next.js 404.

**Changes Made:**
```bash
# Modified 5 ALB HTTPS listener rules to match actual app BASE_PATH values:
# Priority 200: /stripe/* → /apps/stripe/*
# Priority 210: /inventory-ops/* → /apps/inventory/*
# Priority 220: /buylist/* → /apps/buylist/*
# Priority 230: /pos/* → /apps/pos/*
# Priority 240: /mtg-import/* → /apps/mtg-import/*

aws elbv2 modify-rule --rule-arn <rule-arn> --conditions '[
  {"Field":"host-header","HostHeaderConfig":{"Values":["apps.staging.michaelbean.org"]}},
  {"Field":"path-pattern","PathPatternConfig":{"Values":["/apps/<app>/*","/apps/<app>"]}}
]' --region us-west-1
# (repeated for all 5 app rules)
```

**Resources Modified:**
- ALB HTTPS listener rules (priorities 200, 210, 220, 230, 240) on `saleor-platform-staging-alb`
- Region: us-west-1

**Terraform Reconciliation Status:**
- [x] Terraform code updated in `infra/terraform/modules/alb/main.tf` (same commit)
- [ ] Terraform plan confirms no drift (run `terraform plan` to verify)

**Notes:**
The HTTP (non-HTTPS) rules already had the correct `/apps/*` paths. The mismatch was introduced when creating the HTTPS host-based rules, which incorrectly stripped the `/apps/` prefix. All 5 apps confirmed responding HTTP 200 after fix.

---

### 2026-02-14 - CI/CD Pipeline Fixes (post-HTTPS migration)

**Incident:** CI/CD pipeline failures after HTTPS migration
**Responder:** Michael + PAI
**Time:** 2026-02-14 (afternoon)

**Changes Made:**
```bash
# Deleted failed Prisma migration records from inventory_ops database
# (mtg-import's 0001_initial poisoned _prisma_migrations table)
aws ecs run-task --cluster saleor-platform-staging \
  --task-definition saleor-platform-staging-inventory-ops \
  --overrides '{"containerOverrides":[{"name":"inventory-ops","command":["sh","-c","echo \"DELETE FROM _prisma_migrations WHERE finished_at IS NULL;\" | npx prisma db execute --stdin"]}]}'

# Registered new storefront task definition (rev 65) with HTTPS URLs
# Previous revisions had runtime SALEOR_API_URL pointing to raw ALB hostname
aws ecs register-task-definition --cli-input-json file:///tmp/storefront-td.json
aws ecs update-service --cluster saleor-platform-staging --service storefront \
  --task-definition saleor-platform-staging-storefront:65 --force-new-deployment
```

**Resources Modified:**
- Storefront ECS task definition: rev 64 → 65 (SALEOR_API_URL updated to HTTPS)
- `_prisma_migrations` table in `inventory_ops` database: deleted failed records

**CI/CD Fixes (via code commits):**
- Removed mtg-import Prisma migration step (shared schema with inventory-ops causes conflicts)
- Deploy script gracefully skips services without rebuilt images (no SHA tag in ECR)
- Smoke test accepts dashboard 503 (scaled to 0 for cost savings)
- Apps smoke test made non-blocking until routing paths updated for host-based HTTPS

**Terraform Reconciliation Status:**
- [x] No manual AWS infrastructure changes (only ECS task def + DB record)
- [x] Storefront HTTPS URLs will propagate via CI/CD on next deploy
- [ ] Terraform storefront task def still has old URLs — next `terraform apply` will fix

### 2026-02-17 - Fix App Container URL Environment Variables

**Incident:** Continuation of ALB routing fix — apps' `APP_API_BASE_URL` pointed to wrong subdomain
**Responder:** Michael + PAI (Gen)
**Time:** 2026-02-17

**Root Cause:**
App containers had `APP_API_BASE_URL=https://api.staging.michaelbean.org/apps/<app>` but apps are routed via `apps.staging.michaelbean.org`. The `api` subdomain routes to Saleor Django which returns 404 for `/apps/*` paths.

**Changes Made:**
```bash
# Updated 5 ECS task definitions with correct APP_API_BASE_URL and APP_IFRAME_BASE_URL
# stripe: rev 65 → 66, inventory-ops: rev 62 → 63, buylist: rev 62 → 63
# pos: rev 62 → 63, mtg-import: rev 12 → 13
# All updated from api.staging.michaelbean.org → apps.staging.michaelbean.org
aws ecs register-task-definition --cli-input-json <updated-json>
aws ecs update-service --cluster saleor-platform-staging --service <app> \
  --task-definition <new-rev> --force-new-deployment
```

**Terraform Reconciliation Status:**
- [x] Terraform code updated (new `public_apps_base_url` variable in same commit as ALB fix)
- [ ] Next `terraform apply` will match the manual change

---

**Notes:**
Root cause of Prisma P3009 cycle: mtg-import and inventory-ops share the same database (via symlinked schema) but have different migration directories. mtg-import's `0001_initial` tried to CREATE tables that already existed, failed, and the failed record blocked inventory-ops on subsequent runs.

---

### 2026-02-14 - Staging HTTPS Migration

**Incident:** Planned migration (not incident response)
**Responder:** Michael + PAI
**Time:** 2026-02-14

**Changes Made:**
```bash
# Terraform applied: ACM cert, HTTPS listener, Route53 records, ALB routing
terraform apply -var-file=environments/staging.tfvars

# Force-deployed all ECS services to pick up new HTTPS URLs in task definitions
for svc in api worker storefront stripe inventory-ops buylist pos; do
  aws ecs update-service --cluster saleor-platform-staging --service "$svc" \
    --task-definition <latest-revision> --force-new-deployment
done

# Updated GitHub Actions variables
gh variable set STAGING_API_URL -b "https://api.staging.michaelbean.org"
gh variable set STAGING_STOREFRONT_URL -b "https://staging.michaelbean.org"
gh variable set STAGING_DASHBOARD_URL -b "https://dashboard.staging.michaelbean.org"
```

**Resources Created:**
- ACM Certificate: `arn:aws:acm:us-west-1:546464732019:certificate/137b4f10-1fdc-4e47-9ff9-66f7afcbe0a2`
- HTTPS Listener on ALB (port 443)
- 7 HTTPS listener rules (host-based routing)
- 6 Route53 A records (api, www, dashboard, apps, apex + ACM validation CNAMEs)

**Resources Modified:**
- HTTP Listener: changed from forward to 301 redirect to HTTPS
- RDS: downsized from db.t3.medium to db.t3.small
- All ECS task definitions: updated environment variables with HTTPS URLs

**Resources Destroyed:**
- 7 HTTP listener rules (replaced by HTTPS host-based rules)

**Terraform Reconciliation Status:**
- [x] All changes via Terraform (no manual AWS CLI)
- [x] Stale import blocks removed from `imports.tf`
- [x] Terraform plan shows no unexpected drift
- [x] Documentation updated (`expected-divergence.md`, `local-staging-workflow.md`)

**Notes:**
First apply failed with `UnsupportedCertificate` error — ACM cert had just been created and wasn't propagated. Also had stale `_http[0]` import blocks referencing destroyed resources. Both fixed in second apply.

---

### 2026-01-27 - VPC Alignment Reconciliation

**Incident:** VPC drift discovered - Terraform state pointed to wrong VPC
**Responder:** Michael
**Time:** 2026-01-27

**Changes Made:**
- Deleted orphaned VPC `vpc-088fb7c0a22060c10` and all child resources
- Added 60+ import blocks to align state with production VPC

**Resources Deleted:**
- VPC: vpc-088fb7c0a22060c10
- VPC Endpoints: 6
- NAT Gateway: nat-066af8ccd5fe4c7d0
- Security Groups: 8
- Subnets: 4
- Internet Gateway: igw-05ed067171b33f107
- Route Tables: 2

**Terraform Reconciliation Status:**
- [x] Import blocks added to `imports.tf`
- [x] Terraform plan shows "No changes"
- [x] Documentation updated (`docs/reference/expected-divergence.md`)

**Notes:**
This was a remediation of accumulated drift from the 2026-01-22 VPC migration. Weekly drift detection workflow now implemented to prevent recurrence.

---

### 2026-01-22 - VPC Migration During Incident

**Incident:** Service connectivity issues
**Responder:** Michael
**Time:** 2026-01-22

**Changes Made:**
- Created new VPC manually via AWS Console
- Migrated ALB, ECS services, RDS, ElastiCache to new VPC
- Updated security groups and routing

**Resources Created:**
- VPC: vpc-0b0360f5c0c874c59 (now production)
- Subnets, route tables, NAT gateway, VPC endpoints

**Terraform Reconciliation Status:**
- [x] Import blocks added to `imports.tf` (completed 2026-01-27)
- [x] Terraform plan shows "No changes" (completed 2026-01-27)
- [x] Documentation updated

**Notes:**
This was the root cause of the VPC drift. Manual changes were necessary to restore service, but reconciliation was delayed 5 days.

---

## Reconciliation Checklist

After any manual infrastructure change:

1. **Within 24 hours:**
   - [ ] Log the change in this file
   - [ ] Note all resource IDs created

2. **Within 48 hours:**
   - [ ] Create import blocks in `infra/terraform/imports.tf`
   - [ ] Run `terraform plan` to verify alignment
   - [ ] Update `docs/reference/expected-divergence.md` if intentional drift

3. **Weekly review:**
   - [ ] Check GitHub Actions drift detection results
   - [ ] Review any open drift issues
   - [ ] Close reconciled items
