# Root Module - Saleor Platform Infrastructure
# Composes all modules for AWS ECS/Fargate deployment

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id

  # URL scheme based on TLS availability
  url_scheme = var.use_https_urls ? "https" : "http"

  # Computed public URLs with override support
  # When override is empty, generate from domain_name
  # When override is set, use it directly
  public_api_base_url = (
    var.public_api_base_url != "" ? var.public_api_base_url :
    "${local.url_scheme}://api.${var.domain_name}"
  )

  public_storefront_base_url = (
    var.public_storefront_base_url != "" ? var.public_storefront_base_url :
    "${local.url_scheme}://www.${var.domain_name}"
  )

  public_dashboard_base_url = (
    var.public_dashboard_base_url != "" ? var.public_dashboard_base_url :
    "${local.url_scheme}://dashboard.${var.domain_name}"
  )
}

# =============================================================================
# VPC (or use existing)
# =============================================================================

module "vpc" {
  source = "./modules/vpc"
  count  = var.create_vpc ? 1 : 0

  project_name         = var.project_name
  environment          = var.environment
  aws_region           = var.aws_region
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  single_nat_gateway   = var.environment == "staging"
  create_vpc_endpoints = true
}

locals {
  vpc_id             = var.create_vpc ? module.vpc[0].vpc_id : var.existing_vpc_id
  public_subnet_ids  = var.create_vpc ? module.vpc[0].public_subnet_ids : var.existing_public_subnet_ids
  private_subnet_ids = var.create_vpc ? module.vpc[0].private_subnet_ids : var.existing_private_subnet_ids
}

# =============================================================================
# S3 Media Bucket
# =============================================================================

module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
  account_id   = local.account_id

  cors_allowed_origins = [
    "https://www.${var.domain_name}",
    "https://api.${var.domain_name}",
    "https://dashboard.${var.domain_name}"
  ]

  # CloudFront integration
  cloudfront_distribution_arn   = var.enable_cloudfront ? module.cloudfront[0].distribution_arn : ""
  enable_cloudfront_only_access = var.enable_cloudfront && var.cloudfront_only_media_access
}

# =============================================================================
# CloudFront CDN for Media
# =============================================================================

module "cloudfront" {
  source = "./modules/cloudfront"
  count  = var.enable_cloudfront ? 1 : 0

  project_name = var.project_name
  environment  = var.environment

  s3_bucket_name                 = module.s3.bucket_name
  s3_bucket_arn                  = module.s3.bucket_arn
  s3_bucket_regional_domain_name = module.s3.bucket_regional_domain_name

  price_class = var.cloudfront_price_class
}

# =============================================================================
# DynamoDB Tables (for Saleor Apps)
# =============================================================================

module "dynamodb" {
  source = "./modules/dynamodb"

  project_name = var.project_name
  environment  = var.environment

  create_stripe_table           = var.apps_enabled
  enable_point_in_time_recovery = var.environment == "production"
}

# =============================================================================
# ECR Repositories
# =============================================================================

module "ecr" {
  source = "./modules/ecr"

  project_name         = var.project_name
  environment          = var.environment
  image_tag_mutability = var.ecr_image_tag_mutability
}

# =============================================================================
# ALB and Security Groups
# =============================================================================

module "alb" {
  source = "./modules/alb"

  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = local.vpc_id
  public_subnet_ids = local.public_subnet_ids
  domain_name       = var.domain_name
  certificate_arn   = var.create_acm_certificate ? aws_acm_certificate.main[0].arn : ""

  enable_deletion_protection = var.environment == "production"
}

# =============================================================================
# RDS PostgreSQL
# =============================================================================

# Generate master password if not provided
resource "random_password" "db_master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

module "rds" {
  source = "./modules/rds"

  project_name                  = var.project_name
  environment                   = var.environment
  vpc_id                        = local.vpc_id
  private_subnet_ids            = local.private_subnet_ids
  ecs_backend_security_group_id = module.alb.ecs_backend_security_group_id

  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  multi_az              = var.db_multi_az
  backup_retention_days = var.db_backup_retention_days
  deletion_protection   = var.db_deletion_protection
  skip_final_snapshot   = var.environment == "staging"
  master_password       = random_password.db_master.result

