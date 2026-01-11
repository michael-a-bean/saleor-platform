# Manual Inputs Required for AWS Deployment

**Generated**: 2026-01-10
**Purpose**: Complete inventory of manual inputs needed before first deployment

---

## Summary

| Category | Items | Who Creates | Where Stored |
|----------|-------|-------------|--------------|
| AWS Resources | 6 | Michael (manual) | AWS Console/CLI |
| Terraform Variables | 8 | Michael (edit files) | Git repo |
| SSM Parameters | 14 | Michael (AWS CLI) | AWS SSM |
| GitHub Configuration | 9 | Michael (GitHub UI) | GitHub Settings |

---

## 1. AWS Resources (Pre-Terraform)

These must be created manually before `terraform apply`:

| Item | How to Create | Where Used | Notes |
|------|---------------|------------|-------|
| **S3 Bucket (tfstate)** | `aws s3api create-bucket --bucket saleor-platform-tfstate-{ACCOUNT_ID}` | Terraform backend | Enable versioning, encryption |
| **DynamoDB Table (lock)** | `aws dynamodb create-table --table-name saleor-platform-tfstate-lock --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST` | Terraform state locking | |
| **GitHub OIDC Provider** | `aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1` | IAM role trust | Only needed once per account |
| **Route53 Hosted Zone** | AWS Console or `aws route53 create-hosted-zone` | DNS records | Optional if using external DNS |
| **ACM Certificate** | Created by Terraform, but requires DNS validation | ALB HTTPS | Validate via Route53 or manual DNS |
| **inventory_ops Database** | `CREATE DATABASE inventory_ops;` via psql | Prisma migrations | After RDS is created by Terraform |

---

## 2. Terraform Variables (tfvars)

Edit `infra/terraform/environments/staging.tfvars` and `production.tfvars`:

| Variable | Example Value | Where Used | Rotation |
|----------|---------------|------------|----------|
| `domain_name` | `staging.example.com` | ALB listeners, Route53, task defs | N/A |
| `github_org` | `myorg` | IAM OIDC trust policy | N/A |
| `github_repo` | `saleor-platform` | IAM OIDC trust policy | N/A |
| `github_branch` | `platform/main` | IAM OIDC trust policy | N/A |
| `route53_zone_id` | `Z0123456789ABC` | DNS records | N/A |
| `saleor_api_image` | `ghcr.io/saleor/saleor@sha256:...` | ECS task definitions | On Saleor upgrade |
| `saleor_dashboard_image` | `ghcr.io/saleor/saleor-dashboard@sha256:...` | ECS task definitions | On Saleor upgrade |
| `aws_region` | `us-west-2` | All resources | N/A |

---

## 3. SSM Parameters (Secrets)

Create with `aws ssm put-parameter --type SecureString`:

### API Service (Saleor Core)

| Parameter Path | Example Value | Generation | Rotation |
|----------------|---------------|------------|----------|
| `/saleor/{env}/api/SECRET_KEY` | `abc123...` | `openssl rand -hex 32` | Annually |
| `/saleor/{env}/api/DATABASE_URL` | `postgresql://saleor:PASSWORD@rds-endpoint:5432/saleor` | Terraform outputs | On password rotation |
| `/saleor/{env}/api/CELERY_BROKER_URL` | `redis://elasticache-endpoint:6379/1` | Terraform outputs | N/A |

### Stripe App

| Parameter Path | Example Value | Generation | Rotation |
|----------------|---------------|------------|----------|
| `/saleor/{env}/stripe-app/SECRET_KEY` | `def456...` | `openssl rand -hex 32` | Annually |

### Inventory Ops App

| Parameter Path | Example Value | Generation | Rotation |
|----------------|---------------|------------|----------|
| `/saleor/{env}/inventory-ops-app/SECRET_KEY` | `ghi789...` | `openssl rand -hex 32` | Annually |
| `/saleor/{env}/inventory-ops-app/DATABASE_URL` | `postgresql://saleor:PASSWORD@rds-endpoint:5432/inventory_ops` | Terraform outputs | On password rotation |

### Buylist App

| Parameter Path | Example Value | Generation | Rotation |
|----------------|---------------|------------|----------|
| `/saleor/{env}/buylist-app/SECRET_KEY` | `jkl012...` | `openssl rand -hex 32` | Annually |
| `/saleor/{env}/buylist-app/DATABASE_URL` | `postgresql://saleor:PASSWORD@rds-endpoint:5432/inventory_ops` | Terraform outputs | On password rotation |

### POS App

| Parameter Path | Example Value | Generation | Rotation |
|----------------|---------------|------------|----------|
| `/saleor/{env}/pos-app/SECRET_KEY` | `mno345...` | `openssl rand -hex 32` | Annually |
| `/saleor/{env}/pos-app/DATABASE_URL` | `postgresql://saleor:PASSWORD@rds-endpoint:5432/inventory_ops` | Terraform outputs | On password rotation |

---

## 4. GitHub Configuration

### Repository Variables (Settings → Secrets and variables → Actions → Variables)

