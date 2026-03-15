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

# --- 2. Storefront lint + type check (only if storefront files changed) ---
SF_DIR="$PROJECT_ROOT/storefront"
SF_CHANGED=$(cd "$PROJECT_ROOT" && git diff platform/main --name-only -- storefront/ 2>/dev/null | head -1)
if [[ -d "$SF_DIR" ]] && [[ -n "$SF_CHANGED" ]]; then
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

# --- 3. Submodule reference validation (prevents CI checkout failures) ---
cd "$PROJECT_ROOT"

check_nested_submodule_refs() {
  local base_dir="$1"
  local missing=""

  while IFS= read -r line; do
    SHA=$(echo "$line" | awk '{print $1}' | sed 's/^[+ -]*//')
    SUBPATH=$(echo "$line" | awk '{print $2}')
    [[ -z "$SHA" || -z "$SUBPATH" ]] && continue

    local full_path="${base_dir:+$base_dir/}$SUBPATH"
    if ! git -C "$full_path" branch -r --contains "$SHA" >/dev/null 2>&1; then
      missing="${missing}  $full_path ($SHA)\n"
    fi

    # Check nested submodules
    if [[ -f "$full_path/.gitmodules" ]]; then
      nested=$(cd "$full_path" && check_nested_submodule_refs "")
      [[ -n "$nested" ]] && missing="${missing}${nested}"
    fi
  done < <(git -C "${base_dir:-.}" submodule status 2>/dev/null)

  echo -n "$missing"
}

MISSING_REFS=$(check_nested_submodule_refs "")
if [[ -n "$MISSING_REFS" ]]; then
  ERRORS="${ERRORS}Submodule commits not pushed to remote (CI will fail at checkout):\n${MISSING_REFS}\nFix: push submodule commits before creating PR.\n\n"
fi

# --- Report results ---
if [[ -n "$ERRORS" ]]; then
  REASON=$(echo -e "$ERRORS" | jq -Rs .)
  echo "{\"decision\":\"block\",\"reason\":${REASON}}"
  exit 0
fi

# All checks passed
exit 0
