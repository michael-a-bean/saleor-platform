# MCP & Tooling Intake Report

**Generated**: 2026-01-10T13:30:00-08:00 (revised 13:35)
**Purpose**: Assess current environment and recommend minimal MCP set for governed delivery workflow
**Target Workflow**: local → staging → production with blocking /localreview gate and multi-model reviews

---

## A. Environment Summary

### Operating System & Shell
| Property | Value |
|----------|-------|
| OS | Ubuntu 22.04.5 LTS (WSL2 on Windows) |
| Kernel | 6.6.87.2-microsoft-standard-WSL2 |
| Shell | bash |
| Hostname | mb-home-1 |

### Runtimes Installed
| Runtime | Version | Status |
|---------|---------|--------|
| Bun | 1.3.5 | Primary runtime (preferred per CLAUDE.md) |
| Python | 3.10.12 | Available |
| Node.js | Not installed | Uses Bun instead |
| PNPM | Not installed | Uses Bun instead |

### Key Validation Tools
| Tool | Status | Notes |
|------|--------|-------|
| Git | 2.34.1 | Working |
| Docker | 29.1.2 | Working (Docker Desktop WSL integration) |
| Docker Compose | v2.40.3 | Working |
| Make | 4.3 | Working |
| gitleaks | **NOT INSTALLED** | Secrets detection tool |
| trivy | **NOT INSTALLED** | Vulnerability scanner |
| hadolint | **NOT INSTALLED** | Dockerfile linter |
| shellcheck | **NOT INSTALLED** | Shell script linter |
| gh (GitHub CLI) | **NOT INSTALLED** | GitHub operations |

### AI/LLM SDKs
| SDK | Version | Status |
|-----|---------|--------|
| openai | 2.15.0 | Installed |
| google-generativeai | 0.8.6 | Installed |

### Claude Code Configuration
| Property | Value |
|----------|-------|
| Installation | `/home/michael/.local/bin/claude` |
| PAI Directory | `/home/michael/.claude` |
| Repository | `/home/michael/saleor-platform` |
| Current Branch | `platform/main` |

### PAI Infrastructure
PAI (Personal AI) is active with:
- Session hooks for initialization and context loading
- Security validator on Bash commands (blocks certain operations)
- Observability hooks for event capture
- CORE skill auto-loads at session start
- Environment variables configured in `~/.claude/settings.json`

---

## B. Current MCP Inventory (as-is)

### MCP Servers Configured

| Name | Type | Endpoint/Command | Config Location | Status |
|------|------|------------------|-----------------|--------|
| `github` | HTTP | `https://api.githubcopilot.com/mcp/` | `.mcp.json` | Requires `GITHUB_PERSONAL_ACCESS_TOKEN` |
| `saleor-graphql` | Docker (stdio) | `docker run ... npx mcp-graphql` | `.mcp.json` | Ready (requires API container running) |
| `saleor-mcp` | HTTP | `http://localhost:6000/mcp` | `.mcp.json` | Requires running server + auth token |

### IDE-Specific MCP Configs
- `saleor-apps/.cursor/mcp.json` - Cursor IDE GraphQL MCP
- `saleor-apps/.vscode/mcp.json` - VS Code GraphQL MCP

### Enabled Plugins
| Plugin | Source | Purpose |
|--------|--------|---------|
| `local-review` | agent37-skills | Local code review skill |
| `pr-review-toolkit` | claude-plugins-official | PR review agents |

### Permission Model
- Claude Code has filesystem access within repository boundary
- PAI security hooks block access to `~/.claude` via Bash
- Read tool can access any file directly
- Write/Edit tools work within repository

### Gaps & Risks
| Gap | Risk Level | Impact |
|-----|------------|--------|
| No gitleaks/trivy | MEDIUM | Security scanning degrades to pattern matching only |
| saleor-mcp requires running server | LOW | Limited to when server is running |
| GitHub MCP requires PAT | LOW | GitHub operations require token setup |
| gh CLI not installed | LOW | Cannot automate GitHub PR operations from CLI |

