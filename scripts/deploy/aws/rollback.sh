#!/usr/bin/env bash
#
# Rollback ECS services to previous task definition revision
#
# Usage: ./rollback.sh <environment> [service]
#
# Arguments:
#   environment - staging or production
#   service     - (optional) specific service to rollback, or all if omitted

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# =============================================================================
# Arguments
# =============================================================================

ENV="${1:-}"
SERVICE="${2:-all}"

if [[ -z "$ENV" ]]; then
    log_error "Usage: $0 <environment> [service]"
    exit 1
fi

# =============================================================================
# Configuration
# =============================================================================

REGION="${AWS_REGION:-us-west-2}"
CLUSTER="$(get_cluster_name "$ENV")"

# Services to rollback
if [[ "$SERVICE" == "all" ]]; then
    SERVICES=(api worker storefront dashboard stripe-app inventory-ops-app buylist-app pos-app)
else
    SERVICES=("$SERVICE")
fi

# =============================================================================
# Main
# =============================================================================

log_warn "ROLLBACK INITIATED FOR ${ENV}"
log_warn "======================================"
log_info "Cluster: ${CLUSTER}"
log_info "Services: ${SERVICES[*]}"
echo ""

FAILURES=0

for svc in "${SERVICES[@]}"; do
    log_info "Rolling back ${svc}..."

    # Get current task definition
    CURRENT_TASK_DEF=$(get_current_task_def "$CLUSTER" "$svc" 2>/dev/null || echo "")

    if [[ -z "$CURRENT_TASK_DEF" ]]; then
        log_warn "Service ${svc} not found, skipping"
        continue
    fi

    # Parse family and revision
    FAMILY=$(echo "$CURRENT_TASK_DEF" | sed 's/:/ /g' | awk -F'/' '{print $NF}' | awk '{print $1}')
    CURRENT_REV=$(echo "$CURRENT_TASK_DEF" | sed 's/.*://')

    if [[ "$CURRENT_REV" -le 1 ]]; then
        log_warn "Service ${svc} is at revision 1, cannot rollback further"
        continue
    fi

    PREV_REV=$((CURRENT_REV - 1))
    PREV_TASK_DEF="${FAMILY}:${PREV_REV}"

    log_info "  Current: revision ${CURRENT_REV}"
    log_info "  Rolling back to: revision ${PREV_REV}"

    # Verify previous revision exists
    if ! aws ecs describe-task-definition --task-definition "$PREV_TASK_DEF" >/dev/null 2>&1; then
        log_error "Previous task definition ${PREV_TASK_DEF} not found"
        ((FAILURES++)) || true
        continue
    fi

    # Update service to use previous task definition
    if aws ecs update-service \
        --cluster "$CLUSTER" \
        --service "$svc" \
        --task-definition "$PREV_TASK_DEF" \
        --force-new-deployment \
        >/dev/null 2>&1; then
        log_success "Rollback initiated for ${svc}"
    else
        log_error "Failed to rollback ${svc}"
        ((FAILURES++)) || true
    fi
done

echo ""
log_info "======================================"

if [[ "$FAILURES" -eq 0 ]]; then
    log_success "Rollback initiated for all services"
    log_warn "NOTE: Database schema changes are NOT rolled back"
    log_warn "If migrations were applied, manual intervention may be required"
else
    log_error "Rollback completed with ${FAILURES} failure(s)"
    exit 1
fi
