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

output "apm_dashboard_url" {
  description = "URL of the APM dashboard"
  value       = var.tempo_datasource_uid != "" && var.prometheus_datasource_uid != "" ? grafana_dashboard.apm[0].url : ""
}

output "external_services_dashboard_url" {
  description = "URL of the External Services dashboard"
  value       = var.prometheus_datasource_uid != "" ? grafana_dashboard.external_services[0].url : ""
}
