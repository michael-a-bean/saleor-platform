# ElastiCache Module Outputs

output "redis_security_group_id" {
  description = "Security group ID of Redis"
  value       = aws_security_group.redis.id
}

# Cache cluster outputs
output "cache_endpoint" {
  description = "Primary endpoint for cache cluster"
  value       = aws_elasticache_replication_group.cache.primary_endpoint_address
}

output "cache_reader_endpoint" {
  description = "Reader endpoint for cache cluster"
  value       = aws_elasticache_replication_group.cache.reader_endpoint_address
}

output "cache_port" {
  description = "Port for cache cluster"
  value       = aws_elasticache_replication_group.cache.port
}

output "cache_url" {
  description = "Redis URL for application cache"
  value       = "redis://${aws_elasticache_replication_group.cache.primary_endpoint_address}:${aws_elasticache_replication_group.cache.port}/0"
}

# Broker cluster outputs (if separate)
output "broker_endpoint" {
  description = "Primary endpoint for broker cluster"
  value       = length(aws_elasticache_replication_group.broker) > 0 ? aws_elasticache_replication_group.broker[0].primary_endpoint_address : aws_elasticache_replication_group.cache.primary_endpoint_address
}

output "broker_url" {
  description = "Redis URL for Celery broker"
  value       = length(aws_elasticache_replication_group.broker) > 0 ? "redis://${aws_elasticache_replication_group.broker[0].primary_endpoint_address}:${aws_elasticache_replication_group.broker[0].port}/0" : "redis://${aws_elasticache_replication_group.cache.primary_endpoint_address}:${aws_elasticache_replication_group.cache.port}/1"
}
