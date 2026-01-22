# Manual Steps for AWS Deployment

This document lists all manual steps required to complete the AWS ECS/Fargate deployment that cannot be done from the repo side due to AWS account access or sudo requirements.

**Last Updated**: 2026-01-11 (after successful staging deployment)

---

## Related Documents

Before starting, review these documents for context:

- [FIRST_DEPLOY_TRACE.md](./FIRST_DEPLOY_TRACE.md) - Expected execution behavior
- [MANUAL_INPUTS_TABLE.md](./MANUAL_INPUTS_TABLE.md) - Complete list of inputs needed
- [PROMOTION_MODEL.md](./PROMOTION_MODEL.md) - Image promotion semantics
- [MIGRATION_EXECUTION_MODEL.md](./MIGRATION_EXECUTION_MODEL.md) - Migration procedures

---

## Prerequisites Checklist

- [x] AWS Account with admin access
- [x] AWS CLI installed (`aws --version` should show 2.x)
- [x] Terraform installed (version 1.5+)
- [ ] jq installed for JSON processing (optional)
- [x] GitHub repository admin access
- [x] Docker installed for building images

---

## Staging Deployment Status

| Component | Status | Notes |
|-----------|--------|-------|
| Terraform State Backend | ✅ Complete | S3 + DynamoDB |
| GitHub OIDC | ✅ Complete | Provider imported |
| Infrastructure | ✅ Complete | VPC, RDS, Redis, ECS, ALB |
| Secrets (SSM) | ✅ Complete | All secrets stored |
| Database Migrations | ✅ Complete | All migrations applied |
| ECS Services | ✅ Running | API, Worker, Storefront, Dashboard |
| DNS/TLS | ⏳ Pending | Using ALB defaults for now |

---

## Phase 1: AWS Account Setup

### 1.1 Create Terraform State Backend

The Terraform state must be stored remotely in S3 with DynamoDB locking.

```bash
# Set your account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-west-1  # IMPORTANT: We use us-west-1

# Create S3 bucket for state
aws s3api create-bucket \
  --bucket saleor-platform-tfstate-${AWS_ACCOUNT_ID} \
  --region ${AWS_REGION} \
  --create-bucket-configuration LocationConstraint=${AWS_REGION}

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket saleor-platform-tfstate-${AWS_ACCOUNT_ID} \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket saleor-platform-tfstate-${AWS_ACCOUNT_ID} \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket saleor-platform-tfstate-${AWS_ACCOUNT_ID} \
  --public-access-block-configuration '{
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": true,
    "RestrictPublicBuckets": true
  }'

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name saleor-platform-tfstate-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ${AWS_REGION}
```

**Staging Values (Deployed 2026-01-11):**
- Bucket: `saleor-platform-tfstate-546464732019`
- DynamoDB Table: `saleor-platform-tfstate-lock`
- Region: `us-west-1`

### 1.2 Configure Terraform Backend

Create `infra/terraform/backend.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "saleor-platform-tfstate-546464732019"
    key            = "staging/terraform.tfstate"
    region         = "us-west-1"
    encrypt        = true
    dynamodb_table = "saleor-platform-tfstate-lock"
  }
}
```

### 1.3 Create GitHub OIDC Provider

AWS needs to trust GitHub Actions for OIDC authentication.

```bash
# Create OIDC provider (only needed once per account)
# NOTE: If provider already exists, import it into Terraform instead
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

**If provider already exists:**
```bash
# Import into Terraform
cd infra/terraform
terraform import module.iam.aws_iam_openid_connect_provider.github \
  arn:aws:iam::546464732019:oidc-provider/token.actions.githubusercontent.com
```

---

## Phase 2: Initial Infrastructure Deployment

### 2.1 Update Environment Variables

Edit `infra/terraform/environments/staging.tfvars`:

```hcl
# Core settings
environment = "staging"
aws_region  = "us-west-1"

# Domain (using ALB defaults until DNS is configured)
domain_name            = "staging.shuffleandcut.com"
create_acm_certificate = false  # No HTTPS for initial staging

# Availability zones
availability_zones = ["us-west-1a", "us-west-1b"]

# GitHub (for OIDC)
github_org    = "michael-a-bean"
github_repo   = "saleor-platform"

# Images - IMPORTANT: Use 3.21, not 3.22 (3.22 doesn't exist!)
saleor_api_image       = "ghcr.io/saleor/saleor:3.21"
saleor_dashboard_image = "ghcr.io/saleor/saleor-dashboard:3.21"
```

### 2.2 Deploy Staging Infrastructure

```bash
cd infra/terraform

