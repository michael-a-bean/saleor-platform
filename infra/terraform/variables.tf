# Root Module Input Variables
# All variables should have sensible defaults or be environment-specific

# =============================================================================
# Core Configuration
# =============================================================================

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "saleor-platform"
}

# =============================================================================
# Network Configuration
# =============================================================================

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to use"
  type        = list(string)
  default     = ["us-west-2a", "us-west-2b"]
}

variable "create_vpc" {
  description = "Whether to create a new VPC or use an existing one"
  type        = bool
  default     = true
}

variable "existing_vpc_id" {
  description = "ID of existing VPC to use (if create_vpc is false)"
  type        = string
  default     = ""
}

variable "existing_public_subnet_ids" {
  description = "IDs of existing public subnets (if create_vpc is false)"
  type        = list(string)
  default     = []
}

variable "existing_private_subnet_ids" {
  description = "IDs of existing private subnets (if create_vpc is false)"
  type        = list(string)
  default     = []
}

# =============================================================================
# DNS and TLS
# =============================================================================

variable "domain_name" {
  description = "Root domain name for the platform (e.g., example.com)"
  type        = string
}

variable "create_acm_certificate" {
  description = "Whether to create ACM certificate (requires Route53 hosted zone)"
  type        = bool
  default     = true
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for DNS validation (if create_acm_certificate is true)"
  type        = string
  default     = ""
}

# =============================================================================
# Public URL Configuration
# =============================================================================
# These variables allow overriding the auto-generated URLs based on domain_name.
# Useful for staging environments where DNS is not configured yet.
# When empty, URLs are generated from domain_name.
# When set, these values are used directly.

variable "public_api_base_url" {
  description = "Override for public API base URL (e.g., http://alb-dns-name). When empty, uses https://api.{domain_name}"
  type        = string
  default     = ""
}

variable "public_storefront_base_url" {
  description = "Override for public storefront base URL. When empty, uses https://www.{domain_name}"
  type        = string
  default     = ""
}

variable "public_dashboard_base_url" {
  description = "Override for public dashboard base URL. When empty, uses https://dashboard.{domain_name}"
  type        = string
  default     = ""
}

variable "use_https_urls" {
  description = "Whether to use HTTPS in generated URLs (set false for staging without TLS)"
  type        = bool
  default     = true
}

# =============================================================================
# Database Configuration
# =============================================================================

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 100
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = false
}

# Separate inventory DB for production (recommended by Gemini review)
variable "create_separate_inventory_db" {
  description = "Create a separate RDS instance for inventory_ops database (recommended for production)"
  type        = bool
  default     = false
}

# =============================================================================
# Cache Configuration
# =============================================================================

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_multi_az" {
  description = "Enable Multi-AZ for Redis"
  type        = bool
  default     = false
}

# Separate cache for Celery broker (recommended by Gemini review)
variable "create_separate_celery_cache" {
  description = "Create a separate ElastiCache cluster for Celery broker (prevents eviction issues)"
  type        = bool
  default     = false
}

# =============================================================================
# ECS Configuration
# =============================================================================

variable "api_desired_count" {
  description = "Desired count for API service"
  type        = number
  default     = 2
}

variable "api_cpu" {
  description = "CPU units for API task (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memory for API task in MB"
  type        = number
  default     = 1024
}

variable "worker_desired_count" {
  description = "Desired count for worker service"
  type        = number
  default     = 1
}

variable "worker_cpu" {
  description = "CPU units for worker task"
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Memory for worker task in MB"
  type        = number
  default     = 1024
}

variable "storefront_desired_count" {
  description = "Desired count for storefront service"
  type        = number
  default     = 2
}

variable "storefront_cpu" {
  description = "CPU units for storefront task"
  type        = number
  default     = 256
}

variable "storefront_memory" {
  description = "Memory for storefront task in MB"
  type        = number
  default     = 512
}

# =============================================================================
# ECR Configuration
# =============================================================================