  create_separate_inventory_db = var.create_separate_inventory_db
  inventory_password           = var.create_separate_inventory_db ? random_password.db_master.result : ""

  enable_performance_insights = var.environment == "production"
  enable_enhanced_monitoring  = var.environment == "production"
}

# =============================================================================
# ElastiCache Redis
# =============================================================================

module "elasticache" {
  source = "./modules/elasticache"

  project_name                  = var.project_name
  environment                   = var.environment
  vpc_id                        = local.vpc_id
  private_subnet_ids            = local.private_subnet_ids
  ecs_backend_security_group_id = module.alb.ecs_backend_security_group_id

  node_type = var.redis_node_type
  multi_az  = var.redis_multi_az

  create_separate_celery_cache = var.create_separate_celery_cache
}

# =============================================================================
# ECS Cluster and Services
# =============================================================================

module "ecs" {
  source = "./modules/ecs"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  domain_name  = var.domain_name

  # Public URLs for applications (supports overrides for staging without DNS)
  public_api_base_url        = local.public_api_base_url
  public_storefront_base_url = local.public_storefront_base_url
  public_dashboard_base_url  = local.public_dashboard_base_url

  private_subnet_ids             = local.private_subnet_ids
  ecs_backend_security_group_id  = module.alb.ecs_backend_security_group_id
  ecs_frontend_security_group_id = module.alb.ecs_frontend_security_group_id

  task_execution_role_arn  = module.iam.ecs_task_execution_role_arn
  api_task_role_arn        = module.iam.ecs_api_task_role_arn
  worker_task_role_arn     = module.iam.ecs_worker_task_role_arn
  storefront_task_role_arn = module.iam.ecs_storefront_task_role_arn

  api_target_group_arn        = module.alb.api_target_group_arn
  storefront_target_group_arn = module.alb.storefront_target_group_arn
  dashboard_target_group_arn  = module.alb.dashboard_target_group_arn

  saleor_api_image       = var.saleor_api_image
  saleor_dashboard_image = var.saleor_dashboard_image
  storefront_image       = "${module.ecr.storefront_repository_url}:${var.storefront_image_tag}"

  ssm_path_prefix   = "/saleor/${var.environment}"
  media_bucket_name = module.s3.bucket_name
  media_cdn_url     = var.enable_cloudfront ? module.cloudfront[0].domain_name : ""
  allowed_hosts     = "api.${var.domain_name},localhost,${module.alb.alb_dns_name}"
  meilisearch_url   = var.meilisearch_enabled ? module.meilisearch[0].service_url : "http://meilisearch.${local.name_prefix}.local:7700"
  # Pass Meilisearch API key secret ARN to storefront for authenticated requests
  meilisearch_api_key_secret_arn = var.meilisearch_enabled ? aws_secretsmanager_secret.meilisearch_master_key[0].arn : ""

  api_desired_count        = var.api_desired_count
  api_cpu                  = var.api_cpu
  api_memory               = var.api_memory
  worker_desired_count     = var.worker_desired_count
  worker_cpu               = var.worker_cpu
  worker_memory            = var.worker_memory
  storefront_desired_count = var.storefront_desired_count
  storefront_cpu           = var.storefront_cpu
  storefront_memory        = var.storefront_memory

  enable_container_insights = var.enable_container_insights
  log_retention_days        = var.log_retention_days
  enable_https              = var.enable_https

  # ==========================================================================
  # Saleor Apps Configuration
  # ==========================================================================
  apps_enabled       = var.apps_enabled
  apps_desired_count = var.apps_desired_count
  apps_task_role_arn = module.iam.ecs_apps_task_role_arn

