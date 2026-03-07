# Grafana Cloud Dashboards Module
# Provisions CloudWatch data source and monitoring dashboards for Saleor platform.

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# =============================================================================
# CloudWatch Data Source
# =============================================================================

resource "grafana_data_source" "cloudwatch" {
  type = "cloudwatch"
  name = "${local.name_prefix}-cloudwatch"

  json_data_encoded = jsonencode({
    defaultRegion = var.aws_region
    authType      = "grafana_assume_role"
    assumeRoleArn = var.cloudwatch_role_arn
  })
}

# =============================================================================
# Dashboard Folder
# =============================================================================

resource "grafana_folder" "saleor" {
  title = "Saleor Platform (${var.environment})"
}

# =============================================================================
# Dashboards
# =============================================================================

resource "grafana_dashboard" "ecs_services" {
  folder    = grafana_folder.saleor.uid
  overwrite = true

  config_json = templatefile("${path.module}/dashboards/ecs-services.json.tftpl", {
    ds_uid        = grafana_data_source.cloudwatch.uid
    region        = var.aws_region
    cluster_name  = var.ecs_cluster_name
    service_names = join(",", var.ecs_service_names)
    environment   = var.environment
  })
}

resource "grafana_dashboard" "infrastructure" {
  folder    = grafana_folder.saleor.uid
  overwrite = true

  config_json = templatefile("${path.module}/dashboards/infrastructure.json.tftpl", {
    ds_uid          = grafana_data_source.cloudwatch.uid
    region          = var.aws_region
    rds_identifier  = var.rds_identifier
    elasticache_id  = var.elasticache_cluster_id
    alb_arn_suffix  = var.alb_arn_suffix
    fck_nat_name    = var.fck_nat_instance_name
    include_fck_nat = var.fck_nat_instance_name != ""
    environment     = var.environment
  })
}
