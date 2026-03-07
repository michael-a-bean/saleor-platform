# Grafana Cloud CloudWatch Module Outputs

output "iam_role_arn" {
  description = "IAM role ARN for Grafana Cloud to assume (use in Grafana CloudWatch data source config)"
  value       = aws_iam_role.grafana_cloudwatch.arn
}
