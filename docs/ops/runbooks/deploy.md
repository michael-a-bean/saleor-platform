# Deployment Runbook

This runbook covers the deployment process for the Saleor Platform on AWS ECS/Fargate.

## Overview

- **Staging**: Automated deployment on merge to `platform/main`
- **Production**: Manual trigger with approval gate

## Deployment Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Build     │ ──▶ │   Migrate    │ ──▶ │   Deploy     │ ──▶ │ Smoke Tests  │
│   Images     │     │  Databases   │     │  Services    │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

## Staging Deployment

### Automatic (Recommended)

1. Merge PR to `platform/main`
2. GitHub Actions automatically:
   - Builds images and pushes to ECR
   - Creates pre-migration RDS snapshot
   - Runs Django and Prisma migrations
   - Deploys all ECS services
   - Runs smoke tests

### Manual Trigger

1. Go to Actions → "Deploy to Staging"
2. Click "Run workflow"
3. Select `platform/main` branch
4. Click "Run workflow"

### Monitoring Deployment

1. Watch GitHub Actions workflow progress
2. Check CloudWatch Logs:
   - Log groups: `/ecs/saleor-platform-staging/*`
3. Verify in AWS Console:
   - ECS → Clusters → saleor-platform-staging
   - Check service "Running count" matches "Desired count"

### Verification Steps

After deployment completes:

```bash
# Check API health
curl https://api.staging.example.com/health/

# Check GraphQL
curl -X POST https://api.staging.example.com/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { queryType { name } } }"}'

# Check storefront
curl https://www.staging.example.com/api/health

# Check dashboard
curl -I https://dashboard.staging.example.com/
```

## Production Deployment

### Prerequisites

- Staging deployment with same SHA is successful
- All smoke tests pass on staging
- Production approval from designated reviewers

### Deployment Process

1. Go to Actions → "Deploy to Production"
2. Click "Run workflow"
3. Enter the staging SHA (from successful staging deployment)
4. Click "Run workflow"
5. Wait for approval notification
6. Approve in GitHub (production environment reviewers)
7. Monitor deployment progress

### Pre-Production Checklist

- [ ] Staging deployment tested and verified
- [ ] Database migrations reviewed for backward compatibility
- [ ] Rollback plan reviewed
- [ ] Team notified of deployment window
- [ ] Recent RDS snapshot verified

### Post-Production Checklist

- [ ] Smoke tests pass
- [ ] CloudWatch metrics normal
- [ ] No error spikes in logs
- [ ] Customer-facing functionality verified
- [ ] Payment processing verified (if applicable)

## Troubleshooting

### Deployment Stuck

1. Check ECS service events:
   ```bash
   aws ecs describe-services \
     --cluster saleor-platform-staging \
     --services api \
     --query 'services[0].events[:5]'
   ```

2. Check task failures:
   ```bash
   aws ecs list-tasks --cluster saleor-platform-staging --service-name api
   aws ecs describe-tasks --cluster saleor-platform-staging --tasks <task-arn>
   ```

### Migration Failures

1. Check migration task logs in CloudWatch
2. Connect to RDS and verify schema state
3. If partial migration, may need manual intervention
4. See `migrations.md` runbook for details

### Smoke Test Failures

1. Check which test failed in GitHub Actions logs
2. Verify service is reachable:
   ```bash
   curl -v https://api.staging.example.com/health/
   ```
3. Check ALB target group health
4. Check CloudWatch logs for errors

### Service Won't Stabilize

Common causes:
- Health check failing (check `/health/` endpoint)
- Container crashing (check CloudWatch logs)
- Secrets not found (check SSM parameter paths)
- Insufficient memory/CPU (check task stopped reason)

Resolution:
1. Check ECS service events for error messages
2. Check CloudWatch Logs for container output
3. Verify SSM parameters exist and are accessible
4. Consider rolling back to previous task definition

## Emergency Procedures

### Emergency Rollback

```bash
# Rollback all services
./scripts/deploy/aws/rollback.sh production

# Rollback specific service
./scripts/deploy/aws/rollback.sh production api
```

### Database Recovery

If migration corrupted data:
1. Identify the pre-deployment snapshot
2. Consider point-in-time recovery
3. See `backups.md` runbook

### Complete Outage

1. Check AWS Service Health Dashboard
2. Verify VPC/networking
3. Check RDS/ElastiCache status
4. Consider switching to maintenance page
