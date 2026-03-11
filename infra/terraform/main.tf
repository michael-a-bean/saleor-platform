# Root Module - Saleor Platform Infrastructure
# Composes all modules for AWS ECS/Fargate deployment

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id

  # Standard tags for drift detection and resource tracking
  # All resources should include these tags
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
    Repository  = "saleor-platform"
  }

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

  # Apps base URL: where Saleor apps are externally reachable
  # Used for APP_API_BASE_URL and APP_IFRAME_BASE_URL in app containers
  public_apps_base_url = "${local.url_scheme}://apps.${var.domain_name}"

  # Alert SNS topic ARN (empty if alerting disabled)
  alert_sns_topic_arn = var.alert_email != "" ? aws_sns_topic.alerts[0].arn : ""
}

# =============================================================================
# VPC (or use existing)
# =============================================================================

module "vpc" {
  source = "./modules/vpc"
  count  = var.create_vpc ? 1 : 0

  project_name               = var.project_name
  environment                = var.environment
  aws_region                 = var.aws_region
  vpc_cidr                   = var.vpc_cidr
  availability_zones         = var.availability_zones
  single_nat_gateway         = var.environment == "staging"
  use_fck_nat                = var.use_fck_nat
  fck_nat_instance_type      = var.fck_nat_instance_type
  create_vpc_endpoints       = true
  create_interface_endpoints = var.create_interface_endpoints
  tags                       = local.common_tags
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
    "${local.url_scheme}://www.${var.domain_name}",
    "${local.url_scheme}://api.${var.domain_name}",
    "${local.url_scheme}://dashboard.${var.domain_name}"
  ]

  # CloudFront integration
  cloudfront_distribution_arn   = var.enable_cloudfront ? module.cloudfront[0].distribution_arn : ""
  enable_cloudfront_only_access = var.enable_cloudfront && var.cloudfront_only_media_access

  # Allow terraform destroy without emptying bucket first (staging only)
  force_destroy = var.environment == "staging"
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
  enable_https      = var.create_acm_certificate

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
# Alerting (SNS)
# =============================================================================

resource "aws_sns_topic" "alerts" {
  count = var.alert_email != "" ? 1 : 0

  name = "${local.name_prefix}-alerts"
  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "alert_email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# =============================================================================
# CloudWatch Alarms
# =============================================================================

module "cloudwatch_alarms" {
  source = "./modules/cloudwatch-alarms"
  count  = var.alert_email != "" ? 1 : 0

  name_prefix            = local.name_prefix
  sns_topic_arn          = local.alert_sns_topic_arn
  alb_arn_suffix         = module.alb.alb_arn_suffix
  ecs_cluster_name       = local.name_prefix
  ecs_service_names      = ["api", "worker"]
  rds_instance_id        = module.rds.db_instance_id
  elasticache_cluster_id = "${local.name_prefix}-cache-001"

  tags = local.common_tags
}

# =============================================================================
# Grafana Cloud CloudWatch Integration
# =============================================================================

module "grafana_cloudwatch" {
  source = "./modules/grafana-cloudwatch"
  count  = var.grafana_aws_account_id != "" && var.grafana_external_id != "" ? 1 : 0

  project_name           = var.project_name
  environment            = var.environment
  grafana_aws_account_id = var.grafana_aws_account_id
  grafana_external_id    = var.grafana_external_id
  tags                   = local.common_tags
}

# =============================================================================
# Grafana Cloud Dashboards
# =============================================================================

module "grafana_dashboards" {
  source = "./modules/grafana-dashboards"
  count  = var.grafana_api_token != "" ? 1 : 0

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  cloudwatch_role_arn = var.grafana_aws_account_id != "" && var.grafana_external_id != "" ? module.grafana_cloudwatch[0].iam_role_arn : ""

  ecs_cluster_name = local.name_prefix
  ecs_service_names = concat(
    ["api", "worker", "beat", "storefront", "dashboard"],
    var.apps_enabled ? ["stripe", "inventory-ops", "pos"] : [],
    var.meilisearch_enabled ? ["meilisearch"] : []
  )

  rds_identifier         = "${local.name_prefix}-saleor"
  elasticache_cluster_id = "${local.name_prefix}-cache-001"
  alb_arn_suffix         = module.alb.alb_arn_suffix
  fck_nat_instance_name  = var.use_fck_nat ? "${local.name_prefix}-fck-nat" : ""

  tempo_datasource_uid      = var.tempo_datasource_uid
  prometheus_datasource_uid = var.prometheus_datasource_uid
}

# =============================================================================
# CloudFront CDN for Storefront (ALB origin)
# =============================================================================

# ACM certificate in us-east-1 (required by CloudFront).
# This duplicates the domain/SANs of aws_acm_certificate.main (us-west-1 for ALB)
# because CloudFront requires certs in us-east-1. DNS validation records overlap
# but allow_overwrite = true handles this safely.
resource "aws_acm_certificate" "storefront_cdn" {
  count    = var.enable_storefront_cdn ? 1 : 0
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name    = "${local.name_prefix}-storefront-cdn-cert"
    Service = "storefront"
  }
}

