# ECS Module
# Creates ECS Fargate cluster, services, and task definitions

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# =============================================================================
# ECS Cluster
# =============================================================================

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enabled" : "disabled"
  }

  tags = {
    Name = local.name_prefix
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# =============================================================================
# CloudWatch Log Groups
# =============================================================================

resource "aws_cloudwatch_log_group" "services" {
  for_each = toset([
    "api", "worker", "beat", "storefront", "dashboard",
    "stripe-app", "inventory-ops-app", "buylist-app", "pos-app", "mtg-import-app",
    "meilisearch", "migrate"
  ])

  name              = "/ecs/${local.name_prefix}/${each.key}"
  retention_in_days = var.log_retention_days

  tags = {
    Name    = "/ecs/${local.name_prefix}/${each.key}"
    Service = each.key
  }
}

# =============================================================================
# Task Definitions
# =============================================================================

# API Task Definition
resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.api_task_role_arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = var.saleor_api_image
      portMappings = [
        {
          containerPort = 8000
          protocol      = "tcp"
        }
      ]
      essential = true
      secrets = [
        {
          name      = "SECRET_KEY"
          valueFrom = "${var.ssm_path_prefix}/api/SECRET_KEY"
        },
        {
          name      = "DATABASE_URL"
          valueFrom = "${var.ssm_path_prefix}/api/DATABASE_URL"
        },
        {
          name      = "CELERY_BROKER_URL"
          valueFrom = "${var.ssm_path_prefix}/api/CELERY_BROKER_URL"
        },
        {
          name      = "RSA_PRIVATE_KEY"
          valueFrom = "${var.ssm_path_prefix}/api/RSA_PRIVATE_KEY"
        }
      ]
      environment = concat(
        [
          { name = "DEBUG", value = "false" },
          { name = "ALLOWED_HOSTS", value = var.allowed_hosts },
          { name = "ALLOWED_CLIENT_HOSTS", value = var.allowed_hosts },
          { name = "DEFAULT_CHANNEL_SLUG", value = "webstore" },
          # S3 Media Storage - AWS_MEDIA_BUCKET_NAME is required for product images
          { name = "AWS_STORAGE_BUCKET_NAME", value = var.media_bucket_name },
          { name = "AWS_MEDIA_BUCKET_NAME", value = var.media_bucket_name },
          { name = "AWS_S3_REGION_NAME", value = var.aws_region },
          { name = "DASHBOARD_URL", value = "${var.public_dashboard_base_url}/" },
          { name = "ENABLE_ACCOUNT_CONFIRMATION_BY_EMAIL", value = "false" },
          # PUBLIC_URL tells Saleor its own public-facing URL (critical for app installation)
          { name = "PUBLIC_URL", value = "${var.public_api_base_url}/" }
        ],
        # CloudFront CDN for media - sets custom domain for media URLs in GraphQL responses
        var.media_cdn_url != "" ? [
          { name = "AWS_MEDIA_CUSTOM_DOMAIN", value = var.media_cdn_url }
        ] : []
      )
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["api"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8000/health/')\" || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 120
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-api"
    Service = "api"
  }
}

