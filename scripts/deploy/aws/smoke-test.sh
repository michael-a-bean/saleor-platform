#!/usr/bin/env bash
#
# Run smoke tests against deployed services
#
# Usage: ./smoke-test.sh <environment>
#
# Environment variables:
#   STAGING_API_URL, STAGING_STOREFRONT_URL, STAGING_DASHBOARD_URL
#   PRODUCTION_API_URL, PRODUCTION_STOREFRONT_URL, PRODUCTION_DASHBOARD_URL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# =============================================================================
# Arguments
# =============================================================================

ENV="${1:-}"

if [[ -z "$ENV" ]]; then
    log_error "Usage: $0 <environment>"
    exit 1
fi

# =============================================================================
# Configuration
# =============================================================================

# Get URLs from environment variables
if [[ "$ENV" == "staging" ]]; then
    API_URL="${STAGING_API_URL:-}"
    STOREFRONT_URL="${STAGING_STOREFRONT_URL:-}"
    DASHBOARD_URL="${STAGING_DASHBOARD_URL:-}"
elif [[ "$ENV" == "production" ]]; then
    API_URL="${PRODUCTION_API_URL:-}"
    STOREFRONT_URL="${PRODUCTION_STOREFRONT_URL:-}"
    DASHBOARD_URL="${PRODUCTION_DASHBOARD_URL:-}"
else
    log_error "Environment must be 'staging' or 'production'"
    exit 1
fi

# Default timeout for requests
TIMEOUT=30
FAILURES=0

# =============================================================================
# Test Functions
# =============================================================================

test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_code="${3:-200}"

    log_info "Testing ${name}..."

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" || echo "000")

    if [[ "$http_code" == "$expected_code" ]]; then
        log_success "${name}: HTTP ${http_code}"
        return 0
    else
        log_error "${name}: Expected HTTP ${expected_code}, got HTTP ${http_code}"
        ((FAILURES++)) || true
        return 1
    fi
}

test_graphql() {
    local name="$1"
    local url="$2"
    local query="$3"

    log_info "Testing ${name}..."

    local response
    response=$(curl -s --max-time "$TIMEOUT" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"${query}\"}" \
        "$url" || echo '{"errors": [{"message": "Request failed"}]}')

    if echo "$response" | jq -e '.data' >/dev/null 2>&1; then
        log_success "${name}: GraphQL response OK"
        return 0
    else
        local error_msg
        error_msg=$(echo "$response" | jq -r '.errors[0].message // "Unknown error"')
        log_error "${name}: GraphQL error - ${error_msg}"
        ((FAILURES++)) || true
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================

log_info "Running smoke tests for ${ENV}"
log_info "======================================"

# API Health Check
if [[ -n "$API_URL" ]]; then
    test_endpoint "API Health" "${API_URL}/health/"

    # GraphQL introspection test
    test_graphql "API GraphQL" "${API_URL}/graphql/" "{ __schema { queryType { name } } }"

    # Channel query test
    test_graphql "API Channels" "${API_URL}/graphql/" "{ channels { slug } }"
else
    log_warn "API_URL not set, skipping API tests"
fi

# Storefront Health Check
if [[ -n "$STOREFRONT_URL" ]]; then
    test_endpoint "Storefront Homepage" "${STOREFRONT_URL}/"
    test_endpoint "Storefront Health" "${STOREFRONT_URL}/api/health"
else
    log_warn "STOREFRONT_URL not set, skipping storefront tests"
fi

# Dashboard Health Check
if [[ -n "$DASHBOARD_URL" ]]; then
    test_endpoint "Dashboard" "${DASHBOARD_URL}/"
else
    log_warn "DASHBOARD_URL not set, skipping dashboard tests"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
log_info "======================================"
if [[ "$FAILURES" -eq 0 ]]; then
    log_success "All smoke tests passed!"
    exit 0
else
    log_error "Smoke tests completed with ${FAILURES} failure(s)"
    exit 1
fi
