#!/usr/bin/env bash
#
# Bootstrap a fresh Saleor Platform environment after terraform apply.
#
# Automates post-creation steps that don't require external credentials or UI:
#   1. Create inventory_ops database on RDS
#   2. Run Django migrations (Saleor schema)
#   3. Create Saleor superuser
#   4. Run Prisma migrations (inventory-ops schema)
#   5. Force-restart all ECS services
#
# Prerequisites:
#   - terraform apply completed successfully
#   - Docker images pushed to ECR (via CI/CD or manual push)
#   - External secrets updated in SSM (Stripe keys, OTEL headers)
#
# Usage: ./scripts/bootstrap-environment.sh <environment>
#
# After this script completes, you still need to:
#   - Configure Saleor channel, warehouse, shipping via Dashboard
#   - Install Saleor apps via Dashboard
#   - Configure Stripe webhooks in Stripe Dashboard
#   - Run MTG catalog import
#   - Trigger initial price sync
#
# See: docs/ops/runbooks/terraform-destroy-recreate.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/deploy/aws/lib/common.sh"

# =============================================================================
# Arguments
# =============================================================================

ENV="${1:-}"

if [[ -z "$ENV" ]]; then
    log_error "Usage: $0 <environment>"
    log_error "  environment: staging or production"
    exit 1
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    log_error "Environment must be 'staging' or 'production'"
    exit 1
fi

# =============================================================================
# Configuration (from Terraform outputs)
# =============================================================================

REGION="${AWS_REGION:-us-west-1}"
CLUSTER="saleor-platform-${ENV}"
TF_DIR="${SCRIPT_DIR}/../infra/terraform"

log_info "========================================="
log_info "Bootstrap: saleor-platform-${ENV}"
log_info "========================================="
log_info ""

# Get network configuration from Terraform outputs
log_info "Reading Terraform outputs..."

if [[ -d "$TF_DIR" ]]; then
    SUBNETS=$(cd "$TF_DIR" && terraform output -raw ecs_task_subnets 2>/dev/null || echo "")
    SG=$(cd "$TF_DIR" && terraform output -raw ecs_task_security_group 2>/dev/null || echo "")
    RDS_ENDPOINT=$(cd "$TF_DIR" && terraform output -raw rds_endpoint 2>/dev/null || echo "")
else
    log_warn "Terraform directory not found at ${TF_DIR}"
    SUBNETS=""
    SG=""
    RDS_ENDPOINT=""
fi

# Allow environment variable overrides
SUBNETS="${ECS_TASK_SUBNETS:-$SUBNETS}"
SG="${ECS_TASK_SECURITY_GROUPS:-$SG}"

if [[ -z "$SUBNETS" || -z "$SG" ]]; then
    log_error "Could not determine network configuration."
    log_error "Either run from the project root (so Terraform outputs can be read)"
    log_error "or set ECS_TASK_SUBNETS and ECS_TASK_SECURITY_GROUPS env vars."
    exit 1
fi

# Build network config JSON
SUBNET_JSON=$(echo "$SUBNETS" | tr ',' '\n' | sed 's/^/"/;s/$/"/' | paste -sd ',' -)
NETWORK_JSON="{\"awsvpcConfiguration\":{\"subnets\":[${SUBNET_JSON}],\"securityGroups\":[\"${SG}\"],\"assignPublicIp\":\"DISABLED\"}}"

log_success "Network config resolved"
log_info "  Cluster:  ${CLUSTER}"
log_info "  Subnets:  ${SUBNETS}"
log_info "  SG:       ${SG}"
log_info ""

# =============================================================================
# Helper: Run ECS one-off task and wait for completion
# =============================================================================

run_ecs_task() {
    local task_def="$1"
    local container_name="$2"
    local description="$3"
    shift 3
    local command=("$@")

    log_info "Starting: ${description}..."

    # Build command JSON array
    local cmd_json
    cmd_json=$(printf '%s\n' "${command[@]}" | jq -R . | jq -s .)

    local overrides
    overrides=$(jq -n \
        --arg name "$container_name" \
        --argjson cmd "$cmd_json" \
        '{"containerOverrides":[{"name":$name,"command":$cmd}]}')

    local task_arn
    task_arn=$(aws ecs run-task \
        --cluster "$CLUSTER" \
        --task-definition "$task_def" \
        --launch-type FARGATE \
        --network-configuration "$NETWORK_JSON" \
        --overrides "$overrides" \
        --query 'tasks[0].taskArn' \
        --output text \
        --region "$REGION")

    if [[ -z "$task_arn" || "$task_arn" == "None" ]]; then
        log_error "Failed to start task: ${description}"
        return 1
    fi

    log_info "  Task: ${task_arn##*/}"

    # Wait for completion
    aws ecs wait tasks-stopped \
        --cluster "$CLUSTER" \
        --tasks "$task_arn" \
        --region "$REGION"

    # Check exit code
    local exit_code
    exit_code=$(aws ecs describe-tasks \
        --cluster "$CLUSTER" \
        --tasks "$task_arn" \
        --query 'tasks[0].containers[0].exitCode' \
        --output text \
        --region "$REGION")

    if [[ "$exit_code" != "0" ]]; then
        log_error "${description} failed (exit code: ${exit_code})"
        local stop_reason
        stop_reason=$(aws ecs describe-tasks \
            --cluster "$CLUSTER" \
            --tasks "$task_arn" \
            --query 'tasks[0].stoppedReason' \
            --output text \
            --region "$REGION")
        log_error "  Reason: ${stop_reason}"
        return 1
    fi

    log_success "${description} completed"
}

# =============================================================================
# Step 1: Create inventory_ops database
# =============================================================================

log_info "========================================="
log_info "Step 1/5: Create inventory_ops database"
log_info "========================================="

