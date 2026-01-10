# Manual Steps for Michael

This document lists all manual steps required to complete the AWS ECS/Fargate deployment that cannot be done from the repo side due to AWS account access or sudo requirements.

---

## Prerequisites Checklist

- [ ] AWS Account with admin access
- [ ] AWS CLI installed (`aws --version` should show 2.x)
- [ ] Terraform installed (version 1.5+)
- [ ] jq installed for JSON processing
- [ ] GitHub repository admin access

---

## Phase 1: AWS Account Setup

### 1.1 Create Terraform State Backend

The Terraform state must be stored remotely in S3 with DynamoDB locking.

```bash
# Set your account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-west-2

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

### 1.2 Configure Terraform Backend

```bash
cd infra/terraform

# Copy backend template and edit
cp backend.tf.example backend.tf

# Edit backend.tf with your values:
# - Replace ACCOUNT_ID with your AWS account ID
# - Replace ENV with 'staging' or 'production'
# - Verify region is correct
```

**backend.tf for staging:**
```hcl
terraform {
  backend "s3" {
    bucket         = "saleor-platform-tfstate-YOUR_ACCOUNT_ID"
    key            = "staging/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "saleor-platform-tfstate-lock"
  }
}
```

### 1.3 Create GitHub OIDC Provider

AWS needs to trust GitHub Actions for OIDC authentication.

```bash
# Create OIDC provider (only needed once per account)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

---

## Phase 2: Initial Infrastructure Deployment

### 2.1 Update Environment Variables

Edit the tfvars files with your specific values:

```bash
# Edit staging configuration
vi infra/terraform/environments/staging.tfvars

# Update these values:
# - domain_name = "staging.yourdomain.com"
# - github_org = "your-github-org"
# - route53_zone_id = "Z0123456789ABC" (if using Route53)
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

### 2.3 Note Important Outputs

After `terraform apply`, save these outputs:

```bash
terraform output > staging-outputs.txt

# Key outputs to note:
# - alb_dns_name: ALB URL before DNS setup
# - rds_endpoint: Database endpoint
# - redis_endpoint: Cache endpoint
# - github_actions_role_arn: Role for CI/CD
# - ecr_repository_urls: Image registry URLs
```

---

## Phase 3: DNS and TLS Setup

### 3.1 Route53 Setup (If Using Route53)

If you have a Route53 hosted zone:

```bash
# Get your hosted zone ID
aws route53 list-hosted-zones

# The Terraform config will create:
# - api.staging.yourdomain.com -> ALB
# - www.staging.yourdomain.com -> ALB
# - dashboard.staging.yourdomain.com -> ALB
# - apps.staging.yourdomain.com -> ALB
```

### 3.2 Manual DNS Setup (If Not Using Route53)

If managing DNS elsewhere, create these CNAME records:

| Record | Type | Value |
|--------|------|-------|
| api.staging.yourdomain.com | CNAME | <alb_dns_name from outputs> |
| www.staging.yourdomain.com | CNAME | <alb_dns_name from outputs> |
| dashboard.staging.yourdomain.com | CNAME | <alb_dns_name from outputs> |
| apps.staging.yourdomain.com | CNAME | <alb_dns_name from outputs> |

### 3.3 ACM Certificate Validation

If ACM certificate was created, validate it:

```bash
# Get certificate validation records
aws acm describe-certificate \
  --certificate-arn <certificate_arn_from_outputs> \
  --query 'Certificate.DomainValidationOptions'

# Create DNS validation records (if not using Route53)
# Add CNAME records as shown in the output
```

---

## Phase 4: Secrets Configuration

### 4.1 Generate Secrets

```bash
# Generate Django secret key
DJANGO_SECRET=$(openssl rand -hex 32)
echo "Django Secret Key: ${DJANGO_SECRET}"

# Generate app secret keys
STRIPE_APP_SECRET=$(openssl rand -hex 32)
INVENTORY_OPS_SECRET=$(openssl rand -hex 32)
BUYLIST_SECRET=$(openssl rand -hex 32)
POS_SECRET=$(openssl rand -hex 32)
```

### 4.2 Create SSM Parameters

```bash
# Get database password from Terraform
# (or retrieve from AWS Console -> RDS -> Modify -> Show password)
DB_PASSWORD="<from_terraform_or_console>"

# Get endpoints from Terraform outputs
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)

# Create API secrets
aws ssm put-parameter \
  --name "/saleor/staging/api/SECRET_KEY" \
  --type "SecureString" \
  --value "${DJANGO_SECRET}"

aws ssm put-parameter \
  --name "/saleor/staging/api/DATABASE_URL" \
  --type "SecureString" \
  --value "postgresql://saleor:${DB_PASSWORD}@${RDS_ENDPOINT}/saleor"

aws ssm put-parameter \
  --name "/saleor/staging/api/CELERY_BROKER_URL" \
  --type "SecureString" \
  --value "redis://${REDIS_ENDPOINT}:6379/1"

# Create app secrets
aws ssm put-parameter \
  --name "/saleor/staging/stripe-app/SECRET_KEY" \
  --type "SecureString" \
  --value "${STRIPE_APP_SECRET}"

aws ssm put-parameter \
  --name "/saleor/staging/inventory-ops-app/SECRET_KEY" \
  --type "SecureString" \
  --value "${INVENTORY_OPS_SECRET}"

aws ssm put-parameter \
  --name "/saleor/staging/inventory-ops-app/DATABASE_URL" \
  --type "SecureString" \
  --value "postgresql://saleor:${DB_PASSWORD}@${RDS_ENDPOINT}/inventory_ops"

