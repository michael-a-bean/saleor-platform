# CloudFront Module Outputs

output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.media.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = aws_cloudfront_distribution.media.arn
}

output "domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.media.domain_name
}

output "hosted_zone_id" {
  description = "CloudFront distribution hosted zone ID (for Route53 alias)"
  value       = aws_cloudfront_distribution.media.hosted_zone_id
}

output "oac_id" {
  description = "Origin Access Control ID (for S3 bucket policy)"
  value       = aws_cloudfront_origin_access_control.media.id
}

output "media_url" {
  description = "Full HTTPS URL for media access"
  value       = "https://${aws_cloudfront_distribution.media.domain_name}"
}
