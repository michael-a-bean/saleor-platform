# IAM Module
# Creates all IAM roles for ECS and GitHub Actions OIDC
# Follows least-privilege principle as recommended by GPT-5.2 and Gemini 3 reviews

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # ARN patterns for scoped permissions
  ssm_path_prefix    = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/saleor/${var.environment}/*"
  secrets_arn_prefix = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:saleor/${var.environment}/*"
  ecr_repo_prefix    = "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/${var.project_name}/*"
  ecs_service_prefix = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:service/${var.ecs_cluster_name}/*"
  ecs_task_prefix    = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task-definition/${var.project_name}-*"
}

data "aws_caller_identity" "current" {}

# =============================================================================
# GitHub Actions OIDC Provider
# =============================================================================

# Create OIDC provider for GitHub Actions (if not exists)
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]

  tags = {
    Name = "github-actions-oidc"
  }
}

# =============================================================================
# GitHub Actions Deploy Role
# =============================================================================

data "aws_iam_policy_document" "github_actions_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Restrict to specific repo and branch (hardened per GPT-5.2 and Gemini 3 reviews)
    # SECURITY: Using StringEquals (not StringLike) to prevent wildcard bypass
    # Only exact branch match, environment-based claims, and PR events are allowed
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        # Exact branch match for push-triggered workflows
        "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/${var.github_branch}",
        # Environment-based claim for workflows using GitHub Environments
        # This enforces GitHub Environment protection rules (required reviewers)
        "repo:${var.github_org}/${var.github_repo}:environment:${var.environment}",
        # Pull request events — needed for terraform plan on PRs (read-only)
        "repo:${var.github_org}/${var.github_repo}:pull_request"
      ]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${local.name_prefix}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume.json

  tags = {
    Name = "${local.name_prefix}-github-actions-deploy"
  }
}

# ECR permissions
data "aws_iam_policy_document" "github_actions_ecr" {
  statement {
    sid    = "ECRAuth"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ECRPush"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:ListImages"
    ]
    resources = [local.ecr_repo_prefix]
  }
}

# ECS permissions
data "aws_iam_policy_document" "github_actions_ecs" {
  statement {
    sid    = "ECSTaskDefinition"
    effect = "Allow"
    actions = [
      "ecs:RegisterTaskDefinition",
      "ecs:DescribeTaskDefinition",
      "ecs:DeregisterTaskDefinition"
    ]
    resources = ["*"] # Task definitions don't support resource-level permissions for register
  }

  statement {
    sid    = "ECSService"
    effect = "Allow"
    actions = [
      "ecs:UpdateService",
      "ecs:DescribeServices",
      "ecs:ListTasks"
    ]
    resources = [local.ecs_service_prefix]
  }

  # Separate statement for task operations - tasks have different ARN pattern than services
  statement {
    sid    = "ECSTasks"
    effect = "Allow"
    actions = [
      "ecs:DescribeTasks"
    ]
    resources = ["arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task/${var.ecs_cluster_name}/*"]
  }

  statement {
    sid    = "ECSRunTask"
    effect = "Allow"
    actions = [
      "ecs:RunTask",
      "ecs:StopTask"
    ]
    resources = [local.ecs_task_prefix]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [var.ecs_cluster_arn]
    }
  }

  statement {
    sid    = "ECSDescribeCluster"
    effect = "Allow"
    actions = [
      "ecs:DescribeClusters"
    ]
    resources = [var.ecs_cluster_arn]
  }

  # PassRole - scoped to specific roles only (GPT-5.2 and Gemini recommendation)
  statement {
    sid    = "PassRole"
    effect = "Allow"
    actions = [
      "iam:PassRole"
    ]
    resources = [
      aws_iam_role.ecs_task_execution.arn,
      aws_iam_role.ecs_api_task.arn,
      aws_iam_role.ecs_worker_task.arn,
      aws_iam_role.ecs_storefront_task.arn,
      aws_iam_role.ecs_apps_task.arn
    ]
  }
}

# SSM/Secrets permissions for deploy scripts
data "aws_iam_policy_document" "github_actions_secrets" {
  statement {
    sid    = "SSMRead"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath"
    ]
    resources = [local.ssm_path_prefix]
  }

  statement {
    sid    = "SecretsRead"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue"
    ]
    resources = [local.secrets_arn_prefix]
  }
}

# CloudWatch Logs permissions
data "aws_iam_policy_document" "github_actions_logs" {
  statement {
    sid    = "LogsRead"
    effect = "Allow"
    actions = [
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
      "logs:DescribeLogStreams"
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.project_name}-${var.environment}/*"
    ]
  }
}

# RDS snapshot for pre-migration backup (Gemini recommendation)
data "aws_iam_policy_document" "github_actions_rds" {
  statement {
    sid    = "RDSSnapshot"
    effect = "Allow"
    actions = [
      "rds:CreateDBSnapshot",
      "rds:DescribeDBSnapshots"
    ]
    resources = [
      "arn:aws:rds:${var.aws_region}:${data.aws_caller_identity.current.account_id}:db:${local.name_prefix}-*",
      "arn:aws:rds:${var.aws_region}:${data.aws_caller_identity.current.account_id}:snapshot:${local.name_prefix}-*"
    ]
  }
}

resource "aws_iam_role_policy" "github_actions_ecr" {
  name   = "ecr-access"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_ecr.json
}

resource "aws_iam_role_policy" "github_actions_ecs" {
  name   = "ecs-access"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_ecs.json
}

resource "aws_iam_role_policy" "github_actions_secrets" {
  name   = "secrets-access"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_secrets.json
}

resource "aws_iam_role_policy" "github_actions_logs" {
  name   = "logs-access"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_logs.json
}

resource "aws_iam_role_policy" "github_actions_rds" {
  name   = "rds-access"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_rds.json
}

# =============================================================================
# ECS Task Execution Role
# =============================================================================

data "aws_iam_policy_document" "ecs_task_execution_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json

  tags = {
    Name = "${local.name_prefix}-ecs-execution"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_policy" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Additional permissions for secrets injection
data "aws_iam_policy_document" "ecs_execution_secrets" {
  statement {
    sid    = "SSMSecrets"
    effect = "Allow"
    actions = [
      "ssm:GetParameters",
      "ssm:GetParameter"
    ]
    resources = [local.ssm_path_prefix]
  }

  statement {
    sid    = "SecretsManager"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue"
    ]
    resources = [local.secrets_arn_prefix]
  }

  statement {
    sid    = "KMSDecrypt"
    effect = "Allow"
    actions = [
      "kms:Decrypt"
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name   = "secrets-access"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_secrets.json
}

# =============================================================================
# ECS Task Roles (per-service for least privilege)
# =============================================================================

# API Task Role
resource "aws_iam_role" "ecs_api_task" {
  name               = "${local.name_prefix}-ecs-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json

  tags = {
    Name = "${local.name_prefix}-ecs-api-task"
  }
}

data "aws_iam_policy_document" "api_task_policy" {
  # S3 media bucket access
  statement {
    sid    = "S3Media"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      var.media_bucket_arn,
      "${var.media_bucket_arn}/*"
    ]
  }

  # SES for email (if using SES)
  dynamic "statement" {
    for_each = var.enable_ses ? [1] : []
    content {
      sid    = "SES"
      effect = "Allow"
      actions = [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ]
      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "api_task" {
  name   = "api-permissions"
  role   = aws_iam_role.ecs_api_task.id
  policy = data.aws_iam_policy_document.api_task_policy.json
}

# Worker Task Role (same as API for now)
resource "aws_iam_role" "ecs_worker_task" {
  name               = "${local.name_prefix}-ecs-worker-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json

  tags = {
    Name = "${local.name_prefix}-ecs-worker-task"
  }
}

resource "aws_iam_role_policy" "worker_task" {
  name   = "worker-permissions"
  role   = aws_iam_role.ecs_worker_task.id
  policy = data.aws_iam_policy_document.api_task_policy.json
}

# Storefront Task Role (minimal - no AWS service access needed)
resource "aws_iam_role" "ecs_storefront_task" {
  name               = "${local.name_prefix}-ecs-storefront-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json

  tags = {
    Name = "${local.name_prefix}-ecs-storefront-task"
  }
}

# Apps Task Role (DynamoDB for Stripe app, scoped per Gemini review)
resource "aws_iam_role" "ecs_apps_task" {
  name               = "${local.name_prefix}-ecs-apps-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json

  tags = {
    Name = "${local.name_prefix}-ecs-apps-task"
  }
}

data "aws_iam_policy_document" "apps_task_policy" {
  # DynamoDB for Stripe app - scoped to specific table
  statement {
    sid    = "DynamoDB"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan"
    ]
    resources = [
      "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.name_prefix}-stripe-*"
    ]
  }
}

resource "aws_iam_role_policy" "apps_task" {
  name   = "apps-permissions"
  role   = aws_iam_role.ecs_apps_task.id
  policy = data.aws_iam_policy_document.apps_task_policy.json
}

# =============================================================================
# EFS Permissions for Meilisearch (added to API task role)
# =============================================================================
# Required for EFS access point with IAM authentication

data "aws_iam_policy_document" "efs_access" {
  statement {
    sid    = "EFSAccess"
    effect = "Allow"
    actions = [
      "elasticfilesystem:ClientMount",
      "elasticfilesystem:ClientWrite",
      "elasticfilesystem:ClientRootAccess"
    ]
    resources = ["*"]
    condition {
      test     = "Bool"
      variable = "elasticfilesystem:AccessedViaMountTarget"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role_policy" "api_task_efs" {
  name   = "efs-access"
  role   = aws_iam_role.ecs_api_task.id
  policy = data.aws_iam_policy_document.efs_access.json
}
