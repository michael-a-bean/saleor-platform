# CloudFront Module
# Creates CloudFront distribution for S3 media bucket with Origin Access Control (OAC)

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# =============================================================================
# Origin Access Control (OAC) - Modern approach replacing OAI
# =============================================================================

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${local.name_prefix}-media-oac"
  description                       = "OAC for S3 media bucket access"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# =============================================================================
# CloudFront Distribution
# =============================================================================

resource "aws_cloudfront_distribution" "media" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name_prefix} media CDN"
  default_root_object = ""
  price_class         = var.price_class
  wait_for_deployment = false

  # S3 Origin with OAC
  origin {
    domain_name              = var.s3_bucket_regional_domain_name
    origin_id                = "S3-${var.s3_bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  # Default cache behavior for all media
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.s3_bucket_name}"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # TTL settings - aggressive caching for product images
    min_ttl     = 0
    default_ttl = var.default_ttl # 24 hours
    max_ttl     = var.max_ttl     # 7 days
  }

  # Cache behavior for product images - longest TTL
  ordered_cache_behavior {
    path_pattern     = "products/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.s3_bucket_name}"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # Product images rarely change - aggressive caching
    min_ttl     = 3600   # 1 hour minimum
    default_ttl = 86400  # 24 hours
    max_ttl     = 604800 # 7 days
  }

  # Cache behavior for thumbnails - longest TTL
  ordered_cache_behavior {
    path_pattern     = "thumbnails/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.s3_bucket_name}"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # Thumbnails are derived - very aggressive caching
    min_ttl     = 3600   # 1 hour minimum
    default_ttl = 86400  # 24 hours
    max_ttl     = 604800 # 7 days
  }

  # Geo restrictions - none (global distribution within price class)
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Use default CloudFront certificate (*.cloudfront.net)
  # Custom domain with ACM cert can be added later if needed
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  # Custom error responses - return 404 for missing files
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = ""
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = ""
    error_caching_min_ttl = 10
  }

  tags = {
    Name    = "${local.name_prefix}-media-cdn"
    Service = "media"
  }
}
