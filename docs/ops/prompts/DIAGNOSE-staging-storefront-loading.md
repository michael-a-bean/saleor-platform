# Diagnostic Prompt: Staging Storefront Loading Issues

**Purpose**: Systematically investigate why the staging webstore is not fully loading.

---

## Phase 1: Infrastructure Health

Check if underlying services are running and healthy.

### 1.1 ECS Service Status

```bash
aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services storefront api \
  --query 'services[].{name:serviceName,status:status,running:runningCount,desired:desiredCount,deployments:deployments[0].rolloutState}' \
  --output table \
  --region us-west-1
```

**Expected**: Both services show `running == desired` and `IN_PROGRESS` or `COMPLETED` rollout.

### 1.2 ALB Target Group Health

```bash
# Get target group ARNs
aws elbv2 describe-target-groups \
  --names saleor-platform-staging-storefront saleor-platform-staging-api \
  --query 'TargetGroups[].{Name:TargetGroupName,ARN:TargetGroupArn}' \
  --region us-west-1

# Check target health for each
aws elbv2 describe-target-health \
  --target-group-arn <STOREFRONT_TG_ARN> \
  --region us-west-1

aws elbv2 describe-target-health \
  --target-group-arn <API_TG_ARN> \
  --region us-west-1
```

**Expected**: All targets show `healthy` state.

---

## Phase 2: Endpoint Connectivity

Test direct access to critical endpoints.

### 2.1 Health Endpoints

```bash
BASE_URL="http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

# Storefront health
curl -s -w "\nHTTP: %{http_code}\n" "$BASE_URL/api/health"

# API health
curl -s -w "\nHTTP: %{http_code}\n" "$BASE_URL/health/"

# GraphQL introspection (tests API + auth)
curl -s -w "\nHTTP: %{http_code}\n" "$BASE_URL/graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { queryType { name } } }"}'
```

**Expected**: All return HTTP 200.

### 2.2 Storefront Page Load

```bash
# Test homepage HTML response
curl -s -w "\nHTTP: %{http_code}\n" -o /dev/null "$BASE_URL/"

# Test with headers to see what's returned
curl -s -I "$BASE_URL/"
```

**Expected**: HTTP 200, `Content-Type: text/html`.

---

## Phase 3: GraphQL API Functionality

Test queries the storefront depends on.

### 3.1 Channel Query (Required for storefront routing)

```bash
curl -s "$BASE_URL/graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ channels { id slug name currencyCode } }"}' | jq .
```

### 3.2 Products Query (Main page content)

```bash
curl -s "$BASE_URL/graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ products(first: 5, channel: \"webstore\") { edges { node { id name pricing { priceRange { start { gross { amount currency } } } } } } } }"}' | jq .
```

### 3.3 Check for Null Pricing (COMMON CRASH CAUSE)

If products query returns but storefront crashes, check for null prices:

```bash
curl -s "$BASE_URL/graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ products(first: 100, channel: \"webstore\") { edges { node { id name variants { id pricing { price { gross { amount currency } } } } } } } }"}' | \
  jq '.data.products.edges[].node | select(.variants[].pricing.price == null or .variants[].pricing.price.gross == null) | {id, name}'
```

**If results appear**: Products with null pricing will crash the storefront.

---

## Phase 4: CloudWatch Log Analysis

### 4.1 Storefront Logs (Recent Errors)

```bash
aws logs filter-log-events \
  --log-group-name /ecs/saleor-platform-staging/storefront \
  --filter-pattern "ERROR" \
  --start-time $(date -d '30 minutes ago' +%s)000 \
  --region us-west-1 \
  --query 'events[].message' \
  --output text
```

### 4.2 API Logs (Recent Errors)

```bash
aws logs filter-log-events \
  --log-group-name /ecs/saleor-platform-staging/api \
  --filter-pattern "ERROR" \
  --start-time $(date -d '30 minutes ago' +%s)000 \
  --region us-west-1 \
  --query 'events[].message' \
  --output text
```

### 4.3 Look for Specific Crash Patterns