# Initialize Terraform
terraform init

# Review the plan
terraform plan -var-file=environments/staging.tfvars -out=staging.tfplan

# Apply (this will take 15-20 minutes)
terraform apply staging.tfplan
```

**Expected resources created:**
- VPC with public/private subnets
- NAT Gateway
- Application Load Balancer
- ECS Cluster
- RDS PostgreSQL instance
- ElastiCache Redis cluster
- S3 media bucket
- ECR repositories
- IAM roles
- CloudWatch log groups

### 2.3 Capture Terraform Outputs

**Staging Outputs (2026-01-11):**

| Output | Value |
|--------|-------|
| ALB DNS | `saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com` |
| RDS Endpoint | `saleor-platform-staging-saleor.ct8eqa82m5c9.us-west-1.rds.amazonaws.com:5432` |
| Redis Endpoint | `saleor-platform-staging-cache.kybrvw.ng.0001.usw1.cache.amazonaws.com` |
| ECS Cluster | `saleor-platform-staging` |
| VPC ID | `vpc-0b0360f5c0c874c59` |
| ECS Task Subnets | `subnet-0049e63c14fbb3825,subnet-0f12843b826424978` |
| ECS Task Security Group | `sg-0c35fbd209ae520f7` |

---

## Phase 3: DNS and TLS Setup

### 3.1 Staging Without Custom Domain

For initial staging, we use the ALB DNS name directly:

- **Storefront**: http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/
- **Dashboard**: http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard/
- **API**: http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/

### 3.2 Production Domain Setup (When Ready)

When `shuffleandcut.com` is available:

1. Create ACM certificate in us-west-1
2. Add DNS records in Route53/external DNS
3. Update `create_acm_certificate = true` in tfvars
4. Re-apply Terraform

---

## Phase 4: Secrets Configuration

### 4.1 Generate Secrets

```bash
# Generate Django secret key
DJANGO_SECRET=$(openssl rand -hex 32)
echo "Django Secret Key: ${DJANGO_SECRET}"

# Generate RSA private key for JWT (REQUIRED when DEBUG=False)
RSA_PRIVATE_KEY=$(openssl genrsa 2048 2>/dev/null)
echo "RSA Key generated"

# Generate RDS password
RDS_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
echo "RDS Password: ${RDS_PASSWORD}"
```

### 4.2 Create SSM Parameters

**CRITICAL: All these secrets are required for Saleor to start in production mode (DEBUG=False)**

```bash
# Core API secrets
aws ssm put-parameter --region us-west-1 \
  --name "/saleor/staging/api/SECRET_KEY" \
  --type "SecureString" \
  --value "${DJANGO_SECRET}" \
  --overwrite

aws ssm put-parameter --region us-west-1 \
  --name "/saleor/staging/api/DATABASE_URL" \
  --type "SecureString" \
  --value "postgresql://saleor:${RDS_PASSWORD}@saleor-platform-staging-saleor.ct8eqa82m5c9.us-west-1.rds.amazonaws.com:5432/saleor" \
  --overwrite

aws ssm put-parameter --region us-west-1 \
  --name "/saleor/staging/api/CELERY_BROKER_URL" \
  --type "SecureString" \
  --value "redis://saleor-platform-staging-cache.kybrvw.ng.0001.usw1.cache.amazonaws.com:6379/1" \
  --overwrite

# RSA Private Key for JWT (CRITICAL - required when DEBUG=False)
aws ssm put-parameter --region us-west-1 \
  --name "/saleor/staging/api/RSA_PRIVATE_KEY" \
  --type "SecureString" \
  --value "${RSA_PRIVATE_KEY}" \
  --overwrite
```

### 4.3 Update RDS Password (If Changed)

If you generated a new password, update RDS:

```bash
aws rds modify-db-instance \
  --region us-west-1 \
  --db-instance-identifier saleor-platform-staging-saleor \
  --master-user-password "${RDS_PASSWORD}" \
  --apply-immediately
```

---

## Phase 5: Build and Push Storefront Image

The storefront requires a custom build because it needs GraphQL schema at build time.

### 5.1 Generate Schema File

```bash
cd /path/to/saleor-platform/storefront

