# Claude Code Shared Memory — Multi-Device Setup

This directory (`.claude/memory/`) is the shared auto-memory for Claude Code on this project. It lives in the repo so it syncs across devices via git.

## How It Works

Claude Code stores per-project auto-memory at:
```
~/.claude/projects/-home-<user>-<project-path>/memory/
```

By symlinking that path to `.claude/memory/` in the repo, all memory is version-controlled and shared across devices.

## Setup on a New Device

Run this **once** after cloning the repo. Adjust the path if your repo isn't at `~/saleor-platform`:

```bash
# 1. Determine your Claude Code project memory path
#    It's based on your home directory and repo location, with slashes replaced by dashes.
#    Example: repo at ~/saleor-platform → project key is -home-<user>-saleor-platform
PROJECT_MEMORY="$HOME/.claude/projects/-home-$(whoami)-saleor-platform/memory"

# 2. Back up any existing local memory (if you already have sessions on this device)
if [ -d "$PROJECT_MEMORY" ] && [ ! -L "$PROJECT_MEMORY" ]; then
  echo "Backing up existing memory to /tmp/claude-memory-backup/"
  cp -r "$PROJECT_MEMORY" /tmp/claude-memory-backup/
fi

# 3. Ensure parent directory exists
mkdir -p "$(dirname "$PROJECT_MEMORY")"

# 4. Remove existing directory and create symlink
rm -rf "$PROJECT_MEMORY"
ln -sfn "$(pwd)/.claude/memory" "$PROJECT_MEMORY"

# 5. Verify
ls -la "$PROJECT_MEMORY"
# Should show: memory -> /path/to/saleor-platform/.claude/memory
```

## What's Shared vs Device-Local

| Shared (in repo via git) | Device-local |
|---|---|
| `.claude/memory/` — auto-memory (this dir) | `~/.claude/CLAUDE.md` — global PAI config |
| `.claude/settings.json` — hooks, plugins | `.claude/settings.local.json` — local overrides |
| `.claude/hooks/` — pre-PR lint gate | `~/.claude/PAI/` — PAI framework |
| `.claude/rules/` — project rules | Session transcripts |
| `.claude/skills/` — domain skills | |
| `CLAUDE.md` — project instructions | |

## Merging Memory from Another Device

If you already have memory on another device that isn't in the repo yet:

1. Check `/tmp/claude-memory-backup/` (created by step 2 above)
2. Diff against `.claude/memory/MEMORY.md` — merge any unique entries
3. Commit the merged result

## Notes

- Memory files are committed to `platform/main`, NOT `main` (which mirrors upstream)
- The `WORK/` subdirectory contains PRD files for in-progress work items
- `settings.local.json` and `scheduled_tasks.lock` are gitignored (device-specific)
