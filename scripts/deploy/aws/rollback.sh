#!/usr/bin/env bash
#
# Rollback ECS services to previous task definition revision
#
# Usage: ./rollback.sh <environment> [service] [--include-db]
#
# Arguments:
#   environment  - staging or production
#   service      - (optional) specific service to rollback, or all if omitted
#   --include-db - (optional) also restore the RDS database from the most recent
#                  pre-migration snapshot. This is required when a deploy included
#                  destructive schema changes (column renames, table drops).
#
# Best practice: Use expand-then-contract migrations so schema changes are always
# backwards-compatible and --include-db is never needed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# =============================================================================
# Arguments
# =============================================================================

ENV="${1:-}"
SERVICE="${2:-all}"
INCLUDE_DB=false

# Parse flags from any position
for arg in "$@"; do
    if [[ "$arg" == "--include-db" ]]; then
        INCLUDE_DB=true
    fi
done

# If $2 is --include-db, treat service as "all"
if [[ "$SERVICE" == "--include-db" ]]; then
    SERVICE="all"
fi

if [[ -z "$ENV" ]]; then
    log_error "Usage: $0 <environment> [service] [--include-db]"
    exit 1
fi

# =============================================================================
# Configuration
# =============================================================================

REGION="${AWS_REGION:-us-west-2}"
CLUSTER="$(get_cluster_name "$ENV")"

# Services to rollback
if [[ "$SERVICE" == "all" ]]; then
    SERVICES=(api worker storefront dashboard stripe-app inventory-ops-app pos-app)
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
else
    log_error "Rollback completed with ${FAILURES} failure(s)"
fi

# =============================================================================
# Database Rollback (optional --include-db)
# =============================================================================

if [[ "$INCLUDE_DB" == "true" ]]; then
    DB_INSTANCE="saleor-platform-${ENV}-saleor"
    log_warn "DATABASE ROLLBACK REQUESTED"
    log_warn "======================================"

    # Find the most recent pre-migration snapshot
    LATEST_SNAPSHOT=$(aws rds describe-db-snapshots \
        --db-instance-identifier "$DB_INSTANCE" \
        --query "reverse(sort_by(DBSnapshots[?starts_with(DBSnapshotIdentifier, 'saleor-platform-${ENV}-pre-migrate')], &SnapshotCreateTime))[0].DBSnapshotIdentifier" \
        --output text 2>/dev/null || echo "None")

    if [[ -z "$LATEST_SNAPSHOT" || "$LATEST_SNAPSHOT" == "None" ]]; then
        log_error "No pre-migration snapshot found for ${DB_INSTANCE}"
        log_error "Manual RDS restore required. Check AWS Console for available snapshots."
        exit 1
    fi

    SNAPSHOT_TIME=$(aws rds describe-db-snapshots \
        --db-snapshot-identifier "$LATEST_SNAPSHOT" \
        --query "DBSnapshots[0].SnapshotCreateTime" \
        --output text 2>/dev/null || echo "unknown")

    log_warn "Latest pre-migration snapshot: ${LATEST_SNAPSHOT}"
    log_warn "Snapshot created at: ${SNAPSHOT_TIME}"
    log_warn ""
    log_warn "This will:"
    log_warn "  1. Delete the current RDS instance (${DB_INSTANCE})"
    log_warn "  2. Restore from snapshot ${LATEST_SNAPSHOT}"
    log_warn "  3. ALL data written since the snapshot will be LOST"
    log_warn ""

    # Confirmation prompt (skip in CI with ROLLBACK_DB_CONFIRM=yes)
    if [[ "${ROLLBACK_DB_CONFIRM:-}" != "yes" ]]; then
        read -rp "Type 'RESTORE' to confirm database rollback: " CONFIRM
        if [[ "$CONFIRM" != "RESTORE" ]]; then
            log_info "Database rollback cancelled"
            exit 0
        fi
    fi

    log_info "Restoring RDS from snapshot ${LATEST_SNAPSHOT}..."

    # Restore to a temporary instance, then rename
    TEMP_INSTANCE="${DB_INSTANCE}-restore-$(date +%s)"

    aws rds restore-db-instance-from-db-snapshot \
        --db-instance-identifier "$TEMP_INSTANCE" \
        --db-snapshot-identifier "$LATEST_SNAPSHOT" \
        --no-multi-az \
        >/dev/null 2>&1

    log_info "Restore initiated as ${TEMP_INSTANCE}"
    log_info "Waiting for restored instance to become available (this may take 10-20 minutes)..."

    aws rds wait db-instance-available \
        --db-instance-identifier "$TEMP_INSTANCE" \
        --cli-read-timeout 1800

    log_info "Renaming current instance to ${DB_INSTANCE}-old..."
    aws rds modify-db-instance \
        --db-instance-identifier "$DB_INSTANCE" \
        --new-db-instance-identifier "${DB_INSTANCE}-old" \
        --apply-immediately >/dev/null 2>&1

    # Wait for rename to complete
    sleep 30

    log_info "Renaming restored instance to ${DB_INSTANCE}..."
    aws rds modify-db-instance \
        --db-instance-identifier "$TEMP_INSTANCE" \
        --new-db-instance-identifier "$DB_INSTANCE" \
        --apply-immediately >/dev/null 2>&1

    log_success "Database restored from snapshot ${LATEST_SNAPSHOT}"
    log_warn "Old instance preserved as ${DB_INSTANCE}-old — delete manually after verification"
else
    log_warn ""
    log_warn "NOTE: Database schema changes are NOT rolled back"
    log_warn "If migrations included destructive changes, re-run with --include-db"
    log_warn "Best practice: Use expand-then-contract migrations for backwards compatibility"
fi

if [[ "$FAILURES" -gt 0 ]]; then
    exit 1
fi
