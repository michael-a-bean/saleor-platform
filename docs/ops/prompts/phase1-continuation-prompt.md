# Phase 1 Continuation Prompt

Copy and paste the following prompt to continue implementation in a new session:

---

```
You are continuing the Staging Audit Remediation implementation.

## Context

Phase 0 (Pre-Launch Blockers) is COMPLETE. See:
- `docs/ops/audits/2026-01-16-phase0-completion.md` - What was done
- `docs/ops/audits/2026-01-16-implementation-handoff.md` - Full implementation specs

## Current State

- All 6 P0 blockers implemented and verified
- Secret keys configured in `.env` (local) and AWS SSM (staging)
- No commits made yet - all changes are unstaged

## Your Task

Implement **Phase 1: Infrastructure** items from the handoff document:

### P1-1: ECS Auto-Scaling
- File: `infra/terraform/modules/ecs/main.tf`
- Add `aws_appautoscaling_target` and `aws_appautoscaling_policy` for API
- Add variables: `enable_autoscaling`, `api_min_capacity`, `api_max_capacity`

### P1-2: RDS Proxy for Connection Pooling
- File: `infra/terraform/modules/rds/main.tf`
- Add `aws_db_proxy`, `aws_db_proxy_default_target_group`, `aws_db_proxy_target`
- Requires DB credentials in Secrets Manager

### P1-3: Increase max_connections
- File: `infra/terraform/modules/rds/main.tf`
- Change `max_connections` parameter from 200 to 400
- Make it configurable via variable

## Instructions

1. Read the implementation handoff document first
2. Create a todo list to track progress
3. Implement each P1 item with the code from the handoff doc
4. Verify with `terraform validate` where possible
5. Create a completion report similar to Phase 0

## Important Notes

- Work on `platform/main` branch (verify with `git branch --show-current`)
- Terraform files are in `infra/terraform/`
- Do NOT run `terraform apply` without explicit approval
- Document any deviations from the handoff spec
```

---

## Quick Reference

| Phase | Status | Items |
|-------|--------|-------|
| Phase 0 | ✅ Complete | P0-1 through P0-6 |
| Phase 1 | 🔲 Pending | P1-1, P1-2, P1-3 |
| Phase 2 | 🔲 Pending | P2-1, P2-2, P2-3 |
| Phase 3 | 🔲 Pending | P3-1, P3-2, P3-3, P3-4 |
| Phase 4 | 🔲 Pending | P4-1, P4-2, P4-3, P4-4 |
