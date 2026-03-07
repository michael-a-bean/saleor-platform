# CloudFront Storefront Module Outputs

output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.storefront.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = aws_cloudfront_distribution.storefront.arn
}

output "domain_name" {
  description = "CloudFront distribution domain name (e.g., d1234.cloudfront.net)"
  value       = aws_cloudfront_distribution.storefront.domain_name
}

output "hosted_zone_id" {
  description = "CloudFront distribution hosted zone ID (for Route53 alias)"
  value       = aws_cloudfront_distribution.storefront.hosted_zone_id
}
