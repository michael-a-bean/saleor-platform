# CloudFront Storefront Module Variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "alb_dns_name" {
  description = "ALB DNS name to use as CloudFront origin"
  type        = string
}

variable "domain_names" {
  description = "List of domain names for CloudFront alternate domain names (CNAMEs)"
  type        = list(string)
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for CloudFront custom domain"
  type        = string
}

variable "price_class" {
  description = "CloudFront price class (PriceClass_100 = US/Europe, PriceClass_200 = US/Europe/Asia, PriceClass_All = All)"
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be one of: PriceClass_100, PriceClass_200, PriceClass_All"
  }
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
