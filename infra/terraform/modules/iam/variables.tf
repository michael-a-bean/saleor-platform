# IAM Module Variables

variable "project_name" {
  description = "Project name for resource naming"
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

variable "github_org" {
  description = "GitHub organization name"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch allowed to deploy"
  type        = string
  default     = "platform/main"
}

variable "create_oidc_provider" {
  description = "Whether to create the GitHub OIDC provider (set to false if already exists)"
  type        = bool
  default     = true
}

variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
}

variable "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  type        = string
}

variable "media_bucket_arn" {
  description = "ARN of the S3 media bucket"
  type        = string
}

variable "enable_ses" {
  description = "Enable SES permissions for email sending"
  type        = bool
  default     = true
}
