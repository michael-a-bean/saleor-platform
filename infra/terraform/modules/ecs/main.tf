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
    "api", "worker", "storefront", "dashboard",
    "stripe-app", "inventory-ops-app", "buylist-app", "pos-app",
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
      environment = [
        { name = "DEBUG", value = "false" },
        { name = "ALLOWED_HOSTS", value = var.allowed_hosts },
        { name = "ALLOWED_CLIENT_HOSTS", value = var.allowed_hosts },
        { name = "DEFAULT_CHANNEL_SLUG", value = "webstore" },
        { name = "AWS_STORAGE_BUCKET_NAME", value = var.media_bucket_name },
        { name = "AWS_S3_REGION_NAME", value = var.aws_region },
        { name = "DASHBOARD_URL", value = "${var.public_dashboard_base_url}/" },
        { name = "ENABLE_ACCOUNT_CONFIRMATION_BY_EMAIL", value = "false" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["api"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8000/health/ || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
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
        "worker", "--loglevel=info", "-B", # -B only for first worker
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
      environment = [
        { name = "DEBUG", value = "false" },
        { name = "ALLOWED_HOSTS", value = var.allowed_hosts },
        { name = "ALLOWED_CLIENT_HOSTS", value = var.allowed_hosts },
        { name = "AWS_STORAGE_BUCKET_NAME", value = var.media_bucket_name },
        { name = "AWS_S3_REGION_NAME", value = var.aws_region }
      ]
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
        { name = "MEILISEARCH_URL", value = var.meilisearch_url }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["storefront"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"]
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
        { name = "API_URL", value = "${var.public_api_base_url}/graphql/" }
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
  desired_count   = 1
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
        { name = "AWS_STORAGE_BUCKET_NAME", value = var.media_bucket_name },
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
          # APL (App Persistence Layer) - use file-based for simplicity
          { name = "APL", value = "file" },
          { name = "APP_LOG_LEVEL", value = "info" }
        ],
        # App-specific environment variables
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
        command     = ["CMD-SHELL", "curl -f http://localhost:${each.value.port}${each.value.base_path}/api/health || exit 1"]
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
  desired_count   = var.apps_desired_count
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
