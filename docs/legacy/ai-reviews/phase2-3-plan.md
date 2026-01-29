# Phase 2-3 Implementation Plan: AWS ECS/Fargate Deployment

**Generated**: 2026-01-10T13:45:00-08:00
**Author**: Gen (Claude Code Assistant)
**Status**: Draft - Pending AI Review

---

## Executive Summary

This plan implements AWS ECS/Fargate deployment for the Saleor Hobby Gaming Platform with:
- **Phase 2**: Staging automation (auto-deploy on merge to platform/main)
- **Phase 3**: Production readiness (manual approval gate, rollback procedures)

Target architecture: AWS ECS/Fargate + RDS PostgreSQL + ElastiCache Redis + S3 + ALB

---

## 1. Service Inventory (Derived from docker-compose.yml)

### 1.1 Services to Deploy

| Service | Source | Image Strategy | Priority |
|---------|--------|----------------|----------|
| api | ghcr.io/saleor/saleor:3.22 | Use official image | P0 |
| worker | ghcr.io/saleor/saleor:3.22 | Use official image (different entrypoint) | P0 |
| storefront | ./storefront | Build custom image | P0 |
| dashboard | ghcr.io/saleor/saleor-dashboard:latest | Use official image | P0 |
| stripe-app | ./saleor-apps/apps/stripe | Build custom image | P1 |
| inventory-ops-app | ./saleor-apps/apps/inventory-ops | Build custom image | P1 |
| buylist-app | ./saleor-apps/apps/buylist | Build custom image | P1 |
| pos-app | ./saleor-apps/apps/pos | Build custom image | P1 |
| price-sync-worker | ./saleor-apps/apps/price-sync | Build custom image | P2 |
| meilisearch | getmeili/meilisearch:v1.6 | Use official image | P1 |

### 1.2 Managed Services (Not Deployed as Containers)

| Local Service | AWS Equivalent |
|---------------|----------------|
| db (PostgreSQL 15) | RDS PostgreSQL 15 |
| inventory-ops-db (PostgreSQL 15) | RDS PostgreSQL 15 (separate DB or instance) |
| cache (Valkey 8.1) | ElastiCache Redis 7.x (Valkey-compatible) |
| dynamodb-local | DynamoDB (native AWS service) |
| jaeger | X-Ray or CloudWatch (optional) |
| mailpit | SES (production email) |

### 1.3 ECR Repositories Required

```
{account_id}.dkr.ecr.{region}.amazonaws.com/saleor-platform/
  - storefront
  - stripe-app
  - inventory-ops-app
  - buylist-app
  - pos-app
  - price-sync-worker
```

Note: api, worker, dashboard, and meilisearch use official images - no ECR needed.

---

## 2. Infrastructure Architecture

### 2.1 Network Design

```
VPC (10.0.0.0/16)
├── Public Subnets (2 AZs minimum)
│   ├── 10.0.1.0/24 (us-west-2a)
│   └── 10.0.2.0/24 (us-west-2b)
│   └── Resources: ALB, NAT Gateway
│
├── Private Subnets (2 AZs minimum)
│   ├── 10.0.10.0/24 (us-west-2a)
│   └── 10.0.20.0/24 (us-west-2b)
│   └── Resources: ECS Tasks, RDS, ElastiCache
│
└── Security Groups:
    ├── alb-sg: 80/443 from 0.0.0.0/0
    ├── ecs-sg: dynamic ports from alb-sg
    ├── rds-sg: 5432 from ecs-sg
    └── redis-sg: 6379 from ecs-sg
```

### 2.2 ECS Cluster Design

