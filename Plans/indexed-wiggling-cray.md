# Plan: Migrate Sensitive Docs to Private Submodule

## Context

The `saleor-platform` repo is a **public GitHub fork** of `saleor/saleor-platform`. It cannot be made private without detaching from the fork network. Instead, we move ~152 sensitive files (competitive research, IAM snapshots, cost analyses, business plans, ops audits) into a **new private repo** wired in as a git submodule. This keeps the fork relationship intact, requires zero CI/CD or Terraform changes, and syncs across Michael's desktop and laptop via normal git operations.

## Files That Move (152 files)

| Directory | Count | Why sensitive |
|-----------|-------|---------------|
| `docs/reports/shadowpos/` | 19 | Competitor intelligence |
| `docs/ops/audits/` (incl. IAM snapshots, s3 policies) | 38 | Full IAM role/policy details |
| `docs/ops/issues/` | 12 | Internal issue investigations |
| `docs/ops/diagnostics/` | 10 | Internal ops diagnostics |
| `docs/ops/completed/` | 6 | Completed ops tasks |
| `docs/ops/investigations/` | 3 | Internal investigations |
| `docs/reports/research/` | 9 | Market research, cost analysis |
| `docs/reports/` (top-level) | 2 | PRDs, MVP readiness |
| `docs/legacy/` | 27 | Historical AI reviews, research |
| `docs/analysis/` | 1 | Council analysis |
| `docs/plans/` | 1 | MVP implementation plan |
| `docs/debug/` | 2 | Debug session logs |
| `docs/CURRENT-STATE-OF-DEVELOPMENT.md` | 1 | Business state overview |
| `.claude/plans/` | 7 | AI session plans |
| `.claude/issues/` | 3 | AI-tracked issues |
| `.claude/sessions/` | 1 | AI session handoff |
| `.claude/prompts/` | 3 | AI prompts |

## Files That Stay (public, referenced by skills/rules/CLAUDE.md)

- `docs/reference/` — architecture, sync-contracts, git-philosophy, etc.
- `docs/deploy/` — deploy procedures
- `docs/setup/` — setup instructions
- `docs/ops/runbooks/` — operational runbooks
- `docs/ops/prompts/` — ops prompt templates
- `docs/api/` — API reference
- `docs/decisions/` — ADRs
- `docs/images/` — product images
- `.claude/rules/`, `.claude/skills/`, `.claude/settings.json`

## Implementation Steps

### Phase 1: Create Private Repo & Populate (safe, reversible)

**Step 1.1** — Create private repo on GitHub:
```bash
gh repo create michael-a-bean/saleor-platform-docs --private --description "Private docs for saleor-platform"
```

**Step 1.2** — Initialize the private repo with the sensitive files:
```bash
# Create temp working directory
cd /tmp
git clone https://github.com/michael-a-bean/saleor-platform-docs.git
cd saleor-platform-docs

# Copy files from platform repo, preserving directory structure
cd /home/michael/saleor-platform
# (use rsync or cp --parents for each directory group listed above)
# Files go into private repo root mirroring their original paths:
#   docs/reports/shadowpos/FINAL-REPORT.md  (same path inside private repo)
#   .claude/plans/mtg-import-app-plan.md    (same path inside private repo)

cd /tmp/saleor-platform-docs
git add -A
git commit -m "Initial migration of sensitive docs from saleor-platform"
git push origin main
```

**Step 1.3** — Verify: `gh repo view michael-a-bean/saleor-platform-docs --json isPrivate` confirms `true`. File count matches 152.

### Phase 2: Add as Submodule to saleor-platform

**Step 2.1** — Add submodule (mount point: `docs-private/`):
```bash
cd /home/michael/saleor-platform
git submodule add https://github.com/michael-a-bean/saleor-platform-docs.git docs-private
git commit -m "feat: add private docs submodule for sensitive content"
```

After this, sensitive files are accessible at `docs-private/docs/reports/...`, `docs-private/.claude/plans/...`, etc.

**Step 2.2** — Update references in skills/CLAUDE.md:

| File | Old Path | New Path |
|------|----------|----------|
| `CLAUDE.md` line 78 | `docs/legacy/` | `docs-private/docs/legacy/` |
| `.claude/skills/price-sync.md` | `.claude/plans/mvp-completion-plan.md` | `docs-private/.claude/plans/mvp-completion-plan.md` |
| `.claude/skills/pricing-rules.md` | `~/.claude/plans/temporal-percolating-ullman.md` | No change (already points to `~/.claude/`, not repo) |

Only 2 path references actually need updating.

### Phase 3: Remove Sensitive Files from Public Repo

