# DynamoDB Module Outputs

output "stripe_app_table_name" {
  description = "Name of the Stripe app DynamoDB table"
  value       = var.create_stripe_table ? aws_dynamodb_table.stripe_app[0].name : ""
}

output "stripe_app_table_arn" {
  description = "ARN of the Stripe app DynamoDB table"
  value       = var.create_stripe_table ? aws_dynamodb_table.stripe_app[0].arn : ""
}
