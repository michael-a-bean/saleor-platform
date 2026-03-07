# VPC Module Variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
}

variable "single_nat_gateway" {
  description = "Use a single NAT gateway (cost savings for non-prod)"
  type        = bool
  default     = true
}

variable "use_fck_nat" {
  description = "Use fck-nat EC2 instance instead of managed NAT Gateway (~$7/mo vs ~$42/mo, ~5 min failover)"
  type        = bool
  default     = false
}

variable "fck_nat_instance_type" {
  description = "Instance type for fck-nat (t4g.nano recommended for staging)"
  type        = string
  default     = "t4g.nano"
}

variable "create_vpc_endpoints" {
  description = "Create VPC endpoints for AWS services (gateway endpoints are free)"
  type        = bool
  default     = true
}

variable "create_interface_endpoints" {
  description = "Create Interface VPC endpoints (ECR, SSM, Logs). Each costs ~$7.30/mo. Set false for staging to save ~$29/mo when NAT gateway is present."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
