#!/bin/bash
#
# Smoke Tests for Saleor Apps
#
# This script validates that all Saleor apps are correctly deployed and responding
# with JSON instead of HTML (which would indicate routing issues).
#
# Usage:
#   ./scripts/smoke/apps-smoke.sh <ALB_BASE_URL>
#
# Example:
#   ./scripts/smoke/apps-smoke.sh http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ALB_BASE_URL="${1:-}"
TIMEOUT=10
FAILURES=0

# App configurations: name|base_path|port
APPS=(
  "stripe|/apps/stripe|3001"
  "inventory-ops|/apps/inventory|3002"
  "buylist|/apps/buylist|3003"
  "pos|/apps/pos|3004"
)

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_pass() {
  echo -e "  ${GREEN}✓${NC} $1"
}

log_fail() {
  echo -e "  ${RED}✗${NC} $1"
  ((FAILURES++))
}

# Check if response is HTML (indicates routing failure)
is_html_response() {
  local body="$1"
  # Check for HTML indicators
  if [[ "$body" == *"<!DOCTYPE"* ]] || [[ "$body" == *"<html"* ]] || [[ "$body" == "<"* && "$body" != "{"* ]]; then
    return 0  # true, is HTML
  fi
  return 1  # false, not HTML
}

# Print diagnostics for failed request
print_diagnostics() {
  local url="$1"
  local status="$2"
  local content_type="$3"
  local body="$4"

  log_error "Diagnostics for: $url"
  echo "    Status Code: $status"
  echo "    Content-Type: $content_type"
  echo "    Body (first 200 chars):"
  echo "    ${body:0:200}"
  echo ""
}

