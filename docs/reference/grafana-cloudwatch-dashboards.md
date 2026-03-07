# Grafana Cloud CloudWatch Dashboards

Reference for Terraform-managed CloudWatch dashboards in Grafana Cloud. Documents critical compatibility requirements discovered during initial setup (March 2026, Grafana Cloud 13.0.0).

## Dashboard Locations

| Dashboard | Template | Grafana UID |
|-----------|----------|-------------|
| ECS Services | `infra/terraform/modules/grafana-dashboards/dashboards/ecs-services.json.tftpl` | `staging-ecs-services` |
| Infrastructure | `infra/terraform/modules/grafana-dashboards/dashboards/infrastructure.json.tftpl` | `staging-infrastructure` |

Terraform module: `infra/terraform/modules/grafana-dashboards/`

## Critical Requirements

### 1. schemaVersion Must Be 21

```json
{ "schemaVersion": 21 }
```

**Do not use schemaVersion 39 or higher.** Grafana Cloud 13.0.0's CloudWatch plugin silently fails to fire queries with newer schema versions. The browser never sends the query — panels show "no data" with no errors.

This was confirmed via A/B testing: identical dashboard JSON with only `schemaVersion` changed. Version 21 renders data; version 39 does not. Grafana's own built-in CloudWatch dashboards use version 21.

Grafana auto-migrates schema on load, so using 21 is safe and forward-compatible.

### 2. Use `statistics` (Plural Array), Not `statistic`

```json
// Correct
"statistics": ["Average"]

// Wrong — silently ignored
"statistic": "Average"
```

All CloudWatch targets must use the plural `statistics` key with an array value. The singular `statistic` string format is silently ignored.

### 3. Template Variables Do Not Work with CloudWatch

Grafana template variables (`$variable` in dimension values) do not resolve correctly with the CloudWatch plugin in Grafana Cloud 13.0.0 + schemaVersion 21. This applies to all variable types tested:

- Custom variables with static values
- Query variables against CloudWatch
- Variables with `includeAll: true` or specific selections

**Workaround:** Inject dimension values directly from Terraform using `templatefile()`. The ECS dashboard uses `service_names_json` to hardcode all service names:

```hcl
# In main.tf
config_json = templatefile("${path.module}/dashboards/ecs-services.json.tftpl", {
  service_names_json = join(", ", [for s in var.ecs_service_names : "\"${s}\""])
  # ...
})
```

```json
// In the template — Terraform interpolation, not Grafana variable
"dimensions": {
  "ClusterName": ["${cluster_name}"],
  "ServiceName": [${service_names_json}]
}
```

When a new ECS service is added, add it to `ecs_service_names` in `staging.tfvars` and re-apply. The dashboard updates automatically.

### 4. Unnecessary Fields to Avoid

These fields are **not needed** in CloudWatch targets and can be omitted:

| Field | Notes |
|-------|-------|
| `queryMode` | Not present in working built-in dashboards |
| `id` | Not needed for standard metric queries |

Fields that **should be present** (even if empty):

| Field | Value | Notes |
|-------|-------|-------|
| `expression` | `""` | Empty string, present in all working dashboards |
| `matchExact` | `true` | Required for dimension filtering |
| `region` | `"${region}"` | Explicit region from Terraform |
| `period` | `"300"` | String, not integer |

### 5. Dynamic Label Syntax

To show the service name in legends, use Grafana's `$${PROP()}` syntax (double `$$` escapes Terraform interpolation):

```json
"label": "$${PROP('Dim.ServiceName')}"
```

For multi-metric panels (e.g., running vs desired), append a suffix:

```json
"label": "$${PROP('Dim.ServiceName')} running"
```

## Data Source Configuration

The CloudWatch data source uses Grafana's built-in `grafana_assume_role` auth type:

```hcl
resource "grafana_data_source" "cloudwatch" {
  type = "cloudwatch"
  name = "${local.name_prefix}-cloudwatch"

  json_data_encoded = jsonencode({
    defaultRegion = var.aws_region
    authType      = "grafana_assume_role"
    assumeRoleArn = var.cloudwatch_role_arn
  })
}
```

The IAM role (`modules/grafana-cloudwatch/`) trusts Grafana Cloud's AWS account and allows `cloudwatch:GetMetricData`, `cloudwatch:ListMetrics`, etc.

## CloudWatch Namespaces Used

| Namespace | Metrics | Used By |
|-----------|---------|---------|
| `ECS/ContainerInsights` | RunningTaskCount, DesiredTaskCount, NetworkRxBytes, NetworkTxBytes | ECS dashboard |
| `AWS/ECS` | CPUUtilization, MemoryUtilization | ECS dashboard |
| `AWS/RDS` | CPUUtilization, FreeableMemory, DatabaseConnections, ReadIOPS, WriteIOPS, FreeStorageSpace | Infrastructure dashboard |
| `AWS/ElastiCache` | CPUUtilization, DatabaseMemoryUsagePercentage, CurrConnections, NetworkBytesIn, NetworkBytesOut, CacheHitRate | Infrastructure dashboard |
| `AWS/ApplicationELB` | RequestCount, HTTPCode_Target_5XX_Count, TargetResponseTime, ActiveConnectionCount, HealthyHostCount, UnHealthyHostCount | Infrastructure dashboard |
| `AWS/EC2` | CPUUtilization, NetworkIn, NetworkOut, NetworkPacketsIn, NetworkPacketsOut | Infrastructure dashboard (fck-nat) |

## Troubleshooting

### Dashboard shows "no data"

1. **Check schemaVersion** — must be 21, not 39+
2. **Check statistics format** — must be `"statistics": ["Average"]` (array)
3. **Check for template variables** — `$variable` in dimensions won't work; use hardcoded values
4. **Check data source** — verify the Terraform-managed data source UID matches `ds_uid` in the template
5. **Check CloudWatch plugin** — must be enabled (`/api/plugins/cloudwatch/settings`)
6. **Test via API** — `POST /api/ds/query` with the same query to isolate browser vs backend issues

### Adding a new ECS service

1. Add the service name to `ecs_service_names` in `environments/staging.tfvars`
2. Run `terraform apply -var-file=environments/staging.tfvars`
3. The dashboard updates automatically — no template changes needed

### Modifying dashboard panels

1. Edit the `.json.tftpl` template file
2. Use `schemaVersion: 21` and follow the patterns above
3. Apply with `terraform apply` — Grafana resource uses `overwrite = true`
4. Verify in Grafana that panels render data before committing

## Version History

| Date | Commit | Change |
|------|--------|--------|
| 2026-03-06 | `8ec0aaa` | Initial dashboard templates (broken — schemaVersion 39) |
| 2026-03-06 | `b0c5a1a` | Fix schemaVersion to 21, statistics array format |
| 2026-03-06 | `4da4894` | Replace template variables with hardcoded Terraform values |