| Variable | Example Value | Where Used |
|----------|---------------|------------|
| `AWS_ACCOUNT_ID` | `123456789012` | OIDC role ARN construction |
| `AWS_REGION` | `us-west-2` | AWS CLI operations |
| `STAGING_API_URL` | `https://api.staging.example.com` | Storefront build args, smoke tests |
| `STAGING_STOREFRONT_URL` | `https://www.staging.example.com` | Storefront build args, smoke tests |
| `STAGING_DASHBOARD_URL` | `https://dashboard.staging.example.com` | Smoke tests |
| `PRODUCTION_API_URL` | `https://api.example.com` | Production smoke tests |
| `PRODUCTION_STOREFRONT_URL` | `https://www.example.com` | Production smoke tests |
| `PRODUCTION_DASHBOARD_URL` | `https://dashboard.example.com` | Production smoke tests |

### GitHub Environments (Settings → Environments)

| Environment | Required Reviewers | Deployment Branches | Wait Timer |
|-------------|-------------------|---------------------|------------|
| `staging` | None (auto-deploy) | `platform/main` | None |
| `production` | At least 1 reviewer | `platform/main` | Optional (e.g., 5 min) |

---

## 5. Quick Reference Commands

### Generate Secret Keys

```bash
# Generate all app secrets at once
for app in api stripe-app inventory-ops-app buylist-app pos-app; do
  echo "${app}: $(openssl rand -hex 32)"
done
```

### Get RDS Endpoint After Terraform Apply

```bash
cd infra/terraform
terraform output rds_endpoint
terraform output redis_endpoint
```

### Create SSM Parameters (Template)

```bash
ENV=staging
DB_PASSWORD="your-db-password"
RDS_ENDPOINT="your-rds-endpoint"
REDIS_ENDPOINT="your-redis-endpoint"

# API secrets
aws ssm put-parameter --name "/saleor/${ENV}/api/SECRET_KEY" --type SecureString --value "$(openssl rand -hex 32)"
aws ssm put-parameter --name "/saleor/${ENV}/api/DATABASE_URL" --type SecureString --value "postgresql://saleor:${DB_PASSWORD}@${RDS_ENDPOINT}/saleor"
aws ssm put-parameter --name "/saleor/${ENV}/api/CELERY_BROKER_URL" --type SecureString --value "redis://${REDIS_ENDPOINT}:6379/1"

# App secrets
aws ssm put-parameter --name "/saleor/${ENV}/stripe-app/SECRET_KEY" --type SecureString --value "$(openssl rand -hex 32)"
aws ssm put-parameter --name "/saleor/${ENV}/inventory-ops-app/SECRET_KEY" --type SecureString --value "$(openssl rand -hex 32)"
aws ssm put-parameter --name "/saleor/${ENV}/inventory-ops-app/DATABASE_URL" --type SecureString --value "postgresql://saleor:${DB_PASSWORD}@${RDS_ENDPOINT}/inventory_ops"
aws ssm put-parameter --name "/saleor/${ENV}/buylist-app/SECRET_KEY" --type SecureString --value "$(openssl rand -hex 32)"
aws ssm put-parameter --name "/saleor/${ENV}/buylist-app/DATABASE_URL" --type SecureString --value "postgresql://saleor:${DB_PASSWORD}@${RDS_ENDPOINT}/inventory_ops"
aws ssm put-parameter --name "/saleor/${ENV}/pos-app/SECRET_KEY" --type SecureString --value "$(openssl rand -hex 32)"
aws ssm put-parameter --name "/saleor/${ENV}/pos-app/DATABASE_URL" --type SecureString --value "postgresql://saleor:${DB_PASSWORD}@${RDS_ENDPOINT}/inventory_ops"
```

### Verify GitHub OIDC Provider Exists

```bash
aws iam list-open-id-connect-providers | grep token.actions.githubusercontent.com
```

---

## 6. Dependency Order

Must be created in this order:

1. **S3 bucket + DynamoDB table** (Terraform state backend)
2. **GitHub OIDC provider** (IAM trust relationship)
3. **Terraform apply** (creates VPC, RDS, ECR, etc.)
4. **inventory_ops database** (after RDS exists)
5. **SSM parameters** (after RDS endpoint known)
6. **GitHub variables** (anytime before first workflow run)
7. **GitHub environments** (anytime, but before production deploy)
8. **DNS validation** (after ACM certificate created)

---

## 7. Rotation Schedule

| Item | Rotation Frequency | Procedure |
|------|-------------------|-----------|
| App SECRET_KEYs | Annually | Update SSM, redeploy services |
| RDS master password | Quarterly | AWS Secrets Manager rotation (if used) |
| GitHub OIDC thumbprint | When GitHub rotates certs | Update IAM OIDC provider |
| Saleor upstream images | On security patches | Update tfvars, redeploy |

---

## Checklist Before First Deploy

### AWS Pre-requisites
- [ ] S3 bucket for tfstate created
- [ ] DynamoDB table for state lock created
- [ ] GitHub OIDC provider created

### Terraform
- [ ] `backend.tf` configured with correct bucket name
- [ ] `staging.tfvars` updated with domain, github_org, etc.
- [ ] `terraform init` successful
- [ ] `terraform apply` completed

### Post-Terraform
- [ ] inventory_ops database created in RDS
- [ ] DNS records validated (ACM certificate valid)
- [ ] All SSM parameters created

### GitHub
- [ ] All repository variables set
- [ ] `staging` environment created
- [ ] `production` environment created with reviewers
