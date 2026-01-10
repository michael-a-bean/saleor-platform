# ECS Module Outputs

output "cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

# Services
output "api_service_name" {
  description = "API service name"
  value       = aws_ecs_service.api.name
}

output "worker_service_name" {
  description = "Worker service name"
  value       = aws_ecs_service.worker.name
}

output "storefront_service_name" {
  description = "Storefront service name"
  value       = aws_ecs_service.storefront.name
}

output "dashboard_service_name" {
  description = "Dashboard service name"
  value       = aws_ecs_service.dashboard.name
}

# Task Definitions
output "api_task_definition_arn" {
  description = "API task definition ARN"
  value       = aws_ecs_task_definition.api.arn
}

output "worker_task_definition_arn" {
  description = "Worker task definition ARN"
  value       = aws_ecs_task_definition.worker.arn
}

output "storefront_task_definition_arn" {
  description = "Storefront task definition ARN"
  value       = aws_ecs_task_definition.storefront.arn
}

output "migrate_task_definition_arn" {
  description = "Migration task definition ARN"
  value       = aws_ecs_task_definition.migrate.arn
}

# Log Groups
output "log_group_names" {
  description = "Map of service to log group names"
  value       = { for k, v in aws_cloudwatch_log_group.services : k => v.name }
}
