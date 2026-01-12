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