  apps = {
    stripe = {
      port             = 3001
      cpu              = 256
      memory           = 512
      base_path        = "/apps/stripe"
      image            = "${module.ecr.stripe_app_repository_url}:${var.stripe_app_image_tag}"
      target_group_arn = module.alb.stripe_app_target_group_arn
      secrets = [
        {
          name      = "STRIPE_SECRET_KEY"
          valueFrom = "/saleor/${var.environment}/apps/stripe/STRIPE_SECRET_KEY"
        },
        {
          name      = "STRIPE_WEBHOOK_SECRET"
          valueFrom = "/saleor/${var.environment}/apps/stripe/STRIPE_WEBHOOK_SECRET"
        }
      ]
      environment = {
        STRIPE_WEBHOOK_URL       = "${local.public_api_base_url}/apps/stripe/api/webhooks/stripe"
        APL                      = "dynamodb"
        DYNAMODB_MAIN_TABLE_NAME = module.dynamodb.stripe_app_table_name
        AWS_REGION               = var.aws_region
      }
    }

    inventory-ops = {
      port             = 3002
      cpu              = 256
      memory           = 512
      base_path        = "/apps/inventory"
      image            = "${module.ecr.inventory_ops_app_repository_url}:${var.inventory_ops_app_image_tag}"
      target_group_arn = module.alb.inventory_ops_app_target_group_arn
      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "/saleor/${var.environment}/apps/inventory-ops/DATABASE_URL"
        }
      ]
      environment = {
        APL       = "redis"
        REDIS_URL = module.elasticache.cache_url
      }
    }

    buylist = {
      port             = 3003
      cpu              = 256
      memory           = 512
      base_path        = "/apps/buylist"
      image            = "${module.ecr.buylist_app_repository_url}:${var.buylist_app_image_tag}"
      target_group_arn = module.alb.buylist_app_target_group_arn
      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "/saleor/${var.environment}/apps/inventory-ops/DATABASE_URL"
        }
      ]
      environment = {
        APL       = "redis"
        REDIS_URL = module.elasticache.cache_url
      }
    }

    pos = {
      port             = 3004
      cpu              = 256
      memory           = 512
      base_path        = "/apps/pos"
      image            = "${module.ecr.pos_app_repository_url}:${var.pos_app_image_tag}"
      target_group_arn = module.alb.pos_app_target_group_arn
      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "/saleor/${var.environment}/apps/inventory-ops/DATABASE_URL"
        }
      ]
      environment = {
        APL       = "redis"
        REDIS_URL = module.elasticache.cache_url
      }
    }
  }
}

# =============================================================================
# IAM Roles
# =============================================================================

module "iam" {
  source = "./modules/iam"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  github_org    = var.github_org
  github_repo   = var.github_repo
  github_branch = var.github_branch

  ecs_cluster_name = module.ecs.cluster_name
  ecs_cluster_arn  = module.ecs.cluster_arn
  media_bucket_arn = module.s3.bucket_arn
}

# =============================================================================
# ACM Certificate (optional)
# =============================================================================

resource "aws_acm_certificate" "main" {
  count = var.create_acm_certificate ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${local.name_prefix}-cert"
  }
}

