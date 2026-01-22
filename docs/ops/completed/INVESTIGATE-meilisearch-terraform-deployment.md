# Multi-Agent Investigation: Meilisearch & Terraform Deployment

**Version:** 1.0
**Date:** 2026-01-21
**Status:** READY FOR EXECUTION
**Scope:** Meilisearch configuration, Terraform infrastructure, deployment integration

---

## Objective

Spawn a coordinated set of expert agents to investigate the deployment architecture with focus on:
1. Meilisearch service configuration and connectivity
2. Terraform infrastructure definitions
3. Integration points between services
4. Configuration drift or misalignment

---

## Agent Roster

| Agent ID | Domain | Responsibility |
|----------|--------|----------------|
| **INFRA-TF** | Terraform Expert | Module structure, resource definitions, variable handling |
| **MEILI-SVC** | Meilisearch Expert | Index configuration, connectivity, API health |
| **NET-CONN** | Network/Connectivity | Service discovery, DNS, security groups, ALB routing |
| **INT-VALID** | Integration Validator | Cross-service configuration consistency |

---

## Execution Plan

### Phase 1: Parallel Discovery (Run All Simultaneously)

**Agent INFRA-TF: Terraform Infrastructure Analysis**
```
Launch: Task tool with Explore agent
Thoroughness: very thorough

Prompt:
"Investigate the Terraform infrastructure in infra/terraform/:

1. Module Structure Analysis:
   - Map all modules and their dependencies
   - Identify which modules handle Meilisearch (if any)
   - Document ECS task definitions and service configurations

2. Variable Flow:
   - Trace how URLs/endpoints flow through variables.tf → modules → resources
   - Identify any hardcoded values that should be variables
   - Check for environment-specific conditionals

3. Resource Inventory:
   - List all AWS resources being provisioned
   - Identify any missing resources for Meilisearch deployment
   - Check for orphaned or unused resource definitions

4. State Management:
   - Review backend.tf configuration
   - Check imports.tf for imported resources
   - Identify potential state drift indicators

Output format:
- Module dependency graph (text)
- Variable flow diagram (text)
- Resource inventory table
- Issues/gaps identified with severity"
```

**Agent MEILI-SVC: Meilisearch Configuration Analysis**
```
Launch: Task tool with Explore agent + MCP tools
Thoroughness: very thorough

Actions:
1. mcp__saleor-mcp__health_check - Verify Meilisearch is responding
2. mcp__saleor-mcp__list_indexes - Enumerate all indexes
3. mcp__saleor-mcp__get_index_settings channel=<each-channel> - Get settings per index

Codebase Search:
- Grep for MEILISEARCH_URL, MEILISEARCH_HOST, MEILISEARCH_API_KEY
- Find all files that import/use meilisearch clients
- Locate Meilisearch configuration in docker-compose.yml
- Check ECS task definitions for Meilisearch env vars

Document:
- Current Meilisearch deployment method (self-hosted vs cloud)
- Index configuration and document counts
- Connection strings used in each environment (local/staging/prod)
- Authentication/API key handling
- Any sync mechanisms (webhooks, workers, manual)"
```

**Agent NET-CONN: Network & Connectivity Analysis**
```
Launch: Task tool with Explore agent
Thoroughness: medium

Prompt:
"Analyze network connectivity patterns for Meilisearch integration:

1. Service Discovery:
   - How do services find Meilisearch? (DNS, env var, hardcoded)
   - Is Meilisearch internal-only or publicly accessible?
   - Check ALB listener rules for any Meilisearch routing

2. Security Groups (from Terraform):
   - Which security groups allow Meilisearch traffic?
   - What ports are exposed (7700 is default)?
   - Are there any overly permissive rules?

3. Docker Networking:
   - Review docker-compose.yml network configuration
   - Check service names and DNS resolution
   - Compare local networking to ECS networking model

4. TLS/SSL:
   - Is Meilisearch traffic encrypted?
   - Certificate handling if applicable

Files to examine:
- infra/terraform/modules/*/main.tf (security groups)
- infra/terraform/modules/alb/main.tf (listener rules)
- docker-compose.yml (networks section)
- Any nginx/proxy configurations"
```

**Agent INT-VALID: Integration Consistency Validation**
```
Launch: Task tool with Explore agent
Thoroughness: medium

Prompt:
"Validate configuration consistency across environments:

1. Environment Comparison Matrix:
   Create a table comparing these configs across local/staging/prod:
   - MEILISEARCH_URL
   - MEILISEARCH_API_KEY presence
   - NEXT_PUBLIC_* variables referencing search
   - Saleor API search endpoint configuration

2. Code-Infrastructure Alignment:
   - Does code expect Meilisearch features that aren't deployed?
   - Are there feature flags for search functionality?
   - Check for fallback behavior when Meilisearch unavailable

3. Deployment Pipeline:
   - How are Meilisearch indexes populated?
   - Is there a sync mechanism on deploy?
   - Check for any initialization scripts

4. Known Issues Check:
   - Search docs/ops/ for Meilisearch-related issues
   - Check git history for recent Meilisearch changes
   - Look for TODO/FIXME comments related to search"
```