# Worker Task Definition
# Note: Celery beat (-B) runs in a single worker to prevent duplicate tasks
resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name_prefix}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.worker_task_role_arn

  container_definitions = jsonencode([
    {
      name  = "worker"
      image = var.saleor_api_image
      command = [
        "celery", "-A", "saleor", "--app=saleor.celeryconf:app",
        "worker", "--loglevel=info",
        "--concurrency=2"
      ]
      essential = true
      secrets = [
        {
          name      = "SECRET_KEY"
          valueFrom = "${var.ssm_path_prefix}/api/SECRET_KEY"
        },
        {
          name      = "DATABASE_URL"
          valueFrom = "${var.ssm_path_prefix}/api/DATABASE_URL"
        },
        {
          name      = "CELERY_BROKER_URL"
          valueFrom = "${var.ssm_path_prefix}/api/CELERY_BROKER_URL"
        },
        {
          name      = "RSA_PRIVATE_KEY"
          valueFrom = "${var.ssm_path_prefix}/api/RSA_PRIVATE_KEY"
        }
      ]
      environment = concat(
        [
          { name = "DEBUG", value = "false" },
          { name = "ALLOWED_HOSTS", value = var.allowed_hosts },
          { name = "ALLOWED_CLIENT_HOSTS", value = var.allowed_hosts },
          # S3 Media Storage - AWS_MEDIA_BUCKET_NAME is required for product images
          { name = "AWS_STORAGE_BUCKET_NAME", value = var.media_bucket_name },
          { name = "AWS_MEDIA_BUCKET_NAME", value = var.media_bucket_name },
          { name = "AWS_S3_REGION_NAME", value = var.aws_region },
          { name = "PUBLIC_URL", value = "${var.public_api_base_url}/" }
        ],
        # CloudFront CDN for media
        var.media_cdn_url != "" ? [
          { name = "AWS_MEDIA_CUSTOM_DOMAIN", value = var.media_cdn_url }
        ] : []
      )
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["worker"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-worker"
    Service = "worker"
  }
}

# =============================================================================
# Celery Beat Task Definition (P4-2: Separate scheduler for reliability)
# =============================================================================

resource "aws_ecs_task_definition" "beat" {
  family                   = "${local.name_prefix}-beat"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.worker_task_role_arn

  container_definitions = jsonencode([
    {
      name  = "beat"
      image = var.saleor_api_image
      command = [
        "celery", "-A", "saleor", "--app=saleor.celeryconf:app",
        "beat", "--loglevel=info",
        "--scheduler=django_celery_beat.schedulers:DatabaseScheduler"
      ]
      essential = true
      secrets = [
        {
          name      = "SECRET_KEY"
          valueFrom = "${var.ssm_path_prefix}/api/SECRET_KEY"
        },
        {
          name      = "DATABASE_URL"
          valueFrom = "${var.ssm_path_prefix}/api/DATABASE_URL"
        },
        {
          name      = "CELERY_BROKER_URL"
          valueFrom = "${var.ssm_path_prefix}/api/CELERY_BROKER_URL"
        }
      ]
      environment = [
        { name = "DEBUG", value = "false" },
        { name = "ALLOWED_HOSTS", value = var.allowed_hosts }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["beat"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-beat"
    Service = "beat"
  }
}

# Storefront Task Definition
resource "aws_ecs_task_definition" "storefront" {
  family                   = "${local.name_prefix}-storefront"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.storefront_cpu
  memory                   = var.storefront_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.storefront_task_role_arn

  container_definitions = jsonencode([
    {
      name  = "storefront"
      image = var.storefront_image
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]
      essential = true
      environment = [
        { name = "HOSTNAME", value = "0.0.0.0" },
        { name = "PORT", value = "3000" },
        { name = "NEXT_PUBLIC_SALEOR_API_URL", value = "${var.public_api_base_url}/graphql/" },
        { name = "SALEOR_API_URL", value = "${var.public_api_base_url}/graphql/" },
        { name = "NEXT_PUBLIC_STOREFRONT_URL", value = var.public_storefront_base_url },
        { name = "NEXT_PUBLIC_DEFAULT_CHANNEL", value = "webstore" },
        { name = "MEILISEARCH_URL", value = var.meilisearch_url },
        # P4-1: Enable Next.js image optimization in production
        { name = "NEXT_IMAGE_UNOPTIMIZED", value = "false" },
        # Disable upgrade-insecure-requests CSP for HTTP-only environments
        { name = "ENABLE_HTTPS", value = var.enable_https ? "true" : "false" }
      ]
      # Meilisearch API key secret (for staging/production auth)
      secrets = var.meilisearch_api_key_secret_arn != "" ? [
        {
          name      = "MEILISEARCH_API_KEY"
          valueFrom = var.meilisearch_api_key_secret_arn
        }
      ] : []
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["storefront"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      healthCheck = {
        # Use wget instead of curl - Alpine images don't have curl installed
        command     = ["CMD-SHELL", "wget -q --spider http://localhost:3000/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-storefront"
    Service = "storefront"
  }
}

# Dashboard Task Definition
resource "aws_ecs_task_definition" "dashboard" {
  family                   = "${local.name_prefix}-dashboard"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = var.task_execution_role_arn

  container_definitions = jsonencode([
    {
      name  = "dashboard"
      image = var.saleor_dashboard_image
      portMappings = [
        {
          containerPort = 80
          protocol      = "tcp"
        }
      ]
      essential = true
      environment = [
        { name = "API_URL", value = "${var.public_api_base_url}/graphql/" },
        # Disable Apps Marketplace (Explore) feature - not available for self-hosted Saleor
        # Setting to "disabled" prevents fallback to API_URL
        { name = "APPS_MARKETPLACE_API_URL", value = "disabled" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["dashboard"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-dashboard"
    Service = "dashboard"
  }
}

# =============================================================================
# ECS Services
# =============================================================================

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_backend_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.api_target_group_arn
    container_name   = "api"
    container_port   = 8000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-api"
    Service = "api"
  }

  lifecycle {
    ignore_changes = [task_definition] # Allow CI/CD to update
  }
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_backend_security_group_id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name    = "${local.name_prefix}-worker"
    Service = "worker"
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}

# Celery Beat Service (P4-2: Dedicated scheduler, always desired_count = 1)
resource "aws_ecs_service" "beat" {
  name            = "beat"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.beat.arn
  desired_count   = 1 # Must be exactly 1 to avoid duplicate task scheduling
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_backend_security_group_id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name    = "${local.name_prefix}-beat"
    Service = "beat"
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_ecs_service" "storefront" {
  name            = "storefront"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.storefront.arn
  desired_count   = var.storefront_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_frontend_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.storefront_target_group_arn
    container_name   = "storefront"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name    = "${local.name_prefix}-storefront"
    Service = "storefront"
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_ecs_service" "dashboard" {
  name            = "dashboard"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.dashboard.arn
  desired_count   = var.dashboard_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_frontend_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.dashboard_target_group_arn
    container_name   = "dashboard"
    container_port   = 80
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name    = "${local.name_prefix}-dashboard"
    Service = "dashboard"
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}

# =============================================================================
# Migration Task Definition (one-off task for deployments)
# =============================================================================

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name_prefix}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.api_task_role_arn

  container_definitions = jsonencode([
    {
      name      = "migrate"
      image     = var.saleor_api_image
      command   = ["python", "manage.py", "migrate", "--noinput"]
      essential = true
      secrets = [
        {
          name      = "SECRET_KEY"
          valueFrom = "${var.ssm_path_prefix}/api/SECRET_KEY"
        },
        {
          name      = "DATABASE_URL"
          valueFrom = "${var.ssm_path_prefix}/api/DATABASE_URL"
        },
        {
          name      = "RSA_PRIVATE_KEY"
          valueFrom = "${var.ssm_path_prefix}/api/RSA_PRIVATE_KEY"
        }
      ]
      environment = [
        { name = "DEBUG", value = "false" },
        { name = "ALLOWED_HOSTS", value = var.allowed_hosts },
        { name = "ALLOWED_CLIENT_HOSTS", value = var.allowed_hosts },
        { name = "DEFAULT_CHANNEL_SLUG", value = "webstore" },
        # S3 Media Storage
        { name = "AWS_STORAGE_BUCKET_NAME", value = var.media_bucket_name },
        { name = "AWS_MEDIA_BUCKET_NAME", value = var.media_bucket_name },
        { name = "AWS_S3_REGION_NAME", value = var.aws_region }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["migrate"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-migrate"
    Service = "migrate"
  }
}

# =============================================================================
# Saleor Apps - Task Definitions (map-driven)
# =============================================================================

resource "aws_ecs_task_definition" "apps" {
  for_each = var.apps_enabled ? var.apps : {}

  family                   = "${local.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.apps_task_role_arn != "" ? var.apps_task_role_arn : null

  container_definitions = jsonencode([
    {
      name  = each.key
      image = each.value.image
      portMappings = [
        {
          containerPort = each.value.port
          protocol      = "tcp"
        }
      ]
      essential = true
      secrets = concat(
        # Default secrets all apps need
        [
          {
            name      = "SECRET_KEY"
            valueFrom = "${var.ssm_path_prefix}/apps/SECRET_KEY"
          }
        ],
        # App-specific secrets
        each.value.secrets
      )
      environment = concat(
        # Base environment for all apps
        [
          { name = "NODE_ENV", value = "production" },
          { name = "PORT", value = tostring(each.value.port) },
          { name = "BASE_PATH", value = each.value.base_path },
          { name = "NEXT_PUBLIC_BASE_PATH", value = each.value.base_path },
          { name = "SALEOR_API_URL", value = "${var.public_api_base_url}/graphql/" },
          { name = "APP_API_BASE_URL", value = "${var.public_api_base_url}${each.value.base_path}" },
          { name = "APP_IFRAME_BASE_URL", value = "${var.public_api_base_url}${each.value.base_path}" },
          { name = "APP_LOG_LEVEL", value = "info" }
        ],
        # App-specific environment variables (can override APL via environment config)
        [for k, v in each.value.environment : { name = k, value = v }]
      )
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["${each.key}-app"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      healthCheck = {
        # Use wget instead of curl - Alpine images don't have curl installed
        command     = ["CMD-SHELL", "wget -q --spider http://localhost:${each.value.port}${each.value.base_path}/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-${each.key}"
    Service = each.key
  }
}

# =============================================================================
# Saleor Apps - ECS Services (map-driven)
# =============================================================================

resource "aws_ecs_service" "apps" {
  for_each = var.apps_enabled ? var.apps : {}

  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.apps[each.key].arn
  desired_count   = coalesce(each.value.desired_count, var.apps_desired_count)
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_backend_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = each.value.target_group_arn
    container_name   = each.key
    container_port   = each.value.port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-${each.key}"
    Service = each.key
  }

  lifecycle {
    ignore_changes = [task_definition] # Allow CI/CD to update
  }
}

# =============================================================================
# Auto-Scaling for API Service
# =============================================================================

resource "aws_appautoscaling_target" "api" {
  count = var.enable_autoscaling ? 1 : 0

  max_capacity       = var.api_max_capacity
  min_capacity       = var.api_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  count = var.enable_autoscaling ? 1 : 0

  name               = "${local.name_prefix}-api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api[0].resource_id
  scalable_dimension = aws_appautoscaling_target.api[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.api[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# =============================================================================
# Auto-Scaling for Storefront Service
# =============================================================================

resource "aws_appautoscaling_target" "storefront" {
  count = var.enable_autoscaling ? 1 : 0

  max_capacity       = var.storefront_max_capacity
  min_capacity       = var.storefront_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.storefront.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "storefront_cpu" {
  count = var.enable_autoscaling ? 1 : 0

  name               = "${local.name_prefix}-storefront-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.storefront[0].resource_id
  scalable_dimension = aws_appautoscaling_target.storefront[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.storefront[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# =============================================================================
# Meilisearch Service Discovery and ECS Service
# =============================================================================
# NOTE: Meilisearch is now managed via the dedicated meilisearch module.
# See: infra/terraform/modules/meilisearch/
#
# The meilisearch module creates:
# - EFS file system for persistent data
# - ECS task definition and service
# - Service Discovery service (uses namespace from root module)
#
# The CloudWatch log group for Meilisearch IS managed by Terraform via the
# services log group loop above.
#
# Security group rules for port 7700 are managed in the ALB module's
# ecs_backend security group.
