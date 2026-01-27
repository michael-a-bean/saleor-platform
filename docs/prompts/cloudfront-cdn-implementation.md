# CloudFront CDN Implementation Prompt

**Purpose:** Add CloudFront CDN in front of S3 media bucket to improve image loading performance for the Saleor storefront.

**Usage:** Copy and paste this entire prompt into a new Claude Code session in the `/home/michael/saleor-platform` directory.

---

## Prompt

```
I need you to add a CloudFront CDN distribution to our Saleor platform infrastructure to improve image loading performance. This is a $500K-$5M revenue e-commerce platform for MTG card singles.

## Background

A Council debate determined that our staging environment has slow image loading because:
1. S3 media bucket is accessed directly without CDN
2. No edge caching - every request hits origin
3. Users far from our AWS region experience high latency

Next.js image optimization is already enabled (`NEXT_IMAGE_UNOPTIMIZED=false`), but we need CDN for edge caching.

## Current Infrastructure

Location: `infra/terraform/`

**Existing resources:**
- S3 media bucket: `module.s3` in `modules/s3/main.tf`
  - Bucket name: `${var.project_name}-media-${var.environment}-${var.account_id}`
  - Public read enabled for `products/*` and `thumbnails/*` paths
  - CORS configured for storefront/API access

- ALB: `module.alb` in `modules/alb/main.tf`
  - Routes to ECS services (API, storefront, dashboard)

- ACM certificate: `aws_acm_certificate.main` in `main.tf`
  - Domain: `*.${var.domain_name}`
  - Note: CloudFront requires certs in us-east-1 (provider already configured in providers.tf)

## Requirements

1. **Create CloudFront module** at `infra/terraform/modules/cloudfront/`
   - Distribution origin: S3 media bucket
   - Cache behavior: Aggressive caching for `products/*` and `thumbnails/*`
   - TTL: 24 hours default, 7 days max
   - Compress: enabled (gzip/brotli)
   - Price class: PriceClass_100 (US/Europe only for cost)
   - Origin Access Control (OAC) - modern approach, not OAI

2. **Update S3 bucket policy** to allow CloudFront OAC access
   - Remove direct public read policy once CloudFront is working

3. **Output CloudFront domain** for use in storefront configuration
   - Export: `cloudfront_domain_name` and `cloudfront_distribution_id`

4. **Wire into main.tf**
   - Create module instance
   - Pass S3 bucket details
   - Add conditional variable `enable_cloudfront` (default: true for staging/production)

5. **Update storefront to use CloudFront URLs**
   - Either via environment variable `NEXT_PUBLIC_MEDIA_URL`
   - Or by updating the Saleor API `AWS_MEDIA_CUSTOM_DOMAIN` setting

## Constraints

- Follow existing Terraform patterns in this codebase
- Do NOT modify `main` branch - work on `platform/main` or create feature branch
- Use `us-east-1` provider for ACM cert (already configured as `aws.us_east_1`)
- Keep backward compatibility - should work with or without CloudFront enabled

## Validation

After implementation:
1. Run `terraform plan` to verify no errors
2. Show the complete module structure
3. Explain how to test in staging before production

## Files to Create/Modify

Create:
- `infra/terraform/modules/cloudfront/main.tf`
- `infra/terraform/modules/cloudfront/variables.tf`
- `infra/terraform/modules/cloudfront/outputs.tf`

Modify:
- `infra/terraform/main.tf` (add module, wire outputs)
- `infra/terraform/variables.tf` (add enable_cloudfront variable)
- `infra/terraform/modules/s3/main.tf` (update bucket policy for OAC)
- `infra/terraform/modules/ecs/main.tf` (add MEDIA_URL env var to storefront)

Start by reading the existing S3 and ALB modules to understand the patterns, then implement the CloudFront module.
```

---

## Expected Outcome

After running this prompt, you should have:

1. **New CloudFront module** with proper OAC configuration
2. **Updated S3 policy** that works with CloudFront
3. **Terraform outputs** exposing CloudFront domain
4. **ECS task definition** updated to use CloudFront URLs

## Cost Estimate

CloudFront pricing at expected scale:
- ~$50-100/month for staging traffic
- ~$200-500/month at $5M revenue scale
- Savings from reduced S3 egress offset most of the cost

## Follow-up Tasks

After CloudFront is deployed:
1. Update `storefront/next.config.js` to use CloudFront domain in `remotePatterns`
2. Invalidate cache if needed: `aws cloudfront create-invalidation`
3. Monitor cache hit ratio in CloudWatch
