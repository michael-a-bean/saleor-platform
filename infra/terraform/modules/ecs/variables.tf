# ECS Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "domain_name" {
  description = "Domain name"
  type        = string
}

# Public URLs (supports overrides for staging without DNS)
variable "public_api_base_url" {
  description = "Public API base URL (e.g., https://api.example.com or http://alb-dns)"
  type        = string
}

variable "public_storefront_base_url" {
  description = "Public storefront base URL"
  type        = string
}

variable "public_dashboard_base_url" {
  description = "Public dashboard base URL"
  type        = string
}

variable "public_apps_base_url" {
  description = "Public apps base URL (e.g., https://apps.staging.michaelbean.org)"
  type        = string
}

# Network
variable "private_subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "ecs_backend_security_group_id" {
  description = "Security group ID for backend ECS tasks"
  type        = string
}

variable "ecs_frontend_security_group_id" {
  description = "Security group ID for frontend ECS tasks"
  type        = string
}


# IAM
variable "task_execution_role_arn" {
  description = "ARN of ECS task execution role"
  type        = string
}

variable "api_task_role_arn" {
  description = "ARN of API task role"
  type        = string
}

variable "worker_task_role_arn" {
  description = "ARN of Worker task role"
  type        = string
}

variable "storefront_task_role_arn" {
  description = "ARN of Storefront task role"
  type        = string
}

# Target Groups
variable "api_target_group_arn" {
  description = "ARN of API target group"
  type        = string
}

variable "storefront_target_group_arn" {
  description = "ARN of Storefront target group"
  type        = string
}

variable "dashboard_target_group_arn" {
  description = "ARN of Dashboard target group"
  type        = string
}

# Images
variable "saleor_api_image" {
  description = "Saleor API image"
  type        = string
}

variable "saleor_dashboard_image" {
  description = "Saleor Dashboard image"
  type        = string
}

variable "storefront_image" {
  description = "Storefront image"
  type        = string
}

# Configuration
variable "ssm_path_prefix" {
  description = "SSM parameter path prefix"
  type        = string
}

variable "media_bucket_name" {
  description = "S3 media bucket name"
  type        = string
}

variable "allowed_hosts" {
  description = "Allowed hosts for API"
  type        = string
}

variable "meilisearch_url" {
  description = "Meilisearch URL"
  type        = string
}

variable "meilisearch_api_key_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the Meilisearch API key"
  type        = string
  default     = ""
}

variable "media_cdn_url" {
  description = "CDN URL for media assets (CloudFront domain). When set, Saleor uses this for media URLs."
  type        = string
  default     = ""
}

# Scaling
variable "api_desired_count" {
  description = "Desired count for API service"
  type        = number
  default     = 2
}

variable "api_cpu" {
  description = "CPU for API task"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memory for API task"
  type        = number
  default     = 1024
}

variable "worker_desired_count" {
  description = "Desired count for Worker service"
  type        = number
  default     = 1
}

variable "worker_cpu" {
  description = "CPU for Worker task"
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Memory for Worker task"
  type        = number
  default     = 1024
}

variable "storefront_desired_count" {
  description = "Desired count for Storefront service"
  type        = number
  default     = 2
}

variable "storefront_cpu" {
  description = "CPU for Storefront task"
  type        = number
  default     = 256
}

variable "storefront_memory" {
  description = "Memory for Storefront task"
  type        = number
  default     = 512
}

# Monitoring
variable "enable_container_insights" {
  description = "Enable Container Insights"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Log retention in days"
  type        = number
  default     = 30
}

# =============================================================================
# Saleor Apps Configuration
# =============================================================================

variable "apps_task_role_arn" {
  description = "ARN of apps task role"
  type        = string
  default     = ""
}

variable "apps_enabled" {
  description = "Enable Saleor apps deployment"
  type        = bool
  default     = true
}

variable "apps" {
  description = "Map of Saleor apps to deploy"
  type = map(object({
    port             = number
    cpu              = number
    memory           = number
    base_path        = string
    image            = string
    target_group_arn = string
    desired_count    = optional(number)
    environment      = optional(map(string), {})
    secrets = optional(list(object({
      name      = string
      valueFrom = string
    })), [])
  }))
  default = {}
}

variable "apps_desired_count" {
  description = "Default desired count for app services (overridden by per-app desired_count)"
  type        = number
  default     = 1
}

variable "dashboard_desired_count" {
  description = "Desired count for dashboard service. Set to 0 to stop and save costs."
  type        = number
  default     = 1
}

# =============================================================================
# Auto-Scaling Configuration
# =============================================================================

variable "enable_autoscaling" {
  description = "Enable auto-scaling for ECS services"
  type        = bool
  default     = false
}

variable "api_min_capacity" {
  description = "Minimum number of API tasks"
  type        = number
  default     = 2
}

variable "api_max_capacity" {
  description = "Maximum number of API tasks"
  type        = number
  default     = 10
}

variable "storefront_min_capacity" {
  description = "Minimum number of Storefront tasks"
  type        = number
  default     = 2
}

variable "storefront_max_capacity" {
  description = "Maximum number of Storefront tasks"
  type        = number
  default     = 10
}

variable "worker_min_capacity" {
  description = "Minimum number of worker tasks"
  type        = number
  default     = 0
}

variable "worker_max_capacity" {
  description = "Maximum number of worker tasks"
  type        = number
  default     = 2
}

variable "beat_max_capacity" {
  description = "Maximum number of beat tasks (should be 1 to prevent duplicate scheduling)"
  type        = number
  default     = 1
}

variable "apps_scaling_max_capacity" {
  description = "Maximum number of tasks per app service for auto-scaling"
  type        = number
  default     = 1
}

# =============================================================================
# Scheduled Scaling (Off-Hours Cost Savings)
# =============================================================================

variable "enable_scheduled_scaling" {
  description = "Enable scheduled scale-down during off-hours to save costs"
  type        = bool
  default     = false
}

variable "scale_down_schedule" {
  description = "Cron expression for scale-down (default: midnight)"
  type        = string
  default     = "cron(0 0 * * ? *)"
}

variable "scale_up_schedule" {
  description = "Cron expression for scale-up (default: 8 AM)"
  type        = string
  default     = "cron(0 8 * * ? *)"
}

variable "scheduled_scaling_timezone" {
  description = "IANA timezone for scheduled scaling actions"
  type        = string
  default     = "America/Los_Angeles"
}

variable "enable_https" {
  description = "Enable HTTPS upgrade in storefront CSP. Set to false for HTTP-only environments like staging without SSL."
  type        = bool
  default     = true
}

# =============================================================================
# OpenTelemetry Configuration
# =============================================================================

variable "otel_exporter_endpoint" {
  description = "OTLP exporter endpoint (e.g., https://otlp-gateway-prod-us-east-0.grafana.net/otlp). Empty string disables OTEL."
  type        = string
  default     = ""
}
