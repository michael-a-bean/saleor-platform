# S3 Module Variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "account_id" {
  description = "AWS account ID for bucket naming"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption (optional)"
  type        = string
  default     = null
}

variable "cors_allowed_origins" {
  description = "List of allowed origins for CORS"
  type        = list(string)
  default     = ["*"]
}
