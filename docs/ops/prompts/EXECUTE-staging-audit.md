# EXECUTE: Staging Production Readiness Audit

**Copy everything below this line and paste as a prompt to Gen:**

---

Execute a comprehensive staging-to-production readiness audit for the Saleor Hobby Gaming platform. Use the methodology defined in `docs/ops/prompts/staging-production-readiness-audit.md`.

## Immediate Actions

Run these 5 parallel workstreams simultaneously using the Task tool:

### Workstream 1: Infrastructure Health
```
subagent_type: Explore
thoroughness: very thorough
prompt: "Analyze infrastructure configuration for production readiness:
1. Read infra/terraform/*.tf files - identify HA gaps, scaling limits
2. Check ECS task definitions for resource allocation
3. Review ALB health check configurations
4. Document environment variable patterns across services
5. Identify single points of failure
Output: Prioritized list of infrastructure risks with file:line references"
```

### Workstream 2: Saleor API Health
```
Execute MCP tools:
- mcp__saleor-mcp__health_check
- mcp__saleor-mcp__channels
- mcp__saleor-mcp__list_indexes
- mcp__saleor-mcp__get_index_stats for each channel
- mcp__saleor-graphql__introspect-schema

Then test critical operations:
- mcp__saleor-mcp__products (first 10, verify pricing data complete)
- mcp__saleor-mcp__orders (recent orders, verify no null fields)
- mcp__saleor-mcp__customers (verify no PII exposure)
```

### Workstream 3: Custom Apps Code Review
```
Launch 5 parallel code-reviewer agents:

Agent 1: subagent_type: pr-review-toolkit:code-reviewer
prompt: "Review saleor-apps/apps/stripe/ for production readiness. Focus on: error handling, webhook validation, idempotency, secret management."

Agent 2: subagent_type: pr-review-toolkit:code-reviewer
prompt: "Review saleor-apps/apps/inventory-ops/ for production readiness. Focus on: transaction safety, WAC calculations, stock level integrity."

Agent 3: subagent_type: pr-review-toolkit:code-reviewer
prompt: "Review saleor-apps/apps/buylist/ for production readiness. Focus on: pricing accuracy, customer data handling, workflow state management."

Agent 4: subagent_type: pr-review-toolkit:code-reviewer
prompt: "Review saleor-apps/apps/pos/ for production readiness. Focus on: offline handling, receipt generation, cash drawer integration."

Agent 5: subagent_type: pr-review-toolkit:silent-failure-hunter
prompt: "Scan ALL apps in saleor-apps/apps/ for silent failures: empty catch blocks, swallowed errors, missing error boundaries, console.log instead of proper logging."
```

### Workstream 4: Storefront Audit
```
subagent_type: Explore
thoroughness: very thorough
prompt: "Audit storefront/ for production readiness:
1. next.config.js - CSP headers, image domains, redirects
2. Error boundaries in app/ and components/
3. Environment variable handling (staging vs prod)
4. Cart and checkout flow completeness
5. SEO: metadata, robots.txt, sitemap
6. Performance: bundle size, code splitting
Output: Issues with severity ratings and file locations"
```

### Workstream 5: Security Scan
```
subagent_type: general-purpose
prompt: "Execute security audit:
1. Grep for hardcoded secrets: 'sk_live', 'sk_test', 'password=', API keys
2. Check .gitignore covers: .env*, *.pem, *.key, credentials*
3. Review auth token handling in each app's trpc routers
4. Check for SQL injection vectors in raw queries
5. Verify no sensitive data in error messages
6. Check CSP headers in storefront responses
Output: Security findings with severity (Critical/High/Medium/Low)"
```

## After Parallel Workstreams Complete

### Synthesize Findings
Compile all workstream outputs into a single report following the template in the methodology document.

### Run Production Readiness Gate
Evaluate each MANDATORY and RECOMMENDED item from the methodology against actual findings.

### Generate Final Report
Write the audit report to: `docs/ops/audits/2026-01-16-staging-audit.md`

Include:
- Executive summary (5 bullets max)
- P0-P3 prioritized issues tables
- Code review findings by component
- Infrastructure assessment
- Security findings
- Completed production readiness checklist
- Recommended timeline with owners

## Constraints

- Document ALL findings, even minor ones
- Include file:line references for code issues
- Severity must be justified with impact statement
- No findings should be "fix later" without tracking
- Report must be actionable by someone unfamiliar with the codebase
