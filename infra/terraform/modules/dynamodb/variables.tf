# DynamoDB Module Variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "create_stripe_table" {
  description = "Whether to create the Stripe app DynamoDB table"
  type        = bool
  default     = true
}

variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for DynamoDB tables"
  type        = bool
  default     = false
}

variable "enable_ttl" {
  description = "Enable TTL for automatic record expiration"
  type        = bool
  default     = false
}
