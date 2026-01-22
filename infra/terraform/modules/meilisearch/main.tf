# Meilisearch Module
# Creates EFS-backed Meilisearch service with Service Discovery
#
# Council Decision (2026-01-21):
# - EFS for Fargate-compatible persistent storage
# - Service Discovery for internal DNS resolution
# - Secrets Manager for MEILI_MASTER_KEY

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# =============================================================================
# EFS File System for Meilisearch Data Persistence
# =============================================================================

resource "aws_efs_file_system" "meilisearch" {
  creation_token = "${local.name_prefix}-meilisearch"
  encrypted      = true

  # Transition to Infrequent Access after 30 days (cost optimization)
  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }

  # Enable automatic backups
  lifecycle_policy {
    transition_to_primary_storage_class = "AFTER_1_ACCESS"
  }

  tags = {
    Name        = "${local.name_prefix}-meilisearch-data"
    Service     = "meilisearch"
    Environment = var.environment
  }
}

# Enable EFS backup policy
resource "aws_efs_backup_policy" "meilisearch" {
  file_system_id = aws_efs_file_system.meilisearch.id

  backup_policy {
    status = "ENABLED"
  }
}

# Mount targets in each private subnet for HA
resource "aws_efs_mount_target" "meilisearch" {
  count = length(var.private_subnet_ids)

  file_system_id  = aws_efs_file_system.meilisearch.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [aws_security_group.efs.id]
}

# Access point with proper POSIX permissions for Meilisearch
resource "aws_efs_access_point" "meilisearch" {
  file_system_id = aws_efs_file_system.meilisearch.id

  posix_user {
    gid = 1000
    uid = 1000
  }

  root_directory {
    path = "/meili_data"
    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "755"
    }
  }

  tags = {
    Name    = "${local.name_prefix}-meilisearch-ap"
    Service = "meilisearch"
  }
}

# =============================================================================
# Security Group for EFS
# =============================================================================

resource "aws_security_group" "efs" {
  name        = "${local.name_prefix}-meilisearch-efs"
  description = "Security group for Meilisearch EFS mount targets"
  vpc_id      = var.vpc_id

  ingress {
    description     = "NFS from ECS backend tasks"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [var.backend_security_group_id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${local.name_prefix}-meilisearch-efs"
    Service = "meilisearch"
  }
}

# =============================================================================
# ECS Task Definition
# =============================================================================

resource "aws_ecs_task_definition" "meilisearch" {
  family                   = "${local.name_prefix}-meilisearch"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "meilisearch"
      image     = var.meilisearch_image
      essential = true

      portMappings = [
        {
          containerPort = 7700
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "MEILI_ENV"
          value = var.environment == "production" ? "production" : "development"
        },
        {
          name  = "MEILI_NO_ANALYTICS"
          value = "true"
        },
        {
          name  = "MEILI_HTTP_ADDR"
          value = "0.0.0.0:7700"
        },
        {
          name  = "MEILI_DB_PATH"
          value = "/meili_data/data.ms"
        },
        {
          name  = "MEILI_DUMP_DIR"
          value = "/meili_data/dumps"
        },
        {
          name  = "MEILI_SNAPSHOT_DIR"
          value = "/meili_data/snapshots"
        }
      ]

      secrets = var.master_key_secret_arn != "" ? [
        {
          name      = "MEILI_MASTER_KEY"
          valueFrom = var.master_key_secret_arn
        }
      ] : []

      mountPoints = [
        {
          sourceVolume  = "meili-data"
          containerPath = "/meili_data"
          readOnly      = false
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.log_group_name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "meilisearch"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget -q --spider http://localhost:7700/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  volume {
    name = "meili-data"

    efs_volume_configuration {
      file_system_id          = aws_efs_file_system.meilisearch.id
      transit_encryption      = "ENABLED"
      transit_encryption_port = 2049
      authorization_config {
        access_point_id = aws_efs_access_point.meilisearch.id
        iam             = "ENABLED"
      }
    }
  }

  tags = {
    Name    = "${local.name_prefix}-meilisearch"
    Service = "meilisearch"
  }
}

# =============================================================================
# Service Discovery Service
# =============================================================================

resource "aws_service_discovery_service" "meilisearch" {
  name = "meilisearch"

  dns_config {
    namespace_id = var.service_discovery_namespace_id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = {
    Name    = "${local.name_prefix}-meilisearch"
    Service = "meilisearch"
  }
}

# =============================================================================
# ECS Service
# =============================================================================

resource "aws_ecs_service" "meilisearch" {
  name            = "meilisearch"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.meilisearch.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # Platform version 1.4.0+ required for EFS
  platform_version = "1.4.0"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.backend_security_group_id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.meilisearch.arn
  }

  # Ensure 100% availability during deployments
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Wait for EFS mount targets to be available
  depends_on = [aws_efs_mount_target.meilisearch]

  tags = {
    Name    = "${local.name_prefix}-meilisearch"
    Service = "meilisearch"
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}