aws ssm put-parameter \
  --name "/saleor/staging/buylist-app/SECRET_KEY" \
  --type "SecureString" \
  --value "${BUYLIST_SECRET}"

aws ssm put-parameter \
  --name "/saleor/staging/buylist-app/DATABASE_URL" \
  --type "SecureString" \
  --value "postgresql://saleor:${DB_PASSWORD}@${RDS_ENDPOINT}/inventory_ops"

aws ssm put-parameter \
  --name "/saleor/staging/pos-app/SECRET_KEY" \
  --type "SecureString" \
  --value "${POS_SECRET}"

aws ssm put-parameter \
  --name "/saleor/staging/pos-app/DATABASE_URL" \
  --type "SecureString" \
  --value "postgresql://saleor:${DB_PASSWORD}@${RDS_ENDPOINT}/inventory_ops"
```

### 4.3 Create inventory_ops Database

Connect to RDS and create the inventory_ops database:

```bash
# Install psql if needed (on your local machine)
# On macOS: brew install postgresql
# On Ubuntu: sudo apt install postgresql-client

# Get RDS endpoint
RDS_ENDPOINT=$(terraform output -raw rds_endpoint | cut -d: -f1)

# Connect to RDS (you may need to temporarily allow your IP in security group)
psql -h ${RDS_ENDPOINT} -U saleor -d saleor

# In psql:
CREATE DATABASE inventory_ops;
\q
```

---

## Phase 5: GitHub Configuration

### 5.1 Create GitHub Environments

In your GitHub repository:

1. Go to **Settings** → **Environments**
2. Create `staging` environment
3. Create `production` environment
   - Add **Required reviewers** (select approvers)
   - Optionally add **Wait timer** for cooldown

### 5.2 Set Repository Variables

Go to **Settings** → **Secrets and variables** → **Actions** → **Variables**:

| Variable | Value |
|----------|-------|
| AWS_ACCOUNT_ID | `123456789012` (your account ID) |
| AWS_REGION | `us-west-2` |
| STAGING_API_URL | `https://api.staging.yourdomain.com` |
| STAGING_STOREFRONT_URL | `https://www.staging.yourdomain.com` |
| STAGING_DASHBOARD_URL | `https://dashboard.staging.yourdomain.com` |
| PRODUCTION_API_URL | `https://api.yourdomain.com` |
| PRODUCTION_STOREFRONT_URL | `https://www.yourdomain.com` |
| PRODUCTION_DASHBOARD_URL | `https://dashboard.yourdomain.com` |

### 5.3 Verify OIDC Role

Ensure the GitHub Actions role was created correctly:

```bash
# Get role ARN from Terraform
terraform output github_actions_role_arn

# Verify trust policy
aws iam get-role \
  --role-name saleor-platform-staging-github-actions-deploy \
  --query 'Role.AssumeRolePolicyDocument'
```

---

## Phase 6: First Deployment

### 6.1 Trigger Staging Deployment

1. Push to `platform/main` branch OR
2. Go to **Actions** → **Deploy to Staging** → **Run workflow**

### 6.2 Monitor Deployment

1. Watch GitHub Actions progress
2. Check CloudWatch Logs:
   ```bash
   aws logs tail /ecs/saleor-platform-staging/api --follow
   ```
3. Check ECS service status:
   ```bash
   aws ecs describe-services \
     --cluster saleor-platform-staging \
     --services api worker storefront dashboard
   ```

### 6.3 Verify Deployment

```bash
# Check API health
curl https://api.staging.yourdomain.com/health/

# Check GraphQL
curl -X POST https://api.staging.yourdomain.com/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query": "{ channels { slug } }"}'

# Check storefront
curl https://www.staging.yourdomain.com/api/health
```

---

## Phase 7: Production Setup

Repeat Phases 2-6 with production configurations:

1. Update `infra/terraform/environments/production.tfvars`
2. Create separate backend.tf for production state
3. Run `terraform apply -var-file=environments/production.tfvars`
4. Create production SSM parameters
5. Verify GitHub production environment reviewers
6. Test production deployment workflow

---

## Verification Checklist

After setup is complete:

- [ ] Terraform state stored in S3
- [ ] Staging infrastructure created
- [ ] DNS records point to ALB
- [ ] ACM certificate validated
- [ ] SSM parameters created
- [ ] GitHub environments configured
- [ ] First staging deployment successful
- [ ] API health check passes
- [ ] Storefront loads
- [ ] Dashboard accessible

---

## Troubleshooting

### GitHub Actions Can't Assume Role

Check OIDC trust policy:
```bash
aws iam get-role --role-name saleor-platform-staging-github-actions-deploy
```

Verify the `sub` condition matches your repo/branch.

### ECS Tasks Failing to Start

Check CloudWatch logs and task stopped reason:
```bash
aws ecs describe-tasks \
  --cluster saleor-platform-staging \
  --tasks $(aws ecs list-tasks --cluster saleor-platform-staging --service-name api --query 'taskArns[0]' --output text)
```

### Database Connection Failed

1. Verify SSM parameter path is correct
2. Check security group allows ECS tasks to connect
3. Verify database and user exist

### ALB Not Routing

1. Check target group health
2. Verify listener rules
3. Check security group ingress rules

---

## Support

- Terraform documentation: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- ECS troubleshooting: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/troubleshooting.html
- GitHub OIDC: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