# Test health endpoint
test_health() {
  local app_name="$1"
  local base_path="$2"
  local url="${ALB_BASE_URL}${base_path}/api/health"

  local response
  response=$(curl -s -w "\n%{http_code}\n%{content_type}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "CURL_FAILED")

  if [[ "$response" == "CURL_FAILED" ]]; then
    log_fail "Health check failed - connection error: $url"
    return
  fi

  # Parse response (body, status code, content type)
  local body status content_type
  body=$(echo "$response" | head -n -2)
  status=$(echo "$response" | tail -n 2 | head -n 1)
  content_type=$(echo "$response" | tail -n 1)

  # Check status code
  if [[ "$status" != "200" ]]; then
    log_fail "Health check returned status $status (expected 200): $url"
    print_diagnostics "$url" "$status" "$content_type" "$body"
    return
  fi

  # Check for HTML response
  if is_html_response "$body"; then
    log_fail "Health check returned HTML instead of JSON (routing issue): $url"
    print_diagnostics "$url" "$status" "$content_type" "$body"
    return
  fi

  # Check content type
  if [[ "$content_type" != *"application/json"* ]]; then
    log_warn "Health check returned unexpected content-type: $content_type"
  fi

  log_pass "Health check OK: $url"
}

# Test manifest endpoint
test_manifest() {
  local app_name="$1"
  local base_path="$2"
  local url="${ALB_BASE_URL}${base_path}/api/manifest"

  local response
  response=$(curl -s -w "\n%{http_code}\n%{content_type}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "CURL_FAILED")

  if [[ "$response" == "CURL_FAILED" ]]; then
    log_fail "Manifest check failed - connection error: $url"
    return
  fi

  local body status content_type
  body=$(echo "$response" | head -n -2)
  status=$(echo "$response" | tail -n 2 | head -n 1)
  content_type=$(echo "$response" | tail -n 1)

  # Check status code
  if [[ "$status" != "200" ]]; then
    log_fail "Manifest check returned status $status (expected 200): $url"
    print_diagnostics "$url" "$status" "$content_type" "$body"
    return
  fi

  # Check for HTML response
  if is_html_response "$body"; then
    log_fail "Manifest check returned HTML instead of JSON (routing issue): $url"
    print_diagnostics "$url" "$status" "$content_type" "$body"
    return
  fi

  # Verify manifest contains correct URL prefixes
  if [[ "$body" != *"$base_path"* ]]; then
    log_warn "Manifest may not contain correct basePath ($base_path) - verify URLs manually"
  fi

  # Verify appUrl is present
  if [[ "$body" != *"appUrl"* ]]; then
    log_fail "Manifest missing appUrl field"
    return
  fi

  log_pass "Manifest check OK: $url"
}

# Test tRPC endpoint (should return JSON error, not HTML)
test_trpc() {
  local app_name="$1"
  local base_path="$2"
  # Use a known tRPC batch query format - empty batch should return error JSON
  local url="${ALB_BASE_URL}${base_path}/api/trpc"

  local response
  response=$(curl -s -w "\n%{http_code}\n%{content_type}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "CURL_FAILED")

  if [[ "$response" == "CURL_FAILED" ]]; then
    log_fail "tRPC check failed - connection error: $url"
    return
  fi

  local body status content_type
  body=$(echo "$response" | head -n -2)
  status=$(echo "$response" | tail -n 2 | head -n 1)
  content_type=$(echo "$response" | tail -n 1)

  # Check for HTML response - this is the critical test!
  if is_html_response "$body"; then
    log_fail "tRPC endpoint returned HTML instead of JSON - ROUTING ISSUE DETECTED: $url"
    print_diagnostics "$url" "$status" "$content_type" "$body"
    log_error "This indicates the request is going to the wrong service (likely storefront)"
    log_error "Check ALB routing rules and ensure $base_path/* routes to the correct target group"
    return
  fi

  # Even a 404 or 400 is OK as long as it's JSON (means correct routing)
  if [[ "$content_type" == *"application/json"* ]] || [[ "$body" == "{"* ]] || [[ "$body" == "["* ]]; then
    log_pass "tRPC endpoint returns JSON (correct routing): $url"
  else
    log_warn "tRPC endpoint returned unexpected response (status=$status)"
  fi
}

# Test static asset (logo)
test_logo() {
  local app_name="$1"
  local base_path="$2"
  local url="${ALB_BASE_URL}${base_path}/logo.png"

  local response
  response=$(curl -s -o /dev/null -w "%{http_code}\n%{content_type}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "CURL_FAILED")

  if [[ "$response" == "CURL_FAILED" ]]; then
    log_fail "Logo check failed - connection error: $url"
    return
  fi

  local status content_type
  status=$(echo "$response" | head -n 1)
  content_type=$(echo "$response" | tail -n 1)

  if [[ "$status" != "200" ]]; then
    log_fail "Logo check returned status $status (expected 200): $url"
    return
  fi

  if [[ "$content_type" != *"image/"* ]]; then
    log_fail "Logo returned wrong content-type: $content_type (expected image/*)"
    return
  fi

  log_pass "Logo asset OK: $url"
}

# Main
main() {
  if [[ -z "$ALB_BASE_URL" ]]; then
    echo "Usage: $0 <ALB_BASE_URL>"
    echo "Example: $0 http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"
    exit 1
  fi

  # Remove trailing slash from URL
  ALB_BASE_URL="${ALB_BASE_URL%/}"

  echo ""
  echo "=============================================="
  echo "  Saleor Apps Smoke Tests"
  echo "=============================================="
  echo "Base URL: $ALB_BASE_URL"
  echo ""

  for app_config in "${APPS[@]}"; do
    IFS='|' read -r app_name base_path port <<< "$app_config"

    echo ""
    log_info "Testing: $app_name (${base_path})"
    echo "----------------------------------------------"

    test_health "$app_name" "$base_path"
    test_manifest "$app_name" "$base_path"
    test_trpc "$app_name" "$base_path"
    test_logo "$app_name" "$base_path"
  done

  echo ""
  echo "=============================================="
  if [[ $FAILURES -gt 0 ]]; then
    log_error "FAILED: $FAILURES test(s) failed"
    exit 1
  else
    log_info "SUCCESS: All smoke tests passed"
    exit 0
  fi
}

main "$@"
