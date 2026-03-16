# ECR Module
# Creates ECR repositories for custom-built images

locals {
  # List of custom images that need ECR repos
  # Note: api, worker, dashboard, meilisearch use official images
  repositories = toset([
    "storefront",
    "stripe-app",
    "inventory-ops-app",
    "pos-app",
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

  # CI tags: raw commit SHA (e.g., ff1ae67) + staging-latest
  # Rule 1 preserves staging-latest and version tags; Rule 2 expires everything else after 14 days
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 staging-latest and version tags"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["staging-latest", "v"]
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Expire all other images after 14 days"
        selection = {
          tagStatus   = "any"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 14
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
