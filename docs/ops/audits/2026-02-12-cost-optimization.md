# Staging Cost Optimization — 2026-02-12

**Applied by:** Terraform (fully IaC)
**Previous cost baseline:** ~$310-335/mo (estimated from resource inventory)
**Estimated savings:** ~$94/mo

---

## Changes Applied

### 1. VPC Interface Endpoints Removed (~$29/mo saved)

Four interface VPC endpoints were removed. NAT gateway handles the same traffic at lower cost for staging volumes.

| Endpoint | ID | Monthly Cost |
|----------|-----|-------------|
| ECR API | vpce-0275dfaf077ce0aaa | ~$7.30 |
| ECR DKR | vpce-084889bd73e996dce | ~$7.30 |
| CloudWatch Logs | vpce-07b5f26452aeda656 | ~$7.30 |
| SSM | vpce-0465fb738b80a896a | ~$7.30 |
| Security Group | sg-032696ac44e478a88 | — |

**Gateway endpoints retained** (free): S3 (vpce-0032d7cc325cb6435), DynamoDB (vpce-0c08deb97674e3771).

**Terraform changes:**
- Added `create_interface_endpoints` variable to VPC module (`modules/vpc/variables.tf`)
- Gated 4 interface endpoints + SG on `var.create_vpc_endpoints && var.create_interface_endpoints` (`modules/vpc/main.tf`)
- Set `create_interface_endpoints = false` in `staging.tfvars`
- Removed import blocks from `imports.tf` (5 resources)

### 2. RDS Instance Downsized (~$26/mo saved)

| Metric | Before | After |
|--------|--------|-------|
| Instance class | db.t3.medium | db.t3.small |
| Avg CPU utilization | 5.3% | — |
| Avg connections | 0.55 | — |
| Free memory | 55% | — |

**Terraform:** Changed `db_instance_class` in `staging.tfvars`.

### 3. MTG Import Scaled to Zero (~$21/mo saved)

The MTG Import app is a batch importer that doesn't need to run 24/7. Scaled to `desired_count = 0` in Terraform. Can be triggered on-demand via ECS RunTask.

**Terraform:** Added `desired_count` optional field to ECS apps map type, set `desired_count = 0` for mtg-import in `main.tf`.

### 4. Container Insights Disabled (~$9/mo saved)

308 custom metrics were being published with no active monitoring or alarms configured.

**Terraform:** Set `enable_container_insights = false` in `staging.tfvars`.

### 5. Meilisearch Right-Sized (~$9/mo saved)

| Metric | Before | After |
|--------|--------|-------|
| CPU | 512 | 256 |
| Memory | 1024 MB | 512 MB |
| Actual memory usage | ~42 MB | — |

**Terraform:** Environment-conditional sizing in `main.tf` (staging = 256/512, production = 1024/4096).

### 6. Worker CPU Right-Sized (~$2/mo saved)

| Metric | Before | After |
|--------|--------|-------|
| CPU | 512 | 256 |
| Avg CPU utilization | 4.2 CPU units (0.8%) | — |

**Terraform:** Changed `worker_cpu` in `staging.tfvars`.

### 7. Dashboard Scaled to Zero (~$9/mo saved)

Dashboard had 0% CPU and 3MB memory usage. Already at `desired_count = 0` in AWS at time of apply.

**Terraform:** Added `dashboard_desired_count` variable to root and ECS module, set to 0 in `staging.tfvars`.

---

## Other Changes in Same Apply

- **8 SSM parameters imported** into new secrets module (tags added, values preserved)
- **8 services restored** from desired_count=0 to 1 (api, worker, beat, storefront, stripe, inventory-ops, buylist, pos) — platform had been manually scaled down
- **Meilisearch task definition replaced** (CPU/memory change forces replacement)

---

## Files Modified

| File | Change |
|------|--------|
| `modules/vpc/variables.tf` | Added `create_interface_endpoints` variable |
| `modules/vpc/main.tf` | Gated interface endpoints on new variable |
| `modules/ecs/variables.tf` | Added `desired_count` to apps map, added `dashboard_desired_count` |
| `modules/ecs/main.tf` | Dashboard uses variable, apps use per-app desired_count |
| `variables.tf` | Added `create_interface_endpoints`, `dashboard_desired_count` |
| `main.tf` | Pass new variables, meilisearch env-conditional sizing, mtg-import desired_count=0 |
| `environments/staging.tfvars` | All staging-specific values updated |
| `imports.tf` | Removed 5 VPC endpoint import blocks, fixed mtg-import listener rule import |

---

## Utilization Data (7-day averages, 2026-02-12)

Source: CloudWatch metrics queried via AWS CLI.

| Service | CPU Avg | CPU Provisioned | Memory Avg | Memory Provisioned |
|---------|---------|----------------|------------|-------------------|
| API | 1.3% | 1024 | — | 2048 MB |
| Worker | 0.8% | 512 (now 256) | — | 1024 MB |
| Beat | 0.3% | 256 | — | 512 MB |
| Storefront | 0.2% | 256 | — | 512 MB |
| Dashboard | 0.0% | 256 | 3 MB | 512 MB |
| Stripe | 0.07% | 256 | — | 512 MB |
| Inventory-Ops | 0.04% | 256 | — | 512 MB |
| Buylist | 0.04% | 256 | — | 512 MB |
| POS | 0.04% | 256 | — | 512 MB |
| MTG Import | 0.0% | 512 | — | 2048 MB |
| Meilisearch | 0.1% | 512 (now 256) | 42 MB | 1024 (now 512) MB |
| RDS | 5.3% | db.t3.medium (now small) | 55% free | — |
| ElastiCache | 0.24% | cache.t3.micro | 6.2 MB (1.2%) | — |

---

## Re-enabling for Debugging

```bash
# Re-enable Container Insights
# Edit staging.tfvars: enable_container_insights = true
terraform apply -var-file=environments/staging.tfvars

# Scale up dashboard
# Edit staging.tfvars: dashboard_desired_count = 1
terraform apply -var-file=environments/staging.tfvars

# Run mtg-import on-demand
aws ecs run-task \
  --cluster saleor-platform-staging \
  --task-definition saleor-platform-staging-mtg-import \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0885b491c2d394fb6],securityGroups=[sg-0210b4854c817f8ac],assignPublicIp=DISABLED}"
```
