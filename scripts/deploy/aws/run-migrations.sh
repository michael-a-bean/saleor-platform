#!/usr/bin/env bash
#
# Run database migrations as an ECS one-off task
#
# Usage: ./run-migrations.sh <environment> <type>
#
# Arguments:
#   environment - staging or production
#   type        - django or prisma

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# =============================================================================
# Arguments
# =============================================================================

ENV="${1:-}"
MIGRATION_TYPE="${2:-}"

if [[ -z "$ENV" || -z "$MIGRATION_TYPE" ]]; then
    log_error "Usage: $0 <environment> <type>"
    log_error "  type: django or prisma"
    exit 1
fi

if [[ "$MIGRATION_TYPE" != "django" && "$MIGRATION_TYPE" != "prisma" ]]; then
    log_error "Migration type must be 'django' or 'prisma'"
    exit 1
fi

# =============================================================================
# Configuration
# =============================================================================

REGION="${AWS_REGION:-us-west-2}"
CLUSTER="$(get_cluster_name "$ENV")"
TASK_DEF="saleor-platform-${ENV}-migrate"

# Get VPC configuration from ECS service
log_info "Getting network configuration from existing service..."
NETWORK_CONFIG=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services api \
    --query 'services[0].networkConfiguration' \
    --output json)

SUBNETS=$(echo "$NETWORK_CONFIG" | jq -r '.awsvpcConfiguration.subnets | join(",")')
SECURITY_GROUPS=$(echo "$NETWORK_CONFIG" | jq -r '.awsvpcConfiguration.securityGroups | join(",")')

# =============================================================================
# Main
# =============================================================================

log_info "Running ${MIGRATION_TYPE} migrations on ${ENV}"
log_info "  Cluster: ${CLUSTER}"
log_info "  Task Definition: ${TASK_DEF}"

# Run migrations as a one-off task
log_info "Starting migration task..."

# Build command override based on type
if [[ "$MIGRATION_TYPE" == "django" ]]; then
    COMMAND='["python", "manage.py", "migrate", "--noinput"]'
else
    # Prisma migrations run from inventory-ops-app
    TASK_DEF="saleor-platform-${ENV}-inventory-ops-app"
    COMMAND='["npx", "prisma", "migrate", "deploy"]'
fi

TASK_ARN=$(aws ecs run-task \
    --cluster "$CLUSTER" \
    --task-definition "$TASK_DEF" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SECURITY_GROUPS}],assignPublicIp=DISABLED}" \
    --overrides "{\"containerOverrides\":[{\"name\":\"migrate\",\"command\":${COMMAND}}]}" \
    --query 'tasks[0].taskArn' \
    --output text)

if [[ -z "$TASK_ARN" || "$TASK_ARN" == "None" ]]; then
    log_error "Failed to start migration task"
    exit 1
fi

log_info "Migration task started: ${TASK_ARN}"

# Wait for task to complete
log_info "Waiting for migration task to complete..."
aws ecs wait tasks-stopped \
    --cluster "$CLUSTER" \
    --tasks "$TASK_ARN"

# Check exit code
EXIT_CODE=$(aws ecs describe-tasks \
    --cluster "$CLUSTER" \
    --tasks "$TASK_ARN" \
    --query 'tasks[0].containers[0].exitCode' \
    --output text)

if [[ "$EXIT_CODE" != "0" ]]; then
    log_error "Migration task failed with exit code: ${EXIT_CODE}"

    # Get task logs for debugging
    TASK_ID="${TASK_ARN##*/}"
    log_error "Check CloudWatch logs: /ecs/saleor-platform-${ENV}/migrate"

    # Get stop reason
    STOP_REASON=$(aws ecs describe-tasks \
        --cluster "$CLUSTER" \
        --tasks "$TASK_ARN" \
        --query 'tasks[0].stoppedReason' \
        --output text)
    log_error "Stop reason: ${STOP_REASON}"

    exit 1
fi

log_success "Migration task completed successfully"
