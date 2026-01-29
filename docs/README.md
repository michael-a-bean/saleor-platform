# Documentation Index

This directory contains all project documentation for the Saleor Hobby Gaming Platform.

---

## Quick Navigation

### Reference Documentation
| Document | Description |
|----------|-------------|
| [Architecture](reference/architecture.md) | Full platform architecture overview |
| [Sync Contracts](reference/sync-contracts.md) | Data sync contracts (Saleor/Meilisearch/inventory-ops) |
| [Git Philosophy](reference/git-philosophy.md) | Detailed git workflow and branching strategy |
| [Local-Staging Workflow](reference/local-staging-workflow.md) | Development workflow isolation |
| [Expected Divergence](reference/expected-divergence.md) | Intentional Terraform drift documentation |
| [POS System](reference/pos.md) | Point of Sale system overview |
| [Brand Integration](reference/brand-integration.md) | WotC/MTG branding guidelines |
| [Singles Builder](reference/singles-builder-implementation.md) | Singles channel implementation |
| [Delivery Contract](reference/DELIVERY_CONTRACT.md) | Project delivery agreements |

### Operations
| Directory | Description |
|-----------|-------------|
| [Issues Index](ops/issues/README.md) | Tracked issues with resolution status |
| [Runbooks](ops/runbooks/) | Operational procedures and troubleshooting |
| [Incident Log](ops/incident-changes.md) | Manual infrastructure change log |
| [Completed](ops/completed/) | Archived completed investigations |
| [Audits](ops/audits/) | Repository health audits and reviews |

### Setup & Configuration
| Document | Description |
|----------|-------------|
| [Inventory Ops Setup](setup/INVENTORY_OPS_SETUP.md) | Inventory operations configuration |
| [Scryfall Sync Status](setup/SCRYFALL_SYNC_STATUS.md) | Price sync from Scryfall |
| [Security Checklist](setup/security-checklist.md) | Production security requirements |
| [Sealed Product Images](setup/sealed-product-images.md) | MTG sealed product imaging |

### Deployment
| Document | Description |
|----------|-------------|
| [AWS Environment Variables](deploy/aws/ENV_VARS.md) | ECS environment configuration |
| [Manual Steps](deploy/aws/MANUAL_STEPS.md) | Non-automated deployment steps |
| [Secrets Manifest](deploy/aws/SECRETS_MANIFEST.md) | Required secrets documentation |

### Architecture Decisions
| ADR | Title |
|-----|-------|
| [ADR-001](decisions/ADR-001-inventory-ops-costing-layer.md) | Inventory Ops Costing Layer |

### API Documentation
| Document | Description |
|----------|-------------|
| [API Overview](api/README.md) | API documentation index |
| [GraphQL Reference](api/graphql-reference.md) | GraphQL API patterns |
| [Webhooks](api/webhooks.md) | Webhook integration guide |
| [Versioning Policy](api/versioning-policy.md) | API versioning strategy |

---

## AI Agent Documentation

For AI-assisted development, see:
- [CLAUDE.md](../CLAUDE.md) - Main AI configuration and rules
- [.claude/skills/](../.claude/skills/README.md) - Skill definitions
- [.claude/rules/](../.claude/rules/) - Critical constraints

---

## Directory Structure

```
docs/
├── api/              # API documentation
├── decisions/        # Architecture Decision Records
├── deploy/           # Deployment guides
│   └── aws/          # AWS-specific deployment
├── legacy/           # Historical/archived docs
│   └── completed/    # Completed plans and projects
├── ops/              # Operations documentation
│   ├── audits/       # Health audits and reviews
│   ├── completed/    # Archived investigations
│   ├── diagnostics/  # Diagnostic sessions
│   ├── investigations/  # Active investigations
│   ├── issues/       # Issue tracking
│   ├── prompts/      # Reusable prompts
│   └── runbooks/     # Operational runbooks
├── reference/        # Reference documentation
├── research/         # Research and analysis
└── setup/            # Setup and configuration guides

# Active plans are in .claude/plans/ (not docs/)
```

---

## Contributing to Documentation

1. **New features** → Create doc in relevant category
2. **Operational procedures** → Add to `ops/runbooks/`
3. **Architectural decisions** → Create ADR in `decisions/`
4. **Completed work** → Move planning docs to `legacy/` or `ops/completed/`

See [Council Review](ops/audits/2026-01-28-council-comprehensive-review.md) for documentation health status.

---

*Last updated: 2026-01-28*
