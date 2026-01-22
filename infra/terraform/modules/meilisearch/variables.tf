# Meilisearch Module Variables

# =============================================================================
# Required Variables
# =============================================================================

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where resources will be created"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for EFS mount targets and ECS tasks"
  type        = list(string)
}

variable "cluster_id" {
  description = "ECS cluster ID"
  type        = string
}

variable "execution_role_arn" {
  description = "ECS task execution role ARN"
  type        = string
}

variable "task_role_arn" {
  description = "ECS task role ARN (needs EFS permissions)"
  type        = string
}

variable "backend_security_group_id" {
  description = "Backend security group ID (allows port 7700)"
  type        = string
}

variable "service_discovery_namespace_id" {
  description = "Service Discovery private DNS namespace ID"
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch log group name for Meilisearch logs"
  type        = string
}

# =============================================================================
# Optional Variables with Defaults
# =============================================================================

variable "master_key_secret_arn" {
  description = "Secrets Manager ARN for MEILI_MASTER_KEY. Empty string disables authentication."
  type        = string
  default     = ""
}

variable "meilisearch_image" {
  description = "Meilisearch Docker image"
  type        = string
  default     = "getmeili/meilisearch:v1.6"
}

variable "cpu" {
  description = "Task CPU units (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512

  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.cpu)
    error_message = "CPU must be one of: 256, 512, 1024, 2048, 4096."
  }
}

variable "memory" {
  description = "Task memory in MB. Must be compatible with CPU setting."
  type        = number
  default     = 1024

  validation {
    condition     = var.memory >= 512 && var.memory <= 30720
    error_message = "Memory must be between 512 and 30720 MB."
  }
}
