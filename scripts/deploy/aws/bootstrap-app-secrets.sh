#!/usr/bin/env bash
#
# Bootstrap SSM parameters for Saleor apps
#
# Usage: ./bootstrap-app-secrets.sh <environment>
#
# This script creates the required SSM parameters for Saleor apps.
# Run this ONCE before the first terraform apply for apps.
#
# Note: This script creates placeholder values. You must update them
# with real values before apps will function correctly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

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
# Configuration
# =============================================================================

SSM_PREFIX="/saleor/${ENV}"

# =============================================================================
# Helper Functions
# =============================================================================

create_parameter() {
    local name="$1"
    local value="$2"
    local description="${3:-}"

    local full_path="${SSM_PREFIX}/${name}"

    # Check if parameter already exists
    if aws ssm get-parameter --name "$full_path" >/dev/null 2>&1; then
        log_warn "Parameter already exists: ${full_path}"
        return 0
    fi

    log_info "Creating parameter: ${full_path}"
    aws ssm put-parameter \
        --name "$full_path" \
        --type "SecureString" \
        --value "$value" \
        --description "$description" \
        --tags "Key=Environment,Value=${ENV}" "Key=ManagedBy,Value=bootstrap-script" \
        >/dev/null

    log_success "Created: ${full_path}"
}

generate_secret_key() {
    openssl rand -hex 32
}

# =============================================================================
# Main
# =============================================================================

log_info "Bootstrapping SSM parameters for ${ENV} environment"
log_info "SSM prefix: ${SSM_PREFIX}"
echo ""

# -----------------------------------------------------------------------------
# Common App Secrets
# -----------------------------------------------------------------------------

log_info "Creating common app secrets..."

create_parameter \
    "apps/SECRET_KEY" \
    "$(generate_secret_key)" \
    "Shared secret key for all Saleor apps (JWT signing, encryption)"

# -----------------------------------------------------------------------------
# Stripe App Secrets
# -----------------------------------------------------------------------------

log_info "Creating Stripe app secrets..."

create_parameter \
    "apps/stripe/STRIPE_SECRET_KEY" \
    "sk_test_PLACEHOLDER_UPDATE_ME" \
    "Stripe API secret key - UPDATE WITH REAL VALUE"

create_parameter \
    "apps/stripe/STRIPE_WEBHOOK_SECRET" \
    "whsec_PLACEHOLDER_UPDATE_ME" \
    "Stripe webhook signing secret - UPDATE WITH REAL VALUE"

# -----------------------------------------------------------------------------
# Inventory Ops / Buylist / POS Database
# -----------------------------------------------------------------------------

log_info "Creating inventory apps database secrets..."

# Get the RDS endpoint from terraform output or use placeholder
RDS_ENDPOINT="${RDS_ENDPOINT:-PLACEHOLDER_RDS_ENDPOINT}"
INVENTORY_DB_PASSWORD="${INVENTORY_DB_PASSWORD:-$(generate_secret_key | cut -c1-32)}"

create_parameter \
    "apps/inventory-ops/DATABASE_URL" \
    "postgresql://inventory:${INVENTORY_DB_PASSWORD}@${RDS_ENDPOINT}:5432/inventory_ops" \
    "PostgreSQL connection string for inventory apps"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo ""
log_success "Bootstrap complete!"
echo ""
log_warn "IMPORTANT: Update placeholder values before deploying apps:"
echo "  - ${SSM_PREFIX}/apps/stripe/STRIPE_SECRET_KEY"
echo "  - ${SSM_PREFIX}/apps/stripe/STRIPE_WEBHOOK_SECRET"
echo "  - ${SSM_PREFIX}/apps/inventory-ops/DATABASE_URL"
echo ""
log_info "To update a parameter:"
echo "  aws ssm put-parameter --name \"${SSM_PREFIX}/apps/stripe/STRIPE_SECRET_KEY\" --type SecureString --value \"sk_live_xxx\" --overwrite"
echo ""
