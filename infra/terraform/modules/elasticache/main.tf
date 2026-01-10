# ElastiCache Module
# Creates Redis clusters for cache and Celery broker
# Implements separate clusters per Gemini review to prevent eviction issues

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# =============================================================================
# Security Group
# =============================================================================

resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from backend ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.ecs_backend_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-redis-sg"
  }
}

# =============================================================================
# Subnet Group
# =============================================================================

resource "aws_elasticache_subnet_group" "main" {
  name        = "${local.name_prefix}-redis"
  description = "Redis subnet group for ${local.name_prefix}"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}

# =============================================================================
# Parameter Group for Cache (LRU eviction)
# =============================================================================

resource "aws_elasticache_parameter_group" "cache" {
  name        = "${local.name_prefix}-cache"
  family      = "redis7"
  description = "Redis parameters for application cache"

  # LRU eviction for cache - safe to evict entries
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = {
    Name = "${local.name_prefix}-cache"
  }
}

# =============================================================================
# Parameter Group for Broker (no eviction - per Gemini review)
# =============================================================================

resource "aws_elasticache_parameter_group" "broker" {
  count = var.create_separate_celery_cache ? 1 : 0

  name        = "${local.name_prefix}-broker"
  family      = "redis7"
  description = "Redis parameters for Celery broker"

  # NO eviction for broker - prevent losing queue items
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }

  tags = {
    Name = "${local.name_prefix}-broker"
  }
}

# =============================================================================
# Main Cache Cluster (for application cache)
# =============================================================================

resource "aws_elasticache_replication_group" "cache" {
  replication_group_id = "${local.name_prefix}-cache"
  description          = "Application cache for ${local.name_prefix}"

  node_type            = var.node_type
  num_cache_clusters   = var.multi_az ? 2 : 1
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.cache.name

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = var.multi_az
  multi_az_enabled           = var.multi_az

  at_rest_encryption_enabled = true
  transit_encryption_enabled = var.transit_encryption_enabled
  auth_token                 = var.transit_encryption_enabled ? var.auth_token : null

  engine               = "redis"
  engine_version       = "7.0"
  maintenance_window   = "sun:05:00-sun:06:00"
  snapshot_window      = "03:00-04:00"
  snapshot_retention_limit = 7

  apply_immediately = false

  tags = {
    Name    = "${local.name_prefix}-cache"
    Purpose = "application-cache"
  }
}

# =============================================================================
# Celery Broker Cluster (separate per Gemini review)
# =============================================================================

resource "aws_elasticache_replication_group" "broker" {
  count = var.create_separate_celery_cache ? 1 : 0

  replication_group_id = "${local.name_prefix}-broker"
  description          = "Celery broker for ${local.name_prefix}"

  node_type            = var.broker_node_type
  num_cache_clusters   = var.multi_az ? 2 : 1
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.broker[0].name

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = var.multi_az
  multi_az_enabled           = var.multi_az

  at_rest_encryption_enabled = true
  transit_encryption_enabled = var.transit_encryption_enabled
  auth_token                 = var.transit_encryption_enabled ? var.broker_auth_token : null

  engine               = "redis"
  engine_version       = "7.0"
  maintenance_window   = "sun:05:00-sun:06:00"
  snapshot_window      = "03:00-04:00"
  snapshot_retention_limit = 7

  apply_immediately = false

  tags = {
    Name    = "${local.name_prefix}-broker"
    Purpose = "celery-broker"
  }
}
