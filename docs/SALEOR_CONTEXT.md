# Saleor Platform Context Document

> **Purpose**: This document provides comprehensive context for Claude Code sessions working on this Saleor platform fork. It captures architecture, configuration, workflows, and extension patterns to enable productive development without repeated exploration.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Architecture](#architecture)
4. [Technology Stack](#technology-stack)
5. [Service Configuration](#service-configuration)
6. [Git Workflow](#git-workflow)
7. [Extension Patterns](#extension-patterns)
8. [Local Development](#local-development)
9. [Key Files Reference](#key-files-reference)
10. [External Resources](#external-resources)

---

## Project Overview

### What is Saleor?

**Saleor** is a modern, open-source, headless e-commerce platform with 22.4k+ GitHub stars. Key characteristics:

- **GraphQL-first, API-only**: No REST API; all interactions via GraphQL
- **Headless architecture**: Frontend and backend completely decoupled
- **Python/Django backend**: Version 3.22 (current)
- **Composable commerce**: Modular, extensible through apps and webhooks
- **Cloud-native**: Designed for containerized deployment

### What is saleor-platform?

This repository (`saleor-platform`) is a **Docker Compose orchestration layer** that runs the complete Saleor stack locally. It is NOT the core Saleor code itself—it pulls official Docker images and configures them to work together.

### Fork Purpose

This fork extends the upstream Saleor platform while maintaining the ability to pull upstream updates cleanly. All customizations should be additive and isolated.

---

## Repository Structure

```
/home/michael/saleor-platform/
├── docker-compose.yml          # Main orchestration (7 services)
├── backend.env                 # Backend service configuration
├── common.env                  # Shared environment variables
├── replica_user.sql            # PostgreSQL replica user setup
├── setup-e2e-db.sh             # E2E testing database helper
├── .github/
│   └── workflows/
│       └── test-platform.yml   # CI/CD pipeline (pytest)
├── docs/
│   └── SALEOR_CONTEXT.md       # This document
├── CLAUDE_AGENT_GUIDE.md       # Mandatory workflow guidelines
├── README.md                   # Setup instructions
├── LICENSE                     # BSD 3-Clause
└── .gitignore
```

### Recommended Custom Directories (to create as needed)

```
apps/                           # Custom Saleor apps
  my_custom_app/
docs/
  customizations/               # Documentation for custom work
scripts/                        # Custom scripts
docker/
  docker-compose.custom.yml     # Docker overrides
```

---

## Architecture

### Service Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SALEOR PLATFORM                              │
│                    Network: saleor-backend-tier                      │
└─────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐                    ┌──────────────┐
     │   Dashboard  │                    │   Clients    │
     │   (React)    │                    │  (Browser/   │
     │  Port: 9000  │                    │   Mobile)    │
     └──────┬───────┘                    └──────┬───────┘
            │                                   │
            │         GraphQL Queries           │
            └──────────────┬────────────────────┘
                           │
                    ┌──────▼───────┐
                    │     API      │
                    │   (Saleor    │
                    │    Core)     │
                    │  Port: 8000  │
                    └──────┬───────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
│  PostgreSQL │     │   Valkey    │     │   Worker    │
│     (db)    │     │   (cache)   │     │  (Celery)   │
│ Port: 5432  │     │ Port: 6379  │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                        ┌──────▼──────┐
                                        │   Mailpit   │
                                        │   (SMTP)    │
                                        │ Port: 8025  │
                                        └─────────────┘

Observability:
┌─────────────┐
│   Jaeger    │
│ Port: 16686 │
│ OTLP: 4317  │
└─────────────┘
```

### Service Descriptions

| Service | Image | Ports | Purpose |
|---------|-------|-------|---------|
| **api** | `ghcr.io/saleor/saleor:3.22` | 8000 | GraphQL API server (Django) |
| **dashboard** | `ghcr.io/saleor/saleor-dashboard:latest` | 9000 | Admin UI (React SPA) |
| **db** | `postgres:15-alpine` | 5432 | Primary relational database |
| **cache** | `valkey/valkey:8.1-alpine` | 6379 | Cache + Celery message broker |
| **worker** | `ghcr.io/saleor/saleor:3.22` | - | Async task processing (Celery) |
| **jaeger** | `jaegertracing/jaeger` | 16686, 4317, 4318 | APM / distributed tracing |
| **mailpit** | `axllent/mailpit` | 1025 (SMTP), 8025 (UI) | Email capture for testing |

### Data Flow

1. **Client/Dashboard** → GraphQL queries → **API**
2. **API** → SQL queries → **PostgreSQL**
3. **API** → Cache reads/writes → **Valkey**
4. **API** → Task dispatch → **Valkey** (broker) → **Worker**
5. **Worker** → Email sending → **Mailpit**
6. **All services** → Telemetry → **Jaeger**

### Shared Resources

- **Media Volume**: `saleor-media` shared between `api` and `worker`
- **Database Volume**: `saleor-db` for PostgreSQL persistence
- **Network**: All services on `saleor-backend-tier`

---

## Technology Stack

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| **Language** | Python | 3.x | 99% of Saleor Core |
| **Framework** | Django | - | Web framework |
| **API** | GraphQL | - | Exclusive API format (no REST) |
| **Database** | PostgreSQL | 15-alpine | Primary data store |
| **Cache** | Valkey | 8.1-alpine | Redis-compatible fork |
| **Task Queue** | Celery | - | Async job processing |
| **Dashboard** | React | - | Admin SPA |
| **Tracing** | OpenTelemetry | - | Observability standard |
| **APM** | Jaeger | - | Trace visualization |
| **Container** | Docker Compose | - | Local orchestration |

### Why Valkey Instead of Redis?

Recent commits replaced Redis with Valkey (commits `f9461ca`, `76ad5ed`). Valkey is a community-driven Redis fork that's fully compatible but with better licensing terms.

---

## Service Configuration

### backend.env

```bash
# Database
DATABASE_URL=postgres://saleor:saleor@db/saleor

# Cache & Celery (Valkey)
CACHE_URL=redis://cache:6379/0
CELERY_BROKER_URL=redis://cache:6379/1

# Email
DEFAULT_FROM_EMAIL=noreply@example.com
EMAIL_URL=smtp://mailpit:1025

# Security
SECRET_KEY=changeme

# Observability
OTEL_SERVICE_NAME=saleor
OTEL_TRACES_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
```

### common.env

```bash
DEFAULT_CHANNEL_SLUG=default-channel
HTTP_IP_FILTER_ALLOW_LOOPBACK_IPS=True
HTTP_IP_FILTER_ENABLED=True
```

### Database Credentials

| Parameter | Value |
|-----------|-------|
| Host | `db` (internal) / `localhost` (external) |
| Port | 5432 |
| Database | `saleor` |
| User | `saleor` |
| Password | `saleor` |

---

## Git Workflow

### Branch Structure

| Branch | Purpose | Modifiable? |
|--------|---------|-------------|
| `main` | Clean upstream mirror | **NEVER** |
| `platform/main` | Deployable product branch | Yes |
| `feature/*` | Short-lived development | Yes |

### Current Status

- **Active branch**: `platform/main`
- **Remotes**:
  - `origin`: Your fork
  - `upstream`: `saleor/saleor-platform`

### Workflow Commands

```bash
# Starting work - always verify first
git status
git branch --show-current  # Must be platform/main or feature/*

# Create feature branch
git checkout platform/main
git checkout -b feature/<description>

# Merge completed feature
git checkout platform/main
git merge feature/<description>
git push origin platform/main

# Sync from upstream (exact sequence)
git checkout main
git fetch upstream
git reset --hard upstream/main
git push origin main --force-with-lease
git checkout platform/main
git merge main
git push origin platform/main
```

### Commit Standards

- Small, focused commits
- Imperative messages with conventional prefixes:
  - `feat(apps): add inventory sync app`
  - `chore(compose): add custom service`
  - `fix(api): resolve cart calculation bug`
  - `docs: document webhook flow`
- Never commit secrets (use `.env.example`)

---

## Extension Patterns

### Preferred Methods (in order of preference)

1. **Saleor Apps** - External services communicating via GraphQL/webhooks
2. **Webhooks** - Event-driven integrations
3. **Attributes/Metadata** - Extend data models without schema changes
4. **Environment Variables** - Configuration changes
5. **Docker Compose Overrides** - Infrastructure additions
6. **Dashboard Iframes** - Custom admin UI panels

### When Core Modification is Unavoidable

If you must patch upstream code:

1. Keep diff minimal
2. Isolate into dedicated commit
3. Document rationale in `docs/customizations/`
4. Flag as potential upstream PR candidate
5. Add to merge risk assessment

### App Development Pattern

```
apps/
  my_custom_app/
    README.md           # Purpose, setup, env vars, webhooks
    app.py              # Main application
    handlers/           # Webhook handlers
    graphql/            # GraphQL queries/mutations
    tests/
    requirements.txt
    Dockerfile
```

### Docker Compose Override Pattern

```yaml
# docker/docker-compose.custom.yml
services:
  my_custom_service:
    build: ../apps/my_custom_app
    environment:
      - SALEOR_API_URL=http://api:8000/graphql/
    networks:
      - saleor-backend-tier
```

Usage:
```bash
docker compose -f docker-compose.yml -f docker/docker-compose.custom.yml up
```

---

## Local Development

### Initial Setup

```bash
# 1. Start infrastructure services
docker compose up -d db cache

# 2. Run database migrations
docker compose run --rm api python3 manage.py migrate

# 3. Populate sample data and create admin user
docker compose run --rm api python3 manage.py populatedb --createsuperuser
# Creates: admin@example.com / admin

# 4. Start all services
docker compose up
```

### Service Endpoints

| Service | URL | Credentials |
|---------|-----|-------------|
| **GraphQL API** | http://localhost:8000/graphql/ | - |
| **Dashboard** | http://localhost:9000 | admin@example.com / admin |
| **Jaeger UI** | http://localhost:16686 | - |
| **Mailpit UI** | http://localhost:8025 | - |

### Common Commands

```bash
# View logs
docker compose logs -f api
docker compose logs -f worker

# Run Django management commands
docker compose run --rm api python3 manage.py <command>

# Access Django shell
docker compose run --rm api python3 manage.py shell

# Run tests
docker compose run --rm api pytest

# Restart specific service
docker compose restart api

# Full reset
docker compose down -v
docker compose up -d
```

### GraphQL Playground

Access at http://localhost:8000/graphql/ for:
- Interactive query builder
- Schema exploration
- Query history

---

## Key Files Reference

### Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Service definitions and orchestration |
| `backend.env` | API and Worker environment variables |
| `common.env` | Shared configuration across services |
| `replica_user.sql` | Read-only database user setup |

### Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project setup instructions |
| `CLAUDE_AGENT_GUIDE.md` | Mandatory workflow rules for Claude Code |
| `docs/SALEOR_CONTEXT.md` | This context document |

### CI/CD

| File | Purpose |
|------|---------|
| `.github/workflows/test-platform.yml` | PR validation pipeline |

---

## External Resources

### Official Documentation

- **Saleor Docs**: https://docs.saleor.io/
- **GraphQL API Reference**: https://docs.saleor.io/api-reference/
- **App Development Guide**: https://docs.saleor.io/developer/extending/apps/

### Source Repositories

- **Saleor Core**: https://github.com/saleor/saleor
- **Saleor Dashboard**: https://github.com/saleor/saleor-dashboard
- **Saleor Platform**: https://github.com/saleor/saleor-platform
- **Saleor Storefront**: https://github.com/saleor/storefront

### Community

- **GitHub Discussions**: https://github.com/saleor/saleor/discussions
- **Discord**: https://discord.gg/saleor

---

## Commerce Features Summary

### Core Modules

| Module | Description |
|--------|-------------|
| **Products** | Rich catalog with variants, attributes, categories |
| **Channels** | Multi-channel with per-channel pricing/stock |
| **Checkout** | Complete cart and checkout flow |
| **Payments** | Multi-gateway orchestration (Stripe, Adyen, etc.) |
| **Orders** | Fulfillment, returns, split payments |
| **Promotions** | Sales, vouchers, cart rules, gift cards |
| **Shipping** | Multiple methods, zone-based pricing |
| **Taxes** | Integration with tax services (AvaTax) |
| **Warehouses** | Multi-warehouse inventory management |

### GraphQL Operations

Key query/mutation patterns:
```graphql
# Products
query { products(first: 10) { edges { node { id name } } } }

# Checkout
mutation { checkoutCreate(input: {...}) { checkout { id } } }

# Orders
query { orders(first: 10) { edges { node { id status } } } }
```

---

## Delivery Checklist

For every task completed in this repository, include:

1. **Summary of changes** - What was done and why
2. **Files touched** - List of modified/created files
3. **How to run/test locally** - Commands to verify changes
4. **New environment variables** - Any additions to `.env` files
5. **Upstream merge risk assessment** - Impact on future upstream merges

---

## Quick Reference Card

```
BRANCHES:
  main           → NEVER TOUCH (upstream mirror)
  platform/main  → Primary work branch
  feature/*      → Development branches

SERVICES:
  API:       localhost:8000  (GraphQL)
  Dashboard: localhost:9000  (Admin UI)
  Jaeger:    localhost:16686 (Tracing)
  Mailpit:   localhost:8025  (Email UI)
  DB:        localhost:5432  (PostgreSQL)
  Cache:     localhost:6379  (Valkey)

COMMANDS:
  docker compose up                    # Start all
  docker compose logs -f <service>     # View logs
  docker compose run --rm api <cmd>    # Run Django command
  docker compose down -v               # Full reset

EXTENSION PRIORITY:
  1. Apps (external)
  2. Webhooks
  3. Attributes/Metadata
  4. Environment Variables
  5. Docker Compose Overrides
  6. Core patches (last resort)
```

---

*Document created: 2024*
*Last updated: Session initialization*
*Maintained for: Claude Code context preservation*
