# Meilisearch Module Outputs

output "service_url" {
  description = "Meilisearch internal service URL (via Service Discovery)"
  value       = "http://meilisearch.${local.name_prefix}.local:7700"
}

output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.meilisearch.name
}

output "task_definition_arn" {
  description = "ECS task definition ARN"
  value       = aws_ecs_task_definition.meilisearch.arn
}

output "efs_file_system_id" {
  description = "EFS file system ID for data persistence"
  value       = aws_efs_file_system.meilisearch.id
}

output "efs_file_system_arn" {
  description = "EFS file system ARN"
  value       = aws_efs_file_system.meilisearch.arn
}

output "efs_access_point_id" {
  description = "EFS access point ID"
  value       = aws_efs_access_point.meilisearch.id
}

output "service_discovery_arn" {
  description = "Service Discovery service ARN"
  value       = aws_service_discovery_service.meilisearch.arn
}

output "efs_security_group_id" {
  description = "EFS security group ID"
  value       = aws_security_group.efs.id
}
