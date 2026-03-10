# Codex Agent Configuration

## Review guidelines

Focus on issues that matter in production. Do not nitpick formatting, whitespace, or style.

### Severity

- **P0 (critical)** — Security vulnerabilities, data loss, crashes, broken auth, injection flaws.
- **P1 (warning)** — Bugs, logic errors, race conditions, missing error handling that could cause failures.
- **P2 (note)** — Readability, naming, minor improvements. Informational only.

### Project context

- This is a Saleor Platform fork for hobby gaming (MTG secondary market).
- Saleor Apps live in `saleor-apps/` (submodule). Custom apps: inventory-ops, buylist, mtg-import, pos.
- Backend: Django + GraphQL. Frontend: Next.js. Apps: tRPC + Prisma + Meilisearch.
- Extend Saleor via apps and webhooks, not core modification.
- `main` branch mirrors upstream — all work targets `platform/main`.
