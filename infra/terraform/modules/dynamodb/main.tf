# DynamoDB Module
# Creates DynamoDB tables for Saleor Apps

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# =============================================================================
# Stripe App Table
# =============================================================================
# Schema: PK (String) / SK (String) as required by @saleor/app-sdk DynamoAPL
# Stores: APL auth data, Stripe configuration, channel mappings

resource "aws_dynamodb_table" "stripe_app" {
  count = var.create_stripe_table ? 1 : 0

  name         = "${local.name_prefix}-stripe-app"
  billing_mode = "PAY_PER_REQUEST" # On-demand for cost efficiency

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # Point-in-time recovery for data protection
  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  # Server-side encryption with AWS managed key
  server_side_encryption {
    enabled = true
  }

  # TTL for automatic cleanup of old records (optional)
  ttl {
    attribute_name = "ttl"
    enabled        = var.enable_ttl
  }

  tags = {
    Name        = "${local.name_prefix}-stripe-app"
    Service     = "stripe-app"
    Environment = var.environment
  }

  lifecycle {
    prevent_destroy = false # Allow destruction in staging
  }
}
