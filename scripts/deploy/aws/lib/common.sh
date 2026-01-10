#!/usr/bin/env bash
# Common functions for AWS deployment scripts

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Get AWS account ID
get_account_id() {
    aws sts get-caller-identity --query Account --output text
}

# Get ECR registry URL
get_ecr_registry() {
    local account_id="${1:-$(get_account_id)}"
    local region="${2:-${AWS_REGION:-us-west-2}}"
    echo "${account_id}.dkr.ecr.${region}.amazonaws.com"
}

# Get ECS cluster name for environment
get_cluster_name() {
    local env="$1"
    echo "saleor-platform-${env}"
}

# Get current task definition for a service
get_current_task_def() {
    local cluster="$1"
    local service="$2"

    aws ecs describe-services \
        --cluster "$cluster" \
        --services "$service" \
        --query 'services[0].taskDefinition' \
        --output text
}

# Wait for ECS service to stabilize
wait_for_service() {
    local cluster="$1"
    local service="$2"
    local timeout="${3:-600}"

    log_info "Waiting for service ${service} to stabilize (timeout: ${timeout}s)..."

    aws ecs wait services-stable \
        --cluster "$cluster" \
        --services "$service" \
        --cli-read-timeout "$timeout" \
        --cli-connect-timeout 10

    log_success "Service ${service} is stable"
}

# Check if image exists in ECR
image_exists_in_ecr() {
    local repo="$1"
    local tag="$2"

    aws ecr describe-images \
        --repository-name "$repo" \
        --image-ids imageTag="$tag" \
        >/dev/null 2>&1
}

# Mask sensitive values in logs
mask_value() {
    local value="$1"
    echo "::add-mask::${value}"
}