---

## C. /localreview Status

### Invocation Methods
```bash
# Via Makefile (recommended)
make localreview

# Direct script execution
./scripts/localreview.sh

# Via skill system
/local-review
```

### Configuration
| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_REF` | `origin/platform/main` | Git ref to diff against |
| `SCOPE` | `auto` | What to check: auto, staged, all |
| `FAIL_ON` | `HIGH` | Minimum severity to fail |
| `OUTPUT_PATH` | `docs/ai-reviews/localreview.md` | Report output path |

### Report Output
- **Location**: `docs/ai-reviews/localreview.md`
- **Format**: Markdown with findings table, diff stats, scanner results
- **Exit Codes**: 0 (pass), 1 (fail), 2 (error)

### Blocking Behavior
- **Currently blocking on**: HIGH severity and above
- **Can be configured**: `FAIL_ON=MEDIUM make localreview`

### Known False Positives/Negatives
| Issue | Type | Notes |
|-------|------|-------|
| Pattern matching for secrets | False positives | May flag base64 strings that aren't secrets |
| No gitleaks installed | False negatives | Misses secrets that don't match simple patterns |

### Validation Evidence
```
==========================================
LOCAL REVIEW COMPLETE
==========================================
Files checked: 17
Findings: 7
Report: docs/ai-reviews/localreview.md

