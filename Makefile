# Saleor Platform Makefile
#
# Provides common developer operations for the hobby gaming platform.

.PHONY: help localreview validate

# Default target
help:
	@echo "Saleor Platform - Available targets:"
	@echo ""
	@echo "  make localreview    Run local review gate (checks diffs for risky changes)"
	@echo "  make validate       Run validation suite (placeholder for lint/test)"
	@echo ""
	@echo "Local Review Options (via environment variables):"
	@echo "  BASE_REF=origin/platform/main  Git ref to diff against"
	@echo "  SCOPE=auto|staged|all          What to check (default: auto)"
	@echo "  FAIL_ON=HIGH|MEDIUM|LOW|NONE   Minimum severity to fail (default: HIGH)"
	@echo "  OUTPUT_PATH=path/to/report.md  Where to write report"
	@echo ""
	@echo "Examples:"
	@echo "  make localreview"
	@echo "  make localreview BASE_REF=HEAD~5"
	@echo "  make localreview SCOPE=staged FAIL_ON=MEDIUM"

# =============================================================================
# Local Review
# =============================================================================

# Run the local review gate
# Checks git diffs for risky patterns and generates a markdown report
localreview:
	@echo "Running local review..."
	@bash scripts/localreview.sh

# =============================================================================
# Validation
# =============================================================================

# Placeholder for aggregated validation
# Will integrate lint, type-check, and tests as they are added
validate:
	@echo "Validation suite (placeholder)"
	@echo ""
	@echo "Available checks:"
	@echo "  - localreview: make localreview"
	@echo ""
	@echo "TODO: Add lint, type-check, and test targets"
