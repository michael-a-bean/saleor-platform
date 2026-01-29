# Meilisearch Terraform Implementation Plan

**Created:** 2026-01-21
**Status:** APPROVED (Council Complete)
**Source:** Council debate synthesis

---

## Executive Summary

Implement Meilisearch as a fully Terraform-managed service with three-tier sync architecture:
1. **Core Infrastructure**: ECS Fargate + EFS + Cloud Map
2. **Event-Driven Sync**: SNS → SQS → ECS Worker
3. **Safety Nets**: 15-min catchup job + daily reconciliation

---

## Architecture Decisions (from Council)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | **EFS** | Fargate compatible, HA, crash-resilient |
| Event Routing | **SNS → SQS** | Extensibility for future consumers |
| Worker Type | **ECS Fargate** | Connection pooling, cost efficiency |
| Secrets | **Secrets Manager** | Rotation, audit trails |
| Catchup | **15-minute** | MTG price sensitivity |
| Deployment | **Snapshots** | Cost-effective over blue-green |
| Batch Size | **25 documents** | No artificial delay |

---

## Phase 1: Core Infrastructure

### 1.1 Create Meilisearch Module

**File:** `infra/terraform/modules/meilisearch/main.tf`

```hcl
# EFS File System
resource "aws_efs_file_system" "meilisearch" {
  creation_token = "${var.name_prefix}-meilisearch"
  encrypted      = true

  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }

  tags = {
    Name = "${var.name_prefix}-meilisearch-data"
  }
}

resource "aws_efs_mount_target" "meilisearch" {
  count           = length(var.private_subnet_ids)
  file_system_id  = aws_efs_file_system.meilisearch.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [aws_security_group.efs.id]
}

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
}

# ECS Task Definition
resource "aws_ecs_task_definition" "meilisearch" {
  family                   = "${var.name_prefix}-meilisearch"
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
        { name = "MEILI_ENV", value = var.environment == "production" ? "production" : "development" },
        { name = "MEILI_NO_ANALYTICS", value = "true" },
        { name = "MEILI_HTTP_ADDR", value = "0.0.0.0:7700" }
      ]

      secrets = [
        {
          name      = "MEILI_MASTER_KEY"
          valueFrom = var.master_key_secret_arn
        }
      ]

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
          awslogs-group         = var.log_group_name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "meilisearch"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:7700/health || exit 1"]
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
      file_system_id     = aws_efs_file_system.meilisearch.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.meilisearch.id
        iam             = "ENABLED"
      }
    }
  }
}

# ECS Service
resource "aws_ecs_service" "meilisearch" {
  name            = "meilisearch"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.meilisearch.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.backend_security_group_id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.meilisearch.arn
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  lifecycle {
    ignore_changes = [desired_count]
  }
}

# Service Discovery
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
}

# Security Group for EFS
resource "aws_security_group" "efs" {
  name        = "${var.name_prefix}-meilisearch-efs"
  description = "Security group for Meilisearch EFS"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [var.backend_security_group_id]
    description     = "NFS from ECS tasks"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-meilisearch-efs"
  }
}
```

### 1.2 Module Variables

**File:** `infra/terraform/modules/meilisearch/variables.tf`

```hcl
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment (staging/production)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for EFS mount targets"
  type        = list(string)
}

variable "cluster_id" {
  description = "ECS cluster ID"
  type        = string
}

variable "execution_role_arn" {
  description = "ECS task execution role ARN"
  type        = string
}

variable "task_role_arn" {
  description = "ECS task role ARN"
  type        = string
}

variable "backend_security_group_id" {
  description = "Backend security group ID"
  type        = string
}

variable "service_discovery_namespace_id" {
  description = "Service Discovery namespace ID"
  type        = string
}

variable "master_key_secret_arn" {
  description = "Secrets Manager ARN for MEILI_MASTER_KEY"
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch log group name"
  type        = string
}

variable "meilisearch_image" {
  description = "Meilisearch Docker image"
  type        = string
  default     = "getmeili/meilisearch:v1.6"
}

variable "cpu" {
  description = "Task CPU units"
  type        = number
  default     = 512  # 0.5 vCPU
}

variable "memory" {
  description = "Task memory (MB)"
  type        = number
  default     = 1024  # 1 GB (staging), 4096 for production
}
```

### 1.3 Module Outputs

**File:** `infra/terraform/modules/meilisearch/outputs.tf`

```hcl
output "service_url" {
  description = "Meilisearch service URL"
  value       = "http://meilisearch.${var.name_prefix}.local:7700"
}

output "efs_file_system_id" {
  description = "EFS file system ID"
  value       = aws_efs_file_system.meilisearch.id
}

output "service_discovery_arn" {
  description = "Service Discovery ARN"
  value       = aws_service_discovery_service.meilisearch.arn
}

output "task_definition_arn" {
  description = "ECS task definition ARN"
  value       = aws_ecs_task_definition.meilisearch.arn
}
```