---

### Phase 2: Synthesis & Gap Analysis

After Phase 1 agents complete, execute synthesis:

**Synthesis Agent**
```
Launch: Task tool with Plan agent

Prompt:
"Based on the Phase 1 findings, synthesize a deployment assessment:

1. Architecture Diagram:
   Draw (in ASCII) how Meilisearch connects to:
   - Saleor API
   - Storefront
   - Any sync workers/apps

2. Gap Analysis:
   - What's missing for production-ready Meilisearch?
   - Configuration inconsistencies found
   - Security concerns

3. Risk Assessment:
   - What fails if Meilisearch is down?
   - Data consistency risks
   - Performance bottlenecks

4. Recommendations:
   Prioritized list of actions:
   - P0: Immediate fixes
   - P1: Before production
   - P2: Nice to have"
```

---

## Quick Execution Commands

Copy these to run the investigation:

### Option A: Full Parallel Investigation
```
Run 4 Task agents in parallel with subagent_type=Explore:

1. INFRA-TF agent with terraform investigation prompt
2. MEILI-SVC agent with meilisearch analysis prompt
3. NET-CONN agent with network connectivity prompt
4. INT-VALID agent with integration validation prompt

Then run synthesis agent after all complete.
```

### Option B: Focused Terraform-Only
```
Run single Task agent with subagent_type=Explore, thoroughness=very thorough:
"Deeply investigate infra/terraform/ focusing on:
- All module definitions and their purposes
- How ECS services are configured
- Where Meilisearch would fit in the architecture
- Variable definitions and their flow through modules
- Any gaps for search service deployment"
```

### Option C: Focused Meilisearch-Only
```
First: Run MCP health checks
- mcp__saleor-mcp__health_check
- mcp__saleor-mcp__list_indexes

Then: Run Task agent with subagent_type=Explore:
"Find all Meilisearch configuration in the codebase:
- Environment variables (MEILISEARCH_*)
- Client initialization code
- Index creation/sync logic
- docker-compose service definition
- Any Terraform resources for Meilisearch"
```

---

## Expected Outputs

### Per-Agent Deliverables

| Agent | Output |
|-------|--------|
| INFRA-TF | Module map, variable flow, resource inventory, gaps |
| MEILI-SVC | Index inventory, connection configs, sync mechanisms |
| NET-CONN | Network topology, security group analysis, connectivity matrix |
| INT-VALID | Environment comparison table, consistency issues |

### Synthesized Report Structure

```markdown
# Meilisearch & Terraform Deployment Investigation

## Executive Summary
[3-5 key findings]

## Current Architecture
[ASCII diagram]

## Terraform Analysis
### Module Structure
### Resource Inventory
### Configuration Gaps

## Meilisearch Configuration
### Deployment Method
### Index Status
### Connection Patterns

## Network & Security
### Connectivity Model
### Security Group Rules
### TLS Status

## Integration Points
### Environment Consistency Matrix
| Config | Local | Staging | Production |
|--------|-------|---------|------------|

### Sync Mechanisms

## Issues Found
| Severity | Issue | Location | Impact |
|----------|-------|----------|--------|

## Recommendations
### P0: Immediate
### P1: Before Production
### P2: Future Improvements

## Next Steps
[Actionable items with ownership]
```

---

## Tools Used

| Tool | Purpose |
|------|---------|
| Task (Explore) | Codebase investigation |
| Task (Plan) | Synthesis and recommendations |
| mcp__saleor-mcp__health_check | Meilisearch connectivity |
| mcp__saleor-mcp__list_indexes | Index enumeration |
| mcp__saleor-mcp__get_index_settings | Index configuration |
| Grep | Pattern searching |
| Glob | File discovery |
| Read | Configuration file inspection |

---

## Success Criteria

Investigation is complete when:
- [ ] All 4 Phase 1 agents have reported findings
- [ ] Synthesis report generated with architecture diagram
- [ ] Issues prioritized by severity
- [ ] Clear next steps identified
- [ ] Report saved to docs/ops/diagnostics/[date]-meilisearch-terraform-investigation.md

---

## Execution Notes

1. **Parallelism**: Phase 1 agents are independent - run all 4 simultaneously
2. **MCP Tools First**: Run health_check before deep investigation to establish baseline
3. **Evidence**: Include file paths and line numbers for all findings
4. **Severity Classification**:
   - P0: Deployment broken, security vulnerability
   - P1: Degraded functionality, production blocker
   - P2: Technical debt, optimization opportunity

---

## Related Resources

- `infra/terraform/` - Infrastructure definitions
- `docker-compose.yml` - Local service configuration
- `.claude/skills/saleor-database` - Database query patterns
- `docs/reference/sync-contracts.md` - Data sync documentation
