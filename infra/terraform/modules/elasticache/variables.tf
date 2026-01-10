# ElastiCache Module Variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ElastiCache"
  type        = list(string)
}

variable "ecs_backend_security_group_id" {
  description = "Security group ID of backend ECS tasks"
  type        = string
}

variable "node_type" {
  description = "ElastiCache node type for cache"
  type        = string
  default     = "cache.t3.micro"
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "transit_encryption_enabled" {
  description = "Enable transit encryption (TLS)"
  type        = bool
  default     = false
}

variable "auth_token" {
  description = "Auth token for Redis (required if transit encryption is enabled)"
  type        = string
  sensitive   = true
  default     = ""
}

# Separate Celery broker cache
variable "create_separate_celery_cache" {
  description = "Create a separate cache cluster for Celery broker"
  type        = bool
  default     = false
}

variable "broker_node_type" {
  description = "Node type for Celery broker cache"
  type        = string
  default     = "cache.t3.micro"
}

variable "broker_auth_token" {
  description = "Auth token for broker Redis"
  type        = string
  sensitive   = true
  default     = ""
}
