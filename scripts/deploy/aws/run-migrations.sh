#!/usr/bin/env bash
#
# Run database migrations as an ECS one-off task
#
# Usage: ./run-migrations.sh <environment> <type> [app]
#
# Arguments:
#   environment - staging or production
#   type        - django or prisma
#   app         - (prisma only) app name: inventory-ops, mtg-import (default: inventory-ops)
#
# Required Environment Variables:
#   ECS_TASK_SUBNETS          - Comma-separated subnet IDs for task networking
#   ECS_TASK_SECURITY_GROUPS  - Comma-separated security group IDs
#
# Optional Environment Variables:
#   SHA                         - Git SHA / image tag to override the container image
#                                 (ensures migrations run against the newly-built image)
#   ECS_TASK_ASSIGN_PUBLIC_IP   - ENABLED or DISABLED (default: DISABLED)
#   FALLBACK_NETWORK_FROM_SERVICE - Set to 'true' to allow fallback to existing service
#   SERVICE_NAME                - Service name for fallback (required if fallback enabled)
#   DRY_RUN                     - Set to 'true' to validate inputs without AWS calls
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# =============================================================================
# Arguments
# =============================================================================

ENV="${1:-}"
MIGRATION_TYPE="${2:-}"
PRISMA_APP="${3:-inventory-ops}"  # Default to inventory-ops for backwards compatibility

if [[ -z "$ENV" || -z "$MIGRATION_TYPE" ]]; then
    log_error "Usage: $0 <environment> <type> [app]"
    log_error "  type: django or prisma"
    log_error "  app:  (prisma only) inventory-ops, mtg-import (default: inventory-ops)"
    exit 1
fi

if [[ "$MIGRATION_TYPE" != "django" && "$MIGRATION_TYPE" != "prisma" ]]; then
    log_error "Migration type must be 'django' or 'prisma'"
    exit 1
fi

# Validate Prisma app name
if [[ "$MIGRATION_TYPE" == "prisma" ]]; then
    case "$PRISMA_APP" in
        inventory-ops|mtg-import)
            ;;
        *)
            log_error "Invalid Prisma app: ${PRISMA_APP}"
            log_error "Valid apps: inventory-ops, mtg-import"
            exit 1
            ;;
    esac
fi

# =============================================================================
# Configuration
# =============================================================================

REGION="${AWS_REGION:-us-west-2}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(get_account_id)}"
ECR_REGISTRY="$(get_ecr_registry "$ACCOUNT_ID" "$REGION")"
CLUSTER="$(get_cluster_name "$ENV")"
TASK_DEF="saleor-platform-${ENV}-migrate"
SHA="${SHA:-}"
DRY_RUN="${DRY_RUN:-false}"

# =============================================================================
# Network Configuration
# =============================================================================

# Check for explicit network configuration (preferred)
ECS_TASK_SUBNETS="${ECS_TASK_SUBNETS:-}"
ECS_TASK_SECURITY_GROUPS="${ECS_TASK_SECURITY_GROUPS:-}"
ECS_TASK_ASSIGN_PUBLIC_IP="${ECS_TASK_ASSIGN_PUBLIC_IP:-DISABLED}"

# Fallback configuration (optional, for non-first-deploy scenarios)
FALLBACK_NETWORK_FROM_SERVICE="${FALLBACK_NETWORK_FROM_SERVICE:-false}"
SERVICE_NAME="${SERVICE_NAME:-}"

# Function to build awsvpcConfiguration JSON from explicit inputs
build_network_config_from_inputs() {
    local subnets="$1"
    local security_groups="$2"
    local assign_public_ip="$3"

    # Convert comma-separated to JSON array format
    local subnet_array
    subnet_array=$(echo "$subnets" | tr ',' '\n' | sed 's/^/"/;s/$/"/' | paste -sd ',' -)

    local sg_array
    sg_array=$(echo "$security_groups" | tr ',' '\n' | sed 's/^/"/;s/$/"/' | paste -sd ',' -)

    echo "{\"subnets\":[${subnet_array}],\"securityGroups\":[${sg_array}],\"assignPublicIp\":\"${assign_public_ip}\"}"
}

