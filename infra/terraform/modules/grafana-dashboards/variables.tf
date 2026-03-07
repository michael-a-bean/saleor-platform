# Grafana Dashboards Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region for CloudWatch data source"
  type        = string
}

variable "cloudwatch_role_arn" {
  description = "IAM role ARN for Grafana to assume for CloudWatch access"
  type        = string
}

variable "ecs_cluster_name" {
  description = "ECS cluster name for CloudWatch metric dimensions"
  type        = string
}

variable "ecs_service_names" {
  description = "List of ECS service names to include in dashboards"
  type        = list(string)
}

variable "rds_identifier" {
  description = "RDS instance identifier for CloudWatch metrics"
  type        = string
}

variable "elasticache_cluster_id" {
  description = "ElastiCache cache cluster ID for CloudWatch metrics (e.g., name-001)"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metrics (format: app/name/id)"
  type        = string
}

variable "fck_nat_instance_name" {
  description = "fck-nat EC2 instance name tag for CloudWatch metrics. Empty if not using fck-nat."
  type        = string
  default     = ""
}

variable "tempo_datasource_uid" {
  description = "UID of the Grafana Cloud Tempo data source for traces. Empty = skip OTEL dashboards."
  type        = string
  default     = ""
}

variable "prometheus_datasource_uid" {
  description = "UID of the Grafana Cloud Prometheus/Mimir data source for OTEL metrics. Empty = skip OTEL dashboards."
  type        = string
  default     = ""
}
