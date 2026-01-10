# PAI Skill Integration Analysis

## Discovered Skill Systems

This document records the findings from analyzing the PAI skill systems in this repository and the user's environment.

### 1. Project-Level Skills (`.claude/skills/`)

**Location:** `/home/michael/saleor-platform/.claude/skills/`

**Schema:**
```yaml
---
name: skill-name
description: What it does. Use when specific triggers.
---

# Skill Name

## When to Use
- List of use cases

## Commands/Procedures
...
```

**Characteristics:**
- Simple markdown files with YAML frontmatter
- Two required fields: `name` and `description`
- Body contains procedures, commands, and examples
- Repo-specific context loaded by Claude Code
- Listed in `README.md` index

**Existing examples:**
- `docker-ops.md`
- `saleor-database.md`
- `storefront-dev.md`

### 2. User-Level PAI Skills (`~/.claude/skills/`)

**Location:** `/home/michael/.claude/skills/`

**Schema (from SkillSystem.md):**
```
SkillName/
├── SKILL.md              # Main skill file with YAML frontmatter
├── QuickStartGuide.md    # Context files in root (TitleCase)
├── Tools/                # CLI tools (ALWAYS present)
│   └── ToolName.ts
└── Workflows/            # Work execution workflows
    └── Create.md
```

**SKILL.md format:**
```yaml
---
name: SkillName
description: [What it does]. USE WHEN [intent triggers using OR]. [Additional capabilities].
---

# SkillName

[Brief description]

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **WorkflowOne** | "trigger phrase" | `Workflows/WorkflowOne.md` |

## Examples

**Example 1: [Use case]**
...
```

**Characteristics:**
- Directory-based structure
- TitleCase naming convention (mandatory)
- `USE WHEN` keyword required in description
- Registered in `skill-index.json`
- Tools/ directory (required, even if empty)
- Workflows/ directory for execution patterns

**Existing examples:**
- `CORE/`
- `Browser/`
- `CreateSkill/`
- `Agents/`

### 3. Plugin Skills (`~/.claude/plugins/`)

**Location:** `/home/michael/.claude/plugins/marketplaces/`

**Schema:**
```
plugin-name/
└── commands/
    └── command-name.md
```

**Command file format:**
```yaml
---
allowed-tools: Bash(git diff:*), ...
description: What the command does
---

[Instructions for Claude]
```

**Characteristics:**
- Third-party skills from marketplaces
- Invoked as `plugin-name:command-name`
- Has `allowed-tools` frontmatter for permissions
- Contains detailed instructions for Claude

**Existing examples:**
- `local-review:local-review` (different from our localreview)
- `pr-review-toolkit:*`

## Integration Decision

For the `localreview` skill in this repository, I chose **Option 1: Project-Level Skill**.

### Rationale

1. **Repo-specific**: The localreview gate is specific to the saleor-platform repository
2. **Script-based**: It wraps a bash script, not complex agent workflows
3. **Pattern match**: Follows existing skills like `docker-ops.md`
4. **Minimal overhead**: No need for Tools/ or Workflows/ directories
5. **Discoverability**: Listed in skills README alongside other operational skills

### Implementation

**File created:** `.claude/skills/local-review.md`

```yaml
---
name: local-review
description: Deterministic local review gate for code changes. Use when reviewing diffs before commit/PR, checking for risky patterns, or running pre-commit validation.
---
```

**Index updated:** `.claude/skills/README.md`

Added to new "Validation" section.

## Alternative Options (Not Implemented)

### Option 2: User-Level PAI Skill

Would create:
```
~/.claude/skills/LocalReview/
├── SKILL.md
├── Tools/
└── Workflows/
    └── RunReview.md
```

**Why not chosen:**
- This skill is repo-specific, not system-wide
- User-level skills are for cross-repo functionality
- Would require maintaining in two places

### Option 3: Plugin Skill

Would create:
```
~/.claude/plugins/marketplaces/custom/plugins/localreview/
└── commands/
    └── run-review.md
```

**Why not chosen:**
- Plugins are for third-party/shareable skills
- This is a project-internal tool
- Plugin registration is more complex

## Invocation Methods

### Via Make (Primary)
```bash
make localreview
```

### Via Script
```bash
./scripts/localreview.sh
```

### Via Claude Code

Read the skill when needed:
```
Please read .claude/skills/local-review.md and run a local review
```

Or use the skill's procedures directly in conversation.

## Future Considerations

If localreview needs to become a system-wide tool:

1. Create `~/.claude/skills/LocalReview/` directory
2. Add SKILL.md with USE WHEN clause
3. Create Tools/RunReview.ts for direct invocation
4. Regenerate skill-index.json
5. Keep repo-level skill as lightweight reference
