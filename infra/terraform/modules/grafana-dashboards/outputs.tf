# Grafana Dashboards Module Outputs

output "cloudwatch_data_source_uid" {
  description = "UID of the CloudWatch data source in Grafana"
  value       = grafana_data_source.cloudwatch.uid
}

output "folder_uid" {
  description = "Grafana folder UID containing the dashboards"
  value       = grafana_folder.saleor.uid
}

output "ecs_dashboard_url" {
  description = "URL of the ECS Services dashboard"
  value       = grafana_dashboard.ecs_services.url
}

output "infrastructure_dashboard_url" {
  description = "URL of the Infrastructure dashboard"
  value       = grafana_dashboard.infrastructure.url
}