**Step 3.1** — Remove from git tracking (keeps files on disk):
```bash
# Generate file list
git ls-files -- docs/reports/ docs/ops/audits/ docs/ops/investigations/ \
  docs/ops/diagnostics/ docs/ops/completed/ docs/ops/issues/ docs/analysis/ \
  docs/plans/ docs/legacy/ docs/debug/ .claude/plans/ .claude/issues/ \
  .claude/sessions/ .claude/prompts/ docs/CURRENT-STATE-OF-DEVELOPMENT.md \
  > /tmp/files-to-remove.txt

# Remove from tracking
xargs git rm --cached < /tmp/files-to-remove.txt

# Add to .gitignore
cat >> .gitignore << 'EOF'

# Private docs (migrated to docs-private submodule)
docs/reports/
docs/ops/audits/
docs/ops/investigations/
docs/ops/diagnostics/
docs/ops/completed/
docs/ops/issues/
docs/analysis/
docs/plans/
docs/legacy/
docs/debug/
docs/CURRENT-STATE-OF-DEVELOPMENT.md
.claude/plans/
.claude/issues/
.claude/sessions/
.claude/prompts/
EOF

git add .gitignore
git commit -m "chore: remove sensitive docs from public tracking

Files migrated to private docs-private submodule.
See docs-private/ for competitive research, ops audits, IAM snapshots."
```

### Phase 4: Scrub Git History (DESTRUCTIVE — backup first)

**Step 4.1** — Create safety backup:
```bash
cd /home/michael
cp -r saleor-platform saleor-platform-backup-pre-filter
```

**Step 4.2** — Build path list for filter-repo:
```bash
# Create paths file (one path per line, from /tmp/files-to-remove.txt)
# Also include any directory-level patterns
```

**Step 4.3** — Run git filter-repo:
```bash
cd /home/michael/saleor-platform
git filter-repo --invert-paths --paths-from-file /tmp/files-to-remove.txt --force
```

**Step 4.4** — Re-add remote and force push:
```bash
git remote add origin https://github.com/michael-a-bean/saleor-platform.git
git push origin platform/main --force-with-lease
```

**Step 4.5** — Re-add submodules (filter-repo strips them):
```bash
git submodule add https://github.com/michael-a-bean/saleor-apps.git saleor-apps
git submodule add https://github.com/michael-a-bean/saleor-platform-docs.git docs-private
git commit -m "chore: re-add submodules after history rewrite"
git push origin platform/main
```

**Step 4.6** — Verify history is clean:
```bash
git log --all --diff-filter=A -- docs/reports/shadowpos/ | head -5
# Should return nothing
```

### Phase 5: PAT & CI/CD Verification

**Step 5.1** — Verify `SUBMODULES_TOKEN` PAT scope:
- Go to GitHub → Settings → Developer settings → Personal access tokens
- Ensure the PAT used for `SUBMODULES_TOKEN` has `repo` scope (full private repo access)
- If using fine-grained PAT: add `saleor-platform-docs` to the repo list

**Step 5.2** — Test CI picks up both submodules:
- Workflows already use `submodules: recursive` + `token: ${{ secrets.SUBMODULES_TOKEN }}`
- The new submodule will be checked out automatically alongside `saleor-apps`
- Trigger a test workflow run to confirm

### Phase 6: Laptop Setup

```bash
# On laptop — fresh clone after history rewrite
cd ~
rm -rf saleor-platform  # old clone is incompatible after filter-repo
git clone --recurse-submodules https://github.com/michael-a-bean/saleor-platform.git
cd saleor-platform
git checkout platform/main
git submodule update --init --recursive
```

Ongoing sync (both machines):
```bash
git pull --recurse-submodules
# Or to update just docs-private:
cd docs-private && git pull origin main && cd ..
```

## Path Reference Summary

After migration, sensitive content is at `docs-private/` which mirrors the original structure:
- `docs-private/docs/reports/shadowpos/FINAL-REPORT.md`
- `docs-private/docs/ops/audits/iam-snapshots-20260127/...`
- `docs-private/.claude/plans/mtg-import-app-plan.md`

## What Changes in CI/CD

**Nothing** — as long as `SUBMODULES_TOKEN` has access to the private repo. The workflows already use `submodules: recursive`.

## What Changes in Terraform

**Nothing** — repo name stays the same, OIDC trust policy unchanged.

## Verification Checklist

- [ ] Private repo exists and is private (`gh repo view --json isPrivate`)
- [ ] File count in private repo matches 152
- [ ] Submodule initialized and files accessible at `docs-private/`
- [ ] CLAUDE.md and skills references updated (2 files)
- [ ] Files removed from public repo tracking
- [ ] Git history shows no trace of sensitive files
- [ ] `SUBMODULES_TOKEN` PAT has access to new private repo
- [ ] CI/CD test run succeeds with both submodules
- [ ] Laptop clone works with `--recurse-submodules`
- [ ] No Claude Code skills/rules broken

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Filter-repo goes wrong | Full backup at `saleor-platform-backup-pre-filter` |
| Laptop clone broken | Fresh re-clone after history rewrite |
| Open PRs invalidated | Check for open PRs before force push; rebase after |
| PAT doesn't have access | Verify scope BEFORE running CI; fall back to updating PAT |
