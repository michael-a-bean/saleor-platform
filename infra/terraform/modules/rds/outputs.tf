# RDS Module Outputs

output "rds_security_group_id" {
  description = "Security group ID of RDS"
  value       = aws_security_group.rds.id
}

output "db_instance_endpoint" {
  description = "Endpoint of the main RDS instance"
  value       = aws_db_instance.main.endpoint
}

output "db_instance_address" {
  description = "Address of the main RDS instance"
  value       = aws_db_instance.main.address
}

output "db_instance_port" {
  description = "Port of the main RDS instance"
  value       = aws_db_instance.main.port
}

output "db_instance_id" {
  description = "ID of the main RDS instance"
  value       = aws_db_instance.main.id
}

output "db_instance_arn" {
  description = "ARN of the main RDS instance"
  value       = aws_db_instance.main.arn
}

output "saleor_database_url" {
  description = "PostgreSQL connection URL for Saleor"
  value       = "postgresql://${var.master_username}:PASSWORD@${aws_db_instance.main.endpoint}/saleor"
  sensitive   = true
}

# Inventory database outputs (if separate instance)
output "inventory_db_endpoint" {
  description = "Endpoint of the inventory RDS instance"
  value       = length(aws_db_instance.inventory) > 0 ? aws_db_instance.inventory[0].endpoint : aws_db_instance.main.endpoint
}

output "inventory_database_url" {
  description = "PostgreSQL connection URL for inventory_ops"
  value       = length(aws_db_instance.inventory) > 0 ? "postgresql://${var.master_username}:PASSWORD@${aws_db_instance.inventory[0].endpoint}/inventory_ops" : "postgresql://${var.master_username}:PASSWORD@${aws_db_instance.main.endpoint}/inventory_ops"
  sensitive   = true
}

# RDS Proxy outputs (if enabled)
output "rds_proxy_endpoint" {
  description = "Endpoint of the RDS Proxy (use instead of direct RDS endpoint for connection pooling)"
  value       = length(aws_db_proxy.main) > 0 ? aws_db_proxy.main[0].endpoint : null
}

output "rds_proxy_arn" {
  description = "ARN of the RDS Proxy"
  value       = length(aws_db_proxy.main) > 0 ? aws_db_proxy.main[0].arn : null
}

output "connection_endpoint" {
  description = "Recommended connection endpoint (RDS Proxy if enabled, otherwise direct RDS)"
  value       = length(aws_db_proxy.main) > 0 ? aws_db_proxy.main[0].endpoint : aws_db_instance.main.endpoint
}
