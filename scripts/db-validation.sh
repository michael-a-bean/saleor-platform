#!/usr/bin/env bash
# =============================================================================
# Saleor Database Environment Validation
# =============================================================================
#
# Provides database-level validation functions for environment isolation.
# Source this file from validate-environment.sh or use standalone.
#
# Usage (standalone):
#   ./scripts/db-validation.sh [environment]
#
# Usage (sourced):
#   source ./scripts/db-validation.sh
#   validate_saleor_apps "staging"
#   validate_pricing_integrity
#
# =============================================================================

# =============================================================================
# Validate Saleor App URLs
# =============================================================================
# Checks that no apps or webhooks have localhost URLs in non-local environments

validate_saleor_apps() {
    local env="${1:-staging}"

    # Count localhost apps
    local localhost_apps=$(docker compose exec -T db psql -U saleor -d saleor -tAc \
        "SELECT COUNT(*) FROM app_app
         WHERE manifest_url LIKE '%localhost%'
            OR manifest_url LIKE '%127.0.0.1%'
            OR app_url LIKE '%localhost%'
            OR app_url LIKE '%127.0.0.1%';" 2>/dev/null || echo "-1")

    localhost_apps=$(echo "$localhost_apps" | tr -d '[:space:]')

    # Count localhost webhooks
    local localhost_webhooks=$(docker compose exec -T db psql -U saleor -d saleor -tAc \
        "SELECT COUNT(*) FROM webhook_webhook
         WHERE target_url LIKE '%localhost%'
            OR target_url LIKE '%127.0.0.1%';" 2>/dev/null || echo "-1")

    localhost_webhooks=$(echo "$localhost_webhooks" | tr -d '[:space:]')

    case "$env" in
        local|development)
            # In local, localhost URLs are expected
            return 0
            ;;
        staging|production)
            # In staging/production, localhost URLs are forbidden
            if [[ "$localhost_apps" -gt 0 ]] || [[ "$localhost_webhooks" -gt 0 ]]; then
                echo "ERROR: Found $localhost_apps apps and $localhost_webhooks webhooks with localhost URLs" >&2
                return 1
            fi
            return 0
            ;;
        *)
            echo "WARNING: Unknown environment '$env'" >&2
            return 0
            ;;
    esac
}

# =============================================================================
# Validate Pricing Integrity
# =============================================================================
# Ensures no variants have NULL discounted_price_amount when price_amount is set

validate_pricing_integrity() {
    local null_prices=$(docker compose exec -T db psql -U saleor -d saleor -tAc \
        "SELECT COUNT(*) FROM product_productvariantchannellisting
         WHERE price_amount IS NOT NULL AND discounted_price_amount IS NULL;" 2>/dev/null || echo "-1")

    null_prices=$(echo "$null_prices" | tr -d '[:space:]')

    if [[ "$null_prices" == "-1" ]]; then
        echo "WARNING: Could not query pricing data" >&2
        return 1
    elif [[ "$null_prices" -gt 0 ]]; then
        echo "ERROR: Found $null_prices variants with NULL discounted_price_amount" >&2
        return 1
    fi

    return 0
}

# =============================================================================
# List Apps with URLs
# =============================================================================
# Diagnostic function to show all app URLs

list_app_urls() {
    echo "=== Saleor App URLs ===" >&2
    docker compose exec -T db psql -U saleor -d saleor -c \
        "SELECT id, name,
                LEFT(app_url, 50) as app_url,
                LEFT(manifest_url, 50) as manifest_url
         FROM app_app
         ORDER BY name;" 2>/dev/null || echo "ERROR: Could not query apps" >&2
}

# =============================================================================
# List Webhook URLs
# =============================================================================
# Diagnostic function to show all webhook URLs

list_webhook_urls() {
    echo "=== Webhook URLs ===" >&2
    docker compose exec -T db psql -U saleor -d saleor -c \
        "SELECT w.id, w.name, a.name as app_name,
                LEFT(w.target_url, 60) as target_url
         FROM webhook_webhook w
         LEFT JOIN app_app a ON w.app_id = a.id
         ORDER BY a.name, w.name;" 2>/dev/null || echo "ERROR: Could not query webhooks" >&2
}

# =============================================================================
# Get Environment Summary
# =============================================================================
# Shows key indicators of which environment the database belongs to

get_db_environment_summary() {
    echo "=== Database Environment Summary ===" >&2

    # Channel info
    echo "" >&2
    echo "Channels:" >&2
    docker compose exec -T db psql -U saleor -d saleor -c \
        "SELECT slug, name, is_active, currency_code FROM channel_channel;" 2>/dev/null

    # Recent orders (activity indicator)
    echo "" >&2
    echo "Recent Activity:" >&2
    docker compose exec -T db psql -U saleor -d saleor -c \
        "SELECT
            (SELECT COUNT(*) FROM order_order WHERE created_at > NOW() - INTERVAL '24 hours') as orders_24h,
            (SELECT COUNT(*) FROM order_order WHERE created_at > NOW() - INTERVAL '7 days') as orders_7d,
            (SELECT COUNT(*) FROM product_product) as total_products;" 2>/dev/null
}

# =============================================================================
# Standalone Execution
# =============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script is being run directly, not sourced
    ENV="${1:-staging}"

    echo "========================================"
    echo "Saleor Database Validation ($ENV)"
    echo "========================================"
    echo ""

    ERRORS=0

    echo "Checking app URLs..."
    if validate_saleor_apps "$ENV"; then
        echo "[OK] App URLs valid for $ENV"
    else
        echo "[FAIL] App URL validation failed"
        ((ERRORS++))
    fi

    echo ""
    echo "Checking pricing integrity..."
    if validate_pricing_integrity; then
        echo "[OK] Pricing integrity verified"
    else
        echo "[FAIL] Pricing integrity check failed"
        ((ERRORS++))
    fi

    echo ""
    echo "========================================"
    if [[ $ERRORS -gt 0 ]]; then
        echo "FAILED: $ERRORS check(s) failed"
        exit 1
    else
        echo "PASSED: All database checks passed"
        exit 0
    fi
fi
