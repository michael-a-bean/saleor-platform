# Stripe App Installation Runbook

This runbook covers deploying and installing the Stripe payment app in staging and production environments.

## Prerequisites

Before installing the Stripe app:

1. **Infrastructure deployed**: Terraform has been applied successfully
2. **DynamoDB table exists**: The `saleor-platform-{env}-stripe-app` table is created
3. **SSM Parameters set**: Stripe API keys are stored in SSM
4. **Stripe app image pushed**: ECR has the stripe-app image

## Environment Variables

The Stripe app requires these environment variables (configured via Terraform):

| Variable | Source | Description |
|----------|--------|-------------|
| `SECRET_KEY` | SSM Parameter | Encryption key for secure storage |
| `APL` | Terraform | Set to `dynamodb` for AWS deployment |
| `DYNAMODB_MAIN_TABLE_NAME` | Terraform | Table name from DynamoDB module |
| `AWS_REGION` | Terraform | AWS region for DynamoDB |
| `APP_API_BASE_URL` | Terraform | Public URL for app API endpoints |
| `APP_IFRAME_BASE_URL` | Terraform | Public URL for dashboard iframe |
| `SALEOR_API_URL` | Terraform | Saleor GraphQL endpoint |
| `STRIPE_SECRET_KEY` | SSM Parameter | Stripe restricted API key |
| `STRIPE_WEBHOOK_SECRET` | SSM Parameter | Stripe webhook signing secret |

## Deployment Steps

### 1. Verify DynamoDB Table Exists

```bash
aws dynamodb describe-table \
  --table-name saleor-platform-staging-stripe-app \
  --region us-west-1 \
  --query 'Table.TableStatus'
```

Expected output: `"ACTIVE"`

If the table doesn't exist, run Terraform apply:

```bash
cd infra/terraform
terraform apply -var-file=environments/staging.tfvars
```

### 2. Verify SSM Parameters

```bash
# Check Stripe secrets are set (not the values, just that they exist)
aws ssm get-parameter \
  --name "/saleor/staging/apps/stripe/STRIPE_SECRET_KEY" \
  --region us-west-1 \
  --query 'Parameter.Name'

aws ssm get-parameter \
  --name "/saleor/staging/apps/stripe/STRIPE_WEBHOOK_SECRET" \
  --region us-west-1 \
  --query 'Parameter.Name'

# Verify shared app secret key
aws ssm get-parameter \
  --name "/saleor/staging/apps/SECRET_KEY" \
  --region us-west-1 \
  --query 'Parameter.Name'
```

If any are missing, set them:

```bash
# Generate app secret key if needed
aws ssm put-parameter \
  --name "/saleor/staging/apps/SECRET_KEY" \
  --type "SecureString" \
  --value "$(openssl rand -hex 32)" \
  --region us-west-1

# Set Stripe API key (get from Stripe Dashboard > Developers > API keys)
aws ssm put-parameter \
  --name "/saleor/staging/apps/stripe/STRIPE_SECRET_KEY" \
  --type "SecureString" \
  --value "rk_test_..." \
  --region us-west-1

# Set Stripe webhook secret (after creating webhook in Stripe Dashboard)
aws ssm put-parameter \
  --name "/saleor/staging/apps/stripe/STRIPE_WEBHOOK_SECRET" \
  --type "SecureString" \
  --value "whsec_..." \
  --region us-west-1
```

### 3. Verify App Health

```bash
ALB="http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com"

# Check app is running
curl -s "${ALB}/apps/stripe/api/health"

# Check manifest is served
curl -s "${ALB}/apps/stripe/api/manifest" | jq '.id, .name, .tokenTargetUrl'
```

Expected manifest output:
```json
"saleor.app.payment.stripe"
"Stripe"
"http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe/api/register"
```

### 4. Install App via Dashboard

1. Navigate to Saleor Dashboard:
   ```
   http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/dashboard
   ```

2. Go to **Apps** → **Install external app**

3. Enter the manifest URL:
   ```
   http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe/api/manifest
   ```

4. Click **Install** and wait for completion

5. The app should appear as "Active" in the Apps list

### 5. Configure Stripe in App

1. Open the Stripe app from the Apps list
2. Add a new configuration:
   - Name: e.g., "Webstore Config"
   - Stripe Publishable Key: `pk_test_...` (from Stripe Dashboard)
   - Stripe Secret Key: `rk_test_...` (or use the SSM-injected key)
3. Map the configuration to your channel (e.g., "webstore")

### 6. Create Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint:
   - URL: `http://saleor-platform-staging-alb-540548859.us-west-1.elb.amazonaws.com/apps/stripe/api/webhooks/stripe`
   - Events to send:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.canceled`
     - `refund.created`
     - `refund.updated`
     - `refund.failed`
3. Copy the webhook signing secret and update SSM:
   ```bash
   aws ssm put-parameter \
     --name "/saleor/staging/apps/stripe/STRIPE_WEBHOOK_SECRET" \
     --type "SecureString" \
     --value "whsec_..." \
     --region us-west-1 \
     --overwrite
   ```
4. Force redeploy to pick up new secret:
   ```bash
   aws ecs update-service \
     --cluster saleor-platform-staging \
     --service stripe \
     --force-new-deployment \
     --region us-west-1
   ```

## Verification

### Test Payment Flow

1. Create a checkout in the storefront
2. Select Stripe as payment method
3. Use test card: `4242 4242 4242 4242` (any future expiry, any CVC)
4. Complete the payment
5. Verify order is created in Dashboard

### Check CloudWatch Logs

```bash
aws logs tail /ecs/saleor-platform-staging/stripe-app \
  --since 10m \
  --region us-west-1
```

Look for:
- `App configuration set up successfully` - APL data saved
- `Successfully processed webhook` - Stripe webhook received

## Troubleshooting

### "The auth data could not be used to fetch app ID"

**Cause**: App cannot reach Saleor API during registration.

**Checks**:
1. Verify Saleor API is healthy:
   ```bash
   curl -s "${ALB}/graphql/" -X POST \
     -H "Content-Type: application/json" \
     -d '{"query": "{ __typename }"}'
   ```

2. Check app logs for connection errors:
   ```bash
   aws logs tail /ecs/saleor-platform-staging/stripe-app --since 5m --region us-west-1
   ```

3. Verify NAT Gateway is healthy (ECS tasks need outbound internet access)

### "GetAuthDataError: Failed to get APL entry"

**Cause**: DynamoDB table doesn't exist or app lacks permissions.

**Fix**:
1. Verify table exists (see Step 1 above)
2. If missing, apply Terraform
3. Check IAM permissions for `ecs-apps-task` role

### Stripe webhook not received

**Cause**: Webhook URL not reachable or signing secret mismatch.

**Checks**:
1. Verify webhook URL is accessible:
   ```bash
   curl -v "${ALB}/apps/stripe/api/webhooks/stripe"
   ```
   (Should return 400 without valid signature, but not 404/502)

2. Verify webhook secret matches:
   - Compare Stripe Dashboard webhook signing secret
   - With SSM parameter value

3. Check Stripe Dashboard → Webhooks → Recent attempts

## Rollback

If the app causes issues:

1. Uninstall from Dashboard → Apps → Stripe → Uninstall
2. Scale down service:
   ```bash
   aws ecs update-service \
     --cluster saleor-platform-staging \
     --service stripe \
     --desired-count 0 \
     --region us-west-1
   ```

## References

- [Saleor Stripe App Docs](https://docs.saleor.io/developer/app-store/apps/stripe/overview)
- [Stripe API Keys](https://dashboard.stripe.com/apikeys)
- [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
