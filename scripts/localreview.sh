#!/usr/bin/env bash
#
# localreview.sh - Deterministic local review gate for saleor-platform
#
# Inspects git diffs for risky changes and produces a markdown report.
# Designed as a pre-commit/pre-PR gate that can be run standalone or via make.
#
# Environment variables:
#   BASE_REF       - Git ref to diff against (default: origin/platform/main)
#   SCOPE          - auto|staged|all (default: auto)
#   CHANGED_ONLY   - true|false, only check changed files (default: true)
#   FAIL_ON        - Minimum severity to fail: HIGH|MEDIUM|LOW|NONE (default: HIGH)
#   OUTPUT_PATH    - Report output path (default: docs/ai-reviews/localreview.md)
#
# Exit codes:
#   0 - No findings >= FAIL_ON threshold
#   1 - Findings >= FAIL_ON threshold found
#   2 - Script error

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

BASE_REF="${BASE_REF:-origin/platform/main}"
SCOPE="${SCOPE:-auto}"
CHANGED_ONLY="${CHANGED_ONLY:-true}"
FAIL_ON="${FAIL_ON:-HIGH}"
OUTPUT_PATH="${OUTPUT_PATH:-docs/ai-reviews/localreview.md}"

# Severity levels (higher = more severe)
declare -A SEVERITY_LEVELS=([LOW]=1 [MEDIUM]=2 [HIGH]=3 [CRITICAL]=4)
FAIL_THRESHOLD="${SEVERITY_LEVELS[${FAIL_ON}]:-3}"

# Tracking
declare -a FINDINGS=()
HAS_HIGH=false
HAS_MEDIUM=false
HAS_LOW=false
TOTAL_ADDITIONS=0
TOTAL_DELETIONS=0
FILES_CHANGED=0

# =============================================================================
# Utility Functions
# =============================================================================

log_info() {
    echo "[INFO] $*" >&2
}

log_warn() {
    echo "[WARN] $*" >&2
}

log_error() {
    echo "[ERROR] $*" >&2
}

add_finding() {
    local severity="$1"
    local category="$2"
    local finding="$3"
    local evidence="$4"
    local recommendation="$5"

    FINDINGS+=("${severity}|${category}|${finding}|${evidence}|${recommendation}")

    case "$severity" in
        HIGH|CRITICAL) HAS_HIGH=true ;;
        MEDIUM) HAS_MEDIUM=true ;;
        LOW) HAS_LOW=true ;;
    esac
}

severity_meets_threshold() {
    local severity="$1"
    local level="${SEVERITY_LEVELS[${severity}]:-0}"
    [[ "$level" -ge "$FAIL_THRESHOLD" ]]
}

count_by_severity() {
    local pattern="$1"
    local count=0
    for finding in "${FINDINGS[@]}"; do
        local severity="${finding%%|*}"
        if [[ "$severity" =~ ^($pattern)$ ]]; then
            ((count++)) || true
        fi
    done
    echo "$count"
}

# =============================================================================
# Git Operations
# =============================================================================

get_diff_files() {
    local base="$1"

    case "$SCOPE" in
        staged)
            git diff --cached --name-only
            ;;
        all)
            git diff "$base" --name-only 2>/dev/null || git diff HEAD --name-only
            ;;
        auto|*)
            # Check if there are staged changes
            if git diff --cached --quiet 2>/dev/null; then
                # No staged changes, diff against base
                git diff "$base" --name-only 2>/dev/null || git diff HEAD --name-only
            else
                # Has staged changes, use staged
                git diff --cached --name-only
            fi
            ;;
    esac
}

get_diff_content() {
    local base="$1"

    case "$SCOPE" in
        staged)
            git diff --cached
            ;;
        all)
            git diff "$base" 2>/dev/null || git diff HEAD
            ;;
        auto|*)
            if git diff --cached --quiet 2>/dev/null; then
                git diff "$base" 2>/dev/null || git diff HEAD
            else
                git diff --cached
            fi
            ;;
    esac
}

