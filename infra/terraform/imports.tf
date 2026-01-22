# Terraform Import Configuration
# This file defines resources to import into state
# Run: terraform plan -var-file=environments/staging.tfvars
# Then: terraform apply -var-file=environments/staging.tfvars

# =============================================================================
# ECR Repositories
# =============================================================================
import {
  to = module.ecr.aws_ecr_repository.repos["storefront"]
  id = "saleor-platform/storefront"
}

import {
  to = module.ecr.aws_ecr_repository.repos["stripe-app"]
  id = "saleor-platform/stripe-app"
}

import {
  to = module.ecr.aws_ecr_repository.repos["inventory-ops-app"]
  id = "saleor-platform/inventory-ops-app"
}

import {
  to = module.ecr.aws_ecr_repository.repos["buylist-app"]
  id = "saleor-platform/buylist-app"
}

import {
  to = module.ecr.aws_ecr_repository.repos["pos-app"]
  id = "saleor-platform/pos-app"
}

import {
  to = module.ecr.aws_ecr_repository.repos["price-sync-worker"]
  id = "saleor-platform/price-sync-worker"
}

# =============================================================================
# ALB
# =============================================================================
import {
  to = module.alb.aws_lb.main
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:loadbalancer/app/saleor-platform-staging-alb/544ea1780304c8eb"
}

import {
  to = module.alb.aws_lb_listener.http
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:listener/app/saleor-platform-staging-alb/544ea1780304c8eb/9381df049fadaacd"
}

# SKIPPED: Target Groups
# These exist in vpc-03bec79de659bddf7 but Terraform manages vpc-0b0360f5c0c874c59.
# Importing would force replacement and cause downtime.
# Managed out-of-band until VPC migration maintenance window.
#
# Target groups in AWS (for reference):
# - saleor-platform-staging-api
# - sp-staging-storefront
# - sp-staging-dashboard
# - saleor-platform-staging-stripe
# - saleor-platform-staging-inv-ops
# - saleor-platform-staging-buylist
# - saleor-platform-staging-pos

# =============================================================================
# S3
# =============================================================================
import {
  to = module.s3.aws_s3_bucket.media
  id = "saleor-platform-media-staging-546464732019"
}

# =============================================================================
# IAM Roles
# =============================================================================
import {
  to = module.iam.aws_iam_role.ecs_task_execution
  id = "saleor-platform-staging-ecs-execution"
}

import {
  to = module.iam.aws_iam_role.ecs_api_task
  id = "saleor-platform-staging-ecs-api-task"
}

import {
  to = module.iam.aws_iam_role.ecs_worker_task
  id = "saleor-platform-staging-ecs-worker-task"
}

import {
  to = module.iam.aws_iam_role.ecs_storefront_task
  id = "saleor-platform-staging-ecs-storefront-task"
}

import {
  to = module.iam.aws_iam_role.ecs_apps_task
  id = "saleor-platform-staging-ecs-apps-task"
}

import {
  to = module.iam.aws_iam_role.github_actions_deploy
  id = "saleor-platform-staging-github-actions-deploy"
}

import {
  to = module.iam.aws_iam_openid_connect_provider.github[0]
  id = "arn:aws:iam::546464732019:oidc-provider/token.actions.githubusercontent.com"
}

# =============================================================================
# RDS
# =============================================================================
import {
  to = module.rds.aws_db_instance.main
  id = "saleor-platform-staging-saleor"
}

import {
  to = module.rds.aws_db_subnet_group.main
  id = "saleor-platform-staging-db-subnet"
}

import {
  to = module.rds.aws_db_parameter_group.main
  id = "saleor-platform-staging-pg15"
}

# =============================================================================
# ElastiCache
# =============================================================================
import {
  to = module.elasticache.aws_elasticache_replication_group.cache
  id = "saleor-platform-staging-cache"
}

import {
  to = module.elasticache.aws_elasticache_subnet_group.main
  id = "saleor-platform-staging-redis"
}

import {
  to = module.elasticache.aws_elasticache_parameter_group.cache
  id = "saleor-platform-staging-cache"
}

# =============================================================================
# DynamoDB
# =============================================================================
import {
  to = module.dynamodb.aws_dynamodb_table.stripe_app[0]
  id = "saleor-platform-staging-stripe-app"
}

# =============================================================================
# CloudWatch Log Groups
# =============================================================================
import {
  to = module.ecs.aws_cloudwatch_log_group.services["api"]
  id = "/ecs/saleor-platform-staging/api"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["worker"]
  id = "/ecs/saleor-platform-staging/worker"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["storefront"]
  id = "/ecs/saleor-platform-staging/storefront"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["dashboard"]
  id = "/ecs/saleor-platform-staging/dashboard"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["stripe-app"]
  id = "/ecs/saleor-platform-staging/stripe-app"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["inventory-ops-app"]
  id = "/ecs/saleor-platform-staging/inventory-ops-app"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["buylist-app"]
  id = "/ecs/saleor-platform-staging/buylist-app"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["pos-app"]
  id = "/ecs/saleor-platform-staging/pos-app"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["migrate"]
  id = "/ecs/saleor-platform-staging/migrate"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["meilisearch"]
  id = "/ecs/saleor-platform-staging/meilisearch"
}

# =============================================================================
# ECS Services
# =============================================================================
import {
  to = module.ecs.aws_ecs_service.api
  id = "saleor-platform-staging/api"
}

import {
  to = module.ecs.aws_ecs_service.worker
  id = "saleor-platform-staging/worker"
}

import {
  to = module.ecs.aws_ecs_service.storefront
  id = "saleor-platform-staging/storefront"
}

import {
  to = module.ecs.aws_ecs_service.dashboard
  id = "saleor-platform-staging/dashboard"
}

import {
  to = module.ecs.aws_ecs_service.apps["stripe"]
  id = "saleor-platform-staging/stripe"
}

import {
  to = module.ecs.aws_ecs_service.apps["inventory-ops"]
  id = "saleor-platform-staging/inventory-ops"
}

import {
  to = module.ecs.aws_ecs_service.apps["buylist"]
  id = "saleor-platform-staging/buylist"
}

import {
  to = module.ecs.aws_ecs_service.apps["pos"]
  id = "saleor-platform-staging/pos"
}

# =============================================================================
# Meilisearch
# =============================================================================
# NOTE: Meilisearch is managed MANUALLY (not via Terraform) due to VPC mismatch.
#
# Terraform manages VPC: vpc-0b0360f5c0c874c59
# Actual deployment VPC: vpc-03bec79de659bddf7
#
# Manual resources in vpc-03bec79de659bddf7:
# - Service Discovery Namespace: ns-dud7q2v2ezogs6cg (saleor-platform-staging.local)
# - Service Discovery Service: srv-hxm4k7fipdop7zjc (meilisearch)
# - ECS Service: meilisearch in saleor-platform-staging cluster
# - Task Definition: saleor-platform-staging-meilisearch
# - CloudWatch Log Group: /ecs/saleor-platform-staging/meilisearch (managed by terraform)
#
# Security Group Rules (applied manually to sg-0c35fbd209ae520f7):
# - Port 7700 self-reference (backend to backend for Meilisearch)
# - Port 7700 from sg-0b59f22a42e887613 (frontend to backend for storefront search)