```
ECS Cluster: saleor-platform-{env}
│
├── Service: api
│   ├── Task Definition: saleor-api
│   ├── Desired Count: 2 (staging), 3 (prod)
│   ├── Port: 8000
│   └── Health Check: /health/
│
├── Service: worker
│   ├── Task Definition: saleor-worker
│   ├── Desired Count: 1 (staging), 2 (prod)
│   └── Command: celery -A saleor worker -l info -B
│
├── Service: storefront
│   ├── Task Definition: storefront
│   ├── Desired Count: 2 (staging), 3 (prod)
│   ├── Port: 3000
│   └── Health Check: /api/health
│
├── Service: dashboard
│   ├── Task Definition: dashboard
│   ├── Desired Count: 1
│   └── Port: 80
│
├── Service: stripe-app
│   ├── Task Definition: stripe-app
│   ├── Desired Count: 1
│   └── Port: 3001
│
├── Service: inventory-ops-app
│   ├── Task Definition: inventory-ops-app
│   ├── Desired Count: 1
│   └── Port: 3002
│
├── Service: buylist-app
│   ├── Task Definition: buylist-app
│   ├── Desired Count: 1
│   └── Port: 3003
│
├── Service: pos-app
│   ├── Task Definition: pos-app
│   ├── Desired Count: 1
│   └── Port: 3004
│
└── Service: meilisearch
    ├── Task Definition: meilisearch
    ├── Desired Count: 1
    ├── Port: 7700
    └── EFS Volume: meilisearch-data
```

### 2.3 Database Design

**RDS PostgreSQL Configuration:**
```
Instance Class: db.t3.medium (staging), db.r6g.large (prod)
Engine: PostgreSQL 15
Multi-AZ: No (staging), Yes (prod)
Storage: 100 GB gp3
Backup Retention: 7 days (staging), 35 days (prod)

Databases:
  - saleor (main Saleor data)
  - inventory_ops (shared by inventory-ops, buylist, pos apps)
```

**ElastiCache Redis Configuration:**
```
Node Type: cache.t3.micro (staging), cache.r6g.large (prod)
Engine: Redis 7.x (Valkey compatible)
Cluster Mode: Disabled
Multi-AZ: No (staging), Yes (prod)
```

### 2.4 Storage Design

**S3 Media Bucket:**
```
Bucket: saleor-platform-media-{env}-{account_id}
Versioning: Enabled
Lifecycle: 90-day transition to IA, 365-day to Glacier
CORS: Allow storefront/api origins
```

**EFS for Meilisearch:**
```
Filesystem: saleor-meilisearch-{env}
Performance Mode: General Purpose
Throughput Mode: Bursting
Mount Target: Private subnets
```

---

## 3. Terraform Module Structure

```
infra/terraform/
├── main.tf                 # Root module composition
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── providers.tf            # AWS provider configuration
├── versions.tf             # Terraform version constraints
├── backend.tf              # S3 backend configuration (template)
│
├── environments/
│   ├── staging.tfvars      # Staging-specific values
│   └── production.tfvars   # Production-specific values
│
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── alb/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── ecs/
│   │   ├── main.tf         # Cluster + services
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── task-definitions/
│   │       ├── api.json.tpl
│   │       ├── worker.json.tpl
│   │       ├── storefront.json.tpl
│   │       └── ...
│   │
│   ├── rds/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── elasticache/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── s3/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── ecr/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   └── iam/
│       ├── main.tf         # Task roles, execution roles
│       ├── variables.tf
│       └── outputs.tf
│
└── data.tf                 # Data sources (existing VPC import option)
```

---

## 4. CI/CD Workflow Design

### 4.1 PR Workflow (Existing + Enhanced)

**File**: `.github/workflows/test-platform.yml` (enhanced)

```yaml
# Trigger: PR + push to platform/main
# Jobs:
#   - verify_backend (existing)
#   - verify_storefront (existing)
#   - verify_apps (existing)
#   - validate_migrations (existing)
#   - security_scan (existing)
#   - verify_builds (existing)
#   - container_scan (existing)
#   - validate_compose (existing)
#   - terraform_validate (NEW)
#   - localreview_ci (NEW)
```

**New Jobs:**

```yaml
terraform_validate:
  name: Terraform Validation
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: hashicorp/setup-terraform@v3
    - name: Terraform fmt check
      run: terraform fmt -check -recursive
      working-directory: infra/terraform
    - name: Terraform init
      run: terraform init -backend=false
      working-directory: infra/terraform
    - name: Terraform validate
      run: terraform validate
      working-directory: infra/terraform

localreview_ci:
  name: Local Review Gate
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - name: Run localreview
      run: |
        FAIL_ON=HIGH BASE_REF=origin/platform/main ./scripts/localreview.sh
```

### 4.2 Staging Deploy Workflow

**File**: `.github/workflows/deploy-staging.yml`

