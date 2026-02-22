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
# ALB - Re-added 2026-01-27 after drift analysis
# =============================================================================
# NOTE: ALB was recreated in new VPC vpc-0b0360f5c0c874c59 and is now stable
import {
  to = module.alb.aws_lb.main
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:loadbalancer/app/saleor-platform-staging-alb/db6a77fe4c4f68d7"
}

import {
  to = module.alb.aws_lb_listener.http
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:listener/app/saleor-platform-staging-alb/db6a77fe4c4f68d7/a54dae16dc050f2c"
}

# =============================================================================
# ALB Target Groups - All in production VPC vpc-0b0360f5c0c874c59
# =============================================================================
import {
  to = module.alb.aws_lb_target_group.api
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:targetgroup/saleor-platform-staging-api/28b0d316d9f3989d"
}

import {
  to = module.alb.aws_lb_target_group.storefront
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:targetgroup/sp-staging-storefront/478edad36d16d8ff"
}

import {
  to = module.alb.aws_lb_target_group.dashboard
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:targetgroup/sp-staging-dashboard/5a7797b424f69083"
}

import {
  to = module.alb.aws_lb_target_group.stripe_app
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:targetgroup/saleor-platform-staging-stripe/84c4e26a9263e1ad"
}

import {
  to = module.alb.aws_lb_target_group.inventory_ops_app
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:targetgroup/saleor-platform-staging-inv-ops/b29c1eb89c75ed0b"
}

import {
  to = module.alb.aws_lb_target_group.buylist_app
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:targetgroup/saleor-platform-staging-buylist/2d69fd6447cdc796"
}

import {
  to = module.alb.aws_lb_target_group.pos_app
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:targetgroup/saleor-platform-staging-pos/89fd87464e2f1975"
}

# =============================================================================
# ALB Listener Rules (HTTP) - REMOVED 2026-02-14
# =============================================================================
# These HTTP rules were destroyed when enable_https=true was applied.
# HTTPS mode uses host-based routing on the HTTPS listener instead.
# Kept as comments for historical reference.
# Previously imported: api_http, dashboard_http, stripe_app_http,
#   inventory_ops_app_http, buylist_app_http, pos_app_http

# =============================================================================
# CloudFront - Added 2026-01-27 after drift analysis
# =============================================================================
import {
  to = module.cloudfront[0].aws_cloudfront_distribution.media
  id = "E1D0RKJ52XDEZO"
}

import {
  to = module.cloudfront[0].aws_cloudfront_origin_access_control.media
  id = "E3Q4SB0MFYLG2B"
}

# =============================================================================
# Service Discovery Namespace - Production VPC
# =============================================================================
import {
  to = aws_service_discovery_private_dns_namespace.main
  id = "ns-xhvqzcnvqxn3agm7:vpc-0b0360f5c0c874c59"
}

# =============================================================================
# Security Groups - Production VPC (vpc-0b0360f5c0c874c59)
# =============================================================================
import {
  to = module.alb.aws_security_group.alb
  id = "sg-0adc2ff387fdce93f"
}

import {
  to = module.alb.aws_security_group.ecs_backend
  id = "sg-0210b4854c817f8ac"
}

import {
  to = module.alb.aws_security_group.ecs_frontend
  id = "sg-0fd88ba47a4b3affc"
}

import {
  to = module.alb.aws_security_group.ecs_internal
  id = "sg-0eddc188d791f3c86"
}

import {
  to = module.elasticache.aws_security_group.redis
  id = "sg-085c4f77b6a9296a1"
}

import {
  to = module.rds.aws_security_group.rds
  id = "sg-0c71ecc1820c1a974"
}

import {
  to = module.meilisearch[0].aws_security_group.efs
  id = "sg-0b50adccacaf0d569"
}

# =============================================================================
# Production VPC - Imported 2026-01-27 during VPC alignment maintenance
# =============================================================================
# NOTE: Production runs in vpc-0b0360f5c0c874c59
# The old vpc-088fb7c0a22060c10 was removed from state (orphaned)

import {
  to = module.vpc[0].aws_vpc.main
  id = "vpc-0b0360f5c0c874c59"
}

import {
  to = module.vpc[0].aws_subnet.public[0]
  id = "subnet-03f8a9b1c117c7c19" # us-west-1a
}

import {
  to = module.vpc[0].aws_subnet.public[1]
  id = "subnet-04358a3ccacd34e6c" # us-west-1b
}

import {
  to = module.vpc[0].aws_subnet.private[0]
  id = "subnet-0885b491c2d394fb6" # us-west-1a
}

import {
  to = module.vpc[0].aws_subnet.private[1]
  id = "subnet-0917a8f4d0d7b7080" # us-west-1b
}

import {
  to = module.vpc[0].aws_internet_gateway.main
  id = "igw-029a454967ff72400"
}

import {
  to = module.vpc[0].aws_nat_gateway.main[0]
  id = "nat-05ca5f050c37e97a1"
}

import {
  to = module.vpc[0].aws_eip.nat[0]
  id = "eipalloc-0b7171488dae2fece"
}

