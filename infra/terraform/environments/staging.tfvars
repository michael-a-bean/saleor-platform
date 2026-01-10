# Staging Environment Configuration
# Use: terraform plan -var-file=environments/staging.tfvars

environment = "staging"
aws_region  = "us-west-2"

# Domain (update this)
domain_name = "staging.example.com"

# VPC (create new for staging)
create_vpc         = true
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-west-2a", "us-west-2b"]

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
saleor_api_image       = "ghcr.io/saleor/saleor:3.22"
saleor_dashboard_image = "ghcr.io/saleor/saleor-dashboard:3.22.0"

# GitHub (update these)
github_org    = "YOUR_GITHUB_ORG"
github_repo   = "saleor-platform"
github_branch = "platform/main"

# DNS (optional - leave empty if managing DNS manually)
create_acm_certificate = true
route53_zone_id        = ""  # Set this if using Route53

# Monitoring
enable_container_insights = true
log_retention_days        = 14