resource "aws_acm_certificate_validation" "main" {
  count = var.create_acm_certificate && var.route53_zone_id != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.create_acm_certificate && var.route53_zone_id != "" ? {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

# =============================================================================
# Route53 Records (optional)
# =============================================================================

resource "aws_route53_record" "api" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "www" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "dashboard" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "dashboard.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "apps" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "apps.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

# =============================================================================
# Service Discovery Namespace (for internal service DNS)
# =============================================================================

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${local.name_prefix}.local"
  description = "Private DNS namespace for ${local.name_prefix} services"
  vpc         = local.vpc_id

  tags = {
    Name        = "${local.name_prefix}.local"
    Environment = var.environment
  }
}

# =============================================================================
# Meilisearch
# =============================================================================

# Master key stored in Secrets Manager (Council recommendation: better rotation & audit)
# Path matches IAM policy pattern: saleor/${environment}/*
resource "aws_secretsmanager_secret" "meilisearch_master_key" {
  count = var.meilisearch_enabled ? 1 : 0

  name        = "saleor/${var.environment}/meilisearch/master-key"
  description = "Meilisearch master key for API authentication"

  tags = {
    Name    = "${local.name_prefix}-meilisearch-master-key"
    Service = "meilisearch"
  }
}

resource "aws_secretsmanager_secret_version" "meilisearch_master_key" {
  count = var.meilisearch_enabled && var.meilisearch_master_key != "" ? 1 : 0

  secret_id     = aws_secretsmanager_secret.meilisearch_master_key[0].id
  secret_string = var.meilisearch_master_key
}

# Generate a random master key if not provided
resource "random_password" "meilisearch_master_key" {
  count = var.meilisearch_enabled && var.meilisearch_master_key == "" ? 1 : 0

  length  = 32
  special = false
}

resource "aws_secretsmanager_secret_version" "meilisearch_master_key_generated" {
  count = var.meilisearch_enabled && var.meilisearch_master_key == "" ? 1 : 0

  secret_id     = aws_secretsmanager_secret.meilisearch_master_key[0].id
  secret_string = random_password.meilisearch_master_key[0].result
}

module "meilisearch" {
  source = "./modules/meilisearch"
  count  = var.meilisearch_enabled ? 1 : 0

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  vpc_id             = local.vpc_id
  private_subnet_ids = local.private_subnet_ids

  cluster_id         = module.ecs.cluster_id
  execution_role_arn = module.iam.ecs_task_execution_role_arn
  task_role_arn      = module.iam.ecs_api_task_role_arn

  backend_security_group_id      = module.alb.ecs_backend_security_group_id
  service_discovery_namespace_id = aws_service_discovery_private_dns_namespace.main.id
  log_group_name                 = module.ecs.log_group_names["meilisearch"]

  master_key_secret_arn = aws_secretsmanager_secret.meilisearch_master_key[0].arn
  meilisearch_image     = var.meilisearch_image

  # Sizing: staging = 512 CPU / 1GB, production = 1024 CPU / 4GB (Council recommendation)
  cpu    = var.environment == "production" ? 1024 : 512
  memory = var.environment == "production" ? 4096 : 1024
}

# =============================================================================
# Meilisearch Sync Infrastructure (Phase 2: SNS → SQS → Worker)
# =============================================================================

# SNS Topic for Product Events
resource "aws_sns_topic" "product_events" {
  count = var.meilisearch_enabled ? 1 : 0

  name = "${local.name_prefix}-product-events"

  tags = {
    Name    = "${local.name_prefix}-product-events"
    Service = "meilisearch-sync"
  }
}

# SQS Dead Letter Queue for failed sync messages
resource "aws_sqs_queue" "meilisearch_sync_dlq" {
  count = var.meilisearch_enabled ? 1 : 0

  name                      = "${local.name_prefix}-meilisearch-sync-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name    = "${local.name_prefix}-meilisearch-sync-dlq"
    Service = "meilisearch-sync"
  }
}

# SQS Queue for Meilisearch Sync
resource "aws_sqs_queue" "meilisearch_sync" {
  count = var.meilisearch_enabled ? 1 : 0

  name                       = "${local.name_prefix}-meilisearch-sync"
  visibility_timeout_seconds = 300   # 5 minutes
  message_retention_seconds  = 86400 # 1 day
  receive_wait_time_seconds  = 20    # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.meilisearch_sync_dlq[0].arn
    maxReceiveCount     = 3
  })

  tags = {
    Name    = "${local.name_prefix}-meilisearch-sync"
    Service = "meilisearch-sync"
  }
}

# SQS Queue Policy - Allow SNS to send messages
resource "aws_sqs_queue_policy" "meilisearch_sync" {
  count = var.meilisearch_enabled ? 1 : 0

  queue_url = aws_sqs_queue.meilisearch_sync[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.meilisearch_sync[0].arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.product_events[0].arn
          }
        }
      }
    ]
  })
}

# SNS → SQS Subscription
resource "aws_sns_topic_subscription" "meilisearch_sync" {
  count = var.meilisearch_enabled ? 1 : 0

  topic_arn = aws_sns_topic.product_events[0].arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.meilisearch_sync[0].arn
}

# IAM Role for Meilisearch Sync Worker
resource "aws_iam_role" "meilisearch_sync_worker" {
  count = var.meilisearch_enabled ? 1 : 0

  name = "${local.name_prefix}-meilisearch-sync-worker"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name    = "${local.name_prefix}-meilisearch-sync-worker"
    Service = "meilisearch-sync"
  }
}

