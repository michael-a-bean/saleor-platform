# Terraform Destroy & Recreate Runbook

Complete reference for tearing down and rebuilding the Saleor Platform infrastructure from Terraform. Covers what is destroyed, what survives, data loss implications, and the full post-creation bootstrap sequence.

**Last verified:** 2026-02-22
**Terraform source:** `infra/terraform/`
**State backend:** S3 `saleor-platform-tfstate-546464732019` / DynamoDB `saleor-platform-tfstate-lock`

---

## Table of Contents

1. [Resource Inventory](#1-resource-inventory)
2. [What Survives Destroy](#2-what-survives-destroy)
3. [Data Loss Matrix](#3-data-loss-matrix)
4. [Pre-Destroy Checklist](#4-pre-destroy-checklist)
5. [Destroy Procedure](#5-destroy-procedure)
6. [Recreate Procedure](#6-recreate-procedure)
7. [Post-Creation Bootstrap](#7-post-creation-bootstrap)
8. [Verification](#8-verification)
9. [Known Issues & Blockers](#9-known-issues--blockers)
10. [Terraform Source Reference](#10-terraform-source-reference)

---

## 1. Resource Inventory

Every resource managed by Terraform, grouped by module. The **Stateful** column indicates whether the resource holds persistent data that cannot be reconstructed from code alone.

### Networking (`modules/vpc`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| VPC | `aws_vpc` | No | CIDR: `10.0.0.0/16` |
| Public subnets (x2) | `aws_subnet` | No | `us-west-1a`, `us-west-1b` |
| Private subnets (x2) | `aws_subnet` | No | CIDR offset +10 |
| Internet gateway | `aws_internet_gateway` | No | |
| NAT gateway (x1 staging) | `aws_nat_gateway` | No | Single for staging, per-AZ for prod |
| Elastic IP | `aws_eip` | No | Released on destroy, new IP on create |
| Route tables | `aws_route_table` | No | Public + private |
| S3 gateway endpoint | `aws_vpc_endpoint` | No | Free |
| DynamoDB gateway endpoint | `aws_vpc_endpoint` | No | Free |

### Load Balancing (`modules/alb`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| ALB | `aws_lb` | No | New DNS name on recreate |
| Security groups (x4) | `aws_security_group` | No | ALB, frontend, backend, internal |
| Target groups (x8) | `aws_lb_target_group` | No | api, storefront, dashboard, stripe, inv-ops, buylist, pos, mtg-import |
| HTTPS listener | `aws_lb_listener` | No | Port 443 with TLS 1.3 |
| HTTP listener | `aws_lb_listener` | No | Redirects to HTTPS |
| Listener rules (x8) | `aws_lb_listener_rule` | No | Host-based routing |

### Database (`modules/rds`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| RDS PostgreSQL 15 | `aws_db_instance` | **YES** | `saleor` + `inventory_ops` databases |
| DB subnet group | `aws_db_subnet_group` | No | |
| Parameter group (pg15) | `aws_db_parameter_group` | No | `pg_stat_statements`, `max_connections` |
| Security group | `aws_security_group` | No | Backend-only access |

**Staging-specific:** `skip_final_snapshot = true`, `deletion_protection = false`. This means **no automatic final snapshot on destroy**. You MUST snapshot manually before destroying.

### Cache (`modules/elasticache`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| Redis 7.0 replication group | `aws_elasticache_replication_group` | Semi | Cache is ephemeral. Celery broker messages lost. |
| Subnet group | `aws_elasticache_subnet_group` | No | |
| Parameter group (LRU) | `aws_elasticache_parameter_group` | No | |
| Security group | `aws_security_group` | No | |

### Container Registry (`modules/ecr`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| ECR repos (x7) | `aws_ecr_repository` | **YES** | storefront, stripe-app, inventory-ops-app, buylist-app, pos-app, mtg-import-app, price-sync-worker |
| Lifecycle policies | `aws_ecr_lifecycle_policy` | No | Keep 30 tagged, 7 days untagged |

**All Docker images are deleted on destroy.** CI/CD must rebuild and push before services can start.

### Storage (`modules/s3`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| Media bucket | `aws_s3_bucket` | **YES** | Product images, thumbnails |
| Versioning | `aws_s3_bucket_versioning` | No | Enabled |
| Encryption | `aws_s3_bucket_server_side_encryption_configuration` | No | AES256 |
| Lifecycle rules | `aws_s3_bucket_lifecycle_configuration` | No | 90d→IA, 365d→Glacier |
| CORS config | `aws_s3_bucket_cors_configuration` | No | |
| Bucket policy | `aws_s3_bucket_policy` | No | CloudFront OAC |
| Public access block | `aws_s3_bucket_public_access_block` | No | |

**BLOCKER: `force_destroy` is NOT set.** Terraform destroy will fail if the bucket contains objects. See [Known Issues](#9-known-issues--blockers).

### CDN (`modules/cloudfront`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| CloudFront distribution | `aws_cloudfront_distribution` | No | New domain on recreate. Takes 10-15 min to disable before deletion. |
| Origin Access Control | `aws_cloudfront_origin_access_control` | No | |

### Compute (`modules/ecs`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| ECS cluster | `aws_ecs_cluster` | No | Fargate + Fargate Spot |
| Task definitions (x12) | `aws_ecs_task_definition` | No | api, worker, beat, storefront, dashboard, migrate, stripe, inv-ops, buylist, pos, mtg-import |
| Services (x11) | `aws_ecs_service` | No | All use `ignore_changes = [task_definition]` |
| CloudWatch log groups (x12) | `aws_cloudwatch_log_group` | Semi | Historical logs lost, but not critical |
| Auto-scaling targets | `aws_appautoscaling_target` | No | |
| Scheduled scaling actions | `aws_appautoscaling_scheduled_action` | No | Midnight shutdown / 8AM restore |

### IAM (`modules/iam`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| GitHub OIDC provider | `aws_iam_openid_connect_provider` | No | |
| GitHub Actions deploy role | `aws_iam_role` | No | OIDC trust policy |
| ECS execution role | `aws_iam_role` | No | SSM + Secrets Manager access |
| ECS task roles (x4) | `aws_iam_role` | No | api, worker, storefront, apps |
| Role policies (x10+) | `aws_iam_role_policy` | No | Least-privilege per service |

### Secrets (`modules/secrets`)

| Resource | SSM Path | Stateful | Recreated Value |
|----------|---------|----------|----------------|
| API SECRET_KEY | `/saleor/{env}/api/SECRET_KEY` | **YES** | New random 64-char (invalidates existing JWTs) |
| API DATABASE_URL | `/saleor/{env}/api/DATABASE_URL` | Computed | Auto-correct (from new RDS endpoint) |
| CELERY_BROKER_URL | `/saleor/{env}/api/CELERY_BROKER_URL` | Computed | Auto-correct (from new Redis endpoint) |
| RSA_PRIVATE_KEY | `/saleor/{env}/api/RSA_PRIVATE_KEY` | **YES** | New RSA key (invalidates existing JWTs) |
| Apps SECRET_KEY | `/saleor/{env}/apps/SECRET_KEY` | **YES** | New random 64-char |
| Stripe SECRET_KEY | `/saleor/{env}/apps/stripe/STRIPE_SECRET_KEY` | **YES** | `sk_test_PLACEHOLDER_UPDATE_ME` — **MUST UPDATE** |
| Stripe WEBHOOK_SECRET | `/saleor/{env}/apps/stripe/STRIPE_WEBHOOK_SECRET` | **YES** | `whsec_PLACEHOLDER_UPDATE_ME` — **MUST UPDATE** |
| OTEL headers | `/saleor/{env}/api/OTEL_EXPORTER_OTLP_HEADERS` | **YES** | Empty — **MUST UPDATE** |
| Inventory DATABASE_URL | `/saleor/{env}/apps/inventory-ops/DATABASE_URL` | Computed | Auto-correct (from new RDS endpoint) |
| Meilisearch master key | Secrets Manager `saleor/{env}/meilisearch/master-key` | **YES** | New random 32-char (fine for fresh start) |

All SSM parameters use `lifecycle { ignore_changes = [value] }`. Terraform will create them with initial/placeholder values but never overwrite manually-set values during normal `apply`.

### DNS & TLS (root module)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| ACM wildcard cert | `aws_acm_certificate` | No | New cert issued; DNS validation via Route53 |
| Cert validation records | `aws_route53_record` | No | |
| Route53 A records (x6) | `aws_route53_record` | No | api, www, dashboard, apps, apex, cert validation |
| Service Discovery namespace | `aws_service_discovery_private_dns_namespace` | No | `{prefix}.local` |

### Meilisearch (`modules/meilisearch`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| EFS file system | `aws_efs_file_system` | **YES** | Search index data |
| EFS mount targets (x2) | `aws_efs_mount_target` | No | |
| EFS access point | `aws_efs_access_point` | No | POSIX uid/gid 1000 |
| EFS security group | `aws_security_group` | No | NFS from backend |
| EFS backup policy | `aws_efs_backup_policy` | No | Enabled |
| ECS task definition | `aws_ecs_task_definition` | No | |
| ECS service | `aws_ecs_service` | No | |
| Service Discovery service | `aws_service_discovery_service` | No | |

### Meilisearch Sync (`meilisearch-sync.tf`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| SNS topic (product events) | `aws_sns_topic` | No | |
| SQS queue (sync) | `aws_sqs_queue` | Semi | In-flight messages lost |
| SQS DLQ | `aws_sqs_queue` | Semi | Failed messages lost |
| EventBridge rules (x2) | `aws_cloudwatch_event_rule` | No | 15-min catchup + daily reconcile |
| Sync worker task def | `aws_ecs_task_definition` | No | |
| CloudWatch alarms (x3) | `aws_cloudwatch_metric_alarm` | No | DLQ depth, backlog, unhealthy |

### DynamoDB (`modules/dynamodb`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| Stripe APL table | `aws_dynamodb_table` | **YES** | App registration tokens |

### AWS Config (`config.tf`)

| Resource | Terraform Type | Stateful | Notes |
|----------|---------------|----------|-------|
| Config recorder | `aws_config_configuration_recorder` | No | |
| Delivery channel | `aws_config_delivery_channel` | No | |
| Config S3 bucket | `aws_s3_bucket` | Semi | Config history; not critical |
| Required-tags rule | `aws_config_config_rule` | No | |
| IAM role | `aws_iam_role` | No | |

---

## 2. What Survives Destroy

These resources are **NOT managed by Terraform** and persist through destroy/recreate:

| Resource | Why Outside TF | Location |
|----------|---------------|----------|
| Terraform state S3 bucket | Bootstrap (chicken-and-egg) | `saleor-platform-tfstate-546464732019` in `us-west-1` |
| Terraform lock DynamoDB table | Bootstrap | `saleor-platform-tfstate-lock` in `us-west-1` |
| Route53 hosted zone | Shared resource, referenced as data source | Zone ID: `Z04460563Q0BF3J4587VW` |
| Domain registration | External registrar | `michaelbean.org` |
| GitHub repository | Source of truth for code | `michael-a-bean/saleor-platform` |
| Grafana Cloud account | External SaaS | Org 1676082, zone `prod-us-west-0` |
| Stripe account | External SaaS | API keys in Stripe dashboard |
| RDS automated backups | `delete_automated_backups = false` | AWS retains even after instance deletion |

---

## 3. Data Loss Matrix

What is lost when RDS, S3, ECR, EFS, and DynamoDB are destroyed:

### PostgreSQL — `saleor` database

| Data | Recovery Source | Effort |
|------|----------------|--------|
| Products (100k+ MTG cards) | MTG import batch job | 30-60 min |
| Orders, customers | RDS snapshot restore | 10 min |
| User accounts / superuser | `createsuperuser` command | 2 min |
| App installations (tokens, webhooks) | Re-install via Dashboard | 15 min |
| Channel config (webstore, USD) | Manual setup or GraphQL script | 5 min |
| Warehouse / shipping zones | Manual setup | 10 min |
| Celery Beat scheduled tasks | Auto-created by `DatabaseScheduler` on boot | Automatic |
| Django migration state | `python manage.py migrate` recreates | 2 min |

### PostgreSQL — `inventory_ops` database

| Data | Recovery Source | Effort |
|------|----------------|--------|
| Prisma migration state | `prisma migrate deploy` recreates | 2 min |
| Price sync jobs + pending prices | Lost (must re-run sync) | 10 min |
| Purchase orders / goods receipts | Lost (no external source) | N/A |
| WAC cost layers | Lost (no external source) | N/A |
| POS register sessions | Lost (ephemeral) | N/A |

### S3 Media

| Data | Recovery Source | Effort |
|------|----------------|--------|
| Product images / thumbnails | Re-upload or MTG import regenerates from Scryfall | Varies |

### ECR Images

| Data | Recovery Source | Effort |
|------|----------------|--------|
| Docker images (7 repos) | CI/CD rebuild from source | 15-20 min |

### EFS (Meilisearch)

| Data | Recovery Source | Effort |
|------|----------------|--------|
| Search index | Full reindex from Saleor data | 10 min |

### DynamoDB

| Data | Recovery Source | Effort |
|------|----------------|--------|
| Stripe APL tokens | Re-install Stripe app in Saleor | 5 min |

---

## 4. Pre-Destroy Checklist

Run these steps **before** executing `terraform destroy`:

### 4a. Snapshot RDS (CRITICAL — staging has no auto final snapshot)

```bash
# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier saleor-platform-staging-saleor \
  --db-snapshot-identifier pre-destroy-manual-$(date +%Y%m%d-%H%M%S) \
  --region us-west-1

# Wait for completion (5-10 min for staging-sized DB)
aws rds wait db-snapshot-available \
  --db-snapshot-identifier pre-destroy-manual-$(date +%Y%m%d-%H%M%S) \
  --region us-west-1
```

### 4b. Backup S3 Media (optional, if data matters)

```bash
aws s3 sync \
  s3://saleor-platform-media-staging-546464732019 \
  ./backups/media-$(date +%Y%m%d)/ \
  --region us-west-1
```

### 4c. Export SSM Secrets (the 3 that need manual update)

```bash
for param in \
  /saleor/staging/apps/stripe/STRIPE_SECRET_KEY \
  /saleor/staging/apps/stripe/STRIPE_WEBHOOK_SECRET \
  /saleor/staging/api/OTEL_EXPORTER_OTLP_HEADERS; do
  echo "=== $param ==="
  aws ssm get-parameter --name "$param" --with-decryption \
    --query 'Parameter.Value' --output text --region us-west-1
done
```

Save these values securely — you will need them in Step 7c.

### 4d. Empty S3 Buckets (staging: skip — `force_destroy` enabled)

**Staging:** Skip this step. Both media and config buckets have `force_destroy = true` and will be emptied automatically during destroy.

**Production:** `force_destroy` is NOT enabled. Manually empty buckets before destroy:

```bash
# Media bucket
aws s3 rm s3://saleor-platform-media-production-546464732019 --recursive --region us-west-1

# Config bucket (AWS Config delivery)
aws s3 rm s3://saleor-platform-production-config-546464732019 --recursive --region us-west-1
```

### 4e. Verify Branch

```bash
cd /home/michael/saleor-platform
git branch --show-current  # Must be platform/main
```

---

## 5. Destroy Procedure

```bash
cd /home/michael/saleor-platform/infra/terraform

# Plan the destroy first
terraform plan -destroy -var-file=environments/staging.tfvars -out=destroy.tfplan

# Review the plan — count resources being destroyed
# Expected: ~100-120 resources for staging

# Execute
terraform apply destroy.tfplan
```

**Expected duration:** 20-30 minutes. The bottleneck is CloudFront distribution disablement (10-15 min) and RDS deletion.

**If destroy hangs on S3:** You forgot to empty the buckets. Cancel (Ctrl+C), empty them per Step 4d, and retry.

**If destroy hangs on CloudFront:** Wait. CloudFront must transition through `Deploying` → `Deployed (disabled)` → deleted. This is an AWS limitation.

---

## 6. Recreate Procedure

### 6a. Initialize and Apply

```bash
cd /home/michael/saleor-platform/infra/terraform

# Re-init (state bucket and lock table still exist)
terraform init -backend-config="key=staging/terraform.tfstate"

# Plan
terraform plan -var-file=environments/staging.tfvars -out=staging.tfplan

# Apply
terraform apply staging.tfplan
```

**Expected duration:** 15-25 minutes. RDS creation is the bottleneck (~8-12 min).

### 6b. Capture New Outputs

```bash
# Save all outputs — needed for subsequent steps
terraform output -json > /tmp/tf-outputs.json

# Key values for manual steps:
terraform output ecs_task_subnets
terraform output ecs_task_security_group
terraform output ecs_cluster_name
terraform output rds_endpoint
terraform output api_url
terraform output dashboard_url
```

### 6c. What Terraform Creates Automatically

After `terraform apply` completes, the following are ready:

- VPC, subnets, NAT gateway, security groups
- ALB with HTTPS listener and host-based routing rules
- RDS PostgreSQL (empty `saleor` database — schema not applied yet)
- ElastiCache Redis (empty)
- EFS (empty volume for Meilisearch)
- ECR repositories (empty — no images yet)
- S3 media bucket (empty)
- CloudFront distribution
- DynamoDB table (empty)
- ACM certificate (DNS-validated via Route53)
- Route53 A records (api, www, dashboard, apps, apex)
- SSM parameters (with initial/placeholder values)
- Meilisearch Secrets Manager secret
- ECS cluster, task definitions, services (services will fail — no images in ECR)
- IAM roles with correct policies
- Service Discovery namespace
- AWS Config recorder and rules
- Auto-scaling and scheduled scaling

**What is NOT ready:**
- ECR has no images → ECS services crash-loop
- RDS has no schema → API can't start even with images
- No Saleor superuser → can't log into Dashboard
- No Saleor channel → storefront shows nothing
- No app installations → apps are running but not registered with Saleor
- SSM has placeholder Stripe/OTEL secrets → Stripe app non-functional

---

## 7. Post-Creation Bootstrap

### Automated Bootstrap (recommended)

After updating external secrets (Step 1 below), run the bootstrap script to automate Steps 3-7:

```bash
# From the project root
./scripts/bootstrap-environment.sh staging
```

This creates the `inventory_ops` database, runs Django and Prisma migrations, creates the superuser, and force-restarts all ECS services. It outputs the remaining manual steps when complete.

If you prefer manual control, follow all steps below.

### Step 1: Update External Secrets (~2 min)

```bash
# Stripe keys (from pre-destroy backup or Stripe dashboard)
aws ssm put-parameter \
  --name /saleor/staging/apps/stripe/STRIPE_SECRET_KEY \
  --type SecureString --value "sk_test_YOUR_REAL_KEY" --overwrite \
  --region us-west-1

aws ssm put-parameter \
  --name /saleor/staging/apps/stripe/STRIPE_WEBHOOK_SECRET \
  --type SecureString --value "whsec_YOUR_REAL_SECRET" --overwrite \
  --region us-west-1

# Grafana Cloud OTEL auth header
# IMPORTANT: Use URL-encoded %20 not literal space
aws ssm put-parameter \
  --name /saleor/staging/api/OTEL_EXPORTER_OTLP_HEADERS \
  --type SecureString --value "Authorization=Basic%20YOUR_BASE64_TOKEN" --overwrite \
  --region us-west-1
```

### Step 2: Build and Push Docker Images (~15-20 min)

**Option A (recommended):** Push a commit to `platform/main` to trigger CI/CD. The workflow builds all images and pushes to ECR.

**Option B (manual):** Build and push each image. Example for storefront:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-west-1
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_BASE

# Build and push storefront
docker build -t ${ECR_BASE}/saleor-platform/storefront:staging-latest ./storefront
docker push ${ECR_BASE}/saleor-platform/storefront:staging-latest

# Repeat for: stripe-app, inventory-ops-app, buylist-app, pos-app, mtg-import-app
```

**Note:** API (`ghcr.io/saleor/saleor:3.22.26`), Dashboard (`ghcr.io/saleor/saleor-dashboard:3.21.18`), and Meilisearch (`getmeili/meilisearch:v1.6`) use upstream images — no ECR push needed. ECS pulls directly from ghcr.io/DockerHub.

### Step 3: Run Saleor Django Migrations (~2 min)

```bash
CLUSTER=$(terraform output -raw ecs_cluster_name)
TASK_DEF=$(terraform output -raw migrate_task_definition_arn)
SUBNETS=$(terraform output -raw ecs_task_subnets)
SG=$(terraform output -raw ecs_task_security_group)

aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "{
    \"awsvpcConfiguration\": {
      \"subnets\": [$(echo $SUBNETS | sed 's/,/\",\"/g' | sed 's/^/\"/;s/$/\"/')],
      \"securityGroups\": [\"$SG\"],
      \"assignPublicIp\": \"DISABLED\"
    }
  }" \
  --region us-west-1

# Watch logs for completion
aws logs tail /ecs/saleor-platform-staging/migrate --follow --region us-west-1
```

### Step 4: Create Saleor Superuser (~2 min)

```bash
aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --overrides '{
    "containerOverrides": [{
      "name": "migrate",
      "command": ["python", "manage.py", "createsuperuser", "--noinput",
                  "--email", "admin@michaelbean.org"]
    }]
  }' \
  --launch-type FARGATE \
  --network-configuration "{
    \"awsvpcConfiguration\": {
      \"subnets\": [$(echo $SUBNETS | sed 's/,/\",\"/g' | sed 's/^/\"/;s/$/\"/')],
      \"securityGroups\": [\"$SG\"],
      \"assignPublicIp\": \"DISABLED\"
    }
  }" \
  --region us-west-1
```

Then set the password via Django shell or the Dashboard password reset flow.

### Step 5: Create inventory_ops Database (~3 min)

> **Note:** The bootstrap script (`scripts/bootstrap-environment.sh`) handles this automatically. Only follow these manual steps if not using the bootstrap script.

The RDS instance has only the `saleor` database. Create the inventory database:

```bash
# Option A: Run via ECS task override
aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --overrides '{
    "containerOverrides": [{
      "name": "migrate",
      "command": ["python", "-c",
        "import psycopg2; conn = psycopg2.connect(dbname=\"saleor\", host=\"RDS_ENDPOINT\", user=\"saleor\", password=\"PASSWORD\"); conn.autocommit = True; cur = conn.cursor(); cur.execute(\"CREATE DATABASE inventory_ops\"); cur.close(); conn.close(); print(\"Created inventory_ops database\")"]
    }]
  }' \
  --launch-type FARGATE \
  --network-configuration "..." \
  --region us-west-1

# Option B: If you have direct DB access
psql -h RDS_ENDPOINT -U saleor -d postgres -c "CREATE DATABASE inventory_ops;"
```

### Step 6: Run Prisma Migrations for Inventory DB (~2 min)

```bash
# Override inventory-ops task to run migrations
# (inventory-ops service must have an image in ECR first — see Step 2)
aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "saleor-platform-staging-inventory-ops" \
  --overrides '{
    "containerOverrides": [{
      "name": "inventory-ops",
      "command": ["npx", "prisma", "migrate", "deploy"]
    }]
  }' \
  --launch-type FARGATE \
  --network-configuration "{
    \"awsvpcConfiguration\": {
      \"subnets\": [$(echo $SUBNETS | sed 's/,/\",\"/g' | sed 's/^/\"/;s/$/\"/')],
      \"securityGroups\": [\"$SG\"],
      \"assignPublicIp\": \"DISABLED\"
    }
  }" \
  --region us-west-1
```

**IMPORTANT:** Only inventory-ops runs `prisma migrate deploy`. Other apps (POS, buylist, mtg-import) share the schema via symlink and must NOT run their own migrations. See `MEMORY.md` for the P3009 poisoning cycle.

### Step 7: Force Restart ECS Services (~5 min)

After images are pushed and secrets updated, force new deployments to pick up changes:

```bash
for svc in api worker beat storefront dashboard stripe inventory-ops buylist pos; do
  aws ecs update-service \
    --cluster saleor-platform-staging \
    --service "$svc" \
    --force-new-deployment \
    --region us-west-1
done
```

Wait for services to stabilize (2-3 minutes).

### Step 8: Configure Saleor Channel (~10 min)

Via the Dashboard at `https://dashboard.staging.michaelbean.org`:

1. Log in with superuser credentials
2. **Configuration** → **Channels** → **Create Channel**
   - Name: `Webstore`
   - Slug: `webstore`
   - Currency: `USD`
   - Country: `US`
3. Set as default channel
4. **Configuration** → **Warehouses** → **Create Warehouse**
   - Name: `Main Warehouse`
   - Link to `Webstore` channel
5. **Configuration** → **Shipping** → **Create Shipping Zone**
   - Name: `US Domestic`
   - Countries: `United States`
   - Add shipping method (e.g., `Standard Shipping`, `$5.00`)
   - Link to `Webstore` channel
6. **Activate payment method in channel** (REQUIRED for checkout):
   - After installing the Stripe app (Step 9), go to **Configuration** → **Channels** → **Webstore**
   - In the **Payment methods** section, enable Stripe
   - Without this, customers cannot complete checkout

Or via GraphQL `channelCreate` / `channelUpdate` mutations.

### Step 9: Install Saleor Apps (~15 min)

Install each app via the Dashboard (**Apps** → **Install external app**):

| App | Manifest URL |
|-----|-------------|
| Stripe | `https://apps.staging.michaelbean.org/apps/stripe/api/manifest` |
| Inventory Ops | `https://apps.staging.michaelbean.org/apps/inventory/api/manifest` |
| Buylist | `https://apps.staging.michaelbean.org/apps/buylist/api/manifest` |
| POS | `https://apps.staging.michaelbean.org/apps/pos/api/manifest` |
| MTG Import | `https://apps.staging.michaelbean.org/apps/mtg-import/api/manifest` |

**Prerequisites:** Each app's ECS service must be healthy before installation. Check target group health in ALB.

**Required permissions per app:** See `docs/ops/runbooks/staging-app-installation.md` for the full permissions list.

### Step 10: Import MTG Catalog (~30-60 min)

```bash
aws ecs run-task \
  --cluster saleor-platform-staging \
  --task-definition saleor-platform-staging-mtg-import \
  --launch-type FARGATE \
  --network-configuration "{
    \"awsvpcConfiguration\": {
      \"subnets\": [$(echo $SUBNETS | sed 's/,/\",\"/g' | sed 's/^/\"/;s/$/\"/')],
      \"securityGroups\": [\"$SG\"],
      \"assignPublicIp\": \"DISABLED\"
    }
  }" \
  --region us-west-1
```

### Step 11: Initial Price Sync (~10 min)

After the MTG catalog import populates products, trigger the price sync to fetch market prices from Scryfall and write them to Saleor channel listings:

```bash
# Trigger via the inventory-ops cron endpoint (requires app to be installed first)
curl -X POST https://apps.staging.michaelbean.org/apps/inventory/api/cron/price-sync \
  -H "Content-Type: application/json" \
  -d '{"mode": "full"}'
```

**IMPORTANT:** Products have no prices until this step runs. Without prices, the storefront shows `$0.00` and checkout fails with currency errors. Both `price_amount` and `discounted_price_amount` must be set (see database.md rule).

### Step 12: Rebuild Meilisearch Index (~10 min)

The daily EventBridge reconciliation rule will automatically trigger a full reindex at 6 AM UTC. To trigger immediately, run the sync worker with `SYNC_MODE=full` (or wait for the scheduled job).

### Step 13: Reconfigure Stripe Webhooks (~5 min)

In the Stripe Dashboard:
1. Go to **Developers** → **Webhooks**
2. Update or create endpoint URL: `https://apps.staging.michaelbean.org/apps/stripe/api/webhooks/stripe`
3. Verify webhook secret matches the SSM parameter

### Step 14: Restore S3 Media (if backed up)

```bash
aws s3 sync ./backups/media-YYYYMMDD/ \
  s3://saleor-platform-media-staging-546464732019/ \
  --region us-west-1
```

---

## 8. Verification

After completing all bootstrap steps, verify the environment is fully testable.

### Infrastructure Health

```bash
# ECS services
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services api worker beat storefront dashboard stripe inventory-ops buylist pos meilisearch \
  --query 'services[].{Service:serviceName,Status:status,Running:runningCount,Desired:desiredCount}' \
  --output table --region us-west-1
```

### Endpoint Health

```bash
BASE="https://api.staging.michaelbean.org"
STORE="https://staging.michaelbean.org"
DASH="https://dashboard.staging.michaelbean.org"

echo "API Health: $(curl -sf ${BASE}/health/ | head -c 50)"
echo "GraphQL:    $(curl -sf -X POST -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}' ${BASE}/graphql/ | head -c 80)"
echo "Storefront: HTTP $(curl -sf -o /dev/null -w '%{http_code}' ${STORE}/)"
echo "Dashboard:  HTTP $(curl -sf -o /dev/null -w '%{http_code}' ${DASH}/)"

# App health checks
for app in stripe inventory buylist pos; do
  echo "App ${app}: $(curl -sf https://apps.staging.michaelbean.org/apps/${app}/api/health | head -c 50)"
done
```

### Saleor App Registration

```bash
# Query installed apps via GraphQL (requires auth token)
curl -sf -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"query": "{ apps(first: 10) { edges { node { name isActive } } } }"}' \
  https://api.staging.michaelbean.org/graphql/ | jq '.data.apps.edges[].node'
```

### Testable Store Checklist

Use this checklist to confirm the environment is ready for full functionality testing:

**Core Commerce:**
- [ ] Dashboard login works with superuser credentials
- [ ] Webstore channel exists with USD currency
- [ ] At least one warehouse exists and is linked to the channel
- [ ] At least one shipping zone and method are active
- [ ] Stripe payment method is active in the Webstore channel
- [ ] Storefront loads and displays products (requires MTG import)
- [ ] Product pages show prices (requires price sync after import)

**Checkout Flow:**
- [ ] Add product to cart from storefront
- [ ] Enter shipping address → shipping methods appear
- [ ] Select payment → Stripe checkout form renders
- [ ] Complete test payment (use Stripe test card `4242 4242 4242 4242`)
- [ ] Order appears in Dashboard → Orders

**Apps:**
- [ ] Stripe app installed and active (Dashboard → Apps)
- [ ] Inventory Ops app installed and active
- [ ] Buylist app installed and active
- [ ] POS app installed and active
- [ ] MTG Import app installed (can be inactive after import)

**Search:**
- [ ] Meilisearch returns results for product queries
- [ ] Storefront search bar works

**Pricing:**
- [ ] Products have non-zero prices on channel listings
- [ ] No `discounted_price_amount IS NULL` entries (currency crash prevention)

**Background Jobs:**
- [ ] Celery Beat is running (check ECS service count)
- [ ] Worker is processing tasks (check CloudWatch logs)

---

## 9. Known Issues & Blockers

### ~~S3 `force_destroy` Not Set~~ (FIXED)

**Status:** Fixed. Both media and config S3 buckets now have `force_destroy = true` for staging environments. Step 4d (manual bucket emptying) is no longer required for staging.

### CloudFront Disable Delay

**Impact:** Destroy takes 10-15 extra minutes.
**Workaround:** None — AWS limitation. Just wait.

### ACM Certificate Timing

**Impact:** Immediately after creation, ALB HTTPS listener may fail with `UnsupportedCertificate`.
**Workaround:** Wait 1-2 minutes and retry. DNS validation via Route53 auto-completes.

### SSM `ignore_changes` Requires Manual Update

**Impact:** Three external secrets (Stripe x2, OTEL) are created with placeholder values.
**Workaround:** Manual update per Step 7.1. This is by design — Terraform should not store real secrets in `.tfvars`.

### ~~No Automated Bootstrap Script~~ (IMPLEMENTED)

**Status:** Implemented. `scripts/bootstrap-environment.sh` automates Steps 3-7 (database creation, migrations, superuser, service restart). Remaining steps (channel config, app installation, Stripe webhooks, catalog import, price sync) are inherently manual or UI-driven.

### ECS Services Crash-Loop on Fresh Deploy

**Impact:** After `terraform apply`, all ECS services referencing ECR images will fail because repos are empty.
**Workaround:** Expected behavior. Push images (Step 2) and force-restart (Step 7) to resolve.

### Elastic IP Changes on Recreate

**Impact:** NAT gateway gets a new Elastic IP. If any external services whitelist by IP, they need updating.
**Status:** No known external IP whitelists for staging.

---

## 10. Terraform Source Reference

Quick index for agents and humans navigating the codebase:

| File | Purpose |
|------|---------|
| `infra/terraform/main.tf` | Root module — composes all modules, ACM cert, Route53, Service Discovery, Meilisearch secrets |
| `infra/terraform/variables.tf` | All input variables with defaults and validation |
| `infra/terraform/outputs.tf` | All outputs (URLs, ARNs, IDs) |
| `infra/terraform/backend.tf` | S3 state backend configuration |
| `infra/terraform/providers.tf` | AWS provider version constraints |
| `infra/terraform/versions.tf` | Terraform version constraint |
| `infra/terraform/config.tf` | AWS Config drift prevention resources |
| `infra/terraform/meilisearch-sync.tf` | SNS/SQS/EventBridge for Meilisearch sync pipeline |
| `infra/terraform/imports.tf` | Import blocks for state alignment |
| `infra/terraform/environments/staging.tfvars` | Staging variable values |
| `infra/terraform/environments/production.tfvars` | Production variable values |
| `infra/terraform/modules/vpc/main.tf` | VPC, subnets, NAT, VPC endpoints |
| `infra/terraform/modules/alb/main.tf` | ALB, security groups, target groups, listener rules |
| `infra/terraform/modules/rds/main.tf` | RDS PostgreSQL, parameter groups, read replica, RDS Proxy (optional) |
| `infra/terraform/modules/elasticache/main.tf` | Redis replication groups, parameter groups |
| `infra/terraform/modules/ecs/main.tf` | ECS cluster, all task definitions, services, auto-scaling |
| `infra/terraform/modules/ecr/main.tf` | ECR repositories and lifecycle policies |
| `infra/terraform/modules/s3/main.tf` | S3 media bucket, versioning, lifecycle, CORS, bucket policy |
| `infra/terraform/modules/cloudfront/main.tf` | CloudFront distribution, OAC |
| `infra/terraform/modules/iam/main.tf` | All IAM roles and policies (OIDC, ECS, task roles) |
| `infra/terraform/modules/secrets/main.tf` | SSM parameters and auto-generated secrets |
| `infra/terraform/modules/dynamodb/main.tf` | DynamoDB tables for apps |
| `infra/terraform/modules/meilisearch/main.tf` | EFS, Meilisearch ECS service, Service Discovery |

---

## Related Runbooks

- `docs/ops/runbooks/staging-app-installation.md` — Detailed app installation with permissions
- `docs/ops/runbooks/staging-apply-and-verify.md` — Normal Terraform apply workflow
- `docs/ops/runbooks/backups.md` — RDS snapshot and S3 recovery procedures
- `docs/ops/runbooks/migrations.md` — Django and Prisma migration procedures
- `docs/ops/runbooks/deploy.md` — CI/CD deployment workflow
- `docs/ops/runbooks/observability-otel-grafana.md` — OTEL/Grafana Cloud configuration
- `docs/reference/expected-divergence.md` — Known Terraform drift (ignore list)