# Function to get network config from existing service (fallback only)
get_network_config_from_service() {
    local cluster="$1"
    local service="$2"

    log_warn "Using fallback: fetching network config from existing service '${service}'..."

    local config
    config=$(aws ecs describe-services \
        --cluster "$cluster" \
        --services "$service" \
        --query 'services[0].networkConfiguration.awsvpcConfiguration' \
        --output json 2>/dev/null || echo "null")

    if [[ "$config" == "null" || -z "$config" ]]; then
        log_error "Failed to get network configuration from service '${service}'"
        log_error "Service may not exist yet (first deploy) or is misconfigured"
        return 1
    fi

    # Extract and rebuild config in consistent format
    local subnets security_groups assign_public_ip
    subnets=$(echo "$config" | jq -r '.subnets | join(",")')
    security_groups=$(echo "$config" | jq -r '.securityGroups | join(",")')
    assign_public_ip=$(echo "$config" | jq -r '.assignPublicIp // "DISABLED"')

    if [[ -z "$subnets" || "$subnets" == "null" || -z "$security_groups" || "$security_groups" == "null" ]]; then
        log_error "Network configuration from service '${service}' is incomplete"
        return 1
    fi

    build_network_config_from_inputs "$subnets" "$security_groups" "$assign_public_ip"
}

# Validate network configuration inputs
validate_network_inputs() {
    local subnets="$1"
    local security_groups="$2"
    local assign_public_ip="$3"

    local valid=true

    # Validate subnets (must look like subnet-xxxxxxxx)
    if [[ -z "$subnets" ]]; then
        log_error "ECS_TASK_SUBNETS is required but empty"
        valid=false
    else
        IFS=',' read -ra SUBNET_ARRAY <<< "$subnets"
        for subnet in "${SUBNET_ARRAY[@]}"; do
            if [[ ! "$subnet" =~ ^subnet-[a-f0-9]+$ ]]; then
                log_error "Invalid subnet ID format: '${subnet}' (expected subnet-xxxxxxxx)"
                valid=false
            fi
        done
    fi

    # Validate security groups (must look like sg-xxxxxxxx)
    if [[ -z "$security_groups" ]]; then
        log_error "ECS_TASK_SECURITY_GROUPS is required but empty"
        valid=false
    else
        IFS=',' read -ra SG_ARRAY <<< "$security_groups"
        for sg in "${SG_ARRAY[@]}"; do
            if [[ ! "$sg" =~ ^sg-[a-f0-9]+$ ]]; then
                log_error "Invalid security group ID format: '${sg}' (expected sg-xxxxxxxx)"
                valid=false
            fi
        done
    fi

    # Validate assignPublicIp
    if [[ "$assign_public_ip" != "ENABLED" && "$assign_public_ip" != "DISABLED" ]]; then
        log_error "ECS_TASK_ASSIGN_PUBLIC_IP must be ENABLED or DISABLED, got: '${assign_public_ip}'"
        valid=false
    fi

    if [[ "$valid" == "false" ]]; then
        return 1
    fi

    return 0
}

# Determine network configuration
log_info "Resolving network configuration..."

NETWORK_CONFIG=""

if [[ -n "$ECS_TASK_SUBNETS" && -n "$ECS_TASK_SECURITY_GROUPS" ]]; then
    # Primary path: use explicit inputs
    log_info "Using explicit network configuration from environment variables"

    if ! validate_network_inputs "$ECS_TASK_SUBNETS" "$ECS_TASK_SECURITY_GROUPS" "$ECS_TASK_ASSIGN_PUBLIC_IP"; then
        log_error "Network configuration validation failed"
        exit 1
    fi

    NETWORK_CONFIG=$(build_network_config_from_inputs "$ECS_TASK_SUBNETS" "$ECS_TASK_SECURITY_GROUPS" "$ECS_TASK_ASSIGN_PUBLIC_IP")
    log_success "Network configuration built from explicit inputs"

elif [[ "$FALLBACK_NETWORK_FROM_SERVICE" == "true" ]]; then
    # Fallback path: get from existing service
    if [[ -z "$SERVICE_NAME" ]]; then
        log_error "FALLBACK_NETWORK_FROM_SERVICE=true but SERVICE_NAME not provided"
        log_error "Set SERVICE_NAME to the service to fetch network config from"
        exit 1
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_error "Cannot use service fallback in DRY_RUN mode (requires AWS API calls)"
        exit 1
    fi

    NETWORK_CONFIG=$(get_network_config_from_service "$CLUSTER" "$SERVICE_NAME") || exit 1
    log_success "Network configuration retrieved from service '${SERVICE_NAME}'"