```yaml
name: Deploy to Staging

on:
  push:
    branches: [platform/main]
  workflow_dispatch:

concurrency:
  group: deploy-staging
  cancel-in-progress: false

permissions:
  id-token: write  # OIDC
  contents: read

jobs:
  build:
    name: Build & Push Images
    runs-on: ubuntu-latest
    outputs:
      storefront_image: ${{ steps.build.outputs.storefront }}
      stripe_app_image: ${{ steps.build.outputs.stripe_app }}
      # ... other outputs
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/github-actions-deploy
          aws-region: ${{ vars.AWS_REGION }}

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push images
        id: build
        run: |
          ./scripts/deploy/aws/build-and-push.sh staging ${{ github.sha }}

  migrate:
    name: Run Migrations
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/github-actions-deploy
          aws-region: ${{ vars.AWS_REGION }}
      - name: Run Django migrations
        run: ./scripts/deploy/aws/run-migrations.sh staging django
      - name: Run Prisma migrations
        run: ./scripts/deploy/aws/run-migrations.sh staging prisma

  deploy:
    name: Deploy ECS Services
    needs: [build, migrate]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api, worker, storefront, dashboard, stripe-app, inventory-ops-app, buylist-app, pos-app, meilisearch]
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/github-actions-deploy
          aws-region: ${{ vars.AWS_REGION }}
      - name: Deploy service
        run: |
          ./scripts/deploy/aws/deploy-service.sh staging ${{ matrix.service }} ${{ github.sha }}

  smoke_test:
    name: Smoke Tests
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run smoke tests
        run: |
          ./scripts/deploy/aws/smoke-test.sh staging
        env:
          STAGING_URL: ${{ vars.STAGING_URL }}
```

### 4.3 Production Deploy Workflow

**File**: `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      staging_sha:
        description: 'Git SHA deployed to staging (for verification)'
        required: true
      skip_approval:
        description: 'Skip manual approval (emergency only)'
        type: boolean
        default: false

concurrency:
  group: deploy-production
  cancel-in-progress: false

permissions:
  id-token: write
  contents: read

jobs:
  verify_staging:
    name: Verify Staging Deployment
    runs-on: ubuntu-latest
    steps:
      - name: Verify SHA matches staging
        run: |
          # Fetch current staging image tags and verify they match input SHA
          echo "Verifying staging deployment matches ${{ inputs.staging_sha }}"

  approval:
    name: Production Approval
    needs: verify_staging
    if: ${{ !inputs.skip_approval }}
    runs-on: ubuntu-latest
    environment: production  # Requires reviewers
    steps:
      - name: Approval checkpoint
        run: echo "Approved for production deployment"

  deploy:
    name: Deploy to Production
    needs: [verify_staging, approval]
    if: always() && (needs.approval.result == 'success' || inputs.skip_approval)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/github-actions-deploy
          aws-region: ${{ vars.AWS_REGION }}

      - name: Promote images from staging
        run: |
          ./scripts/deploy/aws/promote-to-prod.sh ${{ inputs.staging_sha }}

      - name: Run migrations
        run: |
          ./scripts/deploy/aws/run-migrations.sh production django
          ./scripts/deploy/aws/run-migrations.sh production prisma

      - name: Deploy all services
        run: |
          for svc in api worker storefront dashboard stripe-app inventory-ops-app buylist-app pos-app meilisearch; do
            ./scripts/deploy/aws/deploy-service.sh production $svc ${{ inputs.staging_sha }}
          done

      - name: Smoke tests
        run: ./scripts/deploy/aws/smoke-test.sh production
        env:
          PRODUCTION_URL: ${{ vars.PRODUCTION_URL }}

  rollback_on_failure:
    name: Rollback on Failure
    needs: deploy
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/github-actions-deploy
          aws-region: ${{ vars.AWS_REGION }}
      - name: Rollback to previous
        run: ./scripts/deploy/aws/rollback.sh production
```

---

## 5. Deploy Scripts Structure

