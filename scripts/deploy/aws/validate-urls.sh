#!/usr/bin/env bash
#
# Validate that configured URLs are reachable before deployment
#
# Usage: ./validate-urls.sh <environment>
#
# Environment variables (required):
#   STAGING_API_URL, STAGING_STOREFRONT_URL (for staging)
#   PRODUCTION_API_URL, PRODUCTION_STOREFRONT_URL (for production)
#
# Exit codes:
#   0 - All validations passed
#   1 - One or more validations failed
#
# This script should be run BEFORE deploying to ensure the configured
# URLs point to reachable endpoints. It prevents deploying with broken
# URL configurations.

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

if [[ "$ENV" == "staging" ]]; then
    API_URL="${STAGING_API_URL:-}"
    STOREFRONT_URL="${STAGING_STOREFRONT_URL:-}"
elif [[ "$ENV" == "production" ]]; then
    API_URL="${PRODUCTION_API_URL:-}"
    STOREFRONT_URL="${PRODUCTION_STOREFRONT_URL:-}"
else
    log_error "Environment must be 'staging' or 'production'"
    exit 1
fi

TIMEOUT=15
FAILURES=0

# =============================================================================
# Validation Functions
# =============================================================================

validate_url_format() {
    local name="$1"
    local url="$2"

    if [[ -z "$url" ]]; then
        log_error "${name}: URL is not set"
        ((FAILURES++)) || true
        return 1
    fi

    # Check URL format
    if [[ ! "$url" =~ ^https?:// ]]; then
        log_error "${name}: Invalid URL format (must start with http:// or https://)"
        ((FAILURES++)) || true
        return 1
    fi

    log_success "${name}: URL format valid"
    return 0
}

validate_dns_resolution() {
    local name="$1"
    local url="$2"

    # Extract hostname from URL
    local hostname
    hostname=$(echo "$url" | sed -E 's|https?://([^/:]+).*|\1|')

    log_info "Checking DNS for ${hostname}..."

    # Try to resolve the hostname
    if ! getent hosts "$hostname" >/dev/null 2>&1; then
        # Check if it's an AWS ALB DNS name (these should always resolve)
        if [[ "$hostname" =~ \.elb\.amazonaws\.com$ ]]; then
            # ALB DNS names should always resolve, this is unexpected
            log_error "${name}: ALB DNS name failed to resolve"
            log_error "  This is unexpected for an AWS ALB DNS name."
            log_error "  Check network connectivity or verify the ALB DNS name is correct."
            ((FAILURES++)) || true
            return 1
        else
            log_error "${name}: DNS resolution failed for ${hostname}"
            log_error "  The configured hostname does not exist or is not reachable."
            log_error "  Check your DNS configuration or use the ALB DNS name directly."
            ((FAILURES++)) || true
            return 1
        fi
    fi

    log_success "${name}: DNS resolution OK"
    return 0
}

validate_endpoint_reachable() {
    local name="$1"
    local url="$2"
    local path="${3:-/}"
    local expected_code="${4:-200}"

    local full_url="${url%/}${path}"
    log_info "Testing ${name} at ${full_url}..."

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$full_url" 2>/dev/null || echo "000")

    if [[ "$http_code" == "000" ]]; then
        log_error "${name}: Connection failed (timeout or network error)"
        ((FAILURES++)) || true
        return 1
    elif [[ "$http_code" == "$expected_code" ]]; then
        log_success "${name}: HTTP ${http_code}"
        return 0
    elif [[ "$http_code" =~ ^[23] ]]; then
        # 2xx or 3xx responses are acceptable
        log_success "${name}: HTTP ${http_code} (acceptable)"
        return 0
    else
        log_error "${name}: Expected HTTP ${expected_code}, got HTTP ${http_code}"
        ((FAILURES++)) || true
        return 1
    fi
}

validate_graphql_endpoint() {
    local name="$1"
    local url="$2"

    local graphql_url="${url%/}/graphql/"
    log_info "Testing GraphQL at ${graphql_url}..."

    local response
    response=$(curl -s --max-time "$TIMEOUT" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"query": "{ __typename }"}' \
        "$graphql_url" 2>/dev/null || echo '{"error": "request failed"}')

    if echo "$response" | grep -q '"Query"'; then
        log_success "${name}: GraphQL responds correctly"
        return 0
    elif echo "$response" | grep -q '"error"'; then
        log_error "${name}: GraphQL request failed"
        ((FAILURES++)) || true
        return 1
    else
        log_warn "${name}: Unexpected GraphQL response"
        log_warn "Response: ${response:0:100}..."
        return 0
    fi
}

# =============================================================================
# Main
# =============================================================================

log_info "========================================"
log_info "URL Validation for ${ENV}"
log_info "========================================"
echo ""

# Validate API URL
if [[ -n "$API_URL" ]]; then
    log_info "API URL: ${API_URL}"
    validate_url_format "API URL format" "$API_URL"
    validate_dns_resolution "API DNS" "$API_URL"
    validate_endpoint_reachable "API health" "$API_URL" "/health/" "200"
    validate_graphql_endpoint "API GraphQL" "$API_URL"
else
    log_error "API URL not configured (set ${ENV^^}_API_URL)"
    ((FAILURES++)) || true
fi

echo ""

# Validate Storefront URL
if [[ -n "$STOREFRONT_URL" ]]; then
    log_info "Storefront URL: ${STOREFRONT_URL}"
    validate_url_format "Storefront URL format" "$STOREFRONT_URL"
    validate_dns_resolution "Storefront DNS" "$STOREFRONT_URL"
    validate_endpoint_reachable "Storefront homepage" "$STOREFRONT_URL" "/" "200"
else
    log_error "Storefront URL not configured (set ${ENV^^}_STOREFRONT_URL)"
    ((FAILURES++)) || true
fi

echo ""

# =============================================================================
# Summary
# =============================================================================

log_info "========================================"
if [[ "$FAILURES" -eq 0 ]]; then
    log_success "All URL validations passed!"
    log_info "Configured URLs are reachable and responding correctly."
    exit 0
else
    log_error "URL validation completed with ${FAILURES} failure(s)"
    log_error ""
    log_error "Troubleshooting:"
    log_error "  1. Check if DNS is configured for custom domains"
    log_error "  2. Use ALB DNS name if custom domain is not ready:"
    log_error "     export ${ENV^^}_API_URL=http://<alb-dns-name>"
    log_error "  3. Verify the services are running and healthy"
    exit 1
fi