else
    # No configuration available
    log_error "Network configuration not provided"
    log_error ""
    log_error "Required environment variables:"
    log_error "  ECS_TASK_SUBNETS          - Comma-separated subnet IDs (e.g., subnet-abc123,subnet-def456)"
    log_error "  ECS_TASK_SECURITY_GROUPS  - Comma-separated security group IDs (e.g., sg-abc123)"
    log_error ""
    log_error "Optional:"
    log_error "  ECS_TASK_ASSIGN_PUBLIC_IP - ENABLED or DISABLED (default: DISABLED)"
    log_error ""
    log_error "For non-first-deploy, you can optionally enable fallback:"
    log_error "  FALLBACK_NETWORK_FROM_SERVICE=true SERVICE_NAME=api"
    exit 1
fi

# Build properly-escaped JSON for AWS CLI using Python
# NETWORK_CONFIG contains the awsvpcConfiguration object
# NETWORK_JSON wraps it in {"awsvpcConfiguration": ...} with proper escaping
log_info "Building AWS CLI network configuration JSON..."
NETWORK_JSON="$(NETWORK_CONFIG="$NETWORK_CONFIG" python3 - <<'PY'
import json, os, sys
try:
    cfg = json.loads(os.environ["NETWORK_CONFIG"])
    print(json.dumps({"awsvpcConfiguration": cfg}))
except (json.JSONDecodeError, KeyError) as e:
    print(f"Error building network JSON: {e}", file=sys.stderr)
    sys.exit(1)
PY
)"

if [[ -z "$NETWORK_JSON" ]]; then
    log_error "Failed to build network configuration JSON"
    exit 1
fi

# =============================================================================
# Dry Run Mode
# =============================================================================

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "DRY_RUN mode - validating configuration only"
    log_info ""
    log_info "Configuration Summary:"
    log_info "  Environment:     ${ENV}"
    log_info "  Migration Type:  ${MIGRATION_TYPE}"
    log_info "  Cluster:         ${CLUSTER}"
    log_info "  Task Definition: ${TASK_DEF}"
    log_info ""
    log_info "Network Configuration JSON:"
    if command -v jq &>/dev/null; then
        echo "$NETWORK_JSON" | jq .
    else
        echo "$NETWORK_JSON"
    fi
    log_info ""

    # Build command preview based on migration type
    if [[ "$MIGRATION_TYPE" == "django" ]]; then
        DRY_CONTAINER_NAME="migrate"
        DRY_COMMAND='["python", "manage.py", "migrate", "--noinput"]'
    else
        DRY_TASK_DEF="saleor-platform-${ENV}-${PRISMA_APP}"
        DRY_CONTAINER_NAME="${PRISMA_APP}"
        DRY_COMMAND='["npx", "prisma", "migrate", "deploy"]'
    fi
    DRY_TASK_DEF="${DRY_TASK_DEF:-$TASK_DEF}"

    log_info "AWS CLI command that would be executed:"
    log_info ""
    cat <<EOF
aws ecs run-task \\
    --cluster "$CLUSTER" \\
    --task-definition "$DRY_TASK_DEF" \\
    --launch-type FARGATE \\
    --network-configuration '$NETWORK_JSON' \\
    --overrides '{"containerOverrides":[{"name":"${DRY_CONTAINER_NAME}","command":${DRY_COMMAND}}]}' \\
    --query 'tasks[0].taskArn' \\
    --output text
EOF
    log_info ""
    log_success "Dry run complete - configuration is valid"
    exit 0
fi

# =============================================================================
# Main
# =============================================================================

log_info "Running ${MIGRATION_TYPE} migrations on ${ENV}"
log_info "  Cluster: ${CLUSTER}"
log_info "  Task Definition: ${TASK_DEF}"

# Run migrations as a one-off task
log_info "Starting migration task..."

# Build command override based on type
# IMPORTANT: Container name must match the container defined in the task definition
IMAGE_OVERRIDE=""
if [[ "$MIGRATION_TYPE" == "django" ]]; then
    CONTAINER_NAME="migrate"
    COMMAND='["python", "manage.py", "migrate", "--noinput"]'