import {
  to = module.vpc[0].aws_route_table.public
  id = "rtb-0558fbd2834d65219"
}

import {
  to = module.vpc[0].aws_route_table.private[0]
  id = "rtb-037085d4ee7ffdea8"
}

import {
  to = module.vpc[0].aws_route_table_association.public[0]
  id = "subnet-03f8a9b1c117c7c19/rtb-0558fbd2834d65219"
}

import {
  to = module.vpc[0].aws_route_table_association.public[1]
  id = "subnet-04358a3ccacd34e6c/rtb-0558fbd2834d65219"
}

import {
  to = module.vpc[0].aws_route_table_association.private[0]
  id = "subnet-0885b491c2d394fb6/rtb-037085d4ee7ffdea8"
}

import {
  to = module.vpc[0].aws_route_table_association.private[1]
  id = "subnet-0917a8f4d0d7b7080/rtb-037085d4ee7ffdea8"
}

# Interface VPC endpoints + SG REMOVED 2026-02-12: cost optimization
# create_interface_endpoints = false in staging.tfvars
# These 4 interface endpoints ($29/mo) are being destroyed; NAT handles traffic.
# Removed: sg-032696ac44e478a88, vpce-0275dfaf077ce0aaa, vpce-084889bd73e996dce,
#          vpce-0465fb738b80a896a, vpce-07b5f26452aeda656

import {
  to = module.vpc[0].aws_vpc_endpoint.s3[0]
  id = "vpce-0032d7cc325cb6435"
}

import {
  to = module.vpc[0].aws_vpc_endpoint.dynamodb[0]
  id = "vpce-0c08deb97674e3771"
}

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
# RDS - REMOVED: Recreated during VPC migration 2026-01-22
# =============================================================================
# import {
#   to = module.rds.aws_db_instance.main
#   id = "saleor-platform-staging-saleor"
# }
#
# import {
#   to = module.rds.aws_db_subnet_group.main
#   id = "saleor-platform-staging-db-subnet"
# }
#
# import {
#   to = module.rds.aws_db_parameter_group.main
#   id = "saleor-platform-staging-pg15"
# }

# =============================================================================
# ElastiCache - REMOVED: Recreated during VPC migration 2026-01-22
# =============================================================================
# import {
#   to = module.elasticache.aws_elasticache_replication_group.cache
#   id = "saleor-platform-staging-cache"
# }
#
# import {
#   to = module.elasticache.aws_elasticache_subnet_group.main
#   id = "saleor-platform-staging-redis"
# }
#
# import {
#   to = module.elasticache.aws_elasticache_parameter_group.cache
#   id = "saleor-platform-staging-cache"
# }

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
# Meilisearch - Updated 2026-01-27 with explicit imports
# =============================================================================
# NOTE: Meilisearch is FULLY MANAGED by Terraform via module.meilisearch
# Added explicit imports to align state with AWS reality

import {
  to = module.meilisearch[0].aws_efs_file_system.meilisearch
  id = "fs-08f7c555c0bd96376"
}

import {
  to = module.meilisearch[0].aws_efs_mount_target.meilisearch[0]
  id = "fsmt-0686a0163916d366b"
}

import {
  to = module.meilisearch[0].aws_efs_mount_target.meilisearch[1]
  id = "fsmt-01b5038f5535e4499"
}

import {
  to = module.meilisearch[0].aws_service_discovery_service.meilisearch
  id = "srv-xzf7plnegd6nuhst"
}

import {
  to = module.meilisearch[0].aws_efs_access_point.meilisearch
  id = "fsap-02f31a97e6d19e708"
}

import {
  to = module.meilisearch[0].aws_ecs_service.meilisearch
  id = "saleor-platform-staging/meilisearch"
}

# =============================================================================
# EventBridge Targets - Added 2026-01-27
# =============================================================================
import {
  to = aws_cloudwatch_event_target.meilisearch_catchup[0]
  id = "saleor-platform-staging-meilisearch-catchup/meilisearch-catchup"
}

import {
  to = aws_cloudwatch_event_target.meilisearch_reconcile[0]
  id = "saleor-platform-staging-meilisearch-reconcile/meilisearch-reconcile"
}

# =============================================================================
# Meilisearch Sync Worker Resources - Added 2026-01-27
# =============================================================================
import {
  to = aws_secretsmanager_secret.meilisearch_master_key[0]
  id = "arn:aws:secretsmanager:us-west-1:546464732019:secret:saleor/staging/meilisearch/master-key-WZCjY8"
}

import {
  to = aws_iam_role.meilisearch_sync_worker[0]
  id = "saleor-platform-staging-meilisearch-sync-worker"
}

import {
  to = aws_iam_role.eventbridge_ecs[0]
  id = "saleor-platform-staging-eventbridge-ecs"
}

import {
  to = aws_cloudwatch_log_group.meilisearch_sync_worker[0]
  id = "/ecs/saleor-platform-staging/meilisearch-sync-worker"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["beat"]
  id = "/ecs/saleor-platform-staging/beat"
}

import {
  to = module.ecs.aws_ecs_service.beat
  id = "saleor-platform-staging/beat"
}