```bash
# Currency/pricing crashes
aws logs filter-log-events \
  --log-group-name /ecs/saleor-platform-staging/storefront \
  --filter-pattern "?currency ?NoneType ?undefined ?null" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region us-west-1

# GraphQL errors
aws logs filter-log-events \
  --log-group-name /ecs/saleor-platform-staging/storefront \
  --filter-pattern "?GraphQL ?ECONNREFUSED ?ETIMEDOUT" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region us-west-1
```

---

## Phase 5: Browser-Level Debugging

Open the staging URL in a browser and check:

### 5.1 DevTools Console

1. Open Developer Tools (F12)
2. Navigate to Console tab
3. Look for:
   - JavaScript errors (red)
   - Failed network requests
   - CORS errors
   - `Cannot read property of null/undefined`

### 5.2 DevTools Network

1. Navigate to Network tab
2. Reload page (Ctrl+Shift+R for hard reload)
3. Check for:
   - Failed requests (red, status 4xx/5xx)
   - Pending requests that never complete
   - GraphQL requests returning errors
   - Requests to wrong host (localhost references)

### 5.3 Common Browser Errors and Causes

| Error | Likely Cause |
|-------|--------------|
| "Something went wrong" | Null pricing data in API response |
| CORS error | API not allowing storefront origin |
| Mixed content | HTTPS page loading HTTP resources |
| GraphQL network error | API unreachable from browser |
| Hydration mismatch | Server/client render disagreement |

---

## Phase 6: Environment Configuration

### 6.1 Check Storefront Environment Variables

```bash
# Get current task definition
TASK_DEF=$(aws ecs describe-services \
  --cluster saleor-platform-staging \
  --services storefront \
  --query 'services[0].taskDefinition' \
  --output text \
  --region us-west-1)

# Extract environment variables
aws ecs describe-task-definition \
  --task-definition "$TASK_DEF" \
  --query 'taskDefinition.containerDefinitions[0].environment' \
  --region us-west-1
```

**Verify these are set correctly**:
- `NEXT_PUBLIC_SALEOR_API_URL` - Must be reachable from browser
- `NEXT_PUBLIC_STOREFRONT_URL` - Must match actual deployment URL

### 6.2 Check for localhost References

If `NEXT_PUBLIC_SALEOR_API_URL` contains `localhost`, the browser cannot reach it.

---

## Phase 7: Database State (If Pricing Issues Suspected)

If Phase 3.3 or logs indicate pricing problems:

```sql
-- Connect to staging database and check for null discounted prices
SELECT COUNT(*) as null_discounted_prices
FROM product_productvariantchannellisting
WHERE discounted_price_amount IS NULL
  AND price_amount IS NOT NULL;

-- Fix if needed
UPDATE product_productvariantchannellisting
SET discounted_price_amount = price_amount
WHERE discounted_price_amount IS NULL
  AND price_amount IS NOT NULL;
```

---

## Diagnostic Summary Template

After running checks, fill in:

```markdown
## Findings

| Check | Status | Notes |
|-------|--------|-------|
| ECS Services Running | ✅/❌ | |
| ALB Targets Healthy | ✅/❌ | |
| /api/health | ✅/❌ | |
| /health/ (API) | ✅/❌ | |
| GraphQL Introspection | ✅/❌ | |
| Products Query | ✅/❌ | |
| Null Pricing Check | ✅/❌ | |
| Storefront Logs Clean | ✅/❌ | |
| API Logs Clean | ✅/❌ | |
| Browser Console Clean | ✅/❌ | |
| Env Vars Correct | ✅/❌ | |

## Root Cause
[Describe the identified issue]

## Recommended Fix
[Specific steps to resolve]
```

---

## Quick Reference: Common Issues

| Symptom | Most Likely Cause | Quick Fix |
|---------|-------------------|-----------|
| White page, no content | GraphQL API unreachable | Check API health, env vars |
| "Something went wrong" | Null `discounted_price_amount` | Run SQL fix from Phase 7 |
| Page loads but products missing | Channel mismatch or no products | Verify channel slug, product availability |
| Infinite loading spinner | GraphQL query timeout | Check API logs, DB performance |
| Hydration errors | Server/client data mismatch | Clear cache, check ISR settings |
| CORS errors | API origin not allowed | Update `ALLOWED_HOSTS` in API |