else
    # Prisma migrations run from the specified app's task definition
    TASK_DEF="saleor-platform-${ENV}-${PRISMA_APP}"
    CONTAINER_NAME="${PRISMA_APP}"
    COMMAND='["npx", "prisma", "migrate", "deploy"]'
    log_info "  Prisma App: ${PRISMA_APP}"

    # Map Prisma app names to ECR image names
    declare -A PRISMA_IMAGE_MAP=(
        ["inventory-ops"]="inventory-ops-app"
        ["mtg-import"]="mtg-import-app"
    )

    # Override container image with newly-built image if SHA is provided
    # and the image actually exists in ECR (it won't if the build was skipped)
    if [[ -n "$SHA" ]]; then
        IMAGE_NAME="${PRISMA_IMAGE_MAP[$PRISMA_APP]}"
        CANDIDATE_IMAGE="${ECR_REGISTRY}/saleor-platform/${IMAGE_NAME}:${SHA}"
        if aws ecr describe-images \
            --repository-name "saleor-platform/${IMAGE_NAME}" \
            --image-ids imageTag="${SHA}" \
            --query 'imageDetails[0].imageTags' \
            --output text &>/dev/null; then
            IMAGE_OVERRIDE="$CANDIDATE_IMAGE"
            log_info "  Image override: ${IMAGE_OVERRIDE}"
        else
            log_info "  Image ${SHA} not found in ECR — using current task definition image"
        fi
    fi
fi

# Verify container name exists in task definition (fail fast)
log_info "Verifying container '${CONTAINER_NAME}' exists in task definition '${TASK_DEF}'..."
CONTAINER_NAMES=$(aws ecs describe-task-definition \
    --task-definition "$TASK_DEF" \
    --query 'taskDefinition.containerDefinitions[].name' \
    --output text 2>/dev/null || echo "")

if [[ -z "$CONTAINER_NAMES" ]]; then
    log_error "Task definition '${TASK_DEF}' not found or has no containers"
    exit 1
fi

if ! echo "$CONTAINER_NAMES" | grep -qw "$CONTAINER_NAME"; then
    log_error "Container '${CONTAINER_NAME}' not found in task definition '${TASK_DEF}'"
    log_error "Available containers: ${CONTAINER_NAMES}"
    exit 1
fi
log_success "Container '${CONTAINER_NAME}' found in task definition"

# If image override is needed, register a new task definition revision with the updated image
EFFECTIVE_TASK_DEF="$TASK_DEF"
if [[ -n "$IMAGE_OVERRIDE" ]]; then
    log_info "Registering new task definition with updated image..."

    # Get current task definition JSON
    CURRENT_TD=$(aws ecs describe-task-definition \
        --task-definition "$TASK_DEF" \
        --query 'taskDefinition' \
        --output json)

    # Replace the image in container definitions and register new revision
    NEW_TD=$(echo "$CURRENT_TD" | python3 -c "
import json, sys
td = json.load(sys.stdin)
for c in td['containerDefinitions']:
    if c['name'] == '${CONTAINER_NAME}':
        c['image'] = '${IMAGE_OVERRIDE}'
# Only keep fields valid for register-task-definition
keep = ['family','containerDefinitions','taskRoleArn','executionRoleArn',
        'networkMode','volumes','placementConstraints','requiresCompatibilities',
        'cpu','memory','runtimePlatform']
out = {k: td[k] for k in keep if k in td}
print(json.dumps(out))
")

    EFFECTIVE_TASK_DEF=$(aws ecs register-task-definition \
        --cli-input-json "$NEW_TD" \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)

    log_success "Registered task definition: ${EFFECTIVE_TASK_DEF}"
fi

OVERRIDES="{\"containerOverrides\":[{\"name\":\"${CONTAINER_NAME}\",\"command\":${COMMAND}}]}"

TASK_ARN=$(aws ecs run-task \
    --cluster "$CLUSTER" \
    --task-definition "$EFFECTIVE_TASK_DEF" \
    --launch-type FARGATE \
    --network-configuration "$NETWORK_JSON" \
    --overrides "$OVERRIDES" \
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
