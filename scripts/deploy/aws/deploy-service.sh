#!/usr/bin/env bash
#
# Deploy a single ECS service with a new image tag
#
# Usage: ./deploy-service.sh <environment> <service> <sha>
#
# Arguments:
#   environment - staging or production
#   service     - api, worker, storefront, dashboard, stripe-app, etc.
#   sha         - Git SHA or image tag to deploy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# =============================================================================
# Arguments
# =============================================================================

ENV="${1:-}"
SERVICE="${2:-}"
SHA="${3:-}"

if [[ -z "$ENV" || -z "$SERVICE" || -z "$SHA" ]]; then
    log_error "Usage: $0 <environment> <service> <sha>"
    exit 1
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    log_error "Environment must be 'staging' or 'production'"
    exit 1
fi

# =============================================================================
# Configuration
# =============================================================================

REGION="${AWS_REGION:-us-west-2}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(get_account_id)}"
ECR_REGISTRY="$(get_ecr_registry "$ACCOUNT_ID" "$REGION")"
CLUSTER="$(get_cluster_name "$ENV")"

# Map service names to image sources
declare -A IMAGE_MAP=(
    ["api"]="ghcr.io/saleor/saleor:3.22"
    ["worker"]="ghcr.io/saleor/saleor:3.22"
    ["dashboard"]="ghcr.io/saleor/saleor-dashboard:3.22.0"
    ["storefront"]="${ECR_REGISTRY}/saleor-platform/storefront:${SHA}"
    ["stripe-app"]="${ECR_REGISTRY}/saleor-platform/stripe-app:${SHA}"
    ["inventory-ops-app"]="${ECR_REGISTRY}/saleor-platform/inventory-ops-app:${SHA}"
    ["buylist-app"]="${ECR_REGISTRY}/saleor-platform/buylist-app:${SHA}"
    ["pos-app"]="${ECR_REGISTRY}/saleor-platform/pos-app:${SHA}"
    ["meilisearch"]="getmeili/meilisearch:v1.6"
)

# =============================================================================
# Main
# =============================================================================

log_info "Deploying ${SERVICE} to ${ENV}"
log_info "  Cluster: ${CLUSTER}"
log_info "  SHA: ${SHA}"

# Get current task definition
CURRENT_TASK_DEF=$(get_current_task_def "$CLUSTER" "$SERVICE")
log_info "  Current task def: ${CURRENT_TASK_DEF}"

# Get image for this service
IMAGE="${IMAGE_MAP[$SERVICE]:-}"
if [[ -z "$IMAGE" ]]; then
    log_error "Unknown service: ${SERVICE}"
    exit 1
fi
log_info "  Image: ${IMAGE}"

# For custom images, verify they exist in ECR
if [[ "$IMAGE" == *"${ECR_REGISTRY}"* ]]; then
    REPO_NAME="saleor-platform/${SERVICE}"
    if ! image_exists_in_ecr "$REPO_NAME" "$SHA"; then
        log_error "Image not found in ECR: ${IMAGE}"
        exit 1
    fi
    log_success "Image verified in ECR"
fi

# Get current task definition JSON
TASK_DEF_JSON=$(aws ecs describe-task-definition \
    --task-definition "$CURRENT_TASK_DEF" \
    --query 'taskDefinition')

# Update the image in the container definition
NEW_TASK_DEF=$(echo "$TASK_DEF_JSON" | jq --arg IMAGE "$IMAGE" '
    .containerDefinitions[0].image = $IMAGE |
    del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)
')

# Register new task definition
log_info "Registering new task definition..."
NEW_TASK_DEF_ARN=$(echo "$NEW_TASK_DEF" | aws ecs register-task-definition \
    --cli-input-json file:///dev/stdin \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)
log_success "New task definition: ${NEW_TASK_DEF_ARN}"

# Update service to use new task definition
log_info "Updating ECS service..."
aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --task-definition "$NEW_TASK_DEF_ARN" \
    --force-new-deployment \
    >/dev/null

log_success "Service update initiated for ${SERVICE}"

# Optionally wait for stability (can be done by caller)
if [[ "${WAIT_FOR_STABLE:-false}" == "true" ]]; then
    wait_for_service "$CLUSTER" "$SERVICE"
fi

log_success "Deployment of ${SERVICE} to ${ENV} complete"
