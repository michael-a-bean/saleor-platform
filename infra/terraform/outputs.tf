# Root Module Outputs

# =============================================================================
# Network
# =============================================================================

output "vpc_id" {
  description = "VPC ID"
  value       = local.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = local.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = local.private_subnet_ids
}

# =============================================================================
# ALB
# =============================================================================

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID"
  value       = module.alb.alb_zone_id
}

# =============================================================================
# Database
# =============================================================================

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.db_instance_endpoint
}

output "rds_port" {
  description = "RDS port"
  value       = module.rds.db_instance_port
}

# =============================================================================
# Cache
# =============================================================================

output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = module.elasticache.cache_endpoint
}

output "redis_url" {
  description = "Redis URL for application"
  value       = module.elasticache.cache_url
}

output "celery_broker_url" {
  description = "Celery broker URL"
  value       = module.elasticache.broker_url
}

# =============================================================================
# Storage
# =============================================================================

output "media_bucket_name" {
  description = "Media S3 bucket name"
  value       = module.s3.bucket_name
}

output "media_bucket_arn" {
  description = "Media S3 bucket ARN"
  value       = module.s3.bucket_arn
}

# =============================================================================
# ECR
# =============================================================================

output "ecr_repository_urls" {
  description = "ECR repository URLs"
  value       = module.ecr.repository_urls
}

# =============================================================================
# ECS
# =============================================================================

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = module.ecs.cluster_arn
}

output "migrate_task_definition_arn" {
  description = "Migration task definition ARN"
  value       = module.ecs.migrate_task_definition_arn
}

# =============================================================================
# IAM
# =============================================================================

output "github_actions_role_arn" {
  description = "GitHub Actions OIDC role ARN"
  value       = module.iam.github_actions_role_arn
}

output "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN"
  value       = module.iam.ecs_task_execution_role_arn
}

# =============================================================================
# DNS
# =============================================================================

output "api_url" {
  description = "API URL"
  value       = "https://api.${var.domain_name}"
}

output "storefront_url" {
  description = "Storefront URL"
  value       = "https://www.${var.domain_name}"
}

output "dashboard_url" {
  description = "Dashboard URL"
  value       = "https://dashboard.${var.domain_name}"
}

# =============================================================================
# SSM Parameter Paths (for reference)
# =============================================================================

output "ssm_parameter_prefix" {
  description = "SSM parameter path prefix"
  value       = "/saleor/${var.environment}"
}