resource "aws_route53_record" "storefront_cdn_cert_validation" {
  for_each = var.enable_storefront_cdn && var.route53_zone_id != "" ? {
    for dvo in aws_acm_certificate.storefront_cdn[0].domain_validation_options : dvo.domain_name => {
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
  zone_id         = local.zone_id
}

resource "aws_acm_certificate_validation" "storefront_cdn" {
  count    = var.enable_storefront_cdn && var.route53_zone_id != "" ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.storefront_cdn[0].arn
  validation_record_fqdns = [for record in aws_route53_record.storefront_cdn_cert_validation : record.fqdn]
}

module "cloudfront_storefront" {
  source = "./modules/cloudfront-storefront"
  count  = var.enable_storefront_cdn ? 1 : 0

  project_name = var.project_name
  environment  = var.environment

  alb_dns_name        = module.alb.alb_dns_name
  domain_names        = [var.domain_name, "www.${var.domain_name}"]
  acm_certificate_arn = aws_acm_certificate.storefront_cdn[0].arn
  price_class         = var.cloudfront_price_class
  tags                = local.common_tags

  depends_on = [aws_acm_certificate_validation.storefront_cdn]
}

# =============================================================================
# ECS Cluster and Services
# =============================================================================

module "ecs" {
  source = "./modules/ecs"

  project_name     = var.project_name
  environment      = var.environment
  aws_region       = var.aws_region
  domain_name      = var.domain_name
  use_fargate_spot = var.use_fargate_spot

  # Public URLs for applications (supports overrides for staging without DNS)
  public_api_base_url        = local.public_api_base_url
  public_storefront_base_url = local.public_storefront_base_url
  public_dashboard_base_url  = local.public_dashboard_base_url
  public_apps_base_url       = local.public_apps_base_url

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
  # Saleor's AWS_MEDIA_CUSTOM_DOMAIN expects domain only (no https://), not full URL
  media_cdn_url   = var.enable_cloudfront ? module.cloudfront[0].domain_name : ""
  allowed_hosts   = "api.${var.domain_name},localhost,${module.alb.alb_dns_name}"
  meilisearch_url = var.meilisearch_enabled ? module.meilisearch[0].service_url : "http://meilisearch.${local.name_prefix}.local:7700"
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
  dashboard_desired_count  = var.dashboard_desired_count
  dashboard_min_capacity   = var.dashboard_min_capacity
  dashboard_max_capacity   = var.dashboard_max_capacity

  enable_container_insights = var.enable_container_insights
  log_retention_days        = var.log_retention_days
  enable_https              = var.enable_https

  # OpenTelemetry → Grafana Cloud
  otel_exporter_endpoint = var.otel_exporter_endpoint

  # Alerting
  enable_alerting     = var.alert_email != ""
  alert_sns_topic_arn = local.alert_sns_topic_arn

  # Auto-Scaling & Scheduled Scaling
  enable_autoscaling         = var.enable_autoscaling
  enable_scheduled_scaling   = var.enable_scheduled_scaling
  scale_down_schedule        = var.scale_down_schedule
  scale_up_schedule          = var.scale_up_schedule
  scheduled_scaling_timezone = var.scheduled_scaling_timezone
  api_min_capacity           = var.api_min_capacity
  api_max_capacity           = var.api_max_capacity
  worker_min_capacity        = var.worker_min_capacity
  worker_max_capacity        = var.worker_max_capacity
  storefront_min_capacity    = var.storefront_min_capacity
  storefront_max_capacity    = var.storefront_max_capacity
  beat_min_capacity          = var.beat_min_capacity
  beat_max_capacity          = var.beat_max_capacity
  apps_scaling_min_capacity  = var.apps_scaling_min_capacity
  apps_scaling_max_capacity  = var.apps_scaling_max_capacity

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
        STRIPE_WEBHOOK_URL       = "${local.public_apps_base_url}/apps/stripe/api/webhooks/stripe"
        APL                      = "dynamodb"
        DYNAMODB_MAIN_TABLE_NAME = module.dynamodb.stripe_app_table_name
        AWS_REGION               = var.aws_region
      }
    }

    inventory-ops = {
      port             = 3002
      cpu              = 256
      memory           = 1024  # Bumped: now handles inventory-ops + buylist + mtg-import workloads
      base_path        = "/apps/inventory"
      image            = "${module.ecr.inventory_ops_app_repository_url}:${var.inventory_ops_app_image_tag}"
      target_group_arn = module.alb.inventory_ops_app_target_group_arn
      secrets = concat(
        [
          {
            name      = "DATABASE_URL"
            valueFrom = "/saleor/${var.environment}/apps/inventory-ops/DATABASE_URL"
          },
          {
            name      = "CRON_SECRET"
            valueFrom = "/saleor/${var.environment}/apps/inventory-ops/CRON_SECRET"
          }
        ],
        var.meilisearch_enabled ? [
          {
            name      = "MEILISEARCH_API_KEY"
            valueFrom = aws_secretsmanager_secret.meilisearch_master_key[0].arn
          }
        ] : []
      )
      environment = {
        APL                = "redis"
        REDIS_URL          = module.elasticache.cache_url
        MEILISEARCH_URL    = var.meilisearch_enabled ? module.meilisearch[0].service_url : "http://meilisearch.${local.name_prefix}.local:7700"
        SCRYFALL_CACHE_DIR = "/tmp/scryfall-cache"
        DEFAULT_CURRENCY   = "USD"
        IMPORT_BATCH_SIZE  = "50"
        IMPORT_CONCURRENCY = "5"
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
# SSM Parameters (Secrets)
# =============================================================================

module "secrets" {
  source = "./modules/secrets"

  project_name = var.project_name
  environment  = var.environment

  rds_endpoint      = module.rds.db_instance_endpoint
  rds_password      = random_password.db_master.result
  celery_broker_url = module.elasticache.broker_url

  stripe_secret_key     = var.stripe_secret_key
  stripe_webhook_secret = var.stripe_webhook_secret
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
  zone_id         = local.zone_id
}

# =============================================================================
# Route53 Hosted Zone (data source — zone is shared across environments)
# =============================================================================

data "aws_route53_zone" "main" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
}

locals {
  zone_id = var.route53_zone_id != "" ? data.aws_route53_zone.main[0].zone_id : ""
}

# =============================================================================
# Route53 Records (optional)
# =============================================================================

resource "aws_route53_record" "api" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = local.zone_id
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

  zone_id = local.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.enable_storefront_cdn ? module.cloudfront_storefront[0].domain_name : module.alb.alb_dns_name
    zone_id                = var.enable_storefront_cdn ? module.cloudfront_storefront[0].hosted_zone_id : module.alb.alb_zone_id
    evaluate_target_health = !var.enable_storefront_cdn
  }
}

