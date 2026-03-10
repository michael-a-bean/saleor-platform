#!/usr/bin/env bash
#
# codex-review.sh - Local Codex CLI code review gate
#
# Runs `codex review` against the base branch and parses output for severity.
# Designed as a pre-PR gate in the create-pr skill pipeline.
#
# Requirements:
#   - Node.js 22+ via fnm
#   - @openai/codex installed globally (`npm i -g @openai/codex`)
#   - Authenticated via `codex login` (ChatGPT Plus subscription)
#
# Environment variables:
#   BASE_REF       - Branch to diff against (default: platform/main)
#   FAIL_ON        - Minimum severity to fail: P0|P1|NONE (default: P0)
#   REVIEW_OUTPUT  - Output file path (default: docs/ai-reviews/codex-review.md)
#
# Exit codes:
#   0 - No findings >= FAIL_ON threshold
#   1 - Findings >= FAIL_ON threshold found
#   2 - Script error (codex not installed, not authenticated, etc.)

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

BASE_REF="${BASE_REF:-platform/main}"
FAIL_ON="${FAIL_ON:-P0}"
REVIEW_OUTPUT="${REVIEW_OUTPUT:-docs/ai-reviews/codex-review.md}"

# =============================================================================
# Prerequisites
# =============================================================================

# Ensure real Node.js (not bun wrapper)
# fnm may not be on PATH in non-login shells — add it explicitly
export PATH="$HOME/.local/share/fnm:$PATH"
if command -v fnm &>/dev/null; then
    eval "$(fnm env)"
    fnm use 22 --silent-if-unchanged 2>/dev/null || fnm use 22
fi

if ! command -v codex &>/dev/null; then
    echo "[ERROR] Codex CLI not found. Install with: npm i -g @openai/codex" >&2
    exit 2
fi

# Verify auth
AUTH_STATUS=$(codex login status 2>&1)
if [[ "$AUTH_STATUS" != *"Logged in"* ]]; then
    echo "[ERROR] Codex CLI not authenticated. Run: codex login --device-auth" >&2
    exit 2
fi

# Verify we have changes to review
DIFF_STAT=$(git diff "$BASE_REF"...HEAD --stat 2>/dev/null || git diff "$BASE_REF"..HEAD --stat 2>/dev/null)
if [ -z "$DIFF_STAT" ]; then
    echo "[INFO] No changes to review against $BASE_REF"
    exit 0
fi

# =============================================================================
# Run Review
# =============================================================================

echo "[INFO] Running Codex CLI review against $BASE_REF..."
echo "[INFO] Model: GPT-5.4 (Codex default)"
echo ""

REVIEW_RAW=$(codex review --base "$BASE_REF" 2>&1)

# Extract just the review output (after the session metadata)
# The actual review starts after "codex" line at the end
REVIEW_BODY=$(echo "$REVIEW_RAW" | sed -n '/^codex$/,$ { /^codex$/d; p }')

# If no body found, try capturing everything after the last "exec" block
if [ -z "$REVIEW_BODY" ]; then
    REVIEW_BODY=$(echo "$REVIEW_RAW" | tail -50)
fi

# =============================================================================
# Parse Severity
# =============================================================================

P0_COUNT=$(echo "$REVIEW_BODY" | grep -ci '\[P0\]\|P0 (critical)\|P0:' || true)
P1_COUNT=$(echo "$REVIEW_BODY" | grep -ci '\[P1\]\|P1 (warning)\|P1:' || true)
P2_COUNT=$(echo "$REVIEW_BODY" | grep -ci '\[P2\]\|P2 (note)\|P2:' || true)

# =============================================================================
# Output Report
# =============================================================================

mkdir -p "$(dirname "$REVIEW_OUTPUT")"

cat > "$REVIEW_OUTPUT" << EOF
# Codex CLI Review

**Date:** $(date -u +"%Y-%m-%d %H:%M UTC")
**Base:** $BASE_REF
**Branch:** $(git branch --show-current)
**Model:** GPT-5.4 (Codex CLI)

## Summary

| Severity | Count |
|----------|-------|
| P0 (critical) | $P0_COUNT |
| P1 (warning) | $P1_COUNT |
| P2 (note) | $P2_COUNT |

## Findings

$REVIEW_BODY
EOF

echo ""
echo "════════════════════════════════════════════"
echo "  Codex CLI Review Results"
echo "════════════════════════════════════════════"
echo ""
echo "  P0 (critical): $P0_COUNT"
echo "  P1 (warning):  $P1_COUNT"
echo "  P2 (note):     $P2_COUNT"
echo ""
echo "  Full report: $REVIEW_OUTPUT"
echo ""

# =============================================================================
# Findings
# =============================================================================

# Print the actual findings
echo "$REVIEW_BODY"
echo ""

# =============================================================================
# Exit Decision
# =============================================================================

case "$FAIL_ON" in
    P0)
        if [ "$P0_COUNT" -gt 0 ]; then
            echo "[BLOCKED] $P0_COUNT P0 (critical) finding(s). Fix before creating PR."
            exit 1
        fi
        if [ "$P1_COUNT" -gt 0 ]; then
            echo "[WARNING] $P1_COUNT P1 finding(s) — review recommended but not blocking."
        fi
        ;;
    P1)
        if [ "$P0_COUNT" -gt 0 ] || [ "$P1_COUNT" -gt 0 ]; then
            echo "[BLOCKED] $P0_COUNT P0 + $P1_COUNT P1 finding(s). Fix before creating PR."
            exit 1
        fi
        ;;
    NONE)
        echo "[INFO] Review complete — no severity threshold enforced."
        ;;
    *)
        echo "[ERROR] Unknown FAIL_ON value: $FAIL_ON (expected P0, P1, or NONE)" >&2
        exit 2
        ;;
esac

echo "[PASSED] Codex review passed (threshold: $FAIL_ON)"
exit 0
