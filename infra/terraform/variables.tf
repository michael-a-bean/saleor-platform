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
# Image Configuration
# =============================================================================

# Pin upstream images by digest for immutability (GPT-5.2 recommendation)
variable "saleor_api_image" {
  description = "Saleor API image with digest (e.g., ghcr.io/saleor/saleor@sha256:...)"
  type        = string
  default     = "ghcr.io/saleor/saleor:3.22"
}

variable "saleor_dashboard_image" {
  description = "Saleor Dashboard image with digest"
  type        = string
  default     = "ghcr.io/saleor/saleor-dashboard:3.22.0"
}

variable "meilisearch_image" {
  description = "Meilisearch image"
  type        = string
  default     = "getmeili/meilisearch:v1.6"
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