get_diff_stat() {
    local base="$1"

    case "$SCOPE" in
        staged)
            git diff --cached --stat
            ;;
        all)
            git diff "$base" --stat 2>/dev/null || git diff HEAD --stat
            ;;
        auto|*)
            if git diff --cached --quiet 2>/dev/null; then
                git diff "$base" --stat 2>/dev/null || git diff HEAD --stat
            else
                git diff --cached --stat
            fi
            ;;
    esac
}

# =============================================================================
# Detection Patterns
# =============================================================================

check_workflow_changes() {
    local files="$1"

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        if [[ "$file" =~ \.github/workflows/ ]]; then
            add_finding "HIGH" "CI/CD" \
                "GitHub Actions workflow modified" \
                "$file" \
                "Review workflow changes carefully. Ensure no secrets are exposed and jobs follow security best practices."
        fi
    done <<< "$files"
}

check_docker_changes() {
    local files="$1"

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        if [[ "$file" =~ Dockerfile$ ]] || [[ "$file" =~ docker-compose ]]; then
            add_finding "MEDIUM" "Infrastructure" \
                "Docker configuration modified" \
                "$file" \
                "Verify base images, exposed ports, and volume mounts. Check for hardcoded secrets."
        fi
    done <<< "$files"
}

check_database_changes() {
    local files="$1"

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        if [[ "$file" =~ prisma/schema ]] || [[ "$file" =~ prisma/migrations ]]; then
            add_finding "HIGH" "Database" \
                "Database schema or migration changed" \
                "$file" \
                "Review migration for data loss risks. Ensure rollback strategy exists. Test on staging first."
        fi

        if [[ "$file" =~ migrations/ ]] && [[ "$file" =~ \.py$ ]]; then
            add_finding "HIGH" "Database" \
                "Django migration modified" \
                "$file" \
                "Review migration for backwards compatibility and data integrity. Consider reversibility."
        fi
    done <<< "$files"
}

check_env_changes() {
    local files="$1"

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        if [[ "$file" =~ \.env ]] || [[ "$file" =~ backend\.env ]] || [[ "$file" =~ common\.env ]]; then
            add_finding "CRITICAL" "Secrets" \
                "Environment file modified - potential secret exposure" \
                "$file" \
                "NEVER commit actual secrets. Use .env.example with placeholder values only."
        fi
    done <<< "$files"
}

check_storefront_changes() {
    local files="$1"
    local diff_content="$2"

    local has_storefront=false
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        if [[ "$file" =~ ^storefront/ ]]; then
            has_storefront=true
            break
        fi
    done <<< "$files"

    if [[ "$has_storefront" == "true" ]]; then
        # Check for NEXT_PUBLIC_ additions
        if echo "$diff_content" | grep -q "^\+.*NEXT_PUBLIC_"; then
            add_finding "MEDIUM" "Frontend" \
                "New NEXT_PUBLIC_ environment variable added" \
                "storefront/* (NEXT_PUBLIC_ in diff)" \
                "NEXT_PUBLIC_ vars are exposed to browser. Ensure no sensitive data is leaked."
        fi
    fi
}

check_saleor_apps_changes() {
    local files="$1"

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        if [[ "$file" =~ ^saleor-apps/ ]]; then
            add_finding "MEDIUM" "Apps" \
                "Saleor app modified" \
                "$file" \
                "Test app webhooks and API interactions thoroughly. Verify app permissions."
        fi
    done <<< "$files"
}

check_dependency_changes() {
    local files="$1"

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        if [[ "$file" =~ package\.json$ ]] || [[ "$file" =~ package-lock\.json$ ]] || \
           [[ "$file" =~ bun\.lockb$ ]] || [[ "$file" =~ yarn\.lock$ ]] || \
           [[ "$file" =~ requirements.*\.txt$ ]] || [[ "$file" =~ Pipfile ]]; then
            add_finding "MEDIUM" "Dependencies" \
                "Dependency file changed" \
                "$file" \
                "Review new/updated dependencies for security vulnerabilities. Run audit tools."
        fi
    done <<< "$files"
}

# =============================================================================
# Secret Detection
# =============================================================================

