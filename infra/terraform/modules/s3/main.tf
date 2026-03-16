# S3 Module
# Creates S3 bucket for media storage with proper security settings

locals {
  bucket_name = "${var.project_name}-media-${var.environment}-${var.account_id}"
}

# =============================================================================
# Media Bucket
# =============================================================================

resource "aws_s3_bucket" "media" {
  bucket        = local.bucket_name
  force_destroy = var.force_destroy

  tags = {
    Name    = local.bucket_name
    Purpose = "media"
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.kms_key_arn != null ? "aws:kms" : "AES256"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = var.kms_key_arn != null
  }
}

# Public access settings
# Note: Public read is enabled for product images and thumbnails
# Block ACLs but allow bucket policies for public read
resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = false # Allow public bucket policies
  ignore_public_acls      = true
  restrict_public_buckets = false # Allow public access via bucket policy
}

# Lifecycle rules
resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    filter {}

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }

  rule {
    id     = "transition-old-to-glacier"
    status = "Enabled"

    filter {}

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }
}

# CORS configuration for storefront/API access
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["Content-Type", "Content-Length", "Authorization", "x-amz-content-sha256"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Bucket policy for ECS task access and public/CloudFront read for media
resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id

  # Wait for public access block to be updated
  depends_on = [aws_s3_bucket_public_access_block.media]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      # Always enforce TLS
      [
        {
          Sid       = "EnforceTLSRequestsOnly"
          Effect    = "Deny"
          Principal = "*"
          Action    = "s3:*"
          Resource = [
            aws_s3_bucket.media.arn,
            "${aws_s3_bucket.media.arn}/*"
          ]
          Condition = {
            Bool = {
              "aws:SecureTransport" = "false"
            }
          }
        }
      ],
      # CloudFront OAC access (when CloudFront is enabled)
      var.cloudfront_distribution_arn != "" ? [
        {
          Sid    = "AllowCloudFrontServicePrincipal"
          Effect = "Allow"
          Principal = {
            Service = "cloudfront.amazonaws.com"
          }
          Action   = "s3:GetObject"
          Resource = "${aws_s3_bucket.media.arn}/*"
          Condition = {
            StringEquals = {
              "AWS:SourceArn" = var.cloudfront_distribution_arn
            }
          }
        }
      ] : [],
      # Public read (when CloudFront-only is NOT enabled)
      # This maintains backward compatibility for environments without CloudFront
      !var.enable_cloudfront_only_access ? [
        {
          Sid       = "PublicReadForMedia"
          Effect    = "Allow"
          Principal = "*"
          Action    = "s3:GetObject"
          Resource = [
            "${aws_s3_bucket.media.arn}/products/*",
            "${aws_s3_bucket.media.arn}/thumbnails/*"
          ]
        }
      ] : []
    )
  })
}
