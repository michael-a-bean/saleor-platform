# Remove Staging Warming Cron

The `staging-warm.yml` GitHub Actions workflow hits staging URLs every 10 minutes to keep services warm (prevent cold-start latency). It was added for the MVP presentation period.

## When to Remove

After the MVP presentation is complete and you no longer need consistently fast staging response times.

## How to Remove

### Option 1: Delete the workflow file (permanent)

```bash
git checkout platform/main
git checkout -b feature/remove-warming-cron
git rm .github/workflows/staging-warm.yml
git rm docs/ops/runbooks/remove-warming-cron.md
git commit -m "chore: remove staging warming cron (post-MVP)"
git push origin feature/remove-warming-cron
# Create PR targeting platform/main
gh pr create --base platform/main --label automerge \
  --title "chore: remove staging warming cron" \
  --body "Post-MVP cleanup. Warming cron no longer needed."
```

### Option 2: Disable via GitHub UI (temporary/reversible)

1. Go to https://github.com/michael-a-bean/saleor-platform/actions/workflows/staging-warm.yml
2. Click the `...` menu (top right)
3. Select **Disable workflow**

To re-enable later, same menu → **Enable workflow**.

### Option 3: Reduce frequency instead of removing

Edit `.github/workflows/staging-warm.yml` and change the cron schedule:

```yaml
# Every 30 minutes instead of every 10
- cron: '*/30 * * * *'

# Hourly
- cron: '0 * * * *'
```

## Cost Impact

The warming cron is very cheap:
- Each run: ~10 seconds of `ubuntu-latest` runner time (just `curl` commands)
- At 10-minute intervals: ~144 runs/day = ~24 minutes of runner time/day
- Well within GitHub Actions free tier (2,000 minutes/month)

The real cost is keeping ECS services warm longer (they won't scale to 0 as aggressively). This is already controlled by the scheduled scaling in Terraform (`scale_down_schedule` at midnight PST), which the warming cron does NOT override — services still scale to 0 at midnight.
