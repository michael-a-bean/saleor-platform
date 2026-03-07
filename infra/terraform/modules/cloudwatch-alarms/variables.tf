variable "name_prefix" {
  description = "Prefix for alarm names (e.g., saleor-platform-staging)"
  type        = string
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for alarm notifications"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch dimensions"
  type        = string
}

variable "ecs_cluster_name" {
  description = "ECS cluster name for CloudWatch dimensions"
  type        = string
}

variable "ecs_service_names" {
  description = "List of ECS service names to monitor for CPU/memory"
  type        = list(string)
  default     = ["api", "worker"]
}

variable "rds_instance_id" {
  description = "RDS instance identifier for CloudWatch dimensions"
  type        = string
}

variable "elasticache_cluster_id" {
  description = "ElastiCache replication group ID for CloudWatch dimensions"
  type        = string
}

variable "alb_5xx_threshold" {
  description = "Number of 5xx errors in evaluation period to trigger alarm"
  type        = number
  default     = 10
}

variable "alb_request_count_threshold" {
  description = "Number of requests in evaluation period to trigger alarm (spike detection)"
  type        = number
  default     = 5000
}

variable "alb_response_time_threshold" {
  description = "Target response time in seconds to trigger alarm"
  type        = number
  default     = 5.0
}

variable "ecs_cpu_threshold" {
  description = "ECS CPU utilization percentage to trigger alarm"
  type        = number
  default     = 80
}

variable "ecs_memory_threshold" {
  description = "ECS memory utilization percentage to trigger alarm"
  type        = number
  default     = 80
}

variable "rds_cpu_threshold" {
  description = "RDS CPU utilization percentage to trigger alarm"
  type        = number
  default     = 80
}

variable "rds_free_storage_threshold" {
  description = "RDS free storage space in bytes to trigger alarm (default 2GB)"
  type        = number
  default     = 2000000000
}

variable "elasticache_evictions_threshold" {
  description = "ElastiCache evictions count to trigger alarm"
  type        = number
  default     = 100
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
