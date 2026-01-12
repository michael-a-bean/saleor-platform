# Staging Environment Configuration
# Use: terraform plan -var-file=environments/staging.tfvars

environment = "staging"
aws_region  = "us-west-1"

# Domain (placeholder - custom domain not yet configured)
domain_name = "staging.shuffleandcut.com"

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

# PHASE 2 ACTIVATED: ALB DNS URLs configured (2026-01-11)
public_api_base_url        = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
public_storefront_base_url = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
public_dashboard_base_url  = "http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard"

# VPC (create new for staging)
create_vpc         = true
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-west-1a", "us-west-1b"]

# Database (smaller for staging)
db_instance_class        = "db.t3.medium"
db_allocated_storage     = 100
db_multi_az              = false
db_backup_retention_days = 7
db_deletion_protection   = false

# Inventory DB on same instance for staging (per Gemini review)
create_separate_inventory_db = false

# Cache (smaller for staging)
redis_node_type = "cache.t3.micro"
redis_multi_az  = false

# Separate Celery cache not needed for staging
create_separate_celery_cache = false

# ECS (minimal for staging)
api_desired_count        = 1
api_cpu                  = 512
api_memory               = 1024
worker_desired_count     = 1
worker_cpu               = 512
worker_memory            = 1024
storefront_desired_count = 1
storefront_cpu           = 256
storefront_memory        = 512

# Images (pin by digest in production, use tags in staging)
# Updated 2026-01-12: Aligned to 3.22.x (API 3.22, Dashboard 3.22.24)
saleor_api_image       = "ghcr.io/saleor/saleor:3.22"
saleor_dashboard_image = "ghcr.io/saleor/saleor-dashboard:3.22.24"

# GitHub
github_org    = "michael-a-bean"
github_repo   = "saleor-platform"
github_branch = "platform/main"

# DNS (disabled for staging - using ALB defaults)
create_acm_certificate = false
route53_zone_id        = ""

# Monitoring
enable_container_insights = true
log_retention_days        = 14
