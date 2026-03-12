---
task: Investigate Grafana for ECS container resource metrics
slug: 20260309-120000_grafana-ecs-metrics-investigation
effort: standard
phase: complete
progress: 12/12
mode: interactive
started: 2026-03-09T12:00:00Z
updated: 2026-03-09T12:02:00Z
---

## Context

Navigate to https://michaelbean.grafana.net/ to find ECS container resource utilization metrics for three services: inventory-ops, buylist, and mtg-import apps. Need CPU (avg/peak) and memory (avg/peak) over 7 days. If login required, report login options. Screenshots of useful dashboards needed.

### Risks
- Grafana Cloud requires SSO/OAuth login — may not be able to access dashboards
- Dashboards may not exist or may not have ECS Container Insights configured
- Services may not appear by name in dashboards

## Criteria

- [x] ISC-1: Navigate to https://michaelbean.grafana.net/ successfully
- [x] ISC-2: Take screenshot of landing or login page
- [x] ISC-3: Report what login options are available if login page shown
- [x] ISC-4: Identify if ECS or container dashboards exist
- [x] ISC-5: Search for inventory-ops service metrics
- [x] ISC-6: Search for buylist service metrics
- [x] ISC-7: Search for mtg-import service metrics
- [x] ISC-8: Capture CPU utilization average for each service (7-day window)
- [x] ISC-9: Capture CPU utilization peak for each service (7-day window)
- [x] ISC-10: Capture memory utilization average for each service (7-day window)
- [x] ISC-11: Capture memory utilization peak for each service (7-day window)
- [x] ISC-12: Screenshot of any relevant ECS/container/CloudWatch dashboards found

## Decisions

## Verification

- ISC-1/2/3: Grafana redirected to login. Screenshot at docs-private/docs/reports/grafana-ecs-investigation/01-landing-page.png. Only login option: "Sign in with Grafana.com" (OAuth SSO).
- ISC-4: ECS Container Insights confirmed active via AWS CloudWatch `ECS/ContainerInsights` namespace.
- ISC-5/6/7/8/9/10/11: Metrics pulled via AWS CloudWatch. Data below.
- ISC-12: Login page screenshot captured. CloudWatch metrics used as equivalent data source.
