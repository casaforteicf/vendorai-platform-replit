---
name: Financeiro/cobrança routing + pós-venda inactivity job
description: How financial-intent refinement was wired into agent-dispatch and how the proactive inactivity check job fits the scheduler/agent-engine patterns.
---

Financial-intent classification (routing a `cliente`-status lead to
`cobranca`/`financeiro` instead of the default service agent) must use an LLM
classifier, never regex — mirrors the `detectEscalationTrigger` pattern
(single-purpose service file, `callOpenAI` JSON mode, confidence threshold,
fail-open to the existing fallback on low confidence or classifier error).

**Why:** regex on free-text PT-BR messages about payments/boletos is brittle
and was explicitly rejected; LLM classification generalizes across phrasing
and lets the confidence threshold gate false positives.

**How to apply:** refinement lives *inside* the existing `lead.status ===
"cliente"` branch of `determineAgent`, after the higher-priority branches
(reactivation, sdr-novo, closer-active-deal) and before the service fallback.
Order within the branch: hasOverdueCharge() (deal-level, from
`dealsTable.chargeStatus` synced by the Asaas webhook) wins over
classifyFinancialIntent() wins over plain service fallback. Making
`determineAgent` async (to await the LLM call) required updating its single
call site in `processAgentInternal`.

The pós-venda inactivity check follows the existing proactive-handoff pattern
(see `proactive-agent-handoffs.md`): it dispatches through
`processAgentInternal({ forcedAgent: "relacionamento" })` rather than sending
a raw message, so it stays subject to `agent_configs.agents` enabled checks
and rate limits, and shows up in normal `agent_tasks` history. Dedup uses a
monthly key in `leadCampaignLogTable` (same table already used for other
scheduled outreach dedup) instead of a new table. The threshold is
per-tenant-configurable (`agent_configs.posVendaInactivityDays`, default 30)
rather than hardcoded, since tenants have very different sales cycles.