check_secrets_in_diff() {
    local diff_content="$1"

    # Filter out lock file chunks — integrity hashes cause false positives
    local filtered_diff
    filtered_diff=$(echo "$diff_content" | awk '
        /^diff --git.*\.(lock|lockb|lock\.yaml)/ { skip=1; next }
        /^diff --git/ { skip=0 }
        !skip { print }
    ')

    # Simple patterns for common secret formats
    local -a patterns=(
        'AKIA[0-9A-Z]{16}'                           # AWS Access Key
        'sk[-_]live[-_][a-zA-Z0-9]{24,}'             # Stripe live key
        'sk[-_]test[-_][a-zA-Z0-9]{24,}'             # Stripe test key
        'ghp_[a-zA-Z0-9]{36}'                        # GitHub Personal Access Token
        'gho_[a-zA-Z0-9]{36}'                        # GitHub OAuth Token
        'xox[baprs]-[a-zA-Z0-9-]{10,}'               # Slack token
        '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'  # Private keys
        'password["\x27]?\s*[:=]\s*["\x27][^"\x27]{8,}'  # password = "..." patterns
    )

    for pattern in "${patterns[@]}"; do
        if echo "$filtered_diff" | grep -qE "^\+.*${pattern}"; then
            # Get a sanitized preview
            local match
            match=$(echo "$filtered_diff" | grep -E "^\+.*${pattern}" | head -1 | sed 's/^\+//' | cut -c1-60)
            add_finding "CRITICAL" "Secrets" \
                "Potential secret detected in diff" \
                "${match}..." \
                "REMOVE secret immediately. Use environment variables or secret management system."
        fi
    done
}

# =============================================================================
# External Scanners (Optional)
# =============================================================================

run_gitleaks() {
    if ! command -v gitleaks &>/dev/null; then
        log_info "gitleaks not installed - skipping leak detection"
        return 0
    fi

    log_info "Running gitleaks..."

    local report
    if report=$(gitleaks detect --no-git -v 2>&1); then
        echo "No leaks detected by gitleaks"
    else
        # Redact actual secrets from output
        local redacted
        redacted=$(echo "$report" | sed -E 's/(Secret:?\s*)[^ ]+/\1[REDACTED]/g')
        echo "Gitleaks findings (redacted):"
        echo "$redacted"
        add_finding "CRITICAL" "Secrets" \
            "Gitleaks detected potential secrets" \
            "See scanner output below" \
            "Review gitleaks output and remove any actual secrets."
    fi
}

run_trivy() {
    if ! command -v trivy &>/dev/null; then
        log_info "trivy not installed - skipping vulnerability scan"
        return 0
    fi

    log_info "Running trivy fs scan..."

    local report
    if report=$(trivy fs --scanners secret,misconfig --severity HIGH,CRITICAL . 2>&1); then
        echo "No high/critical issues found by trivy"
    else
        echo "$report" | head -100
    fi
}

# =============================================================================
# Report Generation
# =============================================================================

generate_report() {
    local diff_stat="$1"
    local gitleaks_output="$2"
    local trivy_output="$3"

    mkdir -p "$(dirname "$OUTPUT_PATH")"

    cat > "$OUTPUT_PATH" << EOF
# Local Review Report

**Generated:** $(date -Iseconds)
**Base Reference:** ${BASE_REF}
**Scope:** ${SCOPE}
**Fail Threshold:** ${FAIL_ON}

---

## Summary

| Metric | Value |
|--------|-------|
| Files Changed | ${FILES_CHANGED} |
| Total Findings | ${#FINDINGS[@]} |
| Critical/High | $(count_by_severity "CRITICAL|HIGH") |
| Medium | $(count_by_severity "MEDIUM") |
| Low | $(count_by_severity "LOW") |

---

## Diff Statistics

\`\`\`
${diff_stat}
\`\`\`

---

## Findings

EOF

    if [[ ${#FINDINGS[@]} -eq 0 ]]; then
        echo "No findings detected." >> "$OUTPUT_PATH"
    else
        echo "| Severity | Category | Finding | Evidence | Recommendation |" >> "$OUTPUT_PATH"
        echo "|----------|----------|---------|----------|----------------|" >> "$OUTPUT_PATH"

        for finding in "${FINDINGS[@]}"; do
            IFS='|' read -r severity category finding_text evidence recommendation <<< "$finding"
            # Escape pipe characters in evidence
            evidence="${evidence//|/\\|}"
            echo "| **${severity}** | ${category} | ${finding_text} | \`${evidence}\` | ${recommendation} |" >> "$OUTPUT_PATH"
        done
    fi

    cat >> "$OUTPUT_PATH" << EOF

---

## Scanner Results

### Gitleaks

\`\`\`
${gitleaks_output:-Not available (gitleaks not installed)}
\`\`\`

### Trivy

\`\`\`
${trivy_output:-Not available (trivy not installed)}
\`\`\`

---

## Next Actions

EOF

    if [[ ${#FINDINGS[@]} -eq 0 ]]; then
        cat >> "$OUTPUT_PATH" << EOF
- [x] No issues found - ready to proceed
- [ ] Consider running full CI pipeline before merge
EOF
    else
        cat >> "$OUTPUT_PATH" << EOF
- [ ] Address all CRITICAL and HIGH severity findings before committing
- [ ] Review MEDIUM findings and address as appropriate
- [ ] Run \`make localreview\` again after fixes to verify resolution
- [ ] Consider running full security scan before merge to main branch
EOF
    fi

    cat >> "$OUTPUT_PATH" << EOF

---

*Generated by localreview.sh - Deterministic PR-style local review gate*
EOF
}

# =============================================================================
# Main
# =============================================================================

main() {
    log_info "Starting local review..."
    log_info "Base ref: ${BASE_REF}"
    log_info "Scope: ${SCOPE}"
    log_info "Fail threshold: ${FAIL_ON}"

    # Verify we're in a git repo
    if ! git rev-parse --is-inside-work-tree &>/dev/null; then
        log_error "Not inside a git repository"
        exit 2
    fi

    # Get diff information
    local files diff_content diff_stat
    files=$(get_diff_files "$BASE_REF")
    diff_content=$(get_diff_content "$BASE_REF")
    diff_stat=$(get_diff_stat "$BASE_REF")

    FILES_CHANGED=$(echo "$files" | grep -c . || echo 0)

    if [[ -z "$files" ]] || [[ "$FILES_CHANGED" -eq 0 ]]; then
        log_info "No changes detected"
        generate_report "No changes" "" ""
        echo ""
        echo "Report written to: ${OUTPUT_PATH}"
        exit 0
    fi

    log_info "Checking ${FILES_CHANGED} changed files..."

    # Run all checks
    check_workflow_changes "$files"
    check_docker_changes "$files"
    check_database_changes "$files"
    check_env_changes "$files"
    check_storefront_changes "$files" "$diff_content"
    check_saleor_apps_changes "$files"
    check_dependency_changes "$files"
    check_secrets_in_diff "$diff_content"

    # Run external scanners (optional)
    local gitleaks_output trivy_output
    gitleaks_output=$(run_gitleaks 2>&1 || true)
    trivy_output=$(run_trivy 2>&1 || true)

    # Generate report
    generate_report "$diff_stat" "$gitleaks_output" "$trivy_output"

    log_info "Report written to: ${OUTPUT_PATH}"

    # Determine exit code
    local should_fail=false
    for finding in "${FINDINGS[@]}"; do
        local severity="${finding%%|*}"
        if severity_meets_threshold "$severity"; then
            should_fail=true
            break
        fi
    done

    echo ""
    echo "=========================================="
    echo "LOCAL REVIEW COMPLETE"
    echo "=========================================="
    echo "Files checked: ${FILES_CHANGED}"
    echo "Findings: ${#FINDINGS[@]}"
    echo "Report: ${OUTPUT_PATH}"

    if [[ "$should_fail" == "true" ]]; then
        echo ""
        echo "RESULT: FAILED (findings >= ${FAIL_ON})"
        exit 1
    else
        echo ""
        echo "RESULT: PASSED"
        exit 0
    fi
}

main "$@"
