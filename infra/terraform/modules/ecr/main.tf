# ECR Module
# Creates ECR repositories for custom-built images

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # List of custom images that need ECR repos
  # Note: api, worker, dashboard, meilisearch use official images
  repositories = toset([
    "storefront",
    "stripe-app",
    "inventory-ops-app",
    "buylist-app",
    "pos-app",
    "mtg-import-app",
    "price-sync-worker"
  ])
}

# =============================================================================
# ECR Repositories
# =============================================================================

resource "aws_ecr_repository" "repos" {
  for_each = local.repositories

  name                 = "${var.project_name}/${each.key}"
  image_tag_mutability = var.image_tag_mutability

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = var.kms_key_arn != null ? "KMS" : "AES256"
    kms_key         = var.kms_key_arn
  }

  tags = {
    Name    = "${var.project_name}/${each.key}"
    Service = each.key
  }
}

# =============================================================================
# Lifecycle Policies
# =============================================================================

resource "aws_ecr_lifecycle_policy" "repos" {
  for_each = aws_ecr_repository.repos

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 30 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "sha-"]
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Remove untagged images older than 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