resource "aws_route53_record" "dashboard" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = local.zone_id
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

  zone_id = local.zone_id
  name    = "apps.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

# Bare domain (e.g., staging.michaelbean.org) points to storefront
# When CDN is enabled, routes through CloudFront for edge caching
resource "aws_route53_record" "apex" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = local.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.enable_storefront_cdn ? module.cloudfront_storefront[0].domain_name : module.alb.alb_dns_name
    zone_id                = var.enable_storefront_cdn ? module.cloudfront_storefront[0].hosted_zone_id : module.alb.alb_zone_id
    evaluate_target_health = !var.enable_storefront_cdn
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

  # Staging: immediate deletion so terraform destroy+apply doesn't hit
  # "secret already scheduled for deletion" (default 30-day recovery window).
  # Production keeps the 30-day safety net.
  recovery_window_in_days = var.environment == "staging" ? 0 : 30

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

  project_name     = var.project_name
  environment      = var.environment
  aws_region       = var.aws_region
  use_fargate_spot = var.use_fargate_spot

  vpc_id             = local.vpc_id
  private_subnet_ids = local.private_subnet_ids

  cluster_id         = module.ecs.cluster_id
  cluster_name       = module.ecs.cluster_name
  execution_role_arn = module.iam.ecs_task_execution_role_arn
  task_role_arn      = module.iam.ecs_api_task_role_arn

  backend_security_group_id      = module.alb.ecs_backend_security_group_id
  service_discovery_namespace_id = aws_service_discovery_private_dns_namespace.main.id
  log_group_name                 = module.ecs.log_group_names["meilisearch"]

  master_key_secret_arn = aws_secretsmanager_secret.meilisearch_master_key[0].arn
  meilisearch_image     = var.meilisearch_image

  # Sizing: staging = 1024 CPU / 2GB (filter rebuilds on 76k docs need headroom), production = 1024 CPU / 4GB
  cpu    = var.environment == "production" ? 1024 : 1024
  memory = var.environment == "production" ? 4096 : 2048

  # Scheduled scaling (shares settings with ECS module)
  enable_scheduled_scaling   = var.enable_scheduled_scaling
  scale_down_schedule        = var.scale_down_schedule
  scale_up_schedule          = var.scale_up_schedule
  scheduled_scaling_timezone = var.scheduled_scaling_timezone
}