variable "ecr_image_tag_mutability" {
  description = "ECR image tag mutability. MUTABLE allows overwriting tags like 'staging-latest', IMMUTABLE prevents overwrites (recommended for production)."
  type        = string
  default     = "MUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.ecr_image_tag_mutability)
    error_message = "ecr_image_tag_mutability must be either MUTABLE or IMMUTABLE."
  }
}

# =============================================================================
# Image Configuration
# =============================================================================

# Pin upstream images by digest for immutability (GPT-5.2 recommendation)
variable "saleor_api_image" {
  description = "Saleor API image with digest (e.g., ghcr.io/saleor/saleor@sha256:...)"
  type        = string
  default     = "ghcr.io/saleor/saleor:3.22"
}

variable "saleor_dashboard_image" {
  description = "Saleor Dashboard image (3.22.24 is latest patch for 3.22 series)"
  type        = string
  default     = "ghcr.io/saleor/saleor-dashboard:3.22.24"
}

variable "meilisearch_image" {
  description = "Meilisearch image"
  type        = string
  default     = "getmeili/meilisearch:v1.6"
}

variable "storefront_image_tag" {
  description = "Storefront image tag (e.g., sha-abc1234 or v1.0.0)"
  type        = string
  default     = "sha-3f84f6b"
}

# =============================================================================
# Saleor Apps Image Configuration
# =============================================================================

variable "apps_enabled" {
  description = "Enable Saleor apps deployment"
  type        = bool
  default     = true
}

variable "apps_desired_count" {
  description = "Desired count for each app service"
  type        = number
  default     = 1
}

variable "stripe_app_image_tag" {
  description = "Stripe app image tag"
  type        = string
  default     = "staging-latest"
}

variable "inventory_ops_app_image_tag" {
  description = "Inventory ops app image tag"
  type        = string
  default     = "staging-latest"
}

variable "buylist_app_image_tag" {
  description = "Buylist app image tag"
  type        = string
  default     = "staging-latest"
}

variable "pos_app_image_tag" {
  description = "POS app image tag"
  type        = string
  default     = "staging-latest"
}

variable "mtg_import_app_image_tag" {
  description = "MTG Import app image tag"
  type        = string
  default     = "staging-latest"
}

# =============================================================================
# Monitoring and Logging
# =============================================================================

variable "enable_container_insights" {
  description = "Enable CloudWatch Container Insights"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "enable_https" {
  description = "Enable HTTPS upgrade in storefront CSP. Set to false for HTTP-only environments."
  type        = bool
  default     = true
}

# =============================================================================
# GitHub Actions OIDC
# =============================================================================

variable "github_org" {
  description = "GitHub organization name"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "saleor-platform"
}

variable "github_branch" {
  description = "GitHub branch allowed to deploy (for OIDC trust policy)"
  type        = string
  default     = "platform/main"
}

# =============================================================================
# Meilisearch Configuration
# =============================================================================

variable "meilisearch_enabled" {
  description = "Enable Meilisearch deployment via Terraform (EFS-backed, Service Discovery)"
  type        = bool
  default     = true
}

variable "meilisearch_master_key" {
  description = "Meilisearch master key for API authentication. If empty, a random key will be generated."
  type        = string
  default     = ""
  sensitive   = true
}

# =============================================================================
# Monitoring & Alerting
# =============================================================================

variable "alert_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms. If empty, alarms will be created without actions."
  type        = string
  default     = ""
}

# =============================================================================
# CloudFront CDN Configuration
# =============================================================================

variable "enable_cloudfront" {
  description = "Enable CloudFront CDN for media bucket (recommended for staging/production)"
  type        = bool
  default     = true
}

variable "cloudfront_price_class" {
  description = "CloudFront price class (PriceClass_100 = US/Europe, PriceClass_200 = adds Asia/Australia, PriceClass_All = global)"
  type        = string
  default     = "PriceClass_100"
}

variable "cloudfront_only_media_access" {
  description = "When true, removes direct S3 public access for media - all requests must go through CloudFront"
  type        = bool
  default     = false
}

# =============================================================================
# Drift Prevention & Compliance
# =============================================================================

variable "enable_config_rules" {
  description = "Enable AWS Config rules for drift prevention and compliance monitoring"
  type        = bool
  default     = true
}