# Generate schema from local running API
bunx get-graphql-schema http://localhost:8000/graphql/ > schema.graphql
```

### 5.2 Build and Push Image

```bash
# Login to ECR
aws ecr get-login-password --region us-west-1 | \
  docker login --username AWS --password-stdin 546464732019.dkr.ecr.us-west-1.amazonaws.com

# Get git SHA for image tag
GIT_SHA=$(git rev-parse --short HEAD)

# Build with staging URLs
docker build \
  --build-arg NEXT_PUBLIC_SALEOR_API_URL=http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/ \
  --build-arg NEXT_PUBLIC_STOREFRONT_URL=http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com \
  --build-arg NEXT_PUBLIC_DEFAULT_CHANNEL=default-channel \
  -t 546464732019.dkr.ecr.us-west-1.amazonaws.com/saleor-platform/storefront:sha-${GIT_SHA} \
  .

# Push to ECR
docker push 546464732019.dkr.ecr.us-west-1.amazonaws.com/saleor-platform/storefront:sha-${GIT_SHA}
```

### 5.3 Update Terraform with Image Tag

In `variables.tf`, update or add:

```hcl
variable "storefront_image_tag" {
  description = "Storefront image tag"
  type        = string
  default     = "sha-3f84f6b"  # Update with your SHA
}
```

---

## Phase 6: Run Database Migrations

### 6.1 Run Migration Task

```bash
aws ecs run-task \
  --region us-west-1 \
  --cluster saleor-platform-staging \
  --task-definition saleor-platform-staging-migrate \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0049e63c14fbb3825,subnet-0f12843b826424978],securityGroups=[sg-0c35fbd209ae520f7],assignPublicIp=DISABLED}"
```

### 6.2 Monitor Migration

```bash
# Wait for task to complete
TASK_ARN="<task-arn-from-above>"
aws ecs wait tasks-stopped --region us-west-1 --cluster saleor-platform-staging --tasks "$TASK_ARN"

# Check result
aws ecs describe-tasks --region us-west-1 --cluster saleor-platform-staging --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode'
# Should return: 0
```

---

## Phase 7: Start ECS Services

### 7.1 Update Services to Latest Task Definitions

After Terraform changes, ECS services may not automatically use new task definitions:

```bash
for service in api worker dashboard storefront; do
  LATEST_DEF=$(aws ecs list-task-definitions --region us-west-1 \
    --family-prefix "saleor-platform-staging-$service" \
    --sort DESC --max-items 1 \
    --query 'taskDefinitionArns[0]' --output text)

  echo "Updating $service to $LATEST_DEF"

  aws ecs update-service \
    --region us-west-1 \
    --cluster saleor-platform-staging \
    --service $service \
    --task-definition "$LATEST_DEF" \
    --force-new-deployment
done
```

### 7.2 Wait for Services to Stabilize

```bash
aws ecs wait services-stable \
  --region us-west-1 \
  --cluster saleor-platform-staging \
  --services api worker storefront dashboard
```

---

## Phase 8: Verification

### 8.1 Check Service Status

```bash
aws ecs describe-services --region us-west-1 \
  --cluster saleor-platform-staging \
  --services api dashboard storefront worker \
  --query 'services[*].{name:serviceName,running:runningCount,desired:desiredCount}' \
  --output table
```

Expected output:
```
+---------+--------------+----------+
| desired |    name      | running  |
+---------+--------------+----------+
|  1      |  api         |  1       |
|  1      |  dashboard   |  1       |
|  1      |  storefront  |  1       |
|  1      |  worker      |  1       |
+---------+--------------+----------+
```

### 8.2 Test Endpoints

```bash
ALB_URL="http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

# Health check
curl -s "$ALB_URL/health/"
# Should return empty 200

# GraphQL test
curl -s "$ALB_URL/graphql/" \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ shop { name } }"}'
# Should return: {"data": {"shop": {"name": "Saleor e-commerce"}}}

