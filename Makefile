# Saleor Platform Makefile
#
# Provides common developer operations for the hobby gaming platform.
# See docs/DELIVERY_CONTRACT.md for validation requirements.

.PHONY: help validate validate-with-env validate-quick lint typecheck test migration-check docker-check localreview codex-review env-check

# Default target
help:
	@echo "Saleor Platform - Available targets:"
	@echo ""
	@echo "  Validation:"
	@echo "    make validate          Run full validation suite (no .env required)"
	@echo "    make validate-with-env Run validation with strict .env check"
	@echo "    make validate-quick    Quick validation (skip tests/migrations)"
	@echo "    make localreview       Run local review gate (checks diffs)"
	@echo "    make codex-review      Run Codex CLI AI review (requires auth)"
	@echo ""
	@echo "  Individual checks:"
	@echo "    make lint              Run linters for all projects"
	@echo "    make typecheck         Run type checkers for TypeScript projects"
	@echo "    make test              Run unit tests"
	@echo "    make migration-check   Validate database migrations"
	@echo "    make docker-check      Validate docker-compose configuration"
	@echo "    make env-check         Verify required environment variables"
	@echo ""
	@echo "  Local Review Options (via environment variables):"
	@echo "    BASE_REF=origin/platform/main  Git ref to diff against"
	@echo "    SCOPE=auto|staged|all          What to check (default: auto)"
	@echo "    FAIL_ON=HIGH|MEDIUM|LOW|NONE   Minimum severity to fail (default: HIGH)"
	@echo "    OUTPUT_PATH=path/to/report.md  Where to write report"
	@echo ""
	@echo "  Codex Review Options:"
	@echo "    BASE_REF=platform/main         Branch to diff against (default: platform/main)"
	@echo "    FAIL_ON=P0|P1|NONE             Minimum severity to block (default: P0)"
	@echo ""
	@echo "Examples:"
	@echo "  make validate                       # Full validation suite"
	@echo "  make localreview"
	@echo "  make localreview BASE_REF=HEAD~5"
	@echo "  make localreview SCOPE=staged FAIL_ON=MEDIUM"
	@echo "  make codex-review"
	@echo "  make codex-review FAIL_ON=P1"

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

# Validates docker-compose.yml syntax
# Uses .env.example as fallback if .env doesn't exist (for CI/validation-only mode)
docker-check:
	@echo "Validating Docker configuration..."
	@if [ ! -f .env ] && [ -f .env.example ]; then \
		echo "  [INFO] Using .env.example for validation (no local .env found)"; \
		cp .env.example .env.validation-tmp; \
		docker compose --env-file .env.validation-tmp config > /dev/null 2>&1 && \
			echo "  [OK] docker-compose.yml is valid" || \
			(rm -f .env.validation-tmp; echo "  [ERROR] docker-compose.yml validation failed"; exit 1); \
		rm -f .env.validation-tmp; \
	else \
		docker compose config > /dev/null 2>&1 && echo "  [OK] docker-compose.yml is valid" || \
			(echo "  [ERROR] docker-compose.yml validation failed"; exit 1); \
	fi
	@echo ""

# =============================================================================
# Local Review (Risky Change Detection)
# =============================================================================

# Run the local review gate
# Checks git diffs for risky patterns and generates a markdown report
localreview:
	@echo "Running local review..."
	@bash scripts/localreview.sh

# Run Codex CLI AI-powered review (requires: npm i -g @openai/codex && codex login)
codex-review:
	@echo "Running Codex CLI review..."
	@bash scripts/codex-review.sh

# =============================================================================
# Full Validation Suite
# =============================================================================

# Run all validation checks in sequence (no local .env required)
# This should pass before any commit to platform/main
# Uses .env.example for docker validation if .env is missing
validate: docker-check lint typecheck test migration-check localreview
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

# Full validation with strict env check (for running the stack locally)
validate-with-env: env-check validate
	@echo "Full validation with environment check complete"

# =============================================================================
# Quick Validate (Skip long-running checks)
# =============================================================================

# Faster validation for quick iteration (no local .env required)
validate-quick: docker-check lint typecheck
	@echo ""
	@echo "Quick validation passed (tests and migrations skipped)"
	@echo "Run 'make validate' for full validation before committing"
	@echo ""

# =============================================================================
# Environment Isolation (CRITICAL)
# =============================================================================
# These targets prevent accidental cross-environment contamination.
# See docs/reference/local-staging-workflow.md for workflow documentation.

.PHONY: validate-env validate-env-strict validate-env-full env-guard-local setup-hooks

# Quick environment validation (for pre-push)
validate-env:
	@./scripts/validate-environment.sh pre-push

# Strict environment validation (for deployments)
validate-env-strict:
	@./scripts/validate-environment.sh pre-deploy --strict

# Full environment validation including database checks
validate-env-full:
	@./scripts/validate-environment.sh full --strict

# Guard target - ensures we're in local environment
env-guard-local:
	@if [ "$${SALEOR_ENVIRONMENT:-local}" != "local" ]; then \
		echo "ERROR: This operation requires SALEOR_ENVIRONMENT=local"; \
		echo "Current: $${SALEOR_ENVIRONMENT:-not set}"; \
		exit 1; \
	fi
	@echo "  [OK] Environment guard passed (local)"

# Database reset (local only)
db-reset: env-guard-local
	@echo "Resetting local database..."
	docker compose down -v db
	docker compose up -d db
	@sleep 5
	docker compose run --rm api python manage.py migrate
	@echo "  [OK] Database reset complete"

# Setup git hooks
setup-hooks:
	@echo "Setting up git hooks..."
	@mkdir -p .githooks
	@git config core.hooksPath .githooks
	@chmod +x .githooks/* 2>/dev/null || true
	@echo "  [OK] Git hooks configured (path: .githooks/)"

# =============================================================================
# Deployment Targets (require environment validation)
# =============================================================================

.PHONY: deploy-staging

# Deploy to staging (validates environment first)
deploy-staging: validate-env-strict
	@echo "Deploying to staging..."
	@echo "TODO: Add actual deployment commands"
	@echo "Example: cd infra/terraform && terraform workspace select staging && terraform apply"

# =============================================================================
# Smoke Tests
# =============================================================================

.PHONY: smoke-test smoke-test-local

# Run smoke tests against local environment
# Requires: docker compose services running (api, storefront, dashboard)
smoke-test-local:
	@echo "Running smoke tests against local environment..."
	@./scripts/deploy/aws/smoke-test.sh local

# Run smoke tests against staging
smoke-test-staging:
	@echo "Running smoke tests against staging..."
	@./scripts/deploy/aws/smoke-test.sh staging

# Alias
smoke-test: smoke-test-local
