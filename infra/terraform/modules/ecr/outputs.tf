# ECR Module Outputs

output "repository_urls" {
  description = "Map of repository names to URLs"
  value       = { for k, v in aws_ecr_repository.repos : k => v.repository_url }
}

output "repository_arns" {
  description = "Map of repository names to ARNs"
  value       = { for k, v in aws_ecr_repository.repos : k => v.arn }
}

output "storefront_repository_url" {
  description = "URL of storefront repository"
  value       = aws_ecr_repository.repos["storefront"].repository_url
}

output "stripe_app_repository_url" {
  description = "URL of stripe-app repository"
  value       = aws_ecr_repository.repos["stripe-app"].repository_url
}

output "inventory_ops_app_repository_url" {
  description = "URL of inventory-ops-app repository"
  value       = aws_ecr_repository.repos["inventory-ops-app"].repository_url
}

output "buylist_app_repository_url" {
  description = "URL of buylist-app repository"
  value       = aws_ecr_repository.repos["buylist-app"].repository_url
}

output "pos_app_repository_url" {
  description = "URL of pos-app repository"
  value       = aws_ecr_repository.repos["pos-app"].repository_url
}

output "mtg_import_app_repository_url" {
  description = "URL of mtg-import-app repository"
  value       = aws_ecr_repository.repos["mtg-import-app"].repository_url
}

output "price_sync_worker_repository_url" {
  description = "URL of price-sync-worker repository"
  value       = aws_ecr_repository.repos["price-sync-worker"].repository_url
}