# Storefront
curl -s -o /dev/null -w "%{http_code}" "$ALB_URL/"
# Should return: 307 (redirects to /default-channel)
```

---

## Troubleshooting

### Error: ALLOWED_CLIENT_HOSTS not set

**Symptom**: API containers fail with:
```
django.core.exceptions.ImproperlyConfigured: ALLOWED_CLIENT_HOSTS environment variable must be set when DEBUG=False.
```

**Solution**: Ensure the ECS task definition includes both `ALLOWED_HOSTS` and `ALLOWED_CLIENT_HOSTS` environment variables. They should include the ALB DNS name:

```hcl
environment = [
  { name = "ALLOWED_HOSTS", value = "api.staging.shuffleandcut.com,localhost,saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com" },
  { name = "ALLOWED_CLIENT_HOSTS", value = "api.staging.shuffleandcut.com,localhost,saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com" },
]
```

### Error: RSA_PRIVATE_KEY not set

**Symptom**: API containers fail with:
```
django.core.exceptions.ImproperlyConfigured: Variable RSA_PRIVATE_KEY is not provided. It is required for running in not DEBUG mode.
```

**Solution**: Generate and store RSA key in SSM:
```bash
RSA_PRIVATE_KEY=$(openssl genrsa 2048 2>/dev/null)
aws ssm put-parameter --region us-west-1 \
  --name "/saleor/staging/api/RSA_PRIVATE_KEY" \
  --type "SecureString" \
  --value "$RSA_PRIVATE_KEY" \
  --overwrite
```

Then add to ECS task definition secrets.

### Error: Image not found (ECR)

**Symptom**: `CannotPullContainerError: ... not found`

**Causes**:
1. Image tag doesn't exist in ECR
2. ECR uses IMMUTABLE tags - can't overwrite `:latest`

**Solution**: Use SHA-based tags:
```bash
docker tag myimage:latest 546464732019.dkr.ecr.us-west-1.amazonaws.com/saleor-platform/storefront:sha-abc1234
docker push 546464732019.dkr.ecr.us-west-1.amazonaws.com/saleor-platform/storefront:sha-abc1234
```

### Error: Saleor Dashboard shows localhost API

**Symptom**: Dashboard loads but can't connect to API

**Cause**: Official Saleor dashboard image has `API_URL` hardcoded to `localhost:8000`

**Solution**: Build custom dashboard image with correct API_URL, or configure at runtime if supported by newer versions.

### ECS Service Not Using New Task Definition

**Symptom**: After `terraform apply`, services still use old task definition

**Cause**: ECS services don't automatically update when task definition changes

**Solution**: Force new deployment:
```bash
aws ecs update-service \
  --region us-west-1 \
  --cluster saleor-platform-staging \
  --service api \
  --task-definition saleor-platform-staging-api:4 \
  --force-new-deployment
```

### GraphQL Returns 400 Bad Request

**Symptom**: GraphQL queries return 400 error

**Causes**:
1. Missing CSRF token (for mutations)
2. ALLOWED_HOSTS doesn't include request host
3. Incorrect Content-Type header

**Solution**: Ensure ALLOWED_HOSTS includes ALB DNS name and use proper headers:
```bash
curl -X POST "$ALB_URL/graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ shop { name } }"}'
```

---

## Quick Reference

### Staging Access URLs

| Service | URL |
|---------|-----|
| Storefront | http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/ |
| Dashboard | http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard/ |
| API Health | http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/health/ |
| GraphQL | http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/graphql/ |

### Key SSM Parameters

| Parameter | Purpose |
|-----------|---------|
| `/saleor/staging/api/SECRET_KEY` | Django secret key |
| `/saleor/staging/api/DATABASE_URL` | PostgreSQL connection string |
| `/saleor/staging/api/CELERY_BROKER_URL` | Redis connection for Celery |
| `/saleor/staging/api/RSA_PRIVATE_KEY` | JWT signing key (required!) |

### Useful Commands

```bash
# Check service status
aws ecs describe-services --region us-west-1 --cluster saleor-platform-staging \
  --services api worker storefront dashboard \
  --query 'services[*].{name:serviceName,running:runningCount}'

# View logs
aws logs tail /ecs/saleor-platform-staging/api --follow --region us-west-1

# Force restart a service
aws ecs update-service --region us-west-1 --cluster saleor-platform-staging \
  --service api --force-new-deployment

# List task definitions
aws ecs list-task-definitions --region us-west-1 \
  --family-prefix saleor-platform-staging-api --sort DESC
```

---

## Production Deployment

When ready for production:

1. Update `infra/terraform/environments/production.tfvars`
2. Set `create_acm_certificate = true`
3. Configure Route53 or external DNS
4. Create production SSM parameters
5. Set up GitHub production environment with required reviewers
6. Run `terraform apply -var-file=environments/production.tfvars`
7. Run migrations
8. Deploy services

---

## Support

- Terraform documentation: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- ECS troubleshooting: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/troubleshooting.html
- GitHub OIDC: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
- Saleor documentation: https://docs.saleor.io/