### 1.4 Create Secrets Manager Secret

**File:** `infra/terraform/main.tf` (add to root)

```hcl
# Meilisearch Master Key
resource "aws_secretsmanager_secret" "meilisearch_master_key" {
  name        = "${local.name_prefix}/meilisearch-master-key"
  description = "Meilisearch master key for API authentication"
}

resource "aws_secretsmanager_secret_version" "meilisearch_master_key" {
  secret_id     = aws_secretsmanager_secret.meilisearch_master_key.id
  secret_string = var.meilisearch_master_key
}

# Meilisearch Module
module "meilisearch" {
  source = "./modules/meilisearch"

  name_prefix                    = local.name_prefix
  environment                    = var.environment
  aws_region                     = var.aws_region
  vpc_id                         = local.vpc_id
  private_subnet_ids             = local.private_subnet_ids
  cluster_id                     = module.ecs.cluster_id
  execution_role_arn             = module.iam.ecs_execution_role_arn
  task_role_arn                  = module.iam.ecs_api_task_role_arn
  backend_security_group_id      = module.alb.ecs_backend_security_group_id
  service_discovery_namespace_id = aws_service_discovery_private_dns_namespace.main.id
  master_key_secret_arn          = aws_secretsmanager_secret.meilisearch_master_key.arn
  log_group_name                 = "/ecs/${local.name_prefix}/meilisearch"
  meilisearch_image              = var.meilisearch_image
  cpu                            = var.environment == "production" ? 1024 : 512
  memory                         = var.environment == "production" ? 4096 : 1024
}
```

---

## Phase 2: Event Infrastructure (SNS → SQS)

### 2.1 SNS Topic for Product Events

```hcl
resource "aws_sns_topic" "product_events" {
  name = "${local.name_prefix}-product-events"
}

resource "aws_sns_topic_subscription" "meilisearch_sync" {
  topic_arn = aws_sns_topic.product_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.meilisearch_sync.arn
}
```

### 2.2 SQS Queue with DLQ

```hcl
resource "aws_sqs_queue" "meilisearch_sync_dlq" {
  name                      = "${local.name_prefix}-meilisearch-sync-dlq"
  message_retention_seconds = 1209600  # 14 days
}

resource "aws_sqs_queue" "meilisearch_sync" {
  name                       = "${local.name_prefix}-meilisearch-sync"
  visibility_timeout_seconds = 300  # 5 minutes
  message_retention_seconds  = 86400  # 1 day
  receive_wait_time_seconds  = 20  # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.meilisearch_sync_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_policy" "meilisearch_sync" {
  queue_url = aws_sqs_queue.meilisearch_sync.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.meilisearch_sync.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.product_events.arn
          }
        }
      }
    ]
  })
}
```

### 2.3 Sync Worker Task Definition

```hcl
resource "aws_ecs_task_definition" "meilisearch_sync_worker" {
  family                   = "${local.name_prefix}-meilisearch-sync-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = module.iam.ecs_execution_role_arn
  task_role_arn            = aws_iam_role.meilisearch_sync_worker.arn

  container_definitions = jsonencode([
    {
      name      = "sync-worker"
      image     = "${module.ecr.repository_urls["price-sync-worker"]}:latest"
      essential = true

      environment = [
        { name = "MEILISEARCH_URL", value = module.meilisearch.service_url },
        { name = "SQS_QUEUE_URL", value = aws_sqs_queue.meilisearch_sync.url },
        { name = "SALEOR_API_URL", value = local.api_url },
        { name = "BATCH_SIZE", value = "25" }
      ]

      secrets = [
        {
          name      = "MEILISEARCH_API_KEY"
          valueFrom = aws_secretsmanager_secret.meilisearch_master_key.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${local.name_prefix}/meilisearch-sync-worker"
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "worker"
        }
      }
    }
  ])
}
```

---

## Phase 3: Scheduled Tasks

### 3.1 CloudWatch Event Rules

```hcl
# 15-minute catchup sync
resource "aws_cloudwatch_event_rule" "meilisearch_catchup" {
  name                = "${local.name_prefix}-meilisearch-catchup"
  description         = "Meilisearch 15-minute catchup sync"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "meilisearch_catchup" {
  rule      = aws_cloudwatch_event_rule.meilisearch_catchup.name
  target_id = "meilisearch-catchup"
  arn       = module.ecs.cluster_arn
  role_arn  = aws_iam_role.eventbridge_ecs.arn

  ecs_target {
    task_definition_arn = aws_ecs_task_definition.meilisearch_sync_worker.arn
    task_count          = 1
    launch_type         = "FARGATE"

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

# Daily full reconciliation
resource "aws_cloudwatch_event_rule" "meilisearch_reconcile" {
  name                = "${local.name_prefix}-meilisearch-reconcile"
  description         = "Meilisearch daily full reconciliation"
  schedule_expression = "cron(0 6 * * ? *)"  # 6 AM UTC daily
}

resource "aws_cloudwatch_event_target" "meilisearch_reconcile" {
  rule      = aws_cloudwatch_event_rule.meilisearch_reconcile.name
  target_id = "meilisearch-reconcile"
  arn       = module.ecs.cluster_arn
  role_arn  = aws_iam_role.eventbridge_ecs.arn

  ecs_target {
    task_definition_arn = aws_ecs_task_definition.meilisearch_sync_worker.arn
    task_count          = 1
    launch_type         = "FARGATE"

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
```