```
scripts/deploy/aws/
├── README.md                    # Overview of deploy scripts
├── build-and-push.sh           # Build images and push to ECR
├── render-taskdef.py           # Render ECS task definitions with env vars
├── deploy-service.sh           # Deploy single ECS service
├── run-migrations.sh           # Run Django or Prisma migrations via ECS task
├── promote-to-prod.sh          # Re-tag staging images for prod
├── smoke-test.sh               # Curl-based health checks
├── rollback.sh                 # Rollback ECS service to previous revision
└── lib/
    ├── common.sh               # Shared functions
    └── task-definitions/       # Template task defs for migration tasks
        ├── migrate-django.json
        └── migrate-prisma.json
```

---

## 6. Secrets & Configuration

### 6.1 Environment Variables by Service

**API Service:**
```
# From SSM Parameter Store (/saleor/{env}/api/)
SECRET_KEY              # Django secret key
DATABASE_URL            # RDS connection string
CELERY_BROKER_URL       # ElastiCache connection string
AWS_STORAGE_BUCKET_NAME # S3 media bucket
AWS_S3_REGION_NAME      # S3 region

# Plain env vars (safe)
ALLOWED_HOSTS           # Comma-separated list
DEBUG                   # false in staging/prod
DEFAULT_CHANNEL_SLUG    # webstore
```

**Worker Service:**
```
# Same as API - shares configuration
```

**Storefront:**
```
# Build-time args (not secrets)
NEXT_PUBLIC_SALEOR_API_URL   # https://api.{domain}/graphql/
NEXT_PUBLIC_STOREFRONT_URL   # https://www.{domain}
NEXT_PUBLIC_DEFAULT_CHANNEL  # webstore

# Runtime (SSM)
SALEOR_API_URL              # Internal API URL
MEILISEARCH_URL             # ElastiCache or Meilisearch endpoint
```

**Custom Apps (stripe, inventory-ops, buylist, pos):**
```
# From SSM (/saleor/{env}/{app}/)
SECRET_KEY                # App-specific secret
DATABASE_URL              # inventory_ops DB connection

# Plain env vars
ALLOWED_DOMAIN_PATTERN    # Domain regex
APP_LOG_LEVEL             # info
```

### 6.2 SSM Parameter Store Naming Convention

```
/saleor/staging/api/SECRET_KEY
/saleor/staging/api/DATABASE_URL
/saleor/staging/api/CELERY_BROKER_URL
/saleor/staging/stripe-app/SECRET_KEY
/saleor/staging/inventory-ops-app/SECRET_KEY
/saleor/staging/inventory-ops-app/DATABASE_URL
...

/saleor/production/api/SECRET_KEY
/saleor/production/api/DATABASE_URL
...
```

### 6.3 Secrets Manager (for rotation-capable secrets)

```
saleor/staging/rds-master-password
saleor/production/rds-master-password
```

---

## 7. IAM Design

### 7.1 GitHub Actions OIDC Role

```
Role: github-actions-deploy
Trust Policy:
  - Federated: arn:aws:iam::{account}:oidc-provider/token.actions.githubusercontent.com
  - Condition: repo:{org}/{repo}:ref:refs/heads/platform/main

Permissions:
  - ecr:GetAuthorizationToken
  - ecr:BatchCheckLayerAvailability, ecr:GetDownloadUrlForLayer, etc.
  - ecr:PutImage, ecr:InitiateLayerUpload, etc.
  - ecs:RegisterTaskDefinition
  - ecs:UpdateService
  - ecs:DescribeServices
  - ecs:RunTask (for migrations)
  - ssm:GetParameter, ssm:GetParameters
  - logs:CreateLogStream, logs:PutLogEvents
  - iam:PassRole (for task roles)
```

### 7.2 ECS Task Execution Role

```
Role: saleor-ecs-execution-role
Managed Policies:
  - AmazonECSTaskExecutionRolePolicy

Inline Policy:
  - ssm:GetParameters (for secrets injection)
  - secretsmanager:GetSecretValue (for DB passwords)
  - logs:CreateLogStream, logs:PutLogEvents
```

### 7.3 ECS Task Role (per service)

```
Role: saleor-api-task-role
Permissions:
  - s3:PutObject, s3:GetObject, s3:DeleteObject (media bucket)
  - ses:SendEmail (if using SES)

Role: saleor-worker-task-role
Permissions:
  - Same as API
  - sqs:* (if using SQS for Celery)

Role: saleor-storefront-task-role
Permissions:
  - (minimal - reads from API)

Role: saleor-stripe-app-task-role
Permissions:
  - dynamodb:* (for APL storage)
```

