# Production Environment Configuration
# Use: terraform plan -var-file=environments/production.tfvars

environment = "production"
aws_region  = "us-west-2"

# Domain (update this)
domain_name = "example.com"

# VPC (create new or use existing)
create_vpc         = true
vpc_cidr           = "10.1.0.0/16"  # Different CIDR from staging
availability_zones = ["us-west-2a", "us-west-2b"]

# Database (production sizing)
db_instance_class        = "db.r6g.large"
db_allocated_storage     = 200
db_multi_az              = true
db_backup_retention_days = 35
db_deletion_protection   = true

# Separate inventory DB for production (per Gemini review)
create_separate_inventory_db = true

# Cache (production sizing)
redis_node_type = "cache.r6g.large"
redis_multi_az  = true

# Separate Celery cache for production (per Gemini review to prevent eviction)
create_separate_celery_cache = true

# ECS (production scaling)
api_desired_count        = 3
api_cpu                  = 1024
api_memory               = 2048
worker_desired_count     = 2
worker_cpu               = 1024
worker_memory            = 2048
storefront_desired_count = 3
storefront_cpu           = 512
storefront_memory        = 1024

# Images - PIN BY DIGEST for production (GPT-5.2 recommendation)
# Get digest: docker pull ghcr.io/saleor/saleor:3.22 && docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/saleor/saleor:3.22
saleor_api_image       = "ghcr.io/saleor/saleor:3.22"  # Replace with @sha256:... in production
saleor_dashboard_image = "ghcr.io/saleor/saleor-dashboard:3.22.0"  # Replace with @sha256:...

# GitHub (update these)
github_org    = "YOUR_GITHUB_ORG"
github_repo   = "saleor-platform"
github_branch = "platform/main"

# DNS
create_acm_certificate = true
route53_zone_id        = ""  # Set this if using Route53

# Monitoring
enable_container_insights = true
log_retention_days        = 90
