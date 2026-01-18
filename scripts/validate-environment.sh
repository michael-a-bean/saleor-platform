#!/usr/bin/env bash
# =============================================================================
# Environment Isolation Validator
# =============================================================================
#
# Prevents staging/production cross-contamination by validating environment
# configuration before deployments, commits, and infrastructure operations.
#
# Usage:
#   ./scripts/validate-environment.sh [MODE] [OPTIONS]
#
# Modes:
#   pre-push     Quick checks for git pre-push hook (default)
#   pre-deploy   Full checks before deployment
#   full         All checks including database validation
#
# Options:
#   --strict     Exit with error on any failure (default for pre-deploy)
#   --ci         Disable colors, machine-readable output
#
# Exit Codes:
#   0  All checks passed
#   1  P0 (blocking) error found
#   2  P1 (warning) found in strict mode
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
MODE="${1:-pre-push}"
STRICT_MODE=false
CI_MODE=false

for arg in "$@"; do
    case "$arg" in
        --strict) STRICT_MODE=true ;;
        --ci) CI_MODE=true ;;
    esac
done

# Auto-enable strict for pre-deploy
[[ "$MODE" == "pre-deploy" ]] && STRICT_MODE=true

# Color output (disabled in CI)
if [[ "$CI_MODE" == true ]] || [[ ! -t 1 ]]; then
    RED="" GREEN="" YELLOW="" BLUE="" NC=""
else
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
fi

# Counters
P0_ERRORS=0
P1_WARNINGS=0

log_error() { echo -e "${RED}[P0 ERROR]${NC} $1" >&2; ((P0_ERRORS++)) || true; }
log_warn()  { echo -e "${YELLOW}[P1 WARN]${NC} $1" >&2; ((P1_WARNINGS++)) || true; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_skip()  { echo -e "${BLUE}[SKIP]${NC} $1"; }

# =============================================================================
# Environment Detection
# =============================================================================

detect_environment() {
    local env=""

    # Priority 1: Explicit SALEOR_ENVIRONMENT
    if [[ -n "${SALEOR_ENVIRONMENT:-}" ]]; then
        env="$SALEOR_ENVIRONMENT"
    # Priority 2: DEPLOY_ENV (CI/CD)
    elif [[ -n "${DEPLOY_ENV:-}" ]]; then
        env="$DEPLOY_ENV"
    # Priority 3: Git branch inference
    elif git rev-parse --git-dir &>/dev/null; then
        local branch=$(git branch --show-current 2>/dev/null || echo "")
        case "$branch" in
            *staging*|*stage*) env="staging" ;;
            *prod*|*release*) env="production" ;;
            main|master) env="production" ;;
            *) env="local" ;;
        esac
    else
        env="local"
    fi

    echo "${env:-local}"
}

# =============================================================================
# Check: No localhost URLs in non-local environments
# =============================================================================

check_no_localhost_contamination() {
    local current_env=$(detect_environment)
    log_info "Checking for localhost contamination (env: $current_env)"

    if [[ "$current_env" == "local" ]]; then
        log_skip "Local environment - localhost URLs are expected"
        return 0
    fi

    # Check key environment variables
    local vars_to_check=(
        "NEXT_PUBLIC_SALEOR_API_URL"
        "NEXT_PUBLIC_STOREFRONT_URL"
        "SALEOR_API_URL"
        "DATABASE_URL"
    )

    for var in "${vars_to_check[@]}"; do
        local value="${!var:-}"
        if [[ -n "$value" ]] && [[ "$value" =~ localhost|127\.0\.0\.1 ]]; then
            log_error "$var contains localhost in $current_env environment: $value"
        fi
    done

    # Check .env file if it exists
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        if grep -qE "^(NEXT_PUBLIC_|SALEOR_API_URL|DATABASE_URL).*localhost" "$PROJECT_ROOT/.env" 2>/dev/null; then
            log_error ".env contains localhost URLs for $current_env environment"
        else
            log_ok "No localhost URLs in .env for $current_env"
        fi
    fi
}

# =============================================================================
# Check: No secrets in staged files
# =============================================================================

check_no_secrets_staged() {
    log_info "Checking for secrets in staged files"

    if ! git rev-parse --git-dir &>/dev/null; then
        log_skip "Not a git repository"
        return 0
    fi

    local staged_files=$(git diff --cached --name-only 2>/dev/null || echo "")
    if [[ -z "$staged_files" ]]; then
        log_skip "No staged files"
        return 0
    fi

    local secret_patterns=(
        'AKIA[0-9A-Z]{16}'                    # AWS Access Key
        'sk_live_[a-zA-Z0-9]{24,}'            # Stripe Live Key
        'ghp_[a-zA-Z0-9]{36}'                 # GitHub PAT
        'postgres://[^:]+:[^@]+@'             # Database URL with password
        'SECRET_KEY=[^$\s]{20,}'              # Generic secret key
    )

    local found_secret=false
    for file in $staged_files; do
        [[ -f "$PROJECT_ROOT/$file" ]] || continue
        [[ "$file" == *.md ]] && continue  # Skip markdown
        [[ "$file" == *.example ]] && continue  # Skip examples

        for pattern in "${secret_patterns[@]}"; do
            if grep -qE "$pattern" "$PROJECT_ROOT/$file" 2>/dev/null; then
                log_error "Potential secret found in staged file: $file (pattern: ${pattern:0:20}...)"
                found_secret=true
            fi
        done
    done

    [[ "$found_secret" == false ]] && log_ok "No obvious secrets in staged files"
}

