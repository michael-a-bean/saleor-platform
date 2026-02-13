# Staging Environment Configuration
# Use: terraform plan -var-file=environments/staging.tfvars

environment = "staging"
aws_region  = "us-west-1"

# Domain (placeholder - not actively used when public_*_base_url overrides are set)
# This value is only used for host-based ALB routing when a certificate is configured.
# Since staging uses ALB DNS directly with path-based routing, this is effectively ignored.
domain_name = "staging.saleor-platform.internal"

# =============================================================================
# Public URL Configuration (TWO-PHASE DEPLOYMENT)
# =============================================================================
#
# IMPORTANT: Staging uses ALB DNS directly since custom domain DNS is not configured.
# This requires a two-phase deployment:
#
# PHASE 1 (First Deploy):
#   1. Run: terraform apply -var-file=environments/staging.tfvars
#   2. Note the ALB DNS from output: terraform output alb_dns_name
#   3. Services will start but may have connectivity issues until Phase 2
#
# PHASE 2 (Configure URLs):
#   1. Uncomment and set the public_*_base_url variables below with the ALB DNS
#   2. Update GitHub Actions variables (STAGING_API_URL, STAGING_STOREFRONT_URL)
#   3. Run: terraform apply -var-file=environments/staging.tfvars
#   4. Redeploy services to pick up correct URLs
#
# Once custom domain is configured with DNS and TLS:
#   - Set create_acm_certificate = true
#   - Set route53_zone_id to your hosted zone ID
#   - Remove the public_*_base_url overrides (will use domain_name)
#   - Set use_https_urls = true
#
use_https_urls = false

# Disable HTTPS upgrade in storefront CSP since ALB is HTTP-only
enable_https = false

# PHASE 2 ACTIVATED: ALB DNS URLs configured (2026-01-22 - VPC migration)
public_api_base_url        = "http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com"
public_storefront_base_url = "http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com"
public_dashboard_base_url  = "http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/dashboard"

# =============================================================================
# VPC
# =============================================================================
create_vpc         = true
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-west-1a", "us-west-1b"]

# Cost optimization: Interface VPC endpoints cost ~$29/mo but only save ~$1/mo
# in NAT data transfer for staging traffic levels. NAT gateway handles this.
create_interface_endpoints = false

# =============================================================================
# Database (right-sized for staging)
# =============================================================================
# Downgraded from db.t3.medium: 5.3% avg CPU, 0.55 avg connections, 55% memory free
db_instance_class        = "db.t3.small"
db_allocated_storage     = 100
db_multi_az              = false
db_backup_retention_days = 7
db_deletion_protection   = false

# Inventory DB on same instance for staging (per Gemini review)
create_separate_inventory_db = false

# =============================================================================
# Cache (already minimal)
# =============================================================================
redis_node_type = "cache.t3.micro"
redis_multi_az  = false

# Separate Celery cache not needed for staging
create_separate_celery_cache = false

# =============================================================================
# ECS (right-sized for staging based on utilization analysis 2026-02-12)
# =============================================================================
api_desired_count        = 1
api_cpu                  = 1024
api_memory               = 2048
worker_desired_count     = 1
worker_cpu               = 256  # Right-sized: 4.2 CPU units avg of 512 provisioned (0.8%)
worker_memory            = 1024
storefront_desired_count = 1
storefront_cpu           = 256
storefront_memory        = 512
dashboard_desired_count  = 0    # Scale to 0: 0% CPU, 3MB memory. Scale up when needed.

# Images (pin by digest in production, use tags in staging)
# Updated 2026-01-12: API 3.22.26, Dashboard 3.21.18
# Note: Dashboard 3.22.9+ uses AppExtension fields (mountName, targetName, settings)
#       that don't exist in API 3.22.x. Use Dashboard 3.21.x for compatibility.
saleor_api_image       = "ghcr.io/saleor/saleor:3.22.26"
saleor_dashboard_image = "ghcr.io/saleor/saleor-dashboard:3.21.18"

# Saleor Apps image tags
stripe_app_image_tag     = "document-polyfill-v1"
mtg_import_app_image_tag = "staging-latest"

# GitHub
github_org    = "michael-a-bean"
github_repo   = "saleor-platform"
github_branch = "platform/main"

# DNS (disabled for staging - using ALB defaults)
create_acm_certificate = false
route53_zone_id        = ""

# ECR
# MUTABLE allows CI/CD to overwrite tags like 'staging-latest' on each deploy
ecr_image_tag_mutability = "MUTABLE"

# Meilisearch (EFS-backed, Service Discovery via Terraform module)
meilisearch_enabled = true
# meilisearch_master_key = "" # Leave empty to auto-generate

# S3 Media Security (locked to CloudFront-only access 2026-01-27)
cloudfront_only_media_access = true

# =============================================================================
# Monitoring (right-sized for staging)
# =============================================================================
# Container Insights disabled: 308 custom metrics cost ~$9/mo with no active monitoring.
# Re-enable during debugging: set to true and apply.
enable_container_insights = false
log_retention_days        = 14
