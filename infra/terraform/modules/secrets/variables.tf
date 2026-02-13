# Secrets Module Variables

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

# =============================================================================
# Computed Values (from other modules)
# =============================================================================

variable "rds_endpoint" {
  description = "RDS instance endpoint (host:port)"
  type        = string
}

variable "rds_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "rds_username" {
  description = "RDS master username"
  type        = string
  default     = "saleor"
}

variable "celery_broker_url" {
  description = "Redis URL for Celery broker (from elasticache module)"
  type        = string
}

# =============================================================================
# User-Provided Secrets (with placeholder defaults)
# =============================================================================

variable "stripe_secret_key" {
  description = "Stripe API secret key. Update via CLI after initial deploy."
  type        = string
  default     = "sk_test_PLACEHOLDER_UPDATE_ME"
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret. Update via CLI after initial deploy."
  type        = string
  default     = "whsec_PLACEHOLDER_UPDATE_ME"
  sensitive   = true
}
