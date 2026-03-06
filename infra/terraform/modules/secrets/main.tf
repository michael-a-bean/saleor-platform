# Secrets Module
# Creates and manages SSM parameters required by ECS task definitions.
# Enables full teardown+standup via Terraform without manual bootstrapping.
#
# Categories:
# - Auto-generated: SECRET_KEY, RSA_PRIVATE_KEY (random_password / tls_private_key)
# - Computed: DATABASE_URL, CELERY_BROKER_URL (from module outputs)
# - User-provided: Stripe keys (placeholder default, ignore_changes on value)

locals {
  name_prefix     = "${var.project_name}-${var.environment}"
  ssm_path_prefix = "/saleor/${var.environment}"
}

# =============================================================================
# Auto-Generated Secrets
# =============================================================================

resource "random_password" "api_secret_key" {
  length  = 64
  special = false
}

resource "random_password" "apps_secret_key" {
  length  = 64
  special = false
}

resource "tls_private_key" "api_rsa" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

# =============================================================================
# SSM Parameters - API Secrets
# =============================================================================

resource "aws_ssm_parameter" "api_secret_key" {
  name        = "${local.ssm_path_prefix}/api/SECRET_KEY"
  type        = "SecureString"
  value       = random_password.api_secret_key.result
  description = "Django SECRET_KEY for Saleor API"

  tags = {
    Name        = "${local.name_prefix}-api-secret-key"
    Service     = "api"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "api_database_url" {
  name        = "${local.ssm_path_prefix}/api/DATABASE_URL"
  type        = "SecureString"
  value       = "postgresql://${var.rds_username}:${var.rds_password}@${var.rds_endpoint}/saleor"
  description = "PostgreSQL connection URL for Saleor API"

  tags = {
    Name        = "${local.name_prefix}-api-database-url"
    Service     = "api"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "api_celery_broker_url" {
  name        = "${local.ssm_path_prefix}/api/CELERY_BROKER_URL"
  type        = "SecureString"
  value       = var.celery_broker_url
  description = "Redis URL for Celery broker"

  tags = {
    Name        = "${local.name_prefix}-api-celery-broker-url"
    Service     = "api"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "api_rsa_private_key" {
  name        = "${local.ssm_path_prefix}/api/RSA_PRIVATE_KEY"
  type        = "SecureString"
  value       = tls_private_key.api_rsa.private_key_pem
  description = "RSA private key for JWT signing (required when DEBUG=False)"

  tags = {
    Name        = "${local.name_prefix}-api-rsa-private-key"
    Service     = "api"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}

# =============================================================================
# SSM Parameters - App Secrets
# =============================================================================

resource "aws_ssm_parameter" "apps_secret_key" {
  name        = "${local.ssm_path_prefix}/apps/SECRET_KEY"
  type        = "SecureString"
  value       = random_password.apps_secret_key.result
  description = "Shared secret key for all Saleor apps (JWT signing, encryption)"

  tags = {
    Name        = "${local.name_prefix}-apps-secret-key"
    Service     = "apps"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "stripe_secret_key" {
  name        = "${local.ssm_path_prefix}/apps/stripe/STRIPE_SECRET_KEY"
  type        = "SecureString"
  value       = var.stripe_secret_key
  description = "Stripe API secret key"

  tags = {
    Name        = "${local.name_prefix}-stripe-secret-key"
    Service     = "stripe-app"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "stripe_webhook_secret" {
  name        = "${local.ssm_path_prefix}/apps/stripe/STRIPE_WEBHOOK_SECRET"
  type        = "SecureString"
  value       = var.stripe_webhook_secret
  description = "Stripe webhook signing secret"

  tags = {
    Name        = "${local.name_prefix}-stripe-webhook-secret"
    Service     = "stripe-app"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "otel_headers" {
  name        = "${local.ssm_path_prefix}/api/OTEL_EXPORTER_OTLP_HEADERS"
  type        = "SecureString"
  value       = var.otel_exporter_otlp_headers
  description = "OpenTelemetry OTLP exporter authorization header (Grafana Cloud)"

  tags = {
    Name        = "${local.name_prefix}-otel-headers"
    Service     = "api"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "inventory_database_url" {
  name        = "${local.ssm_path_prefix}/apps/inventory-ops/DATABASE_URL"
  type        = "SecureString"
  value       = "postgresql://${var.rds_username}:${var.rds_password}@${var.rds_endpoint}/inventory_ops"
  description = "PostgreSQL connection URL for inventory apps (inventory-ops, buylist, pos, mtg-import)"

  tags = {
    Name        = "${local.name_prefix}-inventory-database-url"
    Service     = "inventory-ops"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "inventory_cron_secret" {
  name        = "${local.ssm_path_prefix}/apps/inventory-ops/CRON_SECRET"
  type        = "SecureString"
  value       = "placeholder-replaced-after-import"
  description = "Bearer token for authenticating cron endpoint calls to inventory-ops"

  tags = {
    Name        = "${local.name_prefix}-inventory-cron-secret"
    Service     = "inventory-ops"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [value]
  }
}


