# RDS Module Variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for RDS"
  type        = list(string)
}

variable "ecs_backend_security_group_id" {
  description = "Security group ID of backend ECS tasks"
  type        = string
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 100
}

variable "max_allocated_storage" {
  description = "Maximum allocated storage for autoscaling"
  type        = number
  default     = 500
}

variable "master_username" {
  description = "Master username"
  type        = string
  default     = "saleor"
}

variable "master_password" {
  description = "Master password (should come from Secrets Manager)"
  type        = string
  sensitive   = true
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on deletion"
  type        = bool
  default     = true
}

variable "enable_performance_insights" {
  description = "Enable Performance Insights"
  type        = bool
  default     = true
}

variable "enable_enhanced_monitoring" {
  description = "Enable Enhanced Monitoring"
  type        = bool
  default     = false
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption (optional)"
  type        = string
  default     = null
}

# Separate inventory database
variable "create_separate_inventory_db" {
  description = "Create a separate RDS instance for inventory_ops"
  type        = bool
  default     = false
}

variable "inventory_instance_class" {
  description = "Instance class for inventory DB"
  type        = string
  default     = "db.t3.small"
}

variable "inventory_password" {
  description = "Password for inventory database"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# Connection Configuration
# =============================================================================

variable "max_connections" {
  description = "Maximum number of database connections"
  type        = number
  default     = 400
}

# =============================================================================
# RDS Proxy Configuration
# =============================================================================

variable "enable_rds_proxy" {
  description = "Enable RDS Proxy for connection pooling"
  type        = bool
  default     = false
}

variable "db_credentials_secret_arn" {
  description = "ARN of Secrets Manager secret containing DB credentials (required if enable_rds_proxy=true)"
  type        = string
  default     = ""
}

# =============================================================================
# Read Replica Configuration (P4-3)
# =============================================================================

variable "enable_read_replica" {
  description = "Create a read replica for reporting and indexing workloads"
  type        = bool
  default     = false
}

variable "read_replica_instance_class" {
  description = "Instance class for read replica (can be smaller than primary)"
  type        = string
  default     = "db.t3.medium"
}
