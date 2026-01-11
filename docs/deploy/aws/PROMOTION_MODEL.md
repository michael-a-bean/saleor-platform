# Image Promotion Model: Staging to Production

**Generated**: 2026-01-10
**Purpose**: Define and verify image promotion semantics between environments
**Status**: NEEDS IMPROVEMENT - See recommendations below

---

## Current Implementation Analysis

### Staging Deployment (deploy-staging.yml)

**Image Tagging Strategy**:
```yaml
tags: |
  ${{ steps.login-ecr.outputs.registry }}/saleor-platform/storefront:${{ steps.vars.outputs.sha_short }}
  ${{ steps.login-ecr.outputs.registry }}/saleor-platform/storefront:staging-latest
```

- Tags images with Git SHA (short) and `staging-latest`
- Custom-built images (storefront, apps) are pushed to ECR
- Upstream images (api, worker, dashboard) use tags like `:3.22`

### Production Deployment (deploy-production.yml)

**Image Verification**:
```yaml
- name: Verify staging images exist with SHA
  run: |
    SHA="${{ inputs.staging_sha }}"
    for SERVICE in $SERVICES; do
      aws ecr describe-images --repository-name "saleor-platform/${SERVICE}" --image-ids imageTag="${SHA}"
    done
```

**Image Usage**:
- Production workflow takes `staging_sha` as input
- Verifies images with that SHA exist in ECR
- Uses the same SHA to deploy

---

## Promotion Semantics Evaluation

### What's Correct

1. **Same SHA**: Production uses the same Git SHA as staging
2. **No Rebuild**: Production doesn't rebuild images
3. **Verification**: Checks images exist before deployment
4. **Manual Input**: Operator specifies which SHA to promote

### What Needs Improvement

#### Issue 1: Tag-Based, Not Digest-Based (CRITICAL)

**Problem**: While the SHA is the same, we're using **image tags**, not **image digests**.

**Risk**:
- If someone manually pushes a different image with the same tag, production could deploy different code
- Tags are mutable; digests are immutable

**Current**:
```bash
# Staging deploys
image: {ECR}/storefront:abc123

# Production deploys
image: {ECR}/storefront:abc123  # Same tag, but is it the same image?
```

**Recommended**:
```bash
# Staging records digest
image: {ECR}/storefront@sha256:deadbeef...

# Production deploys
image: {ECR}/storefront@sha256:deadbeef...  # Guaranteed identical
```

#### Issue 2: Upstream Images Use Mutable Tags (CRITICAL)

**Problem**: `deploy-service.sh` hardcodes upstream image tags:
```bash
["api"]="ghcr.io/saleor/saleor:3.22"
["worker"]="ghcr.io/saleor/saleor:3.22"
["dashboard"]="ghcr.io/saleor/saleor-dashboard:3.22.0"
```

**Risk**:
- Saleor could push security patches to `:3.22` tag
- Staging might test one version, production deploys another
- Non-reproducible deployments

**Recommended**: Pin upstream images by digest in Terraform:
```hcl
variable "saleor_api_image" {
  default = "ghcr.io/saleor/saleor@sha256:abc123..."
}
```

#### Issue 3: No Release Manifest Artifact

**Problem**: There's no artifact recording exactly which images were deployed to staging.

**Risk**:
- No audit trail of what was promoted
- Difficult to reproduce exact deployment
- No single source of truth for production promotion

---

## Recommended Promotion Model

### Phase 1: Staging Build & Record

```yaml
# In deploy-staging.yml, after build
- name: Record release manifest
  run: |
    MANIFEST="{
      \"git_sha\": \"${GITHUB_SHA}\",
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"images\": {
        \"storefront\": \"$(docker inspect --format='{{index .RepoDigests 0}}' ${ECR}/storefront:${SHA})\",
        \"stripe-app\": \"...\",
        \"api\": \"$(docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/saleor/saleor:3.22)\"
      }
    }"
    echo "$MANIFEST" > release-manifest.json

- name: Upload release manifest
  uses: actions/upload-artifact@v4
  with:
    name: release-manifest-${{ github.sha }}
    path: release-manifest.json
```

### Phase 2: Production Promotion

```yaml
# In deploy-production.yml
- name: Download release manifest
  uses: actions/download-artifact@v4
  with:
    name: release-manifest-${{ inputs.staging_sha }}

- name: Deploy from manifest
  run: |
    # Extract image digests from manifest
    STOREFRONT_IMAGE=$(jq -r '.images.storefront' release-manifest.json)
    API_IMAGE=$(jq -r '.images.api' release-manifest.json)

    # Deploy using digests (immutable)
    ./scripts/deploy/aws/deploy-service.sh production storefront "$STOREFRONT_IMAGE"
```

### Phase 3: Verification

Before production deploy, verify:
1. Manifest SHA matches input SHA
2. All image digests resolve in ECR/GHCR
3. No image has been modified since staging deploy

---

## Immediate Fixes Required

### Fix 1: Capture and Use Digests

Update `scripts/deploy/aws/deploy-service.sh` to:
1. Accept image URI with digest as input
2. Resolve tags to digests if needed
3. Store deployed digest in task definition metadata

### Fix 2: Pin Upstream Images in Terraform

Update `infra/terraform/environments/production.tfvars`:
```hcl
# Get digests:
# docker pull ghcr.io/saleor/saleor:3.22
# docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/saleor/saleor:3.22

saleor_api_image = "ghcr.io/saleor/saleor@sha256:abc123def456..."
saleor_dashboard_image = "ghcr.io/saleor/saleor-dashboard@sha256:789ghi012..."
```

### Fix 3: Generate Release Manifest

Add manifest generation to staging workflow (see example above).

---

## Verification Commands

### Check Image Digest in ECR
```bash
aws ecr describe-images \
  --repository-name saleor-platform/storefront \
  --image-ids imageTag=abc123 \
  --query 'imageDetails[0].imageDigest'
```

### Compare Staging vs Production
```bash
# Get staging task def
aws ecs describe-task-definition \
  --task-definition saleor-platform-staging-storefront \
  --query 'taskDefinition.containerDefinitions[0].image'

# Get production task def
aws ecs describe-task-definition \
  --task-definition saleor-platform-production-storefront \
  --query 'taskDefinition.containerDefinitions[0].image'

# Images should be identical (same digest or same tag with verified digest)
```

---

## Summary

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| Custom Images | Tag-based (SHA) | Digest-based |
| Upstream Images | Mutable tags | Digest-pinned |
| Release Manifest | None | JSON artifact |
| Promotion Verification | Tag exists | Digest matches |
| Audit Trail | Git SHA only | Full manifest |

**Recommendation**: Implement digest-based promotion before first production deploy.

For staging, tag-based deployment is acceptable during initial development.
