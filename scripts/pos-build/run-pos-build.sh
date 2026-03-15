#!/bin/bash
set -euo pipefail

# =============================================================================
# POS BUILD — Autonomous Parallel Execution
# =============================================================================
#
# Combines git worktrees (isolation) with parallel claude -p workers (speed).
# Each domain gets its own worktree + branch, runs headless, logs everything.
#
# Usage:
#   ./scripts/pos-build/run-pos-build.sh              # Run all phases
#   ./scripts/pos-build/run-pos-build.sh --phase 2     # Run only phase 2
#   ./scripts/pos-build/run-pos-build.sh --resume-from 2  # Merge prior phases, run 2+
#   ./scripts/pos-build/run-pos-build.sh --dry-run      # Show what would run
#
# Prerequisites:
#   - claude CLI installed and authenticated
#   - git clean working tree on platform/main
# =============================================================================

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKTREE_BASE="${REPO_ROOT}/.claude/worktrees/pos-build"
LOG_DIR="${REPO_ROOT}/scripts/pos-build/logs"
REQ_DOC="docs/pos-build-requirements.md"
TEST_FILE="saleor-apps/apps/pos/src/__tests__/pos-build-features.test.ts"
BASE_BRANCH="platform/main"
INTEGRATION_BRANCH="feature/pos-build"
INTEGRATION_WORKTREE="${WORKTREE_BASE}/_integration"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

DRY_RUN=false
PHASE_FILTER=""
RESUME_FROM=""

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --phase) PHASE_FILTER="$2"; shift 2 ;;
    --resume-from) RESUME_FROM="$2"; PHASE_FILTER="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()  { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $1"; }
err() { echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $1"; }
warn(){ echo -e "${YELLOW}[$(date +%H:%M:%S)] !${NC} $1"; }

# =============================================================================
# Setup
# =============================================================================

setup() {
  log "Setting up directories..."
  mkdir -p "${LOG_DIR}"
  mkdir -p "${WORKTREE_BASE}"

  # Clean up stale index.lock from crashed runs
  if [[ -f "${REPO_ROOT}/.git/index.lock" ]]; then
    warn "Removing stale .git/index.lock"
    rm -f "${REPO_ROOT}/.git/index.lock"
  fi

  # Verify clean working tree (ignore worktrees dir, this script's dir, and submodule dirty state)
  cd "${REPO_ROOT}"
  if [[ -n "${RESUME_FROM}" ]]; then
    warn "Resume mode — skipping dirty working tree check"
  else
    local dirty_files
    dirty_files="$(git status --porcelain --ignore-submodules=dirty | grep -v '^?? \.claude/worktrees/' | grep -v '^?? scripts/pos-build/' || true)"
    if [[ -n "${dirty_files}" ]]; then
      err "Working tree is dirty. Commit or stash changes first."
      echo "${dirty_files}"
      exit 1
    fi
  fi

  # Verify on correct branch
  local current_branch
  current_branch="$(git branch --show-current)"
  if [[ "${current_branch}" != "${BASE_BRANCH}" ]]; then
    warn "Not on ${BASE_BRANCH} (on ${current_branch}). Worktrees will branch from ${current_branch}."
  fi

  # Create integration branch + dedicated worktree (keeps main repo untouched)
  if ! $DRY_RUN; then
    if ! git rev-parse --verify "${INTEGRATION_BRANCH}" >/dev/null 2>&1; then
      git branch "${INTEGRATION_BRANCH}" "${BASE_BRANCH}"
      ok "Created integration branch: ${INTEGRATION_BRANCH} (from ${BASE_BRANCH})"
    fi
    # Create integration worktree if it doesn't exist
    if [[ -d "${INTEGRATION_WORKTREE}" ]]; then
      ok "Integration worktree exists: ${INTEGRATION_WORKTREE}"
    else
      git worktree add "${INTEGRATION_WORKTREE}" "${INTEGRATION_BRANCH}"
      ok "Created integration worktree: ${INTEGRATION_WORKTREE}"
    fi
  fi

  ok "Setup complete. Logs: ${LOG_DIR}"
}

# =============================================================================
# Resume — merge branches from completed phases
# =============================================================================

# Phase-to-branch mapping
PHASE_1_BRANCHES=("feature/pos-staff-permissions")
PHASE_2_BRANCHES=("feature/pos-customers-tax" "feature/pos-inventory" "feature/pos-pricing" \
                  "feature/pos-hardware-receipts" "feature/pos-buylist-cash" "feature/pos-product-catalog")
PHASE_3_BRANCHES=("feature/pos-cart-checkout" "feature/pos-payments")
PHASE_4_BRANCHES=("feature/pos-reporting" "feature/pos-architecture")

merge_prior_phases() {
  local start_phase="$1"
  local branches_to_merge=()

  # Collect branches from all phases before the start phase
  if [[ "${start_phase}" -ge 2 ]]; then branches_to_merge+=("${PHASE_1_BRANCHES[@]}"); fi
  if [[ "${start_phase}" -ge 3 ]]; then branches_to_merge+=("${PHASE_2_BRANCHES[@]}"); fi
  if [[ "${start_phase}" -ge 4 ]]; then branches_to_merge+=("${PHASE_3_BRANCHES[@]}"); fi

  if [[ ${#branches_to_merge[@]} -eq 0 ]]; then
    return 0
  fi

  log "Merging completed phase branches into ${INTEGRATION_BRANCH}..."

  for branch in "${branches_to_merge[@]}"; do
    if $DRY_RUN; then
      log "[DRY RUN] Would merge: ${branch}"
    else
      merge_to_integration "${branch}"
    fi
  done
}

# =============================================================================
# Merge helper (resolves submodule conflicts automatically)
# =============================================================================

# Merge a feature branch into the integration worktree, resolving submodule conflicts
# Args: $1=branch name
merge_to_integration() {
  local branch="$1"
  local wt_name="${branch#feature/pos-}"
  if ! git rev-parse --verify "${branch}" >/dev/null 2>&1; then
    return 0
  fi
  if [[ -z "$(git log "feature/pos-build..${branch}" --oneline 2>/dev/null)" ]]; then
    return 0
  fi
  log "Merging ${branch}..."
  if ! git -C "${INTEGRATION_WORKTREE}" merge "${branch}" --no-edit 2>/dev/null; then
    # Resolve submodule conflict by accepting theirs
    if git -C "${INTEGRATION_WORKTREE}" diff --name-only --diff-filter=U 2>/dev/null | grep -q saleor-apps; then
      local sub_sha
      sub_sha="$(git -C "${WORKTREE_BASE}/${wt_name}" rev-parse HEAD:saleor-apps 2>/dev/null || true)"
      if [[ -n "${sub_sha}" ]]; then
        git -C "${INTEGRATION_WORKTREE}" rm --cached saleor-apps 2>/dev/null || true
        git -C "${INTEGRATION_WORKTREE}" update-index --add --cacheinfo "160000,${sub_sha},saleor-apps"
        git -C "${INTEGRATION_WORKTREE}" commit --no-edit 2>/dev/null
        ok "Merged ${branch} (resolved submodule conflict)"
        return 0
      fi
    fi
    warn "Merge conflict on ${branch} — resolve manually"
    return 1
  fi
  ok "Merged ${branch}"
}

# =============================================================================
# Worktree + Claude Worker (two-phase: prepare then launch)
# =============================================================================

# Phase A: Create branch + worktree (run sequentially before launching workers)
# Args: $1=name, $2=branch
prepare_worktree() {
  local name="$1"
  local branch="$2"
  local worktree_path="${WORKTREE_BASE}/${name}"

  if $DRY_RUN; then
    log "[DRY RUN] Would create worktree: ${name} (branch: ${branch})"
    return 0
  fi

  # Create branch if it doesn't exist
  if ! git rev-parse --verify "${branch}" >/dev/null 2>&1; then
    git branch "${branch}" HEAD
    ok "Created branch: ${branch}"
  fi

  # Create worktree (remove stale one if exists)
  if [[ -d "${worktree_path}" ]]; then
    warn "Removing stale worktree: ${name}"
    git worktree remove "${worktree_path}" --force 2>/dev/null || true
  fi

  git worktree add "${worktree_path}" "${branch}"
  ok "Created worktree: ${name} → ${branch}"
}

# Phase B: Launch claude -p worker in background (call AFTER all worktrees prepared)
# Args: $1=name, $2=branch, $3=prompt
# Appends PID to PID_FILE (avoids $() capture which blocks on child FDs)
PID_FILE=""

launch_worker() {
  local name="$1"
  local branch="$2"
  local prompt="$3"
  local worktree_path="${WORKTREE_BASE}/${name}"
  local log_file="${LOG_DIR}/${TIMESTAMP}-${name}.log"

  if $DRY_RUN; then
    return 0
  fi

  log "Starting worker: ${name} (log: ${log_file})"

  cd "${worktree_path}"
  unset CLAUDECODE
  claude -p "${prompt}" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    > "${log_file}" 2>&1 &
  local worker_pid=$!
  cd "${REPO_ROOT}"

  echo "${worker_pid} ${name} ${branch}" >> "${PID_FILE}"
  ok "Launched worker: ${name} (PID ${worker_pid})"
}

# Wait for all workers listed in PID_FILE, then commit their changes
wait_and_commit_workers() {
  if [[ ! -f "${PID_FILE}" ]]; then
    return 0
  fi

  local total
  total=$(wc -l < "${PID_FILE}")
  log "Waiting for ${total} parallel workers..."

  local failed=0
  while IFS=' ' read -r pid name branch; do
    if ! wait "$pid" 2>/dev/null; then
      err "Worker ${name} (PID ${pid}) failed"
      ((failed++))
    else
      # Commit changes through nested submodule chain:
      # saleor-apps/apps/{pos,inventory-ops} → saleor-apps → main worktree
      local worktree_path="${WORKTREE_BASE}/${name}"
      local sub="${worktree_path}/saleor-apps"
      local has_changes=false

      # Step 1: Commit inside each nested app submodule
      for app in apps/pos apps/inventory-ops; do
        local appdir="${sub}/${app}"
        if [[ -d "${appdir}" ]] && [[ -n "$(git -C "${appdir}" status --porcelain 2>/dev/null)" ]]; then
          git -C "${appdir}" add -A
          git -C "${appdir}" commit -m "feat(pos): ${name} domain changes in ${app##*/}

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" 2>/dev/null || true
          has_changes=true
        fi
      done

      # Step 2: Commit submodule pointer updates in saleor-apps
      if $has_changes; then
        git -C "${sub}" add -A 2>/dev/null
        git -C "${sub}" commit -m "feat(pos): ${name} domain (submodule pointers)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" 2>/dev/null || true
      fi

      # Step 3: Commit saleor-apps pointer in main worktree
      if $has_changes || [[ -n "$(git -C "${worktree_path}" status --porcelain 2>/dev/null)" ]]; then
        git -C "${worktree_path}" add saleor-apps 2>/dev/null
        git -C "${worktree_path}" add -A 2>/dev/null
        git -C "${worktree_path}" commit -m "feat(pos): implement ${name} domain

Auto-generated by pos-build parallel worker.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" 2>/dev/null || {
          warn "[${name}] Commit failed"
        }
        ok "[${name}] Changes committed on ${branch}"
      else
        warn "[${name}] No changes to commit"
      fi
    fi
  done < "${PID_FILE}"

  rm -f "${PID_FILE}"

  if [[ $failed -gt 0 ]]; then
    err "${failed} worker(s) failed. Check logs in ${LOG_DIR}"
  else
    ok "All ${total} workers completed successfully"
  fi
}

# =============================================================================
# Common prompt prefix
# =============================================================================

COMMON_PROMPT="You are implementing POS features for a hobby gaming commerce platform.

CRITICAL INSTRUCTIONS:
1. Read ${REQ_DOC} for detailed requirements, schema changes, and business rules.
2. Read ${TEST_FILE} for test case specifications.
3. The Prisma schema is at saleor-apps/apps/inventory-ops/prisma/schema.prisma (shared via symlink).
4. Implement each feature by:
   a. Adding any required Prisma schema changes
   b. Creating/modifying tRPC router endpoints
   c. Writing vitest tests that pass
   d. Running: cd saleor-apps/apps/pos && npx vitest run --reporter=verbose
5. Follow existing patterns in the POS codebase (tRPC routers, Decimal.js for money, audit events).
6. Do NOT modify the main trpc-router.ts unless adding a new router module.
7. Do NOT run prisma migrate — only edit the schema file.

IMPORTANT FILES:
- POS routers: saleor-apps/apps/pos/src/modules/*/
- Prisma schema: saleor-apps/apps/inventory-ops/prisma/schema.prisma
- Test setup: saleor-apps/apps/pos/src/__tests__/setup.units.ts
- Requirements: ${REQ_DOC}
- Test specs: ${TEST_FILE}"

# =============================================================================
# Phase 1: Foundation (Sequential — must complete before Phase 2)
# =============================================================================

run_phase_1() {
  log "${BLUE}═══ PHASE 1: Foundation (Staff & Permissions) ═══${NC}"

  local prompt="${COMMON_PROMPT}

YOUR DOMAIN: Staff & Permissions (features 10.2, 10.3, 10.4, 10.5, 10.6)

IMPLEMENT IN ORDER:
1. PosAppSettings model — centralized settings (used by many features across domains)
2. StaffPin model + PIN/badge auth endpoints (10.3) — P0, foundation for overrides
3. Manager override mechanism (10.4) — used by discount auth, returns, margin floor
4. Role-based permission middleware (10.2) — wraps protectedClientProcedure
5. Transaction attribution: cashierId/cashierName on PosTransaction (10.5)
6. Employee activity log query endpoint (10.6) — queries PosAuditEvent by user

The PosAppSettings model is critical — other domains depend on it for:
- discountThresholdPercent/Amount (Cart domain)
- negativeStockAllowed (Inventory domain)
- marginFloorPercent (Pricing domain)
- blindCloseEnabled (Cash Management domain)

Create it with ALL fields from the requirements doc, not just Staff fields."

  if $DRY_RUN; then
    log "[DRY RUN] Phase 1: Staff & Permissions"
    return 0
  fi

  local branch="feature/pos-staff-permissions"
  local worktree_path="${WORKTREE_BASE}/staff-permissions"
  local log_file="${LOG_DIR}/${TIMESTAMP}-phase1-staff.log"

  # Create branch + worktree
  if ! git rev-parse --verify "${branch}" >/dev/null 2>&1; then
    git branch "${branch}" HEAD
  fi
  if [[ -d "${worktree_path}" ]]; then
    git worktree remove "${worktree_path}" --force 2>/dev/null || true
  fi
  git worktree add "${worktree_path}" "${branch}"

  cd "${worktree_path}"
  unset CLAUDECODE
  claude -p "${prompt}" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    2>&1 | tee "${log_file}"

  # Commit
  if [[ -n "$(git status --porcelain)" ]]; then
    git add -A
    git commit -m "feat(pos): implement staff & permissions domain (10.2-10.6)

- PosAppSettings centralized configuration model
- StaffPin model with bcrypt PIN + badge auth
- Manager override mechanism with single-use tokens
- Role-based permission middleware on tRPC procedures
- Transaction attribution (cashierId/cashierName)
- Employee activity log query endpoint

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
  fi

  cd "${REPO_ROOT}"

  # Merge Phase 1 into integration worktree so Phase 2 workers have access
  merge_to_integration "${branch}"
}

# =============================================================================
# Phase 2: Independent Domains (Parallel)
# =============================================================================

run_phase_2() {
  log "${BLUE}═══ PHASE 2: Independent Domains (Parallel — 6 workers) ═══${NC}"

  # Worker definitions: name|branch
  local workers=(
    "customers-tax|feature/pos-customers-tax"
    "inventory|feature/pos-inventory"
    "pricing|feature/pos-pricing"
    "hardware-receipts|feature/pos-hardware-receipts"
    "buylist-cash|feature/pos-buylist-cash"
    "product-catalog|feature/pos-product-catalog"
  )

  # --- Step 1: Create ALL worktrees sequentially (fast git ops, no contention) ---
  log "Preparing ${#workers[@]} worktrees..."
  for entry in "${workers[@]}"; do
    local name="${entry%%|*}"
    local branch="${entry##*|}"
    prepare_worktree "${name}" "${branch}"
  done
  ok "All ${#workers[@]} worktrees ready"

  if $DRY_RUN; then
    return 0
  fi

  # --- Step 2: Launch ALL workers in parallel ---
  PID_FILE="${LOG_DIR}/${TIMESTAMP}-phase2.pids"
  > "${PID_FILE}"

  launch_worker "customers-tax" "feature/pos-customers-tax" "${COMMON_PROMPT}

YOUR DOMAIN: Customers (7.5, 7.8, 7.9, 7.11, 7.12) + Tax (6.3)

IMPLEMENT:
1. CustomerGroup model + CRUD endpoints (7.5)
2. Customer merge with credit balance transfer (7.8) + CustomerMergeLog
3. Store credit add-credit endpoint — ADJUSTMENT type (7.9)
4. Tax-exempt flag — wire existing isTaxExempt/taxExemptReason fields on PosTransaction (6.3/7.11)
   - Modify recalculateTransactionTotals to check isTaxExempt
   - Read tax_exempt from customer metadata on attachToTransaction
5. Customer notes update endpoint (7.12)

NOTE: PosTransaction already has isTaxExempt, taxExemptReason, taxExemptCertId fields.
The recalculateTransactionTotals function just needs to check isTaxExempt and use 0% tax rate."
  launch_worker "inventory" "feature/pos-inventory" "${COMMON_PROMPT}

YOUR DOMAIN: Inventory (4.3, 4.4, 4.5, 4.7, 4.8, 4.9, 4.10, 4.14)

IMPLEMENT:
1. StockReservation model + TTL-based reservation on addLine (4.3)
2. Negative stock prevention check on addLine/updateLine (4.4) — uses PosAppSettings.negativeStockAllowed
3. ReorderPoint + ReorderAlert models + CRUD + alert generation on sale (4.5)
4. InventoryCount + InventoryCountEntry models (4.7, 4.8)
   - Full count (FULL type) with freeze/unfreeze
   - Cycle count (CYCLE type) with category/product filters
5. Scanner-assisted count: barcode → variant resolution using lookupProduct (4.9)
6. Count variance report endpoint with WAC dollar impact (4.10)
7. Inventory movement log: unified query over CostLayerEvent + StockAdjustmentLine (4.14)

NOTE: inventory-ops already has StockAdjustment with COUNT_CORRECTION reason and CostLayerEvent.
Post-count should create stock adjustments via the existing pattern."
  launch_worker "pricing" "feature/pos-pricing" "${COMMON_PROMPT}

YOUR DOMAIN: Pricing & Costing (5.11, 5.12, 5.14, 5.15)

IMPLEMENT:
1. Margin floor enforcement on addLine/updateLine (5.11)
   - Query WacSnapshot for unit cost
   - Calculate margin: (price - WAC) / price * 100
   - Warn if below PosAppSettings.marginFloorPercent
   - Manager override allows below-floor sale
2. PriceChangeAlert model + generation after price sync (5.12)
   - Configurable threshold (default 20%)
   - Acknowledge/dismiss endpoints
3. Price history query from SellPriceSnapshot + CostLayerEvent (5.14)
   - Date range filter, daily aggregation
4. Competitive price comparison from SellPriceSnapshot (5.15)
   - Our price vs market low/median/high
   - Position indicator

NOTE: WacSnapshot and SellPriceSnapshot already exist in the schema.
lookupWacByVariant() exists in price-sync-router.ts but is private — replicate the query pattern."
  launch_worker "hardware-receipts" "feature/pos-hardware-receipts" "${COMMON_PROMPT}

YOUR DOMAIN: Hardware & Receipts (11.4, 11.5, 11.9, 11.11)

IMPLEMENT:
1. Email receipt endpoint (11.4) — generate receipt HTML, send via email
2. Custom receipt template (11.5)
   - Add store config to PosAppSettings (storeName, storeAddress, storePhone, etc.)
   - Replace hardcoded store info in receipts-router.ts getReceiptData/getReceiptHtml
   - Template preview endpoint
3. Customer-facing display endpoint (11.9)
   - Real-time cart state endpoint for secondary display
   - Payment status during checkout
4. Multi-register sync (11.11)
   - Modify register-router.ts open: allow multiple OPEN sessions (one per registerCode)
   - Scope transactions to their register session
   - Z-report per register or consolidated

NOTE: receipts-router.ts has hardcoded store info with TODO comments — replace with PosAppSettings lookup."
  launch_worker "buylist-cash" "feature/pos-buylist-cash" "${COMMON_PROMPT}

YOUR DOMAIN: Buylist (8.10, 8.11) + Cash Management (9.6)

IMPLEMENT:
1. Buylist receipt generation (8.10)
   - getBuylistReceiptData and getBuylistReceiptHtml endpoints on receipts-router
   - Format: customer, items with buy prices, payout method, total, barcode
2. Buylist price preview (8.11)
   - previewBuyPrice endpoint: call buylist pricing rule engine for variants
   - Show per-item price with condition multiplier breakdown
   - Read-only, no records created
3. Blind close (9.6)
   - PosAppSettings.blindCloseEnabled
   - cashSummary hides expected cash when enabled
   - Variance still calculated and revealed after close

NOTE: Buylist modules are now in saleor-apps/apps/inventory-ops/src/modules/buylist/
The pricing rule engine is in inventory-ops/src/modules/buylist/pricing/rule-engine/rule-stacker.ts"
  launch_worker "product-catalog" "feature/pos-product-catalog" "${COMMON_PROMPT}

YOUR DOMAIN: Product Catalog (3.3 — Service / Non-Inventory Item)

IMPLEMENT:
1. Service item detection: addLine checks variant trackInventory field from Saleor (3.3)
   - Add isServiceItem flag on PosTransactionLine
   - Skip stock validation for service items
   - Skip COGS event creation for service items on completion
2. Custom amount entry: addCustomItem endpoint (3.3)
   - Accepts description + price, no variantId required
   - Creates line with isServiceItem=true
3. Ensure mixed carts (service + inventory) process correctly

This is a small domain — should complete quickly."

  # --- Step 3: Wait for all workers ---
  wait_and_commit_workers

  # Merge all Phase 2 branches into integration worktree
  for branch in feature/pos-customers-tax feature/pos-inventory feature/pos-pricing \
                 feature/pos-hardware-receipts feature/pos-buylist-cash feature/pos-product-catalog; do
    merge_to_integration "${branch}"
  done
}

# =============================================================================
# Phase 3: Dependent Domains (Sequential — needs Staff + others)
# =============================================================================

run_phase_3() {
  log "${BLUE}═══ PHASE 3: Cart & Checkout + Payments ═══${NC}"

  # --- Step 1: Create worktrees ---
  prepare_worktree "cart-checkout" "feature/pos-cart-checkout"
  prepare_worktree "payments" "feature/pos-payments"

  if $DRY_RUN; then
    return 0
  fi

  # --- Step 2: Launch workers in parallel ---
  PID_FILE="${LOG_DIR}/${TIMESTAMP}-phase3.pids"
  > "${PID_FILE}"

  launch_worker "cart-checkout" "feature/pos-cart-checkout" "${COMMON_PROMPT}

YOUR DOMAIN: Cart & Checkout (1.5, 1.6, 1.7, 1.10, 1.14, 1.15, 1.16, 1.17, 1.20)

IMPLEMENT IN ORDER:
1. Cart notes: add notes field to PosTransaction + updateNotes endpoint (1.10)
2. Return reason codes: ReturnReasonCode model + validation on createReturn (1.15)
3. Discount authorization: threshold check on addLine/applyDiscount, manager PIN override (1.5)
4. Coupon/promo code: applyVoucher endpoint, Saleor voucher validation (1.6)
5. Automated discount rules: promotion evaluation service (1.7)
6. Return without reference: createUnreferencedReturn endpoint (1.14)
7. Deposit / partial payment: DEPOSIT_HELD status, recordDeposit endpoint (1.17)
8. Customer order (special order): isSpecialOrder flag, uses deposit mechanism (1.20)
9. Exchange: createExchange endpoint combining return + sale with net payment (1.16)

DEPENDENCIES AVAILABLE: PosAppSettings, StaffPin, ManagerOverride (from Phase 1)"
  launch_worker "payments" "feature/pos-payments" "${COMMON_PROMPT}

YOUR DOMAIN: Payments (2.5, 2.8)

IMPLEMENT:
1. Gift card integration (2.5)
   - checkGiftCardBalance query: call Saleor giftCards API
   - Modify recordPayment GIFT_CARD path: validate and deduct via Saleor giftCardUpdate
   - Partial balance handling (split tender)
   - Gift card refund: re-credit via Saleor API
2. Card refund via Square Terminal (2.8)
   - Add CARD to recordRefund method types
   - Look up original payment's externalPaymentId (Square payment ID)
   - Call Square CreatePaymentRefund API
   - Add squareRefundId field to PosPayment
   - Fallback to store credit if Square API fails

NOTE: Square client is at saleor-apps/apps/pos/src/modules/square/square-client.ts"

  # --- Step 3: Wait ---
  wait_and_commit_workers

  for branch in feature/pos-cart-checkout feature/pos-payments; do
    merge_to_integration "${branch}"
  done
}

# =============================================================================
# Phase 4: Reporting + Architecture (Depends on Inventory + Pricing)
# =============================================================================

run_phase_4() {
  log "${BLUE}═══ PHASE 4: Reporting + Architecture ═══${NC}"

  # --- Step 1: Create worktrees ---
  prepare_worktree "reporting" "feature/pos-reporting"
  prepare_worktree "architecture" "feature/pos-architecture"

  if $DRY_RUN; then
    return 0
  fi

  # --- Step 2: Launch workers in parallel ---
  PID_FILE="${LOG_DIR}/${TIMESTAMP}-phase4.pids"
  > "${PID_FILE}"

  launch_worker "reporting" "feature/pos-reporting" "${COMMON_PROMPT}

YOUR DOMAIN: Reporting Suite (4.13, 5.13, 12.14)

IMPLEMENT:
1. Shrinkage tracking (4.13/12.14)
   - Aggregate shrinkage from StockAdjustment with SHRINKAGE/DAMAGE reasons
   - Include dollar impact from CostLayerEvent
   - Period-based reporting (daily/weekly/monthly)
   - Breakdown by category
2. Volatile price detection (5.13)
   - Calculate price volatility (stddev of SellPriceSnapshot changes over 7/30 days)
   - Flag variants above configurable threshold
   - Dashboard query for volatile items

NOTE: StockAdjustment and CostLayerEvent already exist with all needed data."
  launch_worker "architecture" "feature/pos-architecture" "${COMMON_PROMPT}

YOUR DOMAIN: Architecture (13.10, 13.11)

IMPLEMENT:
1. Performance load test script (13.10)
   - Script that simulates 10 concurrent register sessions
   - Each runs: create transaction → add 5 lines → pay → complete
   - Measure P95 response times
   - Verify no data corruption (idempotency check)
2. QuickBooks accounting integration scaffold (13.11)
   - AccountingIntegration model with OAuth tokens
   - OAuth flow endpoints (authorize, callback)
   - Daily journal entry generation logic (sales, COGS, tax, discounts)
   - Chart of accounts mapping configuration"

  # --- Step 3: Wait ---
  wait_and_commit_workers

  for branch in feature/pos-reporting feature/pos-architecture; do
    merge_to_integration "${branch}"
  done
}

# =============================================================================
# Push + PR
# =============================================================================

push_and_pr() {
  log "Pushing ${INTEGRATION_BRANCH} to origin..."
  cd "${INTEGRATION_WORKTREE}"
  git push -u origin "${INTEGRATION_BRANCH}" || {
    err "Push failed — resolve manually"
    return 1
  }
  ok "Pushed ${INTEGRATION_BRANCH}"

  # Create PR if gh is available and no PR exists yet
  if command -v gh >/dev/null 2>&1; then
    local existing_pr
    existing_pr="$(gh pr list --head "${INTEGRATION_BRANCH}" --state open --json number --jq '.[0].number' 2>/dev/null || true)"
    if [[ -n "${existing_pr}" ]]; then
      ok "PR #${existing_pr} already exists for ${INTEGRATION_BRANCH}"
    else
      log "Generating PR description from build results..."
      local diff_stat commit_log pr_body
      diff_stat="$(git diff --stat "${BASE_BRANCH}...${INTEGRATION_BRANCH}" 2>/dev/null)"
      commit_log="$(git log --oneline "${BASE_BRANCH}..${INTEGRATION_BRANCH}" 2>/dev/null)"

      pr_body="$(unset CLAUDECODE; claude -p "You are writing a GitHub pull request description.

Context: This is an autonomous parallel POS build for a hobby gaming commerce platform (MTG secondary market).
The build script ran claude -p workers across 4 phases to implement POS features.
The integration branch is ${INTEGRATION_BRANCH}, merging into ${BASE_BRANCH}.

Here are the commits on this branch:
${commit_log}

Here is the diff stat:
${diff_stat}

Here are the build logs:
$(cat "${LOG_DIR}"/*.log 2>/dev/null)

Write a thorough PR description in this format:
## Summary
Brief overview of what was built and why.

## Features by Domain
For each domain that has actual commits/changes, list the features implemented with their feature IDs.
Only include domains that actually have work — do not list planned/future work.

## Schema Changes
List any Prisma model additions or modifications.

## Test Coverage
Summarize test files added and assertion counts from the logs.

## Architecture Notes
Describe the build approach (parallel workers, phased dependencies) and any notable technical decisions.

## Test Plan
- Checklist of verification steps

🤖 Generated with [Claude Code](https://claude.com/claude-code)" 2>/dev/null)"

      if [[ -z "${pr_body}" ]]; then
        warn "PR description generation failed — using fallback"
        pr_body="Autonomous parallel POS build. See commit log for details.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
      fi

      log "Creating pull request..."
      gh pr create \
        --base "${BASE_BRANCH}" \
        --head "${INTEGRATION_BRANCH}" \
        --title "feat(pos): POS build — 45 features across 13 domains" \
        --body "${pr_body}" || warn "PR creation failed — create manually"
      ok "Pull request created"
    fi
  else
    warn "gh CLI not found — create PR manually at https://github.com"
  fi
}

# =============================================================================
# Cleanup
# =============================================================================

cleanup() {
  if $DRY_RUN; then
    log "[DRY RUN] Would clean up worktrees"
    return 0
  fi
  log "Cleaning up worktrees..."
  cd "${REPO_ROOT}"
  for wt in "${WORKTREE_BASE}"/*/; do
    if [[ -d "$wt" ]]; then
      git worktree remove "$wt" --force 2>/dev/null || true
    fi
  done
  ok "Worktrees cleaned up"
  ok "Logs available at: ${LOG_DIR}/"
}

# =============================================================================
# Main
# =============================================================================

main() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║   POS BUILD — Autonomous Parallel Execution            ║${NC}"
  echo -e "${BLUE}║   45 features · 13 domains · 4 phases                  ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""

  setup

  # When resuming, merge prior phase branches so workers have the foundation code
  if [[ -n "${RESUME_FROM}" ]]; then
    merge_prior_phases "${RESUME_FROM}"
  fi

  # --resume-from N runs phases N through 4; --phase N runs only phase N
  local run_from="${RESUME_FROM:-1}"

  if [[ -z "${PHASE_FILTER}" ]] || [[ "${PHASE_FILTER}" == "1" && "${run_from}" -le 1 ]]; then
    run_phase_1
  fi

  if [[ -z "${PHASE_FILTER}" ]] || [[ "${PHASE_FILTER}" == "2" ]] || [[ -n "${RESUME_FROM}" && "${run_from}" -le 2 ]]; then
    run_phase_2
  fi

  if [[ -z "${PHASE_FILTER}" ]] || [[ "${PHASE_FILTER}" == "3" ]] || [[ -n "${RESUME_FROM}" && "${run_from}" -le 3 ]]; then
    run_phase_3
  fi

  if [[ -z "${PHASE_FILTER}" ]] || [[ "${PHASE_FILTER}" == "4" ]] || [[ -n "${RESUME_FROM}" && "${run_from}" -le 4 ]]; then
    run_phase_4
  fi

  cleanup

  if ! $DRY_RUN; then
    push_and_pr
  fi

  echo ""
  ok "═══ ALL PHASES COMPLETE ═══"
  echo ""
  echo "Next steps:"
  echo "  1. Review logs:  ls ${LOG_DIR}/"
  echo "  2. Run tests:    cd saleor-apps/apps/pos && npx vitest run"
  echo "  3. Run migration: npx prisma migrate dev (in inventory-ops)"
  echo ""
}

main
