# Secrets Module Outputs

output "ssm_parameter_arns" {
  description = "Map of SSM parameter ARNs"
  value = {
    api_secret_key         = aws_ssm_parameter.api_secret_key.arn
    api_database_url       = aws_ssm_parameter.api_database_url.arn
    api_celery_broker_url  = aws_ssm_parameter.api_celery_broker_url.arn
    api_rsa_private_key    = aws_ssm_parameter.api_rsa_private_key.arn
    apps_secret_key        = aws_ssm_parameter.apps_secret_key.arn
    stripe_secret_key      = aws_ssm_parameter.stripe_secret_key.arn
    stripe_webhook_secret  = aws_ssm_parameter.stripe_webhook_secret.arn
    otel_headers           = aws_ssm_parameter.otel_headers.arn
    inventory_database_url = aws_ssm_parameter.inventory_database_url.arn
  }
}

output "ssm_parameter_names" {
  description = "Map of SSM parameter names (paths)"
  value = {
    api_secret_key         = aws_ssm_parameter.api_secret_key.name
    api_database_url       = aws_ssm_parameter.api_database_url.name
    api_celery_broker_url  = aws_ssm_parameter.api_celery_broker_url.name
    api_rsa_private_key    = aws_ssm_parameter.api_rsa_private_key.name
    apps_secret_key        = aws_ssm_parameter.apps_secret_key.name
    otel_headers           = aws_ssm_parameter.otel_headers.name
    stripe_secret_key      = aws_ssm_parameter.stripe_secret_key.name
    stripe_webhook_secret  = aws_ssm_parameter.stripe_webhook_secret.name
    inventory_database_url = aws_ssm_parameter.inventory_database_url.name
  }
}
