# CloudFront Module Variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

# =============================================================================
# S3 Bucket Configuration
# =============================================================================

variable "s3_bucket_name" {
  description = "Name of the S3 bucket to serve"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  type        = string
}

variable "s3_bucket_regional_domain_name" {
  description = "Regional domain name of the S3 bucket (for CloudFront origin)"
  type        = string
}

# =============================================================================
# Cache Configuration
# =============================================================================

variable "default_ttl" {
  description = "Default TTL in seconds (default: 24 hours)"
  type        = number
  default     = 86400
}

variable "max_ttl" {
  description = "Maximum TTL in seconds (default: 7 days)"
  type        = number
  default     = 604800
}

# =============================================================================
# Distribution Configuration
# =============================================================================

variable "price_class" {
  description = "CloudFront price class (PriceClass_100 = US/Europe, PriceClass_200 = US/Europe/Asia, PriceClass_All = All)"
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be one of: PriceClass_100, PriceClass_200, PriceClass_All"
  }
}
