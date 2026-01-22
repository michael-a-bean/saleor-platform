# Council Prompt: Local Development vs Staging Isolation

**Created:** 2026-01-18
**Status:** READY FOR EXECUTION
**Purpose:** Establish safe local development workflow that cannot break staging

---

## Execute This Council

Copy this section to invoke the Council skill:

```
/council

**Topic:** Local Development vs Staging Environment Isolation Strategy

**Context:**

We have a saleor-platform deployment successfully running on AWS staging:
- ALB: `saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com`
- Routing: Path-based (HTTP) - `/graphql/`, `/dashboard/`, `/apps/*`, storefront at root
- No TLS/HTTPS (staging only)

Local development runs differently:
- Docker Compose with localhost URLs
- Host-based routing: `localhost:8000`, `localhost:3000`, `localhost:9000`
- All services on separate ports

**Critical Architecture Facts:**

1. **Build-Time Variables (Baked into Docker images):**
   - `NEXT_PUBLIC_SALEOR_API_URL` - client-side API URL
   - `NEXT_PUBLIC_STOREFRONT_URL` - canonical storefront URL
   - `BASE_PATH` - Next.js basePath for path-based routing
   - These CANNOT be changed at runtime

2. **Runtime Variables (Can change via ECS/docker-compose):**
   - `SALEOR_API_URL` - server-side API URL
   - `MEILISEARCH_URL` - internal service URL
   - `ENABLE_HTTPS` - CSP upgrade-insecure-requests flag

3. **Current Problem:**
   - Local Docker builds use `localhost:*` URLs
   - Staging ECS tasks use ALB DNS URLs
   - If I accidentally push a local build to ECR, staging breaks
   - Unclear how to safely iterate locally then deploy to staging

4. **Specific Concerns:**
   - Middleware CSP headers reference `NEXT_PUBLIC_SALEOR_API_URL`
   - Path-based routing (`/apps/stripe/`) vs port-based (`localhost:3001`)
   - Next.js redirects and rewrites may differ
   - GraphQL codegen runs at build time against API URL

**Questions for the Council:**

1. What is the safest workflow for local development that cannot accidentally affect staging?
2. Should we use separate Docker image tags (`local-*` vs `staging-*`)?
3. How should environment-specific Next.js configs be handled?
4. What CI/CD guardrails would prevent deploying local builds to staging?
5. Can we share a single Docker image between environments, or must they be separate builds?

**Deliverable:** A concrete workflow recommendation with specific commands and safeguards.
```

---

## Council Configuration

**Recommended Council Members:**

| Agent | Perspective | Why Included |
|-------|-------------|--------------|
| **DevOps/Infrastructure** | CI/CD, Docker, AWS ECS | Build pipeline isolation, deployment guardrails |
| **Next.js Expert** | Build-time vs runtime, routing | `NEXT_PUBLIC_*` handling, middleware concerns |
| **Saleor Platform Expert** | Saleor-specific patterns | API URL handling, app installation flows |
| **Testing/QA** | Safe iteration, regression prevention | Workflow that prevents breaking staging |

**Custom prompt for domain-specific agents:**

```
Council with infrastructure expert, Next.js frontend expert, Saleor platform expert, and QA/testing expert
```

---

## Background Investigation Summary

### Current Environment Configuration

**Staging (ECS):**
```hcl
# From infra/terraform/modules/ecs/main.tf
NEXT_PUBLIC_SALEOR_API_URL  = "${var.public_api_base_url}/graphql/"
SALEOR_API_URL              = "${var.public_api_base_url}/graphql/"
NEXT_PUBLIC_STOREFRONT_URL  = var.public_storefront_base_url
ENABLE_HTTPS                = "false"  # HTTP-only staging
BASE_PATH                   = "/apps/stripe"  # Path-based routing
```

**Local (docker-compose.yml):**
```yaml
# Build args (baked into image)
NEXT_PUBLIC_SALEOR_API_URL: http://localhost:8000/graphql/
NEXT_PUBLIC_STOREFRONT_URL: http://localhost:3000

# Runtime env
SALEOR_API_URL: http://localhost:8000/graphql/
MEILISEARCH_URL: http://meilisearch:7700
```

### Key Files Involved

| File | Role |
|------|------|
| `docker-compose.yml` | Local dev build args and runtime env |
| `storefront/Dockerfile` | Build-time ARG injection |
| `storefront/src/middleware.ts` | CSP headers, HTTPS upgrade logic |
| `storefront/src/app/config.ts` | Dual URL pattern (public vs server) |
| `infra/terraform/modules/ecs/main.tf` | Staging task definitions |
| `infra/terraform/variables.tf` | URL override variables |

### The Core Tension

```
┌─────────────────────────────────────────────────────────────────┐
│                    BUILD-TIME INJECTION                         │
├─────────────────────────────────────────────────────────────────┤
│  Local Build:                                                   │
│    docker build --build-arg NEXT_PUBLIC_SALEOR_API_URL=         │
│      http://localhost:8000/graphql/                             │
│                                                                 │
│  → Creates image with localhost URLs BAKED IN                   │
│  → This image CANNOT work on staging                            │
├─────────────────────────────────────────────────────────────────┤
│  Staging Build (via CI/CD):                                     │
│    docker build --build-arg NEXT_PUBLIC_SALEOR_API_URL=         │
│      http://saleor-platform-staging-alb-*.elb.amazonaws.com/    │
│      graphql/                                                   │
│                                                                 │
│  → Creates image with ALB URLs BAKED IN                         │
│  → This image CANNOT work locally                               │
└─────────────────────────────────────────────────────────────────┘
```

### Potential Solutions to Evaluate

1. **Separate Image Tags**
   - `storefront:local-dev` vs `storefront:staging-{commit}`
   - CI/CD only pushes `staging-*` to ECR
   - Local never pushes to ECR

2. **Runtime URL Injection (Complex)**
   - Use environment variables at runtime with client-side hydration
   - Requires Next.js `publicRuntimeConfig` or window injection
   - Breaks static optimization

3. **Proxy/Nginx Approach**
   - Local nginx proxies localhost to match staging paths
   - More complex local setup

4. **Two Docker Compose Files**
   - `docker-compose.yml` for local
   - `docker-compose.staging-sim.yml` to simulate staging routing

5. **Feature Branch Deployments**
   - Never deploy from local
   - Push branch → CI builds → deploy to staging
   - Higher latency for iteration

---

## Expected Council Output

The council should produce:

1. **Recommended Workflow** - Step-by-step for local dev → staging deploy
2. **Guardrails** - What prevents accidental staging breakage
3. **Configuration Changes** - Any needed updates to docker-compose or terraform
4. **Trade-offs** - What we gain/lose with each approach
5. **Implementation Priority** - What to do first

---

## Post-Council Actions

After the council concludes, create:

1. `docs/reference/local-staging-workflow.md` - The definitive workflow guide
2. Updates to `CLAUDE.md` - Reference the new workflow
3. CI/CD guardrails - If recommended by council
4. Any docker-compose or terraform changes

---

## Related Documentation

- `.claude/plans/mtg-inventory-council-implementation.md` - Previous council implementation
- `docs/reference/architecture.md` - Platform architecture
- `infra/terraform/` - Staging infrastructure
- `.claude/rules/storefront.md` - Build gotchas
