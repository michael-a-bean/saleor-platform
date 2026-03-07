# Grafana Cloud CloudWatch Integration
# IAM role that Grafana Cloud assumes to read CloudWatch metrics and logs.
# After applying, configure the CloudWatch data source in Grafana Cloud UI
# with "Grafana Assume Role" auth, providing this role's ARN.

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# IAM Role for Grafana Cloud to assume
resource "aws_iam_role" "grafana_cloudwatch" {
  name = "${local.name_prefix}-grafana-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.grafana_aws_account_id}:root"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "sts:ExternalId" = var.grafana_external_id
          }
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}-grafana-cloudwatch"
    Service = "grafana"
  })
}

# Minimum permissions for CloudWatch metrics, logs, and ECS discovery
resource "aws_iam_role_policy" "grafana_cloudwatch" {
  name = "grafana-cloudwatch-readonly"
  role = aws_iam_role.grafana_cloudwatch.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchMetrics"
        Effect = "Allow"
        Action = [
          "cloudwatch:DescribeAlarmsForMetric",
          "cloudwatch:DescribeAlarmHistory",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:ListMetrics",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetInsightRuleReport",
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:GetLogGroupFields",
          "logs:StartQuery",
          "logs:StopQuery",
          "logs:GetQueryResults",
          "logs:GetLogEvents",
        ]
        Resource = "*"
      },
      {
        Sid    = "ECSDescribe"
        Effect = "Allow"
        Action = [
          "ecs:ListClusters",
          "ecs:ListServices",
          "ecs:DescribeServices",
          "ecs:ListTasks",
          "ecs:DescribeTasks",
        ]
        Resource = "*"
      },
      {
        Sid    = "ResourceDiscovery"
        Effect = "Allow"
        Action = [
          "ec2:DescribeTags",
          "ec2:DescribeInstances",
          "ec2:DescribeRegions",
          "tag:GetResources",
        ]
        Resource = "*"
      },
    ]
  })
}