# =============================================================================
# Check: Branch protection
# =============================================================================

check_branch_protection() {
    log_info "Checking branch protection rules"

    if ! git rev-parse --git-dir &>/dev/null; then
        log_skip "Not a git repository"
        return 0
    fi

    local branch=$(git branch --show-current 2>/dev/null || echo "")

    if [[ "$branch" == "main" ]]; then
        log_error "On protected branch 'main' - commits not allowed (use platform/main)"
    elif [[ "$branch" == "master" ]]; then
        log_error "On protected branch 'master' - commits not allowed"
    else
        log_ok "Branch '$branch' is not protected"
    fi
}

# =============================================================================
# Check: Pricing integrity (database check)
# =============================================================================

check_pricing_integrity() {
    log_info "Checking Saleor pricing integrity"

    if [[ "${SKIP_DB_CHECKS:-false}" == "true" ]]; then
        log_skip "Database checks disabled (SKIP_DB_CHECKS=true)"
        return 0
    fi

    if ! docker compose ps db 2>/dev/null | grep -q "running"; then
        log_skip "Database not running - cannot verify pricing"
        return 0
    fi

    local null_prices=$(docker compose exec -T db psql -U saleor -d saleor -tAc \
        "SELECT COUNT(*) FROM product_productvariantchannellisting
         WHERE price_amount IS NOT NULL AND discounted_price_amount IS NULL;" 2>/dev/null || echo "-1")

    null_prices=$(echo "$null_prices" | tr -d '[:space:]')

    if [[ "$null_prices" == "-1" ]]; then
        log_warn "Could not query pricing data"
    elif [[ "$null_prices" -gt 0 ]]; then
        log_error "Found $null_prices variants with NULL discounted_price_amount (causes runtime errors)"
    else
        log_ok "Pricing integrity verified (no NULL discounted prices)"
    fi
}

# =============================================================================
# Check: Saleor app localhost contamination (database check)
# =============================================================================

check_saleor_apps() {
    local current_env=$(detect_environment)
    log_info "Checking Saleor app URLs (env: $current_env)"

    if [[ "$current_env" == "local" ]]; then
        log_skip "Local environment - skipping app URL check"
        return 0
    fi

    if [[ "${SKIP_DB_CHECKS:-false}" == "true" ]]; then
        log_skip "Database checks disabled (SKIP_DB_CHECKS=true)"
        return 0
    fi

    if ! docker compose ps db 2>/dev/null | grep -q "running"; then
        log_skip "Database not running - cannot verify app URLs"
        return 0
    fi

    # Source db-validation if available
    if [[ -f "$SCRIPT_DIR/db-validation.sh" ]]; then
        source "$SCRIPT_DIR/db-validation.sh"

        if ! validate_saleor_apps "$current_env"; then
            log_error "Saleor apps have localhost URLs in $current_env environment"
        else
            log_ok "Saleor app URLs are correct for $current_env"
        fi
    else
        # Inline check if db-validation.sh not available
        local localhost_apps=$(docker compose exec -T db psql -U saleor -d saleor -tAc \
            "SELECT COUNT(*) FROM app_app WHERE manifest_url LIKE '%localhost%' OR manifest_url LIKE '%127.0.0.1%';" 2>/dev/null || echo "0")

        localhost_apps=$(echo "$localhost_apps" | tr -d '[:space:]')

        if [[ "$localhost_apps" -gt 0 ]]; then
            log_error "Found $localhost_apps Saleor apps with localhost URLs in $current_env"
        else
            log_ok "No localhost app URLs found"
        fi
    fi
}

# =============================================================================
# Check: Docker context
# =============================================================================

check_docker_context() {
    log_info "Checking Docker context"

    if ! command -v docker &>/dev/null; then
        log_skip "Docker not available"
        return 0
    fi

    local docker_context=$(docker context show 2>/dev/null || echo "default")
    local current_env=$(detect_environment)

    if [[ "$current_env" == "local" ]] && [[ "$docker_context" != "default" ]]; then
        log_warn "Docker context '$docker_context' is not 'default' in local environment"
    else
        log_ok "Docker context: $docker_context"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo "========================================"
    echo "Environment Validation ($MODE)"
    echo "========================================"
    echo ""

    local current_env=$(detect_environment)
    log_info "Detected environment: $current_env"
    echo ""

    # Always run these checks
    check_branch_protection
    check_no_secrets_staged
    check_no_localhost_contamination

    # Additional checks for pre-deploy and full modes
    if [[ "$MODE" == "pre-deploy" ]] || [[ "$MODE" == "full" ]]; then
        check_docker_context
        check_pricing_integrity
        check_saleor_apps
    fi

    # Full mode only
    if [[ "$MODE" == "full" ]]; then
        # Add any additional comprehensive checks here
        :
    fi

    echo ""
    echo "========================================"

    if [[ $P0_ERRORS -gt 0 ]]; then
        echo -e "${RED}FAILED: $P0_ERRORS error(s), $P1_WARNINGS warning(s)${NC}"
        exit 1
    elif [[ $P1_WARNINGS -gt 0 ]] && [[ "$STRICT_MODE" == true ]]; then
        echo -e "${YELLOW}FAILED (strict): $P1_WARNINGS warning(s)${NC}"
        exit 2
    elif [[ $P1_WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}PASSED with $P1_WARNINGS warning(s)${NC}"
        exit 0
    else
        echo -e "${GREEN}PASSED: All checks passed${NC}"
        exit 0
    fi
}

main "$@"
