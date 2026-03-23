---
name: webhook-payload-storage-fixed
description: Saleor webhook payloads now use S3 via AWS_MEDIA_PRIVATE_BUCKET_NAME — fixed 2026-03-23
type: project
---

Saleor webhook delivery was broken on staging since inception — fixed 2026-03-23 (PR #184, issue #183).

**Root cause**: Saleor 3.22 has TWO storage backends:
- `AWS_MEDIA_BUCKET_NAME` → `STORAGES["default"]` (product images, public media) — was set
- `AWS_MEDIA_PRIVATE_BUCKET_NAME` → `PRIVATE_FILE_STORAGE` (webhook payloads via `EventPayload.payload_file`) — was NOT set

Without the private bucket, payloads wrote to local `FileSystemStorage` — broken across separate ECS containers.

**Fix**: Added `AWS_MEDIA_PRIVATE_BUCKET_NAME` env var to API, worker, and migrate task definitions in Terraform. Uses same S3 bucket as media (IAM already covered).

**Why:** This is a critical distinction in Saleor's storage model. `DEFAULT_FILE_STORAGE` (media) and `PRIVATE_FILE_STORAGE` (webhook payloads) are separate settings with separate env vars.

**How to apply:** If adding new Saleor containers that process webhooks, they need BOTH `AWS_MEDIA_BUCKET_NAME` and `AWS_MEDIA_PRIVATE_BUCKET_NAME`. Also relevant if migrating to a new environment.