resource "aws_iam_role_policy" "meilisearch_sync_worker" {
  count = var.meilisearch_enabled ? 1 : 0

  name = "meilisearch-sync-permissions"
  role = aws_iam_role.meilisearch_sync_worker[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = aws_sqs_queue.meilisearch_sync[0].arn
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.meilisearch_master_key[0].arn
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# CloudWatch Log Group for Sync Worker
resource "aws_cloudwatch_log_group" "meilisearch_sync_worker" {
  count = var.meilisearch_enabled ? 1 : 0

  name              = "/ecs/${local.name_prefix}/meilisearch-sync-worker"
  retention_in_days = var.log_retention_days

  tags = {
    Name    = "${local.name_prefix}-meilisearch-sync-worker"
    Service = "meilisearch-sync"
  }
}

# Meilisearch Sync Worker Task Definition
resource "aws_ecs_task_definition" "meilisearch_sync_worker" {
  count = var.meilisearch_enabled ? 1 : 0

  family                   = "${local.name_prefix}-meilisearch-sync-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = module.iam.ecs_task_execution_role_arn
  task_role_arn            = aws_iam_role.meilisearch_sync_worker[0].arn

  container_definitions = jsonencode([
    {
      name      = "sync-worker"
      image     = "${module.ecr.repository_urls["price-sync-worker"]}:latest"
      essential = true

      environment = [
        { name = "MEILISEARCH_URL", value = module.meilisearch[0].service_url },
        { name = "SQS_QUEUE_URL", value = aws_sqs_queue.meilisearch_sync[0].url },
        { name = "SALEOR_API_URL", value = local.public_api_base_url },
        { name = "BATCH_SIZE", value = "25" }
      ]

      secrets = [
        {
          name      = "MEILISEARCH_API_KEY"
          valueFrom = aws_secretsmanager_secret.meilisearch_master_key[0].arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.meilisearch_sync_worker[0].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "worker"
        }
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-meilisearch-sync-worker"
    Service = "meilisearch-sync"
  }
}

# =============================================================================
# Meilisearch Scheduled Tasks (Phase 3: Catchup & Reconciliation)
# =============================================================================

# IAM Role for EventBridge to run ECS tasks
resource "aws_iam_role" "eventbridge_ecs" {
  count = var.meilisearch_enabled ? 1 : 0

  name = "${local.name_prefix}-eventbridge-ecs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name    = "${local.name_prefix}-eventbridge-ecs"
    Service = "meilisearch-sync"
  }
}

resource "aws_iam_role_policy" "eventbridge_ecs" {
  count = var.meilisearch_enabled ? 1 : 0

  name = "ecs-run-task"
  role = aws_iam_role.eventbridge_ecs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecs:RunTask"
        Resource = aws_ecs_task_definition.meilisearch_sync_worker[0].arn
        Condition = {
          ArnLike = {
            "ecs:cluster" = module.ecs.cluster_arn
          }
        }
      },
      {
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = [
          module.iam.ecs_task_execution_role_arn,
          aws_iam_role.meilisearch_sync_worker[0].arn
        ]
      }
    ]
  })
}

# 15-minute catchup sync (Council recommendation: MTG price sensitivity)
resource "aws_cloudwatch_event_rule" "meilisearch_catchup" {
  count = var.meilisearch_enabled ? 1 : 0

  name                = "${local.name_prefix}-meilisearch-catchup"
  description         = "Meilisearch 15-minute catchup sync for missed events"
  schedule_expression = "rate(15 minutes)"

  tags = {
    Name    = "${local.name_prefix}-meilisearch-catchup"
    Service = "meilisearch-sync"
  }
}

resource "aws_cloudwatch_event_target" "meilisearch_catchup" {
  count = var.meilisearch_enabled ? 1 : 0

  rule      = aws_cloudwatch_event_rule.meilisearch_catchup[0].name
  target_id = "meilisearch-catchup"
  arn       = module.ecs.cluster_arn
  role_arn  = aws_iam_role.eventbridge_ecs[0].arn

  ecs_target {
    task_definition_arn = aws_ecs_task_definition.meilisearch_sync_worker[0].arn
    task_count          = 1
    launch_type         = "FARGATE"
    platform_version    = "1.4.0"

    network_configuration {
      subnets          = local.private_subnet_ids
      security_groups  = [module.alb.ecs_backend_security_group_id]
      assign_public_ip = false
    }
  }

  input = jsonencode({
    containerOverrides = [{
      name = "sync-worker"
      environment = [
        { name = "SYNC_MODE", value = "delta" },
        { name = "DELTA_MINUTES", value = "20" }
      ]
    }]
  })
}

