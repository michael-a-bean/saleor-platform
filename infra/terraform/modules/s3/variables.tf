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

# =============================================================================
# CloudFront Integration
# =============================================================================

variable "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN for bucket policy (when CloudFront is enabled)"
  type        = string
  default     = ""
}

variable "enable_cloudfront_only_access" {
  description = "When true, removes public access and only allows CloudFront OAC access"
  type        = bool
  default     = false
}

variable "force_destroy" {
  description = "Allow Terraform to destroy the bucket even when it contains objects. Use for staging only."
  type        = bool
  default     = false
}
