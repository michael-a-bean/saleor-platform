# Full Repository Analysis Prompt

**Purpose:** Comprehensive examination of repository state, recent work, and system health using parallel specialist agents.

---

## Execution Instructions

Launch ALL agents in parallel using the Task tool. Each agent has a specific focus area and returns structured findings. Synthesize results into a unified status report.

---

## Agent Assignments

### Agent 1: Git Historian
**subagent_type:** `Explore`
**Focus:** Git history, branches, and commit patterns

```
Analyze the git state of this repository:

1. BRANCH ANALYSIS
   - List all branches (local and remote) with last commit date
   - Identify stale branches (no commits > 30 days)
   - Check for unmerged feature branches
   - Verify main vs platform/main divergence

2. RECENT COMMITS (last 2 weeks)
   - Group commits by author
   - Categorize by type (feat/fix/chore/docs/ci)
   - Identify large commits (>500 lines changed)
   - Flag any commits touching sensitive files (.env, credentials, keys)

3. MERGE/REBASE STATE
   - Any merge conflicts pending?
   - Rebase status on feature branches
   - Cherry-pick history

4. TAGS AND RELEASES
   - Latest tags
   - Unreleased commits since last tag

Output as structured markdown with tables.
```

### Agent 2: Submodule Inspector
**subagent_type:** `Explore`
**Focus:** Submodule state and synchronization

```
Examine all git submodules in this repository:

1. SUBMODULE STATUS
   - Run: git submodule status --recursive
   - Check for dirty submodules (uncommitted changes)
   - Check for detached HEAD states
   - Verify submodule URLs are accessible

2. SYNC STATE
   - Compare submodule commits vs remote HEAD
   - Identify submodules behind upstream
   - Check for unpushed commits in submodules

3. DEPENDENCY ANALYSIS
   - Which apps/services depend on each submodule?
   - Are there version mismatches?

4. SALEOR-APPS DEEP DIVE
   - Current commit hash and branch
   - Recent changes in custom apps (inventory-ops, buylist, pos)
   - Any pending migrations?

Output findings with specific commit hashes and actionable recommendations.
```

### Agent 3: Infrastructure Auditor
**subagent_type:** `Explore`
**Focus:** Docker, Terraform, and deployment state

```
Audit infrastructure configuration:

1. DOCKER STATE
   - Parse docker-compose.yml for all services
   - Check for version pinning (images should be pinned)
   - Identify any :latest tags (risky)
   - Volume mounts and their purposes

2. TERRAFORM STATE
   - List all .tf files and their purposes
   - Check terraform.tfstate status (if accessible)
   - Identify resources by environment (staging/prod)
   - Any drift between config and state?

3. CI/CD PIPELINES
   - Parse .github/workflows/*.yml
   - List all workflow triggers and their purposes
   - Identify failing or disabled workflows
   - Check for hardcoded secrets (should use GitHub secrets)

4. ENVIRONMENT CONFIGURATION
   - List all .env.example files
   - Check for missing required vars
   - Identify environment-specific configs

Output as infrastructure health report with risk levels (LOW/MEDIUM/HIGH/CRITICAL).
```

### Agent 4: Code Health Analyst
**subagent_type:** `Explore`
**Focus:** Code quality, dependencies, and technical debt

```
Analyze code health across the monorepo:

1. DEPENDENCY AUDIT
   - Check package.json files for outdated deps
   - Identify security vulnerabilities (if lockfile audit available)
   - Look for duplicate dependencies across workspaces
   - Check for peer dependency warnings

2. TYPE SAFETY
   - Any TypeScript errors? (check tsconfig strictness)
   - Files with @ts-ignore or @ts-expect-error
   - Any 'any' type usage in critical paths

3. TEST COVERAGE
   - Locate test files and their patterns
   - Identify untested modules
   - Check for skipped tests (.skip, .only)

4. TECHNICAL DEBT MARKERS
   - Search for TODO, FIXME, HACK, XXX comments
   - Count and categorize by urgency
   - Identify oldest debt (by git blame)

5. DEAD CODE
   - Unused exports
   - Orphaned files not imported anywhere

Output as code health scorecard with specific file locations.
```

### Agent 5: Documentation Reviewer
**subagent_type:** `Explore`
**Focus:** Documentation completeness and accuracy

```
Review documentation state:

1. README FILES
   - List all README.md files
   - Check for outdated instructions
   - Verify linked resources exist

2. ARCHITECTURE DOCS
   - Locate ADRs (Architecture Decision Records)
   - Check docs/reference/ for completeness
   - Identify undocumented systems

3. API DOCUMENTATION
   - GraphQL schema documentation
   - REST endpoint documentation (if any)
   - Webhook payload documentation

4. RUNBOOKS AND PROCEDURES
   - Deployment runbooks exist?
   - Incident response procedures?
   - On-call documentation?

5. STALENESS CHECK
   - Docs modified > 90 days ago
   - Docs referencing deprecated features
   - Broken internal links

Output as documentation coverage report with gaps highlighted.
```

### Agent 6: Security Scanner
**subagent_type:** `Explore`
**Focus:** Security posture and sensitive data

```
Perform security-focused analysis:

1. SECRETS DETECTION
   - Scan for hardcoded API keys, tokens, passwords
   - Check .gitignore covers sensitive patterns
   - Verify .env files are not committed

2. DEPENDENCY VULNERABILITIES
   - Check for known CVEs in dependencies
   - Identify packages with security advisories

3. CONFIGURATION SECURITY
   - CORS settings
   - Authentication configuration
   - Rate limiting setup

4. ACCESS CONTROL
   - Review permission models
   - Check for overly permissive settings
   - Webhook signature validation

5. SENSITIVE FILE AUDIT
   - Private keys
   - Certificates
   - Database credentials

Output as security assessment with severity ratings and remediation steps.
DO NOT output actual secrets - only indicate their presence and location.
```

---

## Synthesis Instructions

After all agents complete, synthesize findings into:

```markdown
# Repository State Report
**Generated:** [timestamp]
**Repository:** saleor-platform
**Branch:** platform/main

## Executive Summary
[3-5 bullet points of most important findings]

## Health Scores
| Area | Score | Trend |
|------|-------|-------|
| Git State | X/10 | ↑↓→ |
| Infrastructure | X/10 | ↑↓→ |
| Code Quality | X/10 | ↑↓→ |
| Documentation | X/10 | ↑↓→ |
| Security | X/10 | ↑↓→ |

## Critical Issues (Action Required)
1. [Issue with remediation]
2. ...

## Warnings (Review Recommended)
1. [Warning with context]
2. ...

## Recent Activity Summary
- Commits (14d): X
- Active contributors: X
- Features merged: X
- Bugs fixed: X

## Recommendations
1. [Prioritized recommendation]
2. ...
```

---

## Usage

To execute this analysis, run:

```
Analyze this repository using the full-repo-analysis prompt. Launch all 6 specialist agents in parallel, then synthesize their findings into a unified report.
```
