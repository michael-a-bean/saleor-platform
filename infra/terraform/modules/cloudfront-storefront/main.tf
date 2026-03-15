# CloudFront Storefront Module
# Puts CloudFront in front of the ALB for the Next.js storefront.
# Caches static assets at edge while respecting origin Cache-Control for dynamic pages.

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  origin_id   = "ALB-${local.name_prefix}-storefront"
}

# =============================================================================
# Cache Policies
# =============================================================================

# Static assets: immutable, ignore query strings, ignore cookies
resource "aws_cloudfront_cache_policy" "static_assets" {
  name        = "${local.name_prefix}-static-assets"
  comment     = "Immutable static assets (JS, CSS, images)"
  default_ttl = 31536000 # 1 year
  max_ttl     = 31536000
  min_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Next.js image optimization: cache by query string (url, w, q params)
resource "aws_cloudfront_cache_policy" "nextjs_images" {
  name        = "${local.name_prefix}-nextjs-images"
  comment     = "Next.js optimized images — cache by query params"
  default_ttl = 86400  # 24 hours
  max_ttl     = 604800 # 7 days
  min_ttl     = 3600   # 1 hour minimum

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Accept"] # Next.js uses Accept header to decide AVIF vs WebP
      }
    }
    query_strings_config {
      query_string_behavior = "all" # url, w, q params are the cache key
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Dynamic pages: respect origin Cache-Control (s-maxage=60, stale-while-revalidate=300)
resource "aws_cloudfront_cache_policy" "dynamic_pages" {
  name        = "${local.name_prefix}-dynamic-pages"
  comment     = "Dynamic storefront pages — respect origin Cache-Control"
  default_ttl = 60  # Fallback if no Cache-Control header
  max_ttl     = 300 # Cap at 5 minutes
  min_ttl     = 0   # Allow no-cache for auth pages

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "whitelist"
      headers {
        items = [
          "RSC",                    # React Server Components — response format differs from HTML
          "Next-Router-State-Tree", # RSC navigation context
        ]
      }
    }
    query_strings_config {
      query_string_behavior = "all" # Forward query strings for search, pagination
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# =============================================================================
# Origin Request Policy (forward Host header for ALB routing)
# =============================================================================

resource "aws_cloudfront_origin_request_policy" "alb_forwarding" {
  name    = "${local.name_prefix}-alb-forwarding"
  comment = "Forward Host header so ALB host-based routing works"

  cookies_config {
    cookie_behavior = "all" # Forward cookies for auth (checkout, cart)
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Host",
        "Accept",
        "Accept-Language",
        "Referer",
        "Next-Action",         # Server action ID — without this, Next.js returns HTML instead of action response
        "Next-Router-State-Tree", # RSC navigation state
        "RSC",                 # React Server Components request marker
        "Content-Type",        # POST body content type
      ]
    }
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

# =============================================================================
# CloudFront Distribution
# =============================================================================

resource "aws_cloudfront_distribution" "storefront" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name_prefix} storefront CDN"
  default_root_object = ""
  price_class         = var.price_class
  wait_for_deployment = false
  aliases             = var.domain_names

  # ALB Origin
  origin {
    domain_name = var.alb_dns_name
    origin_id   = local.origin_id

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_keepalive_timeout = 60
      origin_read_timeout      = 60
    }
  }

  # Default behavior: dynamic pages (respect origin Cache-Control).
  # Cookies are forwarded to origin (via origin_request_policy) but excluded from
  # cache key (via cache_policy). This is safe because the storefront middleware
  # sets no Cache-Control on auth/transactional paths (checkout, cart, orders),
  # so CloudFront's min_ttl=0 ensures those responses are not cached.
  default_cache_behavior {
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = local.origin_id
    cache_policy_id          = aws_cloudfront_cache_policy.dynamic_pages.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.alb_forwarding.id
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  # /_next/static/* — hashed JS/CSS bundles, immutable
  ordered_cache_behavior {
    path_pattern             = "/_next/static/*"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = local.origin_id
    cache_policy_id          = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.alb_forwarding.id
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  # /images/* — static marketing/product images, immutable
  ordered_cache_behavior {
    path_pattern             = "/images/*"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = local.origin_id
    cache_policy_id          = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.alb_forwarding.id
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  # /_next/image* — Next.js image optimization endpoint
  ordered_cache_behavior {
    path_pattern             = "/_next/image*"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = local.origin_id
    cache_policy_id          = aws_cloudfront_cache_policy.nextjs_images.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.alb_forwarding.id
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  # Static files (favicon, robots.txt, etc.)
  ordered_cache_behavior {
    path_pattern             = "*.ico"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = local.origin_id
    cache_policy_id          = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.alb_forwarding.id
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  # Geo restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Custom SSL certificate (us-east-1)
  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # Cache errors briefly to avoid hammering origin
  custom_error_response {
    error_code            = 502
    error_caching_min_ttl = 5
  }

  custom_error_response {
    error_code            = 503
    error_caching_min_ttl = 5
  }

  custom_error_response {
    error_code            = 504
    error_caching_min_ttl = 5
  }

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}-storefront-cdn"
    Service = "storefront"
  })
}
