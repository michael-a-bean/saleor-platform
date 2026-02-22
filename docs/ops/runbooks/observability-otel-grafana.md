# Observability: OpenTelemetry + Grafana Cloud

Setup date: 2026-02-21

## Overview

Saleor API and worker export traces, metrics, and logs to Grafana Cloud via OpenTelemetry (OTLP). Saleor 3.22 ships with `opentelemetry-distro[otlp]` and initializes telemetry automatically via `saleor.core.telemetry.initialize_telemetry()`.

## Architecture

```
Saleor API/Worker (ECS) → OTLP HTTP/protobuf → Grafana Cloud OTLP Gateway → Tempo (traces) / Mimir (metrics) / Loki (logs)
```

- **Protocol**: `http/protobuf` (not gRPC — Grafana Cloud OTLP gateway requires HTTP)
- **Endpoint**: `https://otlp-gateway-prod-us-west-0.grafana.net/otlp`
- **Auth**: Basic auth via `OTEL_EXPORTER_OTLP_HEADERS` (URL-encoded, stored in SSM)

## Service Names

Saleor's internal telemetry overrides `OTEL_SERVICE_NAME` and registers as `saleor` regardless of the env var value. When searching in Grafana Cloud Tempo, filter by `service.name = saleor`.

## Configuration

### Staging (ECS)

OTEL env vars are set in ECS task definitions via Terraform:

| Variable | API Value | Worker Value |
|----------|-----------|--------------|
| `OTEL_SERVICE_NAME` | `saleor-api` | `saleor-worker` |
| `OTEL_TRACES_EXPORTER` | `otlp` | `otlp` |
| `OTEL_METRICS_EXPORTER` | `otlp` | `otlp` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | `http/protobuf` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (from tfvars) | (from tfvars) |
| `OTEL_EXPORTER_OTLP_HEADERS` | (from SSM) | (from SSM) |

Note: Despite setting `OTEL_SERVICE_NAME=saleor-api`, Saleor's `initialize_telemetry()` overrides this to `saleor`.

**SSM Parameter**: `/saleor/staging/api/OTEL_EXPORTER_OTLP_HEADERS`
- Format: `Authorization=Basic%20<base64-credentials>` (URL-encoded, `%20` not literal space)

### Local Development

- `backend.env`: OTEL endpoint and protocol configuration
- `.env` (gitignored): `OTEL_EXPORTER_OTLP_HEADERS` with Grafana Cloud auth
- `docker-compose.yml`: passes `OTEL_EXPORTER_OTLP_HEADERS` from `.env` to API and worker containers
- Jaeger remains available for local-only tracing (uncomment Jaeger endpoint in `backend.env`)

### Terraform

Controlled by `otel_exporter_endpoint` variable:

```hcl
# In staging.tfvars
otel_exporter_endpoint = "https://otlp-gateway-prod-us-west-0.grafana.net/otlp"
```

Set to empty string `""` to disable OTEL entirely (conditional blocks in ECS task definitions).

**Files**:
- `infra/terraform/modules/ecs/main.tf` — API and worker task def OTEL blocks
- `infra/terraform/modules/ecs/variables.tf` — `otel_exporter_endpoint` variable
- `infra/terraform/variables.tf` — root variable
- `infra/terraform/main.tf` — wires to ECS module
- `infra/terraform/environments/staging.tfvars` — endpoint value

## Grafana Cloud Account

- **Org**: michael-a-bean (ID: 1676082)
- **Zone**: `prod-us-west-0`
- **Free tier**: 50k traces, 10k metrics, 50GB logs, 14-day retention, 3 users
- **OTLP Instance ID**: 1533536

## Viewing Traces

1. Go to Grafana Cloud → Explore → Tempo
2. Service name filter: `saleor`
3. Key spans: `PluginManager.__init__`, `get_plugins_manager`, `get_all_plugin_configs`, payment gateway operations

## Troubleshooting

### No traces appearing

1. Verify OTEL env vars in container:
   ```bash
   aws ecs execute-command --cluster saleor-platform-staging --task <task-id> \
     --container api --interactive --command "env | grep OTEL"
   ```

2. Test manual span export from container:
   ```bash
   aws ecs execute-command --cluster saleor-platform-staging --task <task-id> \
     --container api --interactive --command \
     "python -c \"from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter; e=OTLPSpanExporter(); print(e._endpoint)\""
   ```

3. Check auth header format — must be URL-encoded (`%20` not literal space):
   ```bash
   aws ssm get-parameter --name /saleor/staging/api/OTEL_EXPORTER_OTLP_HEADERS \
     --with-decryption --query 'Parameter.Value' --output text
   ```

4. Force new ECS deployment after changing SSM or task def:
   ```bash
   aws ecs update-service --cluster saleor-platform-staging --service <service> --force-new-deployment
   ```

### Auth header format

The OTEL Python SDK URL-decodes the `OTEL_EXPORTER_OTLP_HEADERS` value. The format must be:
```
Authorization=Basic%20<base64-token>
```
NOT `Authorization=Basic <base64-token>` (literal space fails).
