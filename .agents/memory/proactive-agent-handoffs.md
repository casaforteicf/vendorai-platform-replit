---
name: Proactive agent handoffs
description: How to trigger agent-to-agent transitions from system events (no incoming lead message) instead of waiting for reactive routing.
---

Some transitions in the CRM must fire the moment a backend event happens (an
`agendamento` is confirmed, a deal is won) rather than waiting for the lead to
send another WhatsApp message that reactive routing would pick up.

Two flavors, chosen by audience:

- **Internal signal to a human (e.g. Closer told a meeting was confirmed):**
  use `notificationsTable` + a best-effort `sendDirectWhatsAppMessage` to the
  relevant user's own phone (e.g. `deal.assignedTo`). This never touches the
  lead's conversation, so it can't accidentally "reopen" it.
- **Outbound message to the lead from an AI agent (e.g. onboarding welcome
  after a deal closes):** don't call the LLM with a synthetic prompt. Instead
  build a canned message and route it through the same `insertAndRun()`
  mechanism used by reactive agent turns (agentName + actionType
  `enviar_whatsapp`), after checking the agent is `enabled` in
  `agent_configs.agents` and passing `computeLimits()`. This keeps the
  message subject to the same autonomy/approval and rate-limit rules as every
  other agent-sent message, and shows up in the same `agent_tasks` history.

**Why:** mixing these two (e.g. sending a raw WhatsApp message from a
"non-agent" internal event) breaks analytics/history that assume all
lead-facing messages flow through `agent_tasks`, and skipping the enabled/limit
checks lets a system trigger bypass tenant-configured guardrails.

**How to apply:** when adding a new automatic transition, first decide who the
audience is (internal operator vs. the lead) — that decision alone tells you
which of the two patterns above to copy.
