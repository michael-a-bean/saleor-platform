# Saleor Platform Makefile
#
# Provides common developer operations for the hobby gaming platform.
# See docs/DELIVERY_CONTRACT.md for validation requirements.

.PHONY: help validate lint typecheck test migration-check docker-check localreview env-check

# Default target
help:
	@echo "Saleor Platform - Available targets:"
	@echo ""
	@echo "  Validation:"
	@echo "    make validate       Run full validation suite (required before commit)"
	@echo "    make localreview    Run local review gate (checks diffs for risky changes)"
	@echo ""
	@echo "  Individual checks:"
	@echo "    make lint           Run linters for all projects"
	@echo "    make typecheck      Run type checkers for TypeScript projects"
	@echo "    make test           Run unit tests"
	@echo "    make migration-check    Validate database migrations"
	@echo "    make docker-check   Validate docker-compose configuration"
	@echo "    make env-check      Verify required environment variables"
	@echo ""
	@echo "  Local Review Options (via environment variables):"
	@echo "    BASE_REF=origin/platform/main  Git ref to diff against"
	@echo "    SCOPE=auto|staged|all          What to check (default: auto)"
	@echo "    FAIL_ON=HIGH|MEDIUM|LOW|NONE   Minimum severity to fail (default: HIGH)"
	@echo "    OUTPUT_PATH=path/to/report.md  Where to write report"
	@echo ""
	@echo "Examples:"
	@echo "  make validate                       # Full validation suite"
	@echo "  make localreview"
	@echo "  make localreview BASE_REF=HEAD~5"
	@echo "  make localreview SCOPE=staged FAIL_ON=MEDIUM"

# =============================================================================
# Environment Check
# =============================================================================

# Check that .env file exists with required variables
env-check:
	@echo "Checking environment configuration..."
	@if [ ! -f .env ]; then \
		echo "ERROR: .env file not found. Copy from .env.example and fill in values."; \
		exit 1; \
	fi
	@echo "  [OK] .env file exists"
	@# Check for required variables (without exposing values)
	@for var in SECRET_KEY POSTGRES_USER POSTGRES_PASSWORD \
		STRIPE_APP_SECRET_KEY INVENTORY_OPS_SECRET_KEY BUYLIST_SECRET_KEY POS_SECRET_KEY \
		INVENTORY_DATABASE_URL INVENTORY_POSTGRES_USER INVENTORY_POSTGRES_PASSWORD; do \
		if ! grep -q "^$$var=" .env 2>/dev/null || [ "$$(grep "^$$var=" .env | cut -d= -f2-)" = "" ]; then \
			echo "ERROR: Required variable $$var is not set in .env"; \
			exit 1; \
		fi; \
	done
	@echo "  [OK] Required environment variables are set"
	@echo ""

# =============================================================================
# Linting
# =============================================================================

lint: lint-storefront lint-apps
	@echo "All linting checks passed"

lint-storefront:
	@echo "Linting storefront..."
	@if [ -d "storefront" ] && [ -f "storefront/package.json" ]; then \
		cd storefront && pnpm lint || exit 1; \
	else \
		echo "  [SKIP] Storefront not found or not configured"; \
	fi

lint-apps:
	@echo "Linting saleor-apps..."
	@if [ -d "saleor-apps" ] && [ -f "saleor-apps/package.json" ]; then \
		cd saleor-apps && pnpm lint || exit 1; \
	else \
		echo "  [SKIP] saleor-apps not found or not configured"; \
	fi

# =============================================================================
# Type Checking
# =============================================================================

typecheck: typecheck-storefront typecheck-apps
	@echo "All type checks passed"

typecheck-storefront:
	@echo "Type checking storefront..."
	@if [ -d "storefront" ] && [ -f "storefront/package.json" ]; then \
		cd storefront && pnpm exec tsc --noEmit || exit 1; \
	else \
		echo "  [SKIP] Storefront not found or not configured"; \
	fi

typecheck-apps:
	@echo "Type checking saleor-apps..."
	@if [ -d "saleor-apps" ] && [ -f "saleor-apps/package.json" ]; then \
		cd saleor-apps && pnpm check-types || exit 1; \
	else \
		echo "  [SKIP] saleor-apps not found or not configured"; \
	fi

# =============================================================================
# Testing
# =============================================================================

test: test-storefront test-apps
	@echo "All tests passed"

test-storefront:
	@echo "Testing storefront..."
	@if [ -d "storefront" ] && [ -f "storefront/package.json" ]; then \
		cd storefront && pnpm test || exit 1; \
	else \
		echo "  [SKIP] Storefront not found or not configured"; \
	fi

test-apps:
	@echo "Testing saleor-apps..."
	@if [ -d "saleor-apps" ] && [ -f "saleor-apps/package.json" ]; then \
		cd saleor-apps && pnpm test:ci || exit 1; \
	else \
		echo "  [SKIP] saleor-apps not found or not configured"; \
	fi

# =============================================================================
# Migration Validation
# =============================================================================

migration-check: migration-check-django migration-check-prisma
	@echo "All migration checks passed"

migration-check-django:
	@echo "Checking Django migrations..."
	@# Check for unapplied migrations (requires running db)
	@if docker compose ps db 2>/dev/null | grep -q "running"; then \
		docker compose run --rm --no-deps api python3 manage.py migrate --check || \
			(echo "  [ERROR] Django migration check failed - see errors above"; exit 1); \
	else \
		echo "  [SKIP] Database not running - cannot verify Django migrations"; \
	fi

migration-check-prisma:
	@echo "Checking Prisma migrations..."
	@if [ -d "saleor-apps/apps/inventory-ops/prisma/migrations" ]; then \
		echo "  [OK] Prisma migrations directory exists"; \
		# Validate schema syntax
		if [ -f "saleor-apps/apps/inventory-ops/prisma/schema.prisma" ]; then \
			cd saleor-apps/apps/inventory-ops && pnpm prisma validate 2>/dev/null || \
				echo "  [WARN] Prisma schema validation failed or prisma not available"; \
		fi; \
	else \
		echo "  [SKIP] No Prisma migrations found"; \
	fi

# =============================================================================
# Docker Validation
# =============================================================================

docker-check:
	@echo "Validating Docker configuration..."
	@docker compose config > /dev/null 2>&1 && echo "  [OK] docker-compose.yml is valid" || \
		(echo "  [ERROR] docker-compose.yml validation failed"; exit 1)
	@echo ""

# =============================================================================
# Local Review (Risky Change Detection)
# =============================================================================

# Run the local review gate
# Checks git diffs for risky patterns and generates a markdown report
localreview:
	@echo "Running local review..."
	@bash scripts/localreview.sh

# =============================================================================
# Full Validation Suite
# =============================================================================

# Run all validation checks in sequence
# This should pass before any commit to platform/main
validate: env-check docker-check lint typecheck test migration-check localreview
	@echo ""
	@echo "=============================================="
	@echo "  All validation checks passed!"
	@echo "=============================================="
	@echo ""
	@echo "Ready to commit. Remember:"
	@echo "  - git branch --show-current (must not be 'main')"
	@echo "  - git status (review changes)"
	@echo "  - git commit (with meaningful message)"
	@echo ""

# =============================================================================
# Quick Validate (Skip long-running checks)
# =============================================================================

# Faster validation for quick iteration
validate-quick: env-check docker-check lint typecheck
	@echo ""
	@echo "Quick validation passed (tests and migrations skipped)"
	@echo "Run 'make validate' for full validation before committing"
	@echo ""
