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
# Migration Network Configuration
# These outputs provide the values needed for ECS run-task network config.
# Use these to set GitHub Actions variables for first-deploy-safe migrations.
# =============================================================================

output "ecs_task_subnets" {
  description = "Comma-separated private subnet IDs for ECS task networking (for ECS_TASK_SUBNETS)"
  value       = join(",", local.private_subnet_ids)
}

output "ecs_task_security_group" {
  description = "Security group ID for ECS backend tasks (for ECS_TASK_SECURITY_GROUPS)"
  value       = module.alb.ecs_backend_security_group_id
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
  description = "API URL (computed from overrides or domain_name)"
  value       = local.public_api_base_url
}

output "storefront_url" {
  description = "Storefront URL (computed from overrides or domain_name)"
  value       = local.public_storefront_base_url
}

output "dashboard_url" {
  description = "Dashboard URL (computed from overrides or domain_name)"
  value       = local.public_dashboard_base_url
}

output "api_graphql_url" {
  description = "Full API GraphQL endpoint URL"
  value       = "${local.public_api_base_url}/graphql/"
}

# =============================================================================
# DynamoDB
# =============================================================================

output "stripe_app_dynamodb_table" {
  description = "DynamoDB table name for Stripe app"
  value       = module.dynamodb.stripe_app_table_name
}

# =============================================================================
# SSM Parameter Paths (for reference)
# =============================================================================

output "ssm_parameter_prefix" {
  description = "SSM parameter path prefix"
  value       = "/saleor/${var.environment}"
}

# =============================================================================
# Meilisearch
# =============================================================================

output "meilisearch_url" {
  description = "Meilisearch internal service URL"
  value       = var.meilisearch_enabled ? module.meilisearch[0].service_url : null
}

output "meilisearch_efs_id" {
  description = "Meilisearch EFS file system ID"
  value       = var.meilisearch_enabled ? module.meilisearch[0].efs_file_system_id : null
}

output "service_discovery_namespace" {
  description = "Service Discovery private DNS namespace"
  value       = aws_service_discovery_private_dns_namespace.main.name
}

output "service_discovery_namespace_id" {
  description = "Service Discovery private DNS namespace ID"
  value       = aws_service_discovery_private_dns_namespace.main.id
}


# =============================================================================
# CloudFront CDN
# =============================================================================

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for media CDN"
  value       = var.enable_cloudfront ? module.cloudfront[0].distribution_id : null
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = var.enable_cloudfront ? module.cloudfront[0].domain_name : null
}

output "media_cdn_url" {
  description = "Media CDN URL (CloudFront if enabled, otherwise direct S3)"
  value       = var.enable_cloudfront ? module.cloudfront[0].media_url : "https://${module.s3.bucket_regional_domain_name}"
}

# =============================================================================
# Storefront CDN
# =============================================================================

output "storefront_cdn_distribution_id" {
  description = "CloudFront distribution ID for storefront CDN"
  value       = var.enable_storefront_cdn ? module.cloudfront_storefront[0].distribution_id : null
}

output "storefront_cdn_domain_name" {
  description = "CloudFront distribution domain name for storefront CDN"
  value       = var.enable_storefront_cdn ? module.cloudfront_storefront[0].domain_name : null
}

# =============================================================================
# Grafana Cloud
# =============================================================================

output "grafana_ecs_dashboard_url" {
  description = "Grafana ECS Services dashboard URL. Retrieve with: terraform output -raw grafana_ecs_dashboard_url"
  value       = var.grafana_api_token != "" ? module.grafana_dashboards[0].ecs_dashboard_url : null
  sensitive   = true
}

output "grafana_infrastructure_dashboard_url" {
  description = "Grafana Infrastructure dashboard URL. Retrieve with: terraform output -raw grafana_infrastructure_dashboard_url"
  value       = var.grafana_api_token != "" ? module.grafana_dashboards[0].infrastructure_dashboard_url : null
  sensitive   = true
}

output "grafana_apm_dashboard_url" {
  description = "Grafana APM dashboard URL. Retrieve with: terraform output -raw grafana_apm_dashboard_url"
  value       = var.grafana_api_token != "" && var.tempo_datasource_uid != "" ? module.grafana_dashboards[0].apm_dashboard_url : null
  sensitive   = true
}

output "grafana_external_services_dashboard_url" {
  description = "Grafana External Services dashboard URL. Retrieve with: terraform output -raw grafana_external_services_dashboard_url"
  value       = var.grafana_api_token != "" && var.prometheus_datasource_uid != "" ? module.grafana_dashboards[0].external_services_dashboard_url : null
  sensitive   = true
}

output "grafana_cloudwatch_role_arn" {
  description = "IAM role ARN for Grafana Cloud CloudWatch integration. Retrieve with: terraform output -raw grafana_cloudwatch_role_arn"
  value       = var.grafana_aws_account_id != "" && var.grafana_external_id != "" ? module.grafana_cloudwatch[0].iam_role_arn : null
  sensitive   = true
}