# Use the migrate task definition (has psycopg2 available via Saleor image)
MIGRATE_TASK_DEF="saleor-platform-${ENV}-migrate"

run_ecs_task "$MIGRATE_TASK_DEF" "migrate" \
    "Create inventory_ops database" \
    "python" "-c" \
    "import os, psycopg2; url=os.environ.get('DATABASE_URL',''); parts=url.rsplit('/',1); conn=psycopg2.connect(parts[0]+'/postgres'); conn.autocommit=True; cur=conn.cursor(); cur.execute(\"SELECT 1 FROM pg_database WHERE datname='inventory_ops'\"); exists=cur.fetchone(); cur.execute('CREATE DATABASE inventory_ops') if not exists else None; cur.close(); conn.close(); print('inventory_ops database ' + ('already exists' if exists else 'created'))"

echo ""

# =============================================================================
# Step 2: Run Django migrations
# =============================================================================

log_info "========================================="
log_info "Step 2/5: Django migrations (Saleor)"
log_info "========================================="

run_ecs_task "$MIGRATE_TASK_DEF" "migrate" \
    "Django migrations" \
    "python" "manage.py" "migrate" "--noinput"

echo ""

# =============================================================================
# Step 3: Create superuser
# =============================================================================

log_info "========================================="
log_info "Step 3/5: Create Saleor superuser"
log_info "========================================="

ADMIN_EMAIL="${SALEOR_ADMIN_EMAIL:-admin@michaelbean.org}"

run_ecs_task "$MIGRATE_TASK_DEF" "migrate" \
    "Create superuser (${ADMIN_EMAIL})" \
    "python" "-c" \
    "import django; django.setup(); from django.contrib.auth import get_user_model; User=get_user_model(); u,created=User.objects.get_or_create(email='${ADMIN_EMAIL}',defaults={'is_staff':True,'is_superuser':True,'is_active':True}); print(f'Superuser {u.email} '+('created' if created else 'already exists'))"

echo ""

# =============================================================================
# Step 4: Run Prisma migrations (inventory-ops only)
# =============================================================================

log_info "========================================="
log_info "Step 4/5: Prisma migrations (inventory-ops)"
log_info "========================================="

INVENTORY_TASK_DEF="saleor-platform-${ENV}-inventory-ops"

# Check if inventory-ops image exists before attempting
log_info "Checking if inventory-ops task definition exists..."
if aws ecs describe-task-definition --task-definition "$INVENTORY_TASK_DEF" --region "$REGION" &>/dev/null; then
    run_ecs_task "$INVENTORY_TASK_DEF" "inventory-ops" \
        "Prisma migrations" \
        "npx" "prisma" "migrate" "deploy"
else
    log_warn "inventory-ops task definition not found — skipping Prisma migrations"
    log_warn "Push inventory-ops image to ECR first, then run:"
    log_warn "  scripts/deploy/aws/run-migrations.sh ${ENV} prisma inventory-ops"
fi

echo ""

# =============================================================================
# Step 5: Force-restart ECS services
# =============================================================================

log_info "========================================="
log_info "Step 5/5: Force-restart ECS services"
log_info "========================================="

SERVICES=(api worker beat storefront dashboard stripe inventory-ops pos meilisearch)

for svc in "${SERVICES[@]}"; do
    log_info "Restarting: ${svc}..."
    aws ecs update-service \
        --cluster "$CLUSTER" \
        --service "$svc" \
        --force-new-deployment \
        --region "$REGION" \
        --query 'service.serviceName' \
        --output text &>/dev/null 2>&1 || log_warn "  ${svc}: service not found (skipped)"
done

log_success "All services restarted"
echo ""

# =============================================================================
# Summary
# =============================================================================

log_info "========================================="
log_success "Bootstrap complete!"
log_info "========================================="
log_info ""
log_info "Automated steps completed:"
log_info "  [x] inventory_ops database created"
log_info "  [x] Django migrations applied"
log_info "  [x] Superuser created (${ADMIN_EMAIL})"
log_info "  [x] Prisma migrations applied"
log_info "  [x] ECS services restarted"
log_info ""
log_info "========================================="
log_warn "REMAINING MANUAL STEPS:"
log_info "========================================="
log_info ""
log_info "1. Set superuser password:"
log_info "   Use Dashboard password reset or Django shell"
log_info ""
log_info "2. Configure Saleor channel (via Dashboard):"
log_info "   - Create 'Webstore' channel (USD, US)"
log_info "   - Create warehouse, link to channel"
log_info "   - Set up shipping zones"
log_info "   - Activate Stripe payment method in channel"
log_info ""
log_info "3. Install Saleor apps (via Dashboard → Apps → Install external app):"
log_info "   - Stripe:        https://apps.staging.michaelbean.org/apps/stripe/api/manifest"
log_info "   - Inventory Ops: https://apps.staging.michaelbean.org/apps/inventory/api/manifest"
log_info "   - POS:           https://apps.staging.michaelbean.org/apps/pos/api/manifest"
log_info ""
log_info "4. Configure Stripe webhooks (in Stripe Dashboard):"
log_info "   Endpoint: https://apps.staging.michaelbean.org/apps/stripe/api/webhooks/stripe"
log_info ""
log_info "5. Import MTG catalog (30-60 min):"
log_info "   Use Inventory Ops app Import section in Dashboard"
log_info ""
log_info "6. Trigger initial price sync:"
log_info "   After import completes, run the price sync cron endpoint"
log_info ""
log_info "7. Rebuild Meilisearch index:"
log_info "   Wait for daily EventBridge reconcile or trigger manually"
log_info ""
log_info "See: docs/ops/runbooks/terraform-destroy-recreate.md for full details"