---

## 8. Implementation Phases

### Phase 2: Staging Automation

**Deliverables:**
1. [ ] Terraform modules (VPC, ALB, ECS, RDS, ElastiCache, S3, ECR, IAM)
2. [ ] staging.tfvars with appropriate sizing
3. [ ] GitHub Actions: deploy-staging.yml
4. [ ] Deploy scripts (build, deploy, migrate, smoke-test)
5. [ ] SSM parameter structure documentation
6. [ ] Manual steps for initial infrastructure creation

**Success Criteria:**
- Merge to platform/main triggers auto-deploy to staging
- Migrations run automatically before service deployment
- Smoke tests verify basic functionality
- Logs visible in CloudWatch

### Phase 3: Production Readiness

**Deliverables:**
1. [ ] production.tfvars with production sizing (Multi-AZ, larger instances)
2. [ ] GitHub Actions: deploy-production.yml with approval gate
3. [ ] Rollback scripts and procedures
4. [ ] Operational runbooks (deploy, rollback, migrations, backups)
5. [ ] GitHub Environment configuration documentation

**Success Criteria:**
- Production deployment requires manual approval
- Same images used in staging are promoted (no rebuild)
- Rollback procedure tested and documented
- Backup strategy documented

---

## 9. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Database migration failure | HIGH | Run migrations as separate ECS task with rollback capability |
| Secrets exposure in logs | HIGH | Use SSM SecureString, never echo secrets |
| OIDC misconfiguration | HIGH | Restrict to specific repo/branch in trust policy |
| Cost overrun | MEDIUM | Use staging with minimal resources, set billing alerts |
| Meilisearch data loss | MEDIUM | EFS with backups, or use Meilisearch Cloud |
| Cold start latency | LOW | Keep minimum task count >0, use provisioned capacity |

---

## 10. Manual Steps for Michael (Preview)

This section will be expanded after implementation. Key items:

1. **AWS Account Prerequisites**
   - Enable OIDC provider for GitHub Actions
   - Create S3 bucket for Terraform state
   - Create KMS key for state encryption (optional)

2. **IAM Setup**
   - Create GitHub Actions OIDC role with trust policy
   - Create ECS execution and task roles

3. **DNS & TLS**
   - Create Route53 hosted zone (if not exists)
   - Request ACM certificates with DNS validation
   - Add CNAME records for validation

4. **Secrets Creation**
   - Create SSM parameters for each service
   - Generate and store Django SECRET_KEY
   - Create RDS master password in Secrets Manager

5. **GitHub Configuration**
   - Create `staging` and `production` environments
   - Add required reviewers to production environment
   - Set repository variables (AWS_ACCOUNT_ID, AWS_REGION, etc.)

6. **Infrastructure Deployment**
   - Initialize Terraform with S3 backend
   - Run `terraform plan` and review
   - Run `terraform apply` for staging first

---

## 11. Questions for Review

1. **Database Architecture**: Should inventory_ops be a separate database on the same RDS instance, or a completely separate RDS instance?

2. **Meilisearch Strategy**: Self-host on ECS with EFS, or use Meilisearch Cloud?

3. **DynamoDB for Stripe App**: Use native AWS DynamoDB (simpler) or keep compatible local implementation?

4. **Dashboard Access**: Should dashboard be behind the same ALB, or a separate one with different access controls?

5. **Monitoring**: CloudWatch only, or integrate with existing observability (Jaeger replacement)?

---

## Review Checklist for AI Reviewers

### For GPT-5.2 (Correctness/Spec Review)
- [ ] Terraform module structure follows best practices
- [ ] CI/CD workflow dependencies are correct
- [ ] Migration ordering is safe (migrate before deploy)
- [ ] IAM permissions follow least privilege
- [ ] Task definition templates are complete

### For Gemini 3 (Security/Ops Review)
- [ ] No secrets in plaintext
- [ ] OIDC trust policy restricts to correct repo/branch
- [ ] Security groups follow least-access principles
- [ ] Backup and retention policies are adequate
- [ ] Rollback procedures are feasible
