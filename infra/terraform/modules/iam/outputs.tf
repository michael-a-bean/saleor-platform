# IAM Module Outputs

output "github_actions_role_arn" {
  description = "ARN of the GitHub Actions deploy role"
  value       = aws_iam_role.github_actions_deploy.arn
}

output "github_actions_role_name" {
  description = "Name of the GitHub Actions deploy role"
  value       = aws_iam_role.github_actions_deploy.name
}

output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  value       = aws_iam_role.ecs_task_execution.arn
}

output "ecs_task_execution_role_name" {
  description = "Name of the ECS task execution role"
  value       = aws_iam_role.ecs_task_execution.name
}

output "ecs_api_task_role_arn" {
  description = "ARN of the API task role"
  value       = aws_iam_role.ecs_api_task.arn
}

output "ecs_worker_task_role_arn" {
  description = "ARN of the Worker task role"
  value       = aws_iam_role.ecs_worker_task.arn
}

output "ecs_storefront_task_role_arn" {
  description = "ARN of the Storefront task role"
  value       = aws_iam_role.ecs_storefront_task.arn
}

output "ecs_apps_task_role_arn" {
  description = "ARN of the Apps task role"
  value       = aws_iam_role.ecs_apps_task.arn
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider"
  value       = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : null
}