# Daily full reconciliation (6 AM UTC)
resource "aws_cloudwatch_event_rule" "meilisearch_reconcile" {
  count = var.meilisearch_enabled ? 1 : 0

  name                = "${local.name_prefix}-meilisearch-reconcile"
  description         = "Meilisearch daily full reconciliation"
  schedule_expression = "cron(0 6 * * ? *)"

  tags = {
    Name    = "${local.name_prefix}-meilisearch-reconcile"
    Service = "meilisearch-sync"
  }
}

resource "aws_cloudwatch_event_target" "meilisearch_reconcile" {
  count = var.meilisearch_enabled ? 1 : 0

  rule      = aws_cloudwatch_event_rule.meilisearch_reconcile[0].name
  target_id = "meilisearch-reconcile"
  arn       = module.ecs.cluster_arn
  role_arn  = aws_iam_role.eventbridge_ecs[0].arn

  ecs_target {
    task_definition_arn = aws_ecs_task_definition.meilisearch_sync_worker[0].arn
    task_count          = 1
    launch_type         = "FARGATE"
    platform_version    = "1.4.0"

    network_configuration {
      subnets          = local.private_subnet_ids
      security_groups  = [module.alb.ecs_backend_security_group_id]
      assign_public_ip = false
    }
  }

  input = jsonencode({
    containerOverrides = [{
      name = "sync-worker"
      environment = [
        { name = "SYNC_MODE", value = "full" }
      ]
    }]
  })
}

# =============================================================================
# Meilisearch Monitoring & Alerts (Phase 4)
# =============================================================================

# DLQ depth alarm - alert when sync messages fail repeatedly
resource "aws_cloudwatch_metric_alarm" "meilisearch_dlq_depth" {
  count = var.meilisearch_enabled && var.alert_sns_topic_arn != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-meilisearch-dlq-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 10
  alarm_description   = "Meilisearch sync DLQ has messages - sync failures occurring"

  dimensions = {
    QueueName = aws_sqs_queue.meilisearch_sync_dlq[0].name
  }

  alarm_actions = [var.alert_sns_topic_arn]
  ok_actions    = [var.alert_sns_topic_arn]

  tags = {
    Name    = "${local.name_prefix}-meilisearch-dlq-depth"
    Service = "meilisearch-sync"
  }
}

# Queue backlog alarm - alert when sync is falling behind
resource "aws_cloudwatch_metric_alarm" "meilisearch_queue_backlog" {
  count = var.meilisearch_enabled && var.alert_sns_topic_arn != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-meilisearch-queue-backlog"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 1000
  alarm_description   = "Meilisearch sync queue backlog > 1000 messages"

  dimensions = {
    QueueName = aws_sqs_queue.meilisearch_sync[0].name
  }

  alarm_actions = [var.alert_sns_topic_arn]
  ok_actions    = [var.alert_sns_topic_arn]

  tags = {
    Name    = "${local.name_prefix}-meilisearch-queue-backlog"
    Service = "meilisearch-sync"
  }
}

# Meilisearch service health - alert when no tasks running
resource "aws_cloudwatch_metric_alarm" "meilisearch_unhealthy" {
  count = var.meilisearch_enabled && var.alert_sns_topic_arn != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-meilisearch-unhealthy"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  alarm_description   = "Meilisearch service has no running tasks"

  dimensions = {
    ClusterName = module.ecs.cluster_name
    ServiceName = "meilisearch"
  }

  alarm_actions = [var.alert_sns_topic_arn]
  ok_actions    = [var.alert_sns_topic_arn]

  tags = {
    Name    = "${local.name_prefix}-meilisearch-unhealthy"
    Service = "meilisearch-sync"
  }
}
