#!/usr/bin/env bash
#
# Build, push, and deploy a SINGLE service to staging/production
# For fast iteration: ~5 minutes from code change to running on AWS
#
# Usage: ./deploy-single.sh <environment> <service> [--skip-wait] [--dry-run]
#
# Services:
#   storefront, stripe, inventory-ops, buylist, pos, mtg-import
#
# Examples:
#   ./deploy-single.sh staging inventory-ops          # Build + deploy inventory-ops
#   ./deploy-single.sh staging storefront --skip-wait # Deploy storefront, don't wait
#   ./deploy-single.sh staging pos --dry-run          # Show what would happen
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Docker with Buildx support
#   - ECR login (script handles this automatically)
#
# Environment Variables:
#   AWS_REGION         - AWS region (default: us-west-1 for staging, us-west-2 for production)
#   STAGING_API_URL    - Staging API URL (required for storefront builds)
#   STAGING_STOREFRONT_URL - Staging storefront URL (required for storefront builds)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# =============================================================================
# Arguments
# =============================================================================

ENV="${1:-}"
SERVICE="${2:-}"
SKIP_WAIT=false
DRY_RUN=false

shift 2 2>/dev/null || true
for arg in "$@"; do
    case "$arg" in
        --skip-wait) SKIP_WAIT=true ;;
        --dry-run) DRY_RUN=true ;;
        *) log_error "Unknown argument: $arg"; exit 1 ;;
    esac
done

if [[ -z "$ENV" || -z "$SERVICE" ]]; then
    echo "Usage: $0 <environment> <service> [--skip-wait] [--dry-run]"
    echo ""
    echo "Services: storefront, stripe, inventory-ops, buylist, pos, mtg-import"
    exit 1
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    log_error "Environment must be 'staging' or 'production'"
    exit 1
fi

# =============================================================================
# Service Configuration
# =============================================================================

# Default region per environment
if [[ -z "${AWS_REGION:-}" ]]; then
    case "$ENV" in
        staging) export AWS_REGION="us-west-1" ;;
        production) export AWS_REGION="us-west-2" ;;
    esac
fi

ACCOUNT_ID="$(get_account_id)"
ECR_REGISTRY="$(get_ecr_registry "$ACCOUNT_ID" "$AWS_REGION")"
CLUSTER="$(get_cluster_name "$ENV")"
SHA="$(cd "$REPO_ROOT" && git rev-parse --short HEAD)"

# Map service name to build configuration
declare -A ECR_REPO_MAP=(
    ["storefront"]="saleor-platform/storefront"
    ["stripe"]="saleor-platform/stripe-app"
    ["inventory-ops"]="saleor-platform/inventory-ops-app"
    ["buylist"]="saleor-platform/buylist-app"
    ["pos"]="saleor-platform/pos-app"
    ["mtg-import"]="saleor-platform/mtg-import-app"
)

declare -A CONTEXT_MAP=(
    ["storefront"]="./storefront"
    ["stripe"]="./saleor-apps"
    ["inventory-ops"]="./saleor-apps"
    ["buylist"]="./saleor-apps"
    ["pos"]="./saleor-apps"
    ["mtg-import"]="./saleor-apps"
)

declare -A DOCKERFILE_MAP=(
    ["storefront"]="./storefront/Dockerfile"
    ["stripe"]="./saleor-apps/apps/stripe/Dockerfile"
    ["inventory-ops"]="./saleor-apps/apps/inventory-ops/Dockerfile"
    ["buylist"]="./saleor-apps/apps/buylist/Dockerfile"
    ["pos"]="./saleor-apps/apps/pos/Dockerfile"
    ["mtg-import"]="./saleor-apps/apps/mtg-import/Dockerfile"
)

declare -A ECS_SERVICE_MAP=(
    ["storefront"]="storefront"
    ["stripe"]="stripe"
    ["inventory-ops"]="inventory-ops"
    ["buylist"]="buylist"
    ["pos"]="pos"
    ["mtg-import"]="mtg-import"
)

declare -A BASE_PATH_MAP=(
    ["stripe"]="/apps/stripe"
    ["inventory-ops"]="/apps/inventory"
    ["buylist"]="/apps/buylist"
    ["pos"]="/apps/pos"
    ["mtg-import"]="/apps/mtg-import"
)

# Validate service name
ECR_REPO="${ECR_REPO_MAP[$SERVICE]:-}"
if [[ -z "$ECR_REPO" ]]; then
    log_error "Unknown service: ${SERVICE}"
    echo "Valid services: ${!ECR_REPO_MAP[*]}"
    exit 1
fi

CONTEXT="${CONTEXT_MAP[$SERVICE]}"
DOCKERFILE="${DOCKERFILE_MAP[$SERVICE]}"
ECS_SERVICE="${ECS_SERVICE_MAP[$SERVICE]}"
IMAGE="${ECR_REGISTRY}/${ECR_REPO}:${SHA}"
IMAGE_LATEST="${ECR_REGISTRY}/${ECR_REPO}:${ENV}-latest"

# =============================================================================
# Build Args
# =============================================================================

