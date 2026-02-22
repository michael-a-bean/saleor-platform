# Staging Environment Configuration
# Use: terraform plan -var-file=environments/staging.tfvars

environment = "staging"
aws_region  = "us-west-1"

# Domain: staging subdomain of michaelbean.org
# ACM wildcard cert (*.staging.michaelbean.org) + Route53 records created by Terraform
# Host-based ALB routing: api.staging.michaelbean.org, staging.michaelbean.org, etc.
domain_name = "staging.michaelbean.org"

# =============================================================================
# HTTPS Configuration (2026-02-13)
# =============================================================================
# Custom domain with ACM certificate enables:
# - HTTPS ALB listener (port 443) with TLS 1.3
# - HTTP → HTTPS redirect on port 80
# - Host-based routing (api.staging.*, dashboard.staging.*, apps.staging.*)
# - Storefront CSP HTTPS upgrade
#
# This eliminates the HTTP/HTTPS parity gap between staging and production.
#
use_https_urls = true

# Enable HTTPS upgrade in storefront CSP
enable_https = true

# OpenTelemetry → Grafana Cloud
otel_exporter_endpoint = "https://otlp-gateway-prod-us-west-0.grafana.net/otlp"

# Public URL overrides removed — Terraform derives URLs from domain_name:
#   API:        https://api.staging.michaelbean.org
#   Storefront: https://staging.michaelbean.org
#   Dashboard:  https://dashboard.staging.michaelbean.org
#   Apps:       https://apps.staging.michaelbean.org/stripe, /inventory, etc.

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
worker_cpu               = 256 # Right-sized: 4.2 CPU units avg of 512 provisioned (0.8%)
worker_memory            = 1024
storefront_desired_count = 1
storefront_cpu           = 512  # Doubled: 0.25→0.5 vCPU for faster SSR
storefront_memory        = 1024 # Doubled: headroom for Next.js data cache
dashboard_desired_count  = 0    # Scale to 0: 0% CPU, 3MB memory. Scale up when needed.

# =============================================================================
# Scheduled Scaling (Off-Hours Cost Savings)
# =============================================================================
# All services scale to 0 at midnight and restore at 8 AM Pacific.
# This saves ~$3-5/day on staging Fargate costs.
# Services scale down at midnight PST, back up at 8 AM PST.
# Dashboard and mtg-import are already at desired_count=0, so they're excluded.
enable_scheduled_scaling = true
# scale_down_schedule      = "cron(0 0 * * ? *)"  # midnight PST (default)
# scale_up_schedule        = "cron(0 8 * * ? *)"  # 8 AM PST (default)
# scheduled_scaling_timezone = "America/Los_Angeles" # (default)

# Auto-scaling capacity limits (staging: minimal, 1 service instance each)
api_min_capacity          = 1  # Baseline min=1 prevents terraform apply from undoing 8 AM scheduled scale-up
api_max_capacity          = 2
worker_min_capacity       = 1
worker_max_capacity       = 2
storefront_min_capacity   = 1
storefront_max_capacity   = 2
beat_min_capacity         = 1
beat_max_capacity         = 1  # Never more than 1 beat scheduler
apps_scaling_min_capacity = 1  # Always-on apps stay running; batch jobs (desired_count=0) are excluded in Terraform
apps_scaling_max_capacity = 1  # 1 instance per app in staging

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

# DNS: Route53 hosted zone for michaelbean.org
create_acm_certificate = true
route53_zone_id        = "Z04460563Q0BF3J4587VW"

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
