# Grafana Cloud CloudWatch Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "grafana_aws_account_id" {
  description = "Grafana Labs AWS account ID (from CloudWatch data source settings in Grafana Cloud)"
  type        = string
  sensitive   = true
}

variable "grafana_external_id" {
  description = "External ID for Grafana Cloud assume role (from CloudWatch data source settings)"
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
