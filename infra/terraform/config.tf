# AWS Config - Drift Prevention & Compliance
# Enforces ManagedBy=terraform tagging requirement on critical infrastructure.
# Extracted from main.tf for maintainability.
# Reference: docs/ops/prompts/DRIFT-PREVENTION-NEXT-STEPS.md

# S3 bucket for AWS Config delivery
resource "aws_s3_bucket" "config" {
  count  = var.enable_config_rules ? 1 : 0
  bucket = "${local.name_prefix}-config-${local.account_id}"

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-config"
    Service = "aws-config"
  })
}

resource "aws_s3_bucket_versioning" "config" {
  count  = var.enable_config_rules ? 1 : 0
  bucket = aws_s3_bucket.config[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config" {
  count  = var.enable_config_rules ? 1 : 0
  bucket = aws_s3_bucket.config[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "config" {
  count  = var.enable_config_rules ? 1 : 0
  bucket = aws_s3_bucket.config[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 bucket policy for AWS Config
resource "aws_s3_bucket_policy" "config" {
  count  = var.enable_config_rules ? 1 : 0
  bucket = aws_s3_bucket.config[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSConfigBucketPermissionsCheck"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.config[0].arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = local.account_id
          }
        }
      },
      {
        Sid    = "AWSConfigBucketExistenceCheck"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.config[0].arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = local.account_id
          }
        }
      },
      {
        Sid    = "AWSConfigBucketDelivery"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.config[0].arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"      = "bucket-owner-full-control"
            "AWS:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })
}

# IAM role for AWS Config
resource "aws_iam_role" "config" {
  count = var.enable_config_rules ? 1 : 0
  name  = "${local.name_prefix}-config"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-config"
    Service = "aws-config"
  })
}

resource "aws_iam_role_policy_attachment" "config" {
  count      = var.enable_config_rules ? 1 : 0
  role       = aws_iam_role.config[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

resource "aws_iam_role_policy" "config_s3" {
  count = var.enable_config_rules ? 1 : 0
  name  = "s3-delivery"
  role  = aws_iam_role.config[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.config[0].arn}/*"
        Condition = {
          StringLike = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.config[0].arn
      }
    ]
  })
}

# AWS Config recorder
resource "aws_config_configuration_recorder" "main" {
  count    = var.enable_config_rules ? 1 : 0
  name     = "${local.name_prefix}-recorder"
  role_arn = aws_iam_role.config[0].arn

  recording_group {
    all_supported                 = false
    include_global_resource_types = false

    # Only record resource types we're monitoring for tagging compliance
    resource_types = [
      "AWS::EC2::VPC",
      "AWS::EC2::Subnet",
      "AWS::EC2::SecurityGroup",
      "AWS::EC2::NatGateway",
      "AWS::EC2::InternetGateway",
      "AWS::ElasticLoadBalancingV2::LoadBalancer"
    ]
  }
}

# AWS Config delivery channel
resource "aws_config_delivery_channel" "main" {
  count          = var.enable_config_rules ? 1 : 0
  name           = "${local.name_prefix}-delivery"
  s3_bucket_name = aws_s3_bucket.config[0].id

  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

# Enable the recorder
resource "aws_config_configuration_recorder_status" "main" {
  count      = var.enable_config_rules ? 1 : 0
  name       = aws_config_configuration_recorder.main[0].name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.main]
}

# AWS Config Rule: Required Tags
# Alerts when EC2/VPC resources are created without ManagedBy tag
resource "aws_config_config_rule" "required_tags" {
  count = var.enable_config_rules ? 1 : 0
  name  = "${local.name_prefix}-required-tags"

  source {
    owner             = "AWS"
    source_identifier = "REQUIRED_TAGS"
  }

  input_parameters = jsonencode({
    tag1Key   = "ManagedBy"
    tag1Value = "terraform"
  })

  scope {
    compliance_resource_types = [
      "AWS::EC2::VPC",
      "AWS::EC2::Subnet",
      "AWS::EC2::SecurityGroup",
      "AWS::EC2::NatGateway",
      "AWS::ElasticLoadBalancingV2::LoadBalancer"
    ]
  }

  depends_on = [aws_config_configuration_recorder_status.main]

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-required-tags"
    Service = "aws-config"
    Purpose = "drift-prevention"
  })
}