---

## Phase 4: Monitoring & Alerts

### 4.1 CloudWatch Alarms

```hcl
# DLQ depth alarm
resource "aws_cloudwatch_metric_alarm" "meilisearch_dlq_depth" {
  alarm_name          = "${local.name_prefix}-meilisearch-dlq-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 10
  alarm_description   = "Meilisearch sync DLQ has messages"

  dimensions = {
    QueueName = aws_sqs_queue.meilisearch_sync_dlq.name
  }

  alarm_actions = [var.alert_sns_topic_arn]
}

# Queue depth alarm (backlog)
resource "aws_cloudwatch_metric_alarm" "meilisearch_queue_backlog" {
  alarm_name          = "${local.name_prefix}-meilisearch-queue-backlog"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 1000
  alarm_description   = "Meilisearch sync queue backlog > 1000"

  dimensions = {
    QueueName = aws_sqs_queue.meilisearch_sync.name
  }

  alarm_actions = [var.alert_sns_topic_arn]
}

# Meilisearch service health
resource "aws_cloudwatch_metric_alarm" "meilisearch_unhealthy" {
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
}
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Create `infra/terraform/modules/meilisearch/` directory
- [ ] Create `main.tf` with EFS, task definition, service, service discovery
- [ ] Create `variables.tf` and `outputs.tf`
- [ ] Add Secrets Manager secret for MEILI_MASTER_KEY
- [ ] Add module invocation to root `main.tf`
- [ ] Update root `outputs.tf` with meilisearch_url
- [ ] Run `terraform plan` and verify resources
- [ ] Run `terraform apply`
- [ ] Verify Meilisearch service starts and is healthy

### Phase 2: Event Infrastructure
- [ ] Add SNS topic for product events
- [ ] Add SQS queue with DLQ
- [ ] Create sync worker task definition
- [ ] Create IAM role for sync worker (SQS, Secrets Manager, CloudWatch)
- [ ] Run `terraform apply`
- [ ] Test queue by sending test message

### Phase 3: Scheduled Tasks
- [ ] Add CloudWatch Event Rule for 15-min catchup
- [ ] Add CloudWatch Event Rule for daily reconciliation
- [ ] Create EventBridge IAM role for ECS
- [ ] Run `terraform apply`
- [ ] Verify scheduled tasks trigger

### Phase 4: Monitoring
- [ ] Add CloudWatch alarms (DLQ, queue backlog, service health)
- [ ] Create CloudWatch dashboard
- [ ] Run `terraform apply`
- [ ] Test alert triggers

### Phase 5: Migration
- [ ] Run initial full sync to new Meilisearch
- [ ] Compare document counts (old vs new)
- [ ] Update storefront MEILISEARCH_URL to new endpoint
- [ ] Monitor for 24 hours
- [ ] Decommission old Meilisearch service

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during EFS mount | Low | High | Enable EFS backup policy, test restore |
| Sync worker overwhelms Meilisearch | Medium | Medium | Circuit breaker, exponential backoff |
| Missed webhooks during cutover | Medium | Low | 15-min catchup as safety net |
| Secret rotation breaks service | Low | High | Test rotation procedure in staging |
| EFS performance during bulk import | Medium | Medium | Monitor IOPS, consider provisioned throughput |

---

## Estimated Timeline

| Phase | Tasks | Duration |
|-------|-------|----------|
| Phase 1 | Core infrastructure | 2-3 hours |
| Phase 2 | Event infrastructure | 1-2 hours |
| Phase 3 | Scheduled tasks | 1 hour |
| Phase 4 | Monitoring | 1 hour |
| Phase 5 | Migration + validation | 2-4 hours |
| **Total** | | **7-11 hours** |

---

## Commands Reference

```bash
# Initialize and plan
cd infra/terraform
terraform init
terraform workspace select staging
terraform plan -var-file=environments/staging.tfvars

# Apply infrastructure
terraform apply -var-file=environments/staging.tfvars

# Verify Meilisearch is running
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services meilisearch

# Check Meilisearch health
curl http://meilisearch.saleor-platform-staging.local:7700/health

# Run initial sync manually
aws ecs run-task \
  --cluster saleor-platform-staging \
  --task-definition saleor-platform-staging-meilisearch-sync-worker \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"sync-worker","environment":[{"name":"SYNC_MODE","value":"full"}]}]}'
```
