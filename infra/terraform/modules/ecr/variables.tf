# ECR Module Variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption (optional)"
  type        = string
  default     = null
}

variable "image_tag_mutability" {
  description = "Image tag mutability setting. Use MUTABLE for staging (allows overwriting tags like 'staging-latest'), IMMUTABLE for production."
  type        = string
  default     = "MUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.image_tag_mutability)
    error_message = "image_tag_mutability must be either MUTABLE or IMMUTABLE."
  }
}
