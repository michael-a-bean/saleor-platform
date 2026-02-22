# Meilisearch Sync Infrastructure
# SNS → SQS → Worker pipeline, EventBridge scheduled tasks, and monitoring alarms.
# Extracted from main.tf for maintainability.

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