# =============================================================================
# AWS Config Resources - Added 2026-01-29
# =============================================================================
import {
  to = aws_s3_bucket.config[0]
  id = "saleor-platform-staging-config-546464732019"
}

import {
  to = aws_iam_role.config[0]
  id = "saleor-platform-staging-config"
}

# =============================================================================
# SSM Parameters (Secrets Module) - Added during IaC audit 2026-02-12
# =============================================================================

import {
  to = module.secrets.aws_ssm_parameter.api_secret_key
  id = "/saleor/staging/api/SECRET_KEY"
}

import {
  to = module.secrets.aws_ssm_parameter.api_database_url
  id = "/saleor/staging/api/DATABASE_URL"
}

import {
  to = module.secrets.aws_ssm_parameter.api_celery_broker_url
  id = "/saleor/staging/api/CELERY_BROKER_URL"
}

import {
  to = module.secrets.aws_ssm_parameter.api_rsa_private_key
  id = "/saleor/staging/api/RSA_PRIVATE_KEY"
}

import {
  to = module.secrets.aws_ssm_parameter.apps_secret_key
  id = "/saleor/staging/apps/SECRET_KEY"
}

import {
  to = module.secrets.aws_ssm_parameter.stripe_secret_key
  id = "/saleor/staging/apps/stripe/STRIPE_SECRET_KEY"
}

import {
  to = module.secrets.aws_ssm_parameter.stripe_webhook_secret
  id = "/saleor/staging/apps/stripe/STRIPE_WEBHOOK_SECRET"
}

import {
  to = module.secrets.aws_ssm_parameter.inventory_database_url
  id = "/saleor/staging/apps/inventory-ops/DATABASE_URL"
}

import {
  to = module.secrets.aws_ssm_parameter.inventory_cron_secret
  id = "/saleor/staging/apps/inventory-ops/CRON_SECRET"
}

import {
  to = module.secrets.aws_ssm_parameter.otel_headers
  id = "/saleor/staging/api/OTEL_EXPORTER_OTLP_HEADERS"
}

# MTG Import resources (created before Terraform adoption)
import {
  to = module.ecr.aws_ecr_repository.repos["mtg-import-app"]
  id = "saleor-platform/mtg-import-app"
}

import {
  to = module.ecs.aws_cloudwatch_log_group.services["mtg-import-app"]
  id = "/ecs/saleor-platform-staging/mtg-import-app"
}

import {
  to = module.alb.aws_lb_target_group.mtg_import_app
  id = "arn:aws:elasticloadbalancing:us-west-1:546464732019:targetgroup/saleor-platform-staging-mtg-imp/a7cee7de4721f945"
}

# mtg_import_app_http[0] removed 2026-02-14 — destroyed with enable_https=true

import {
  to = module.ecs.aws_ecs_task_definition.apps["mtg-import"]
  id = "arn:aws:ecs:us-west-1:546464732019:task-definition/saleor-platform-staging-mtg-import:8"
}

# ECS service imported via CLI (TF 1.5 import blocks don't support for_each service resources)
# terraform import 'module.ecs.aws_ecs_service.apps["mtg-import"]' 'saleor-platform-staging/mtg-import'

# =============================================================================
# Application Auto Scaling Targets - Added 2026-02-21
# Previously managed via AWS CLI; now IaC-managed with scheduled scaling.
# =============================================================================

import {
  to = module.ecs.aws_appautoscaling_target.api[0]
  id = "ecs/service/saleor-platform-staging/api/ecs:service:DesiredCount"
}

import {
  to = module.ecs.aws_appautoscaling_target.worker[0]
  id = "ecs/service/saleor-platform-staging/worker/ecs:service:DesiredCount"
}

import {
  to = module.ecs.aws_appautoscaling_target.beat[0]
  id = "ecs/service/saleor-platform-staging/beat/ecs:service:DesiredCount"
}

import {
  to = module.ecs.aws_appautoscaling_target.storefront[0]
  id = "ecs/service/saleor-platform-staging/storefront/ecs:service:DesiredCount"
}

import {
  to = module.ecs.aws_appautoscaling_target.apps["stripe"]
  id = "ecs/service/saleor-platform-staging/stripe/ecs:service:DesiredCount"
}

import {
  to = module.ecs.aws_appautoscaling_target.apps["inventory-ops"]
  id = "ecs/service/saleor-platform-staging/inventory-ops/ecs:service:DesiredCount"
}

import {
  to = module.ecs.aws_appautoscaling_target.apps["buylist"]
  id = "ecs/service/saleor-platform-staging/buylist/ecs:service:DesiredCount"
}

import {
  to = module.ecs.aws_appautoscaling_target.apps["pos"]
  id = "ecs/service/saleor-platform-staging/pos/ecs:service:DesiredCount"
}

import {
  to = module.ecs.aws_appautoscaling_target.apps["mtg-import"]
  id = "ecs/service/saleor-platform-staging/mtg-import/ecs:service:DesiredCount"
}

# Meilisearch scaling target (managed by meilisearch module, not ECS module)
# Note: target was deregistered during P0 cleanup — will be recreated by Terraform
