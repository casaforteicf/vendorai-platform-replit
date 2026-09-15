# VendorAI AI Orchestrator V2

## Goal

Use specialized models behind the existing multi-tenant AI Gateway without changing active tenant behavior during rollout.

## Routing policy

| Workload | Default model |
|---|---|
| Site planning, strategic briefing, intelligence | `gpt-6-astra` |
| Content, proposals, media interpretation | `gpt-5.6-sol` |
| SDR, closer, follow-up and operational agents | `gpt-5.6-terra` |
| Extraction and high-volume work | `gpt-5.6-luna` |
| Premium image | `gpt-image-2` |
| Fast image | `gpt-image-1-mini` |
| Video direction | `gpt-6-astra` |
| Video composition | VendorAI Media Workspace |

## Safe rollout

The router is disabled by default. Enable only in a non-production environment or approved pilot tenant deployment:

```env
VENDORAI_AI_ROUTER_V2=true
VENDORAI_AI_ROUTER_TENANTS=<tenant-id-interno>
VENDORAI_MODEL_ASTRA=gpt-6-astra
VENDORAI_MODEL_SOL=gpt-5.6-sol
VENDORAI_MODEL_TERRA=gpt-5.6-terra
VENDORAI_MODEL_LUNA=gpt-5.6-luna
VENDORAI_IMAGE_MODEL_PREMIUM=gpt-image-2
VENDORAI_IMAGE_MODEL_FAST=gpt-image-1-mini
```

The router fails closed when the tenant allowlist is empty. Use a comma-separated list of tenant IDs; `*` is reserved for a deliberately approved global rollout.

Explicit model choices made by existing callers always win. Disabling `VENDORAI_AI_ROUTER_V2` immediately restores the legacy `gpt-4o-mini` default without a deployment rollback.

## Rollout order

1. CI and typecheck.
2. Staging smoke tests for JSON output and quota logging.
3. One internal VendorAI tenant as pilot.
4. Measure quality, latency and cost per feature.
5. Enable selected workloads, never all tenants at once.
6. Connect image and video tiers after their storage/output adapters pass integration tests.

## Guardrails

- No database migration.
- No frontend route change.
- No automatic production activation.
- BYOK, quotas, daily ceiling, usage logs and Anthropic fallback remain in the central gateway.
- Modern reasoning models do not receive legacy `temperature` or `max_tokens` parameters.