RESULT: FAILED (findings >= HIGH)
```

---

## D. Required Capability Matrix

| Requirement | Present? | How Satisfied | What to Install/Configure | Risk Notes |
|-------------|----------|---------------|---------------------------|------------|
| **Filesystem access (repo-scoped)** | YES | Claude Code Read/Write/Edit tools | None needed | Already repo-bounded |
| **Git operations** | YES | Bash + git 2.34.1 | None needed | Working |
| **Safe shell execution** | YES | Bash tool with PAI security hooks | None needed | Hooks provide guardrails |
| **CI workflow parsing** | PARTIAL | Can read `.github/workflows/*.yml` | Consider `gh` CLI for richer API | Manual parsing only |
| **Docker/Compose understanding** | YES | Docker 29.1.2 + Compose v2.40.3 | None needed | Working |
| **Secrets scanning (advisory)** | PARTIAL | localreview.sh pattern matching | Install `gitleaks` | Pattern matching only |
| **Multi-model review (GPT/Gemini)** | YES | `tools/delivery/review_phase.py` | API keys already configured | SDKs installed |
| **GitHub API operations** | NO | No gh CLI installed | `sudo apt install gh` | Cannot create PRs from CLI |

---

## E. Proposed Minimal MCP Set (Recommended)

### Install Now (Phase 0-1)
| MCP/Tool | Purpose | Install Method | Priority |
|----------|---------|----------------|----------|
| **gitleaks** | Secrets detection | `brew install gitleaks` or download binary | HIGH |
| **gh CLI** | GitHub operations | `sudo apt install gh` or via brew | MEDIUM |

### Already Working (Keep)
| MCP/Tool | Purpose | Notes |
|----------|---------|-------|
| Claude Code built-in tools | Filesystem, git, bash | Core functionality |
| Docker + Compose | Container operations | 29.1.2 + v2.40.3 |
| saleor-graphql MCP | GraphQL introspection | Ready when API running |
| PAI hooks | Security, observability | Already configured |
| local-review plugin | Code review skill | Working |
| pr-review-toolkit plugin | PR review agents | Working |
| Python AI SDKs | Multi-model reviews | openai, google-generativeai installed |

### Explicitly Deferred
| MCP/Tool | Reason for Deferral |
|----------|---------------------|
| trivy | Can use CI-only scanning (Phase 2) |
| hadolint | Low priority; Dockerfile changes infrequent |
| shellcheck | Low priority; shell scripts are stable |
| Cloud provisioning MCPs | Not selected; no cloud provider chosen |
| Observability MCPs | Phase 3 scope |

### MCPs NOT Recommended
| MCP | Reason |
|-----|--------|
| Broad filesystem MCPs | Already have bounded access via Claude Code |
| Network/HTTP MCPs | WebFetch tool sufficient; security risk |
| Database MCPs | Use existing saleor-database skill instead |

---

## F. Exact Commands / Config Changes

### 1. Install gitleaks

```bash
# Option A: Download binary (no brew)
GITLEAKS_VERSION=8.24.0
curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz | tar -xz
sudo mv gitleaks /usr/local/bin/

# Option B: Via Homebrew (if installed)
brew install gitleaks

# Verify
gitleaks version
```

### 2. Install GitHub CLI

```bash
# Via apt
type -p curl >/dev/null || sudo apt install curl -y
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh -y

# Authenticate
gh auth login

# Verify
gh --version
```

### 3. Configure GitHub PAT for MCP

The `.mcp.json` already references `${GITHUB_PERSONAL_ACCESS_TOKEN}`. Set it:

```bash
# Add to ~/.bashrc or ~/.claude/.env
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"
```

Required scopes: `repo`, `read:org`, `workflow`

### 4. No Config File Changes Made

I did not modify any configuration files during this inspection. All proposed changes are documented above for manual execution.

---

## G. Validation Evidence

### Filesystem (Read/Write/Delete)
```
# MCP Test File
Created at: validation test
This file can be deleted.
✓ Filesystem write/read/delete test passed
```

### Git Operations
```
$ git log --oneline -5
f88a3b4 fix(delivery): update review script to use GPT-5.2 and Gemini 3
0382b00 feat(ci): expand CI quality gates with security scanning
dfd926a feat(delivery): establish Phase 0 delivery foundation
1fc6c10 feat: add localreview skill for deterministic pre-commit review gate
b921e8a docs: add delivery intake report for CI/CD planning
```

### Local Review Execution
```
[INFO] Starting local review...
[INFO] Base ref: HEAD~5
[INFO] Scope: auto
[INFO] Fail threshold: HIGH
[INFO] Checking 17 changed files...
[INFO] Report written to: docs/ai-reviews/localreview.md
RESULT: FAILED (findings >= HIGH)
```

### Docker Verification
```
Docker version 29.1.2, build 890dcca
Docker Compose version v2.40.3-desktop.1
```
Docker compose services available: api, dashboard, db, cache, and more.

### AI SDK Verification
```
openai 2.15.0
google-generativeai 0.8.6
```

### CI Workflow Parsing
Successfully read `.github/workflows/test-platform.yml`:
- 8 jobs identified: verify_backend, verify_storefront, verify_apps, validate_migrations, security_scan, verify_builds, container_scan, validate_compose
- Uses gitleaks-action and trivy-action for scanning

---

## H. Open Questions

| Question | Context | Needed For |
|----------|---------|------------|
| **Cloud provider selection?** | No cloud MCPs currently configured | Phase 2-3 deployment automation |
| **GitHub PAT scope?** | MCP configured but token not verified | GitHub MCP activation |
| **Staging environment details?** | Not yet defined | Phase 1 staging deployment |
| **Production environment details?** | Not yet defined | Phase 2-3 production deployment |

---

## Summary for ChatGPT Handoff

**Use this report to:**
1. Validate the environment matches what I've discovered
2. Recommend any additional MCPs I may have missed
3. Help prioritize the installation order
4. Suggest configuration for staging/production phases

**Key Facts:**
- WSL2 Ubuntu 22.04, Bun 1.3.5 primary runtime
- Docker 29.1.2 + Compose v2.40.3 WORKING
- gitleaks/trivy NOT installed (security gap - pattern matching fallback)
- /localreview WORKING and blocking on HIGH
- Multi-model review scripts READY (APIs configured)
- PAI infrastructure ACTIVE with security hooks
- saleor-graphql MCP READY (when API container running)

**Minimal Install List:**
1. gitleaks binary (HIGH) - enhances secret detection
2. gh CLI + authentication (MEDIUM) - enables PR automation

---

*Generated by Claude Code environment inspection*
