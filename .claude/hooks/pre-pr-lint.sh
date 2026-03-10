#!/usr/bin/env bash
# Pre-PR Lint Gate — blocks `gh pr create` if lint or type-check fails.
#
# Runs the same checks as CI's test-platform.yml:
#   1. saleor-apps: pnpm turbo run lint (custom apps only)
#   2. storefront: pnpm lint + tsc --noEmit
#
# Hook type: PreToolUse (Bash matcher)
# Reads stdin JSON, checks if command contains "gh pr create".
# Outputs JSON { "decision": "block", "reason": "..." } on failure.

# Read stdin (hook input JSON)
INPUT=$(cat)

# Extract the command from the hook input
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only gate on `gh pr create` commands
if [[ -z "$COMMAND" ]] || ! echo "$COMMAND" | grep -q 'gh pr create'; then
  exit 0
fi

# Determine project root (where this hook lives)
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"

ERRORS=""

# --- 1. Saleor Apps lint (custom apps only, matches CI) ---
APPS_DIR="$PROJECT_ROOT/saleor-apps"
if [[ -d "$APPS_DIR" ]]; then
  cd "$APPS_DIR"

  # Install deps if needed
  if [[ ! -d "node_modules" ]]; then
    pnpm install --frozen-lockfile >/dev/null 2>&1 || true
  fi

  APPS_LINT_EXIT=0
  LINT_OUTPUT=$(pnpm turbo run lint \
    --filter=saleor-app-inventory-ops \
    --filter=saleor-app-buylist \
    --filter=saleor-app-pos 2>&1) || APPS_LINT_EXIT=$?

  if [[ $APPS_LINT_EXIT -ne 0 ]]; then
    # Extract error lines (not warnings) for a clear message
    ERROR_LINES=$(echo "$LINT_OUTPUT" | grep -E '\d+:\d+\s+error\s' | head -20)
    if [[ -n "$ERROR_LINES" ]]; then
      ERRORS="${ERRORS}saleor-apps lint errors:\n${ERROR_LINES}\n\n"
    else
      ERRORS="${ERRORS}saleor-apps lint failed:\n$(echo "$LINT_OUTPUT" | tail -10)\n\n"
    fi
  fi
fi

# --- 2. Storefront lint + type check ---
SF_DIR="$PROJECT_ROOT/storefront"
if [[ -d "$SF_DIR" ]]; then
  cd "$SF_DIR"

  if [[ ! -d "node_modules" ]]; then
    pnpm install --frozen-lockfile >/dev/null 2>&1 || true
  fi

  # Generate GraphQL types if needed (lint depends on them)
  if [[ ! -f "src/gql/graphql.ts" ]]; then
    USE_SCHEMA_FILE=true pnpm generate >/dev/null 2>&1 || true
  fi

  LINT_EXIT=0
  LINT_OUTPUT=$(pnpm lint 2>&1) || LINT_EXIT=$?
  if [[ $LINT_EXIT -ne 0 ]]; then
    ERRORS="${ERRORS}storefront lint failed (exit $LINT_EXIT):\n$(echo "$LINT_OUTPUT" | tail -15)\n\n"
  fi

  TSC_EXIT=0
  TSC_OUTPUT=$(pnpm exec tsc --noEmit 2>&1) || TSC_EXIT=$?
  if [[ $TSC_EXIT -ne 0 ]]; then
    ERRORS="${ERRORS}storefront tsc failed (exit $TSC_EXIT):\n$(echo "$TSC_OUTPUT" | tail -15)\n\n"
  fi
fi

# --- Report results ---
if [[ -n "$ERRORS" ]]; then
  REASON=$(echo -e "$ERRORS" | jq -Rs .)
  echo "{\"decision\":\"block\",\"reason\":${REASON}}"
  exit 0
fi

# All checks passed
exit 0
