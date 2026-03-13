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

# fck-nat: EC2-based NAT instance (~$7/mo) replaces managed NAT Gateway (~$42/mo).
# t4g.nano ARM64 with HA mode (ASG auto-recovery, ~5 min failover). Acceptable for staging.
# Rollback: set use_fck_nat = false and apply to recreate managed NAT Gateway.
use_fck_nat = true

# =============================================================================
# Database (right-sized for staging)
# =============================================================================
# Upgraded from db.t3.small: 2 GB RAM insufficient for 100k product catalog (2-3 GB).
# t3.medium (4 GB) keeps full working set in memory, benefits all services.
db_instance_class        = "db.t3.medium"
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
# Fargate Spot: ~60% cheaper than on-demand. Interruption risk acceptable for staging.
use_fargate_spot = true

api_desired_count        = 1
api_cpu                  = 1024
api_memory               = 2048
worker_desired_count     = 1
worker_cpu               = 256  # Right-sized: 4.2 CPU units avg of 512 provisioned (0.8%)
worker_memory            = 2048 # Upgraded: 91% peak memory risked OOM
storefront_desired_count = 1
storefront_cpu           = 256 # Right-sized: 8% avg CPU, 26% peak mem
storefront_memory        = 512
dashboard_desired_count  = 1 # Dashboard should be running during business hours
dashboard_min_capacity   = 1 # Baseline min=1 so terraform apply doesn't undo scheduled scale-up
dashboard_max_capacity   = 2

# =============================================================================
# Scheduled Scaling (Off-Hours Cost Savings)
# =============================================================================
# All services scale to 0 at midnight and restore at 8 AM Pacific.
# This saves ~$3-5/day on staging Fargate costs.
# Services scale down at midnight PST, back up at 8 AM PST.
# All core services participate in scheduled scaling.
enable_scheduled_scaling = true
# scale_down_schedule      = "cron(0 0 * * ? *)"  # midnight PST (default)
# scale_up_schedule        = "cron(0 8 * * ? *)"  # 8 AM PST (default)
# scheduled_scaling_timezone = "America/Los_Angeles" # (default)

# Auto-scaling capacity limits (staging: minimal, 1 service instance each)
api_min_capacity          = 1 # Baseline min=1 prevents terraform apply from undoing 8 AM scheduled scale-up
api_max_capacity          = 2
worker_min_capacity       = 1
worker_max_capacity       = 2
storefront_min_capacity   = 1
storefront_max_capacity   = 2
beat_min_capacity         = 1
beat_max_capacity         = 1 # Never more than 1 beat scheduler
apps_scaling_min_capacity = 1 # Always-on apps stay running; batch jobs (desired_count=0) are excluded in Terraform
apps_scaling_max_capacity = 1 # 1 instance per app in staging

# Images (pin by digest in production, use tags in staging)
# Updated 2026-03-03: API 3.22.39, Dashboard 3.22.34
saleor_api_image       = "ghcr.io/saleor/saleor:3.22.39"
saleor_dashboard_image = "ghcr.io/saleor/saleor-dashboard:3.22.34"

# Saleor Apps image tags
stripe_app_image_tag = "document-polyfill-v1"

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

# Meilisearch channel configs: warehouseIds scopes stock per-location
# Retail + Brea warehouses for Shuffle & Cut, Franks warehouse for Frank & Sons
meilisearch_channels = "[{\"slug\":\"webstore\",\"warehouseIds\":null},{\"slug\":\"singles-builder\",\"warehouseIds\":[\"V2FyZWhvdXNlOjVkM2VjOTMyLWE5MTItNGY1Yy04ZDVlLTFkZTE4NGMzZGI3NQ==\",\"V2FyZWhvdXNlOmU5NmEzN2EzLWMzM2YtNDNiZS1hMjdjLTk0ZDkxYWQ2YjI1Nw==\"]},{\"slug\":\"frank-and-sons\",\"warehouseIds\":[\"V2FyZWhvdXNlOmExMGE1ZTFhLTZhZjEtNGRjMS05NTNkLTNlYWJiM2U2OTM4Zg==\"]}]"

# S3 Media Security (locked to CloudFront-only access 2026-01-27)
cloudfront_only_media_access = true

# Storefront CDN: CloudFront in front of ALB for edge caching
# Caches /_next/static/*, /images/*, /_next/image* at edge
# Dynamic pages respect origin Cache-Control (s-maxage=60)
enable_storefront_cdn = true

# =============================================================================
# Monitoring & Alerting (right-sized for staging)
# =============================================================================
# Container Insights: required for ECS service health alarms (RunningTaskCount).
# Cost: ~$9/mo for 308 custom metrics.
enable_container_insights = true
log_retention_days        = 14

# Alerting: email for CloudWatch alarm notifications
alert_email = "michael@michaelbean.org"

# Grafana Cloud CloudWatch integration
# Values from Grafana Cloud → Connections → CloudWatch → "Grafana Assume Role" settings.
grafana_aws_account_id = "008923505280"
grafana_external_id    = "1533536"

# Grafana Cloud dashboard provisioning
grafana_url = "https://michaelbean.grafana.net/"
# grafana_api_token: pass via TF_VAR_grafana_api_token (never commit tokens)

# Grafana Faro RUM (Frontend Observability)
# To get the URL: Grafana Cloud → Frontend → Applications → New Application → "storefront"
# Format: https://faro-collector-prod-us-west-0.grafana.net/collect/<app-key>
grafana_faro_url = "https://faro-collector-prod-us-west-0.grafana.net/collect/5fdc8fffb376243bea13f2ad1287e2bc"

# Grafana Cloud OTEL data sources (pre-existing, managed by Grafana Cloud)
tempo_datasource_uid      = "grafanacloud-traces"
prometheus_datasource_uid = "grafanacloud-prom"