BUILD_ARGS=""
if [[ "$SERVICE" == "storefront" ]]; then
    # Storefront needs environment-specific URLs baked in at build time
    API_URL="${STAGING_API_URL:-}"
    SF_URL="${STAGING_STOREFRONT_URL:-}"

    if [[ -z "$API_URL" || -z "$SF_URL" ]]; then
        log_error "Storefront builds require STAGING_API_URL and STAGING_STOREFRONT_URL"
        log_error "Set them or export from your environment"
        exit 1
    fi

    BUILD_ARGS="--build-arg NEXT_PUBLIC_BUILD_ENV=${ENV}"
    BUILD_ARGS="${BUILD_ARGS} --build-arg NEXT_PUBLIC_SALEOR_API_URL=${API_URL}/graphql/"
    BUILD_ARGS="${BUILD_ARGS} --build-arg NEXT_PUBLIC_STOREFRONT_URL=${SF_URL}"
    BUILD_ARGS="${BUILD_ARGS} --build-arg NEXT_PUBLIC_DEFAULT_CHANNEL=webstore"
else
    BASE_PATH="${BASE_PATH_MAP[$SERVICE]:-}"
    if [[ -n "$BASE_PATH" ]]; then
        BUILD_ARGS="--build-arg BASE_PATH=${BASE_PATH}"
    fi
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
log_info "============================================="
log_info "  Single-Service Deploy"
log_info "============================================="
log_info "  Environment: ${ENV}"
log_info "  Service:     ${SERVICE}"
log_info "  ECS Service: ${ECS_SERVICE}"
log_info "  Cluster:     ${CLUSTER}"
log_info "  SHA:         ${SHA}"
log_info "  Image:       ${IMAGE}"
log_info "  Skip Wait:   ${SKIP_WAIT}"
log_info "  Dry Run:     ${DRY_RUN}"
log_info "============================================="
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_warn "DRY RUN — no changes will be made"
    echo ""
    echo "Would execute:"
    echo "  1. docker buildx build -f ${DOCKERFILE} ${BUILD_ARGS} -t ${IMAGE} -t ${IMAGE_LATEST} ${CONTEXT}"
    echo "  2. docker push ${IMAGE} ${IMAGE_LATEST}"
    echo "  3. deploy-service.sh ${ENV} ${ECS_SERVICE} ${SHA}"
    if [[ "$SKIP_WAIT" == "false" ]]; then
        echo "  4. aws ecs wait services-stable --cluster ${CLUSTER} --services ${ECS_SERVICE}"
    fi
    exit 0
fi

# =============================================================================
# Step 1: ECR Login
# =============================================================================

STEP_START=$(date +%s)
log_info "[1/4] Logging into ECR..."

aws ecr get-login-password --region "${AWS_REGION}" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}" 2>/dev/null

log_success "ECR login complete ($(( $(date +%s) - STEP_START ))s)"

# =============================================================================
# Step 2: Build Image
# =============================================================================

STEP_START=$(date +%s)
log_info "[2/4] Building ${SERVICE}..."

cd "$REPO_ROOT"

# Use buildx for cache support
docker buildx build \
    -f "${DOCKERFILE}" \
    ${BUILD_ARGS} \
    -t "${IMAGE}" \
    -t "${IMAGE_LATEST}" \
    --push \
    --cache-from "type=registry,ref=${IMAGE_LATEST}" \
    "${CONTEXT}"

BUILD_TIME=$(( $(date +%s) - STEP_START ))
log_success "Build complete (${BUILD_TIME}s)"

# =============================================================================
# Step 3: Deploy to ECS
# =============================================================================

STEP_START=$(date +%s)
log_info "[3/4] Deploying ${ECS_SERVICE} to ${ENV}..."

"${SCRIPT_DIR}/deploy-service.sh" "${ENV}" "${ECS_SERVICE}" "${SHA}"

DEPLOY_TIME=$(( $(date +%s) - STEP_START ))
log_success "Deploy initiated (${DEPLOY_TIME}s)"

# =============================================================================
# Step 4: Wait for Stability (optional)
# =============================================================================

WAIT_TIME=0
if [[ "$SKIP_WAIT" == "false" ]]; then
    STEP_START=$(date +%s)
    log_info "[4/4] Waiting for ${ECS_SERVICE} to stabilize..."

    aws ecs wait services-stable \
        --cluster "${CLUSTER}" \
        --services "${ECS_SERVICE}" \
        --region "${AWS_REGION}"

    WAIT_TIME=$(( $(date +%s) - STEP_START ))
    log_success "Service stable (${WAIT_TIME}s)"
else
    log_info "[4/4] Skipping stability wait (--skip-wait)"
fi

# =============================================================================
# Summary
# =============================================================================

TOTAL_TIME=$(( BUILD_TIME + DEPLOY_TIME + WAIT_TIME ))

echo ""
log_success "============================================="
log_success "  Deployment Complete!"
log_success "============================================="
log_success "  Service:    ${SERVICE}"
log_success "  Build:      ${BUILD_TIME}s"
log_success "  Deploy:     ${DEPLOY_TIME}s"
log_success "  Wait:       ${WAIT_TIME}s"
log_success "  Total:      ${TOTAL_TIME}s"
log_success "============================================="
echo ""
