# Meilisearch Staging Setup - Session 2026-01-27

**Date:** 2026-01-27
**Status:** IN PROGRESS (background tasks running)

---

## Executive Summary

Setting up Meilisearch for staging environment with both `webstore` and `singles-builder` channels. CloudFront CDN also deployed for media optimization.

---

## What Was Accomplished

### 1. Meilisearch Service Started
- Scaled up Meilisearch ECS service from 0 to 1
- Service is healthy and accepting requests
- Service discovery DNS: `meilisearch.saleor-platform-staging.local:7700`

### 2. CloudFront CDN Deployed
- **Distribution:** `d30pbahsk8hi4i.cloudfront.net`
- **Media CDN URL:** `https://d30pbahsk8hi4i.cloudfront.net`
- Fixed CloudFront module error (custom_error_response configuration)
- S3 bucket policy updated for CloudFront OAC access

### 3. Storefront Image Optimization
- Pulled 15 commits including `feat(storefront): optimize image loading for MTG cards`
- Next.js config updated for Scryfall image optimization
- WebP/AVIF formats enabled
- Storefront, API, and Worker services redeployed

### 4. Singles-Builder Channel Created
- Created new channel: `Singles Builder` (slug: `singles-builder`, ID: `Q2hhbm5lbDoz`)
- Currency: USD, Country: US

### 5. Background Tasks Started

#### Task A: Webstore Meilisearch Sync
- **ECS Task ID:** `c7e2897ac7684420ae563f8fb0af5204`
- **Status:** RUNNING (as of session end)
- **Products:** ~92,000+ products syncing
- **Index:** `webstore-products`

**Check status:**
```bash
aws ecs describe-tasks --cluster saleor-platform-staging \
  --tasks c7e2897ac7684420ae563f8fb0af5204 --region us-west-1 \
  --query 'tasks[0].{status:lastStatus,exit:containers[0].exitCode}'

# Check logs
aws logs tail /ecs/saleor-platform-staging/meilisearch-sync-worker \
  --log-stream-names "manual-sync/sync/c7e2897ac7684420ae563f8fb0af5204" \
  --since 10m --region us-west-1
```

#### Task B: Add Products to Singles-Builder Channel
- **Local Process PID:** 35919 (on development machine)
- **Log file:** `/tmp/singles-builder-channel-add.log`
- **Script:** `scripts/add-products-to-channel.py`
- **Products:** 92,612 products from MTG Singles category (Q2F0ZWdvcnk6Mg==)

**Check status:**
```bash
ps aux | grep add-products-to-channel
tail -f /tmp/singles-builder-channel-add.log
```

**If process died, resume with:**
```bash
# Get credentials
ADMIN_EMAIL=$(aws secretsmanager get-secret-value --secret-id "saleor/staging/sync/admin-email" --region us-west-1 --query SecretString --output text)
ADMIN_PASSWORD=$(aws secretsmanager get-secret-value --secret-id "saleor/staging/sync/admin-password" --region us-west-1 --query SecretString --output text)

export SALEOR_API_URL="http://saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com/graphql/"
export SALEOR_ADMIN_EMAIL="$ADMIN_EMAIL"
export SALEOR_ADMIN_PASSWORD="$ADMIN_PASSWORD"

# The script is idempotent - running again will skip already-added products
python3 scripts/add-products-to-channel.py \
  --source-channel webstore \
  --target-channel singles-builder \
  --category "Q2F0ZWdvcnk6Mg==" \
  --batch-size 100
```

---

## Next Steps (When Resuming)

### 1. Check Background Task Completion

```bash
# Webstore sync
aws ecs describe-tasks --cluster saleor-platform-staging \
  --tasks c7e2897ac7684420ae563f8fb0af5204 --region us-west-1 \
  --query 'tasks[0].{status:lastStatus,exit:containers[0].exitCode}'

# If STOPPED with exit 0, sync completed successfully
```

### 2. Run Singles-Builder Meilisearch Sync

After products are added to the channel, sync to Meilisearch:

```bash
SUBNET="subnet-0917a8f4d0d7b7080"
SG="sg-0210b4854c817f8ac"  # ecs-backend-sg

aws ecs run-task \
  --cluster saleor-platform-staging \
  --task-definition saleor-platform-staging-meilisearch-manual-sync:4 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"sync","command":["python","sync-meilisearch.py","--channel","singles-builder"]}]}' \
  --region us-west-1
```

### 3. Verify Search Functionality

```bash
ALB_DNS="saleor-platform-staging-alb-1516106871.us-west-1.elb.amazonaws.com"

# Test storefront search (should return results after sync)
curl "http://$ALB_DNS/" # Navigate to search page
```

### 4. Verify CloudFront CDN

```bash
# Test CDN is serving images
curl -I "https://d30pbahsk8hi4i.cloudfront.net/products/test.jpg"
```

---

## Infrastructure State

| Component | Status | Details |
|-----------|--------|---------|
| Meilisearch ECS | Running | 1 task, healthy |
| API ECS | Running | Redeployed with CDN config |
| Storefront ECS | Running | Redeployed with image optimization |
| Worker ECS | Running | Redeployed with CDN config |
| CloudFront | Deployed | d30pbahsk8hi4i.cloudfront.net |

### Channels

| Channel | Slug | Products | Meilisearch Index |
|---------|------|----------|-------------------|
| Webstore | webstore | ~92,000 | webstore-products (syncing) |
| Singles Builder | singles-builder | 0 → 92,612 (adding) | singles-builder-products (empty, needs sync) |

---

## Files Created/Modified This Session

### Created
- `scripts/add-products-to-channel.py` - Bulk add products to a channel

### Modified
- `infra/terraform/modules/cloudfront/main.tf` - Fixed custom_error_response config

### Terraform Applied
- CloudFront distribution created
- S3 bucket policy updated
- ECS task definitions updated (api, worker) with MEDIA_CDN_URL

---

## Key Commands Reference

### Scale Services Up/Down
```bash
# Scale up all
aws ecs update-service --cluster saleor-platform-staging --service meilisearch --desired-count 1 --region us-west-1
aws ecs update-service --cluster saleor-platform-staging --service api --desired-count 1 --region us-west-1
aws ecs update-service --cluster saleor-platform-staging --service storefront --desired-count 1 --region us-west-1
aws ecs update-service --cluster saleor-platform-staging --service worker --desired-count 1 --region us-west-1

# Scale down all
aws ecs update-service --cluster saleor-platform-staging --service meilisearch --desired-count 0 --region us-west-1
# ... etc
```

### Run Manual Meilisearch Sync
```bash
SUBNET="subnet-0917a8f4d0d7b7080"
SG="sg-0210b4854c817f8ac"

aws ecs run-task \
  --cluster saleor-platform-staging \
  --task-definition saleor-platform-staging-meilisearch-manual-sync:4 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"sync","command":["python","sync-meilisearch.py","--channel","CHANNEL_SLUG"]}]}' \
  --region us-west-1
```

---

## Troubleshooting

### Meilisearch Connection Issues
- Ensure sync task uses `sg-0210b4854c817f8ac` (ecs-backend-sg)
- Meilisearch only accessible within VPC via service discovery

### Auth Errors (401/403)
- All clients now use `MEILISEARCH_API_KEY` from Secrets Manager
- Key path: `saleor/staging/meilisearch/master-key`

### CloudFront 403 Errors
- S3 bucket policy allows CloudFront OAC
- Public read also enabled for products/* and thumbnails/*
